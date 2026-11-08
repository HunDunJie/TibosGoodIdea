import {parse} from './vendor/acorn/acorn.mjs';
import {openRendererArchive} from './asar-reader.mjs';
import {createHash} from 'node:crypto';

const literal=n=>n?.type==='Literal'?n.value:undefined;
const property=n=>(n?.property??n?.key)?.name??literal(n?.property??n?.key);
const one=items=>items.length===1?items[0]:null;
function visit(node,fn){
  if(!node?.type)return;fn(node);
  for(const value of Object.values(node)){
    if(Array.isArray(value)){for(const item of value)if(item?.type)visit(item,fn);}
    else if(value?.type)visit(value,fn);
  }
}
function has(node,fn){let result=false;visit(node,n=>{if(fn(n))result=true;});return result;}
const text=(node,value)=>has(node,n=>literal(n)===value);
const method=(node,value)=>has(node,n=>n.type==='MemberExpression'&&property(n)===value);
const objectKeys=(node,keys)=>node?.type==='ObjectExpression'&&keys.every(key=>node.properties.some(p=>property(p)===key));
const unwrap=n=>n?.type==='SequenceExpression'?n.expressions.at(-1):n;

// Parse module factories and export declarations only. Never evaluate archive code.
export function discoverRspackBindings(source,{entry,chunk,composerSource=source}){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const declaration=one(ast.body.flatMap(n=>n.declaration?.declarations??[]).filter(n=>n.id?.name==='__webpack_modules__'));
  if(declaration?.init?.type!=='ObjectExpression')throw Error('Rspack module table unavailable');
  const modules=new Map(),defs=[];
  for(const p of declaration.init.properties){
    const fn=p.value,id=String(property(p));
    if(fn?.type!=='FunctionExpression'||modules.has(id))throw Error('Ambiguous Rspack factory');
    const m={id,exports:new Map(),imports:new Map(),defs:[],body:fn.body,functions:fn.body.body.filter(n=>n.type==='FunctionDeclaration'),source:source.slice(p.start,p.end),require:fn.params[2]?.name??null};
    for(const n of fn.body.body){
      if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.type==='Identifier'&&d.init){
        m.defs.push(d);
        if(d.init.type==='CallExpression'&&d.init.callee.name===m.require&&typeof literal(d.init.arguments[0])==='string')m.imports.set(d.id.name,literal(d.init.arguments[0]));
      }
    }
    visit(fn.body,n=>{
      if(n.type!=='CallExpression'||n.callee.type!=='MemberExpression'||n.callee.object.name!==m.require||property(n.callee)!=='d')return;
      for(const [index,arrow]of [[1,true],[2,false]])for(const p of n.arguments[index]?.properties??[]){
        const value=arrow?p.value?.body:p.value;
        if(value?.type==='Identifier')m.exports.set(value.name,String(property(p)));
      }
    });
    for(const d of m.defs)if(m.exports.has(d.id.name))defs.push({m,node:d.init,name:d.id.name,key:`${id}:${m.exports.get(d.id.name)}`});
    modules.set(id,m);
  }
  const references={};
  function reference(m,node){
    node=unwrap(node);
    if(node?.type==='Identifier'&&m.exports.has(node.name))return {id:m.id,export:m.exports.get(node.name)};
    if(node?.type==='MemberExpression'&&m.imports.has(node.object.name))return {id:m.imports.get(node.object.name),export:String(property(node))};
    return null;
  }
  function add(ref){if(!ref||!/^[-\w$]+$/.test(ref.id)||!/^[-\w$]+$/.test(ref.export))return null;const key=`${ref.id}:${ref.export}`;references[key]=ref;return key;}
  const key=d=>d?add({id:d.m.id,export:d.m.exports.get(d.name)}):null;
  const calls=defs.filter(d=>d.node.type==='CallExpression');
  const event=one(calls.filter(d=>objectKeys(d.node.arguments[2],['onMount'])&&text(d.node,'turn-completed')&&method(d.node,'subscribe')));
  const composer=one(calls.filter(d=>literal(d.node.arguments[0])==='ComposerScope'));
  const binding=one(calls.filter(d=>d.m.source.includes('client-thread-bindings-v1')&&d.node.arguments[1]?.type==='ArrowFunctionExpression'&&text(d.node,'local:')));
  const navigation=one(calls.filter(d=>objectKeys(d.node.arguments[1],['navigate','navigateToLocalConversation','prepareNavigation'])));
  const rootKeys=[event,binding,navigation].filter(Boolean).map(d=>JSON.stringify(reference(d.m,d.node.arguments[0])));
  const root=rootKeys.length>=2&&new Set(rootKeys).size===1?add(JSON.parse(rootKeys[0])):null;
  const mountedNavigation=[];
  if(root&&!navigation)for(const m of modules.values())visit(m.body,n=>{
    if(n.type!=='CallExpression'||n.callee.type!=='MemberExpression'||property(n.callee)!=='set'||!objectKeys(n.arguments[1],['navigate','navigateToLocalConversation','prepareNavigation']))return;
    const stores=[];
    visit(m.body,d=>{if(d.type==='VariableDeclarator'&&d.id.name===n.callee.object.name&&d.init?.type==='CallExpression')stores.push(reference(m,d.init.arguments[0]));});
    if(stores.length===1&&JSON.stringify(stores[0])===rootKeys[0]){const ref=reference(m,n.arguments[0]);if(ref)mountedNavigation.push(ref);}
  });
  const navigationKey=key(navigation)??add(one([...new Map(mountedNavigation.map(ref=>[JSON.stringify(ref),ref])).values()]));
  const host=one(calls.filter(d=>{
    const arrow=d.node.arguments[1],body=arrow?.body,last=body?.type==='BlockStatement'?body.body.at(-1)?.argument:body;
    return JSON.stringify(reference(d.m,d.node.arguments[0]))===rootKeys[0]&&last?.type==='LogicalExpression'&&literal(last.right)==='local'&&method(d.node,'has')&&method(d.node,'values')&&method(d.node,'next');
  }));
  const storage=[];
  if(binding)visit(binding.node.arguments[1],n=>{
    if(n.type==='CallExpression'&&n.arguments.length===2&&n.arguments[1]?.type==='UnaryExpression'&&n.arguments[1].operator==='void'){
      const ref=reference(binding.m,n.callee);if(ref)storage.push(add(ref));
    }
  });
  const readStorage=one([...new Set(storage)].filter(Boolean));
  const clients=one(calls.filter(d=>objectKeys(d.node.arguments[1]?.body,['status','client'])&&text(d.node.arguments[1].body,'unavailable')&&JSON.stringify(reference(d.m,d.node.arguments[0]))===rootKeys[0]));
  const hostRefs=[];
  if(clients)for(const d of clients.m.defs)visit(d.init,n=>{
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&property(n.callee)==='includes'&&n.callee.object.type==='CallExpression'){
      const ref=reference(clients.m,n.callee.object.arguments[0]);if(ref)hostRefs.push(add(ref));
    }
  });
  const hosts=one([...new Set(hostRefs)].filter(Boolean));
  const monitor=root&&clients&&hosts&&['getWorkInProgress','getCachedThreadIds','getLoadedConversationHistory','sendRequest'].every(name=>source.includes(name+'(')||source.includes('get '+name+'('))?{clients:key(clients),hosts,init:[]}:null;
  const quotaReaders=[];
  for(const m of modules.values()){
    const reads=m.functions.filter(f=>has(f,n=>n.type==='CallExpression'&&property(n.callee)==='safeGet'&&literal(n.arguments[0])==='/wham/usage'));
    for(const f of m.functions)if(m.exports.has(f.id.name)&&has(f,n=>n.type==='CallExpression'&&reads.some(read=>read.id.name===n.callee.name)&&n.arguments[0]?.name===f.params[0]?.name&&objectKeys(n.arguments[1],['expectedIdentity'])))quotaReaders.push({m,name:f.id.name});
  }
  const completion=!!(root&&event),send=!!(root&&composer&&binding&&navigationKey&&host&&readStorage&&['handleSubmit','submitDisabled','isResponseInProgress','focusComposerAfterSubmit','onAccepted'].every(name=>composerSource.includes(name)));
  return {schema:2,discovery:'rspack-syntax',rspack:{entry,chunk},references,initial:chunk,shared:chunk,scope:root,
    initEvents:'__cqbReady',completionEvent:key(event),composerScope:key(composer),initSend:[],readStorage,navigation:navigationKey,conversationBinding:key(binding),host:key(host),navigationMode:'native-method',monitor,quotaFetch:key(one(quotaReaders)),
    capabilities:{completion,send,shutdown:!!monitor},reasons:{completion:completion?null:'completion-interface-unverified',send:send?null:'draft-interface-unverified'}};
}

export async function readRspackBindings(asar){
  const archive=await openRendererArchive(asar);
  try{
    const entries=[];
    for(const name of archive.entryScripts){const bytes=await archive.read(name);if(bytes.includes('__webpack_require__'))entries.push({name,bytes});}
    const entry=one(entries);if(!entry)throw Error('Ambiguous Rspack entry');
    const names=archive.names.filter(n=>n.startsWith('async/'));
    if(names.length>10000||names.reduce((n,name)=>n+(archive.size(name)??0),0)>512*1024*1024)throw Error('Rspack discovery budget exceeded');
    const candidates=[],composers=[];
    for(const name of names){
      if(archive.size(name)<1000)continue;
      const bytes=await archive.read(name);
      if(['composer-prompt-drafts-v2','client-thread-bindings-v1','getWorkInProgress','turn-completed'].every(text=>bytes.includes(text)))candidates.push({name,bytes});
      if(['handleSubmit','submitDisabled','isResponseInProgress','focusComposerAfterSubmit','onAccepted'].every(text=>bytes.includes(text)))composers.push({name,bytes});
    }
    const main=one(candidates);if(!main)throw Error('Ambiguous Rspack application chunk');
    const composer=one(composers);
    const bindings=discoverRspackBindings(main.bytes.toString('utf8'),{entry:entry.name,chunk:main.name,composerSource:composer?.bytes.toString('utf8')??''});
    return {...bindings,fingerprints:Object.fromEntries([entry,main,...composer?[composer]:[]].map(({name,bytes})=>[name,createHash('sha256').update(bytes).digest('hex')]))};
  }finally{await archive.close();}
}
