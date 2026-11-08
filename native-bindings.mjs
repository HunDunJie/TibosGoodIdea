import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from './vendor/acorn/acorn.mjs';
import {openRendererArchive} from './asar-reader.mjs';

const property=n=>(n?.property??n?.key)?.name??(n?.property??n?.key)?.value;
const unwrap=n=>n?.type==='SequenceExpression'?n.expressions.at(-1):n?.type==='ChainExpression'?unwrap(n.expression):n;
const one=items=>items.length===1?items[0]:null;
function visit(node,fn){
  if(!node?.type)return;fn(node);
  for(const value of Object.values(node)){
    if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,fn);}
    else if(value?.type)visit(value,fn);
  }
}
const tree=source=>parse(source,{ecmaVersion:'latest',sourceType:'module'});

// Follow the native profile opener and its lazy-loading group, rather than bundle names.
export function discoverRspackUsage(source){
  const ast=tree(source),table=one(ast.body.flatMap(n=>n.declaration?.declarations??[]).filter(n=>n.id?.name==='__webpack_modules__'))?.init;
  if(table?.type!=='ObjectExpression')throw Error('Native Rspack modules unavailable');
  const matches=[];
  for(const factory of table.properties){
    const fn=factory.value,require=fn?.params?.[2]?.name;if(!require)continue;
    const imports=new Map(),declarations=[],calls=[];
    for(const node of fn.body.body)if(node.type==='VariableDeclaration')for(const d of node.declarations){
      if(d.id.type==='Identifier'&&d.init?.type==='CallExpression'&&d.init.callee.name===require&&typeof d.init.arguments[0]?.value==='string')imports.set(d.id.name,d.init.arguments[0].value);
    }
    const ref=node=>{node=unwrap(node);return node?.type==='MemberExpression'&&imports.has(node.object.name)?{id:imports.get(node.object.name),export:String(property(node))}:null;};
    visit(fn.body,node=>{if(node.type==='VariableDeclarator')declarations.push(node);if(node.type==='CallExpression')calls.push(node);});
    for(const open of calls){
      const options=open.arguments[2];
      if(options?.type!=='ObjectExpression')continue;
      const props=new Map(options.properties.map(p=>[property(p),p.value]));
      const enabled=props.get('defaultResetCreditsOpen');
      if(!(enabled?.value===true||enabled?.operator==='!'&&enabled.argument?.value===0)||!['initialAvailableCount','isRateLimitReached','onResetComplete'].every(key=>props.has(key)))continue;
      const store=open.arguments[0]?.name,callback=props.get('onResetComplete');
      const scopes=declarations.filter(d=>d.id.name===store&&d.init?.type==='CallExpression').map(d=>ref(d.init.arguments[0])).filter(Boolean);
      const turns=[],records=[];
      visit(callback,node=>{
        if(node.type!=='CallExpression')return;
        if(node.callee.type==='MemberExpression'&&node.callee.object.name===store&&property(node.callee)==='get'&&node.arguments.length===2)turns.push(ref(node.arguments[0]));
        if(node.arguments[0]?.name===store&&node.arguments[1]?.type==='ObjectExpression'&&['accountId','conversationId','turnId'].every(key=>node.arguments[1].properties.some(p=>property(p)===key)))records.push(ref(node.callee));
      });
      const routes=declarations.filter(d=>d.init?.type==='CallExpression'&&d.init.arguments[0]?.value==='/remote/:taskId').map(d=>d.id.name);
      const decoders=calls.filter(c=>{const arg=unwrap(c.arguments[0]);return c.arguments.length===1&&property(arg)==='taskId'&&property(arg?.object)==='params'&&routes.includes(unwrap(arg.object.object)?.name);}).map(c=>ref(c.callee)).filter(Boolean);
      const result={profileId:String(property(factory)),scope:one(scopes),openModal:ref(open.callee),usageModal:ref(open.arguments[1]),turn:one(turns),recordReset:one(records),decodeConversation:one(decoders)};
      if(Object.values(result).some(value=>!value))throw Error('Incomplete native Rspack usage context');
      matches.push(result);
    }
  }
  const result=one(matches);if(!result)throw Error('Ambiguous native Rspack usage opener');return result;
}

export function discoverUsageChunks(source,profileId){
  const groups=[];
  visit(tree(source),node=>{
    if(node.type!=='CallExpression'||property(node.callee)!=='then')return;
    const bind=node.arguments[0],owner=bind?.callee?.object?.name;
    if(property(bind?.callee)!=='bind'||bind.arguments?.[0]?.name!==owner||bind.arguments?.[1]?.value!==profileId)return;
    const load=node.callee.object;
    const calls=property(load?.callee)==='all'&&load.callee.object.name==='Promise'?load.arguments[0]?.elements:[load];
    if(!calls?.length||calls.some(c=>c?.type!=='CallExpression'||property(c.callee)!=='e'||c.callee.object.name!==owner||!Number.isSafeInteger(c.arguments[0]?.value)))return;
    groups.push(calls.map(c=>c.arguments[0].value));
  });
  return groups;
}

async function readRspackUsage(asarPath){
  const archive=await openRendererArchive(asarPath);
  try{
    const entries=[];
    for(const name of archive.entryScripts)if((await archive.read(name)).includes('__webpack_require__'))entries.push(name);
    const entry=one(entries);if(!entry)throw Error('Ambiguous native Rspack entry');
    const names=archive.names.filter(n=>n.startsWith('async/'));
    if(names.length>10000||names.reduce((size,name)=>size+(archive.size(name)??0),0)>512*1024*1024)throw Error('Native Rspack discovery budget exceeded');
    const profiles=[];
    for(const name of names){
      const bytes=await archive.read(name);
      if(bytes.includes('defaultResetCreditsOpen')&&bytes.includes('onRateLimitResetClick'))profiles.push(discoverRspackUsage(bytes.toString('utf8')));
    }
    const binding=one(profiles);if(!binding)throw Error('Ambiguous native Rspack profile');
    const groups=[];
    for(const name of names){const bytes=await archive.read(name);if(bytes.includes(JSON.stringify(binding.profileId))||bytes.includes("'"+binding.profileId+"'"))groups.push(...discoverUsageChunks(bytes.toString('utf8'),binding.profileId));}
    const chunks=one([...new Map(groups.map(group=>[JSON.stringify(group),group])).values()]);
    if(!chunks)throw Error('Native profile loading group unavailable');
    const {profileId,...api}=binding;
    return {schema:2,rspack:{entry,chunks},...api};
  }finally{await archive.close();}
}

// Resolve the current installed renderer's exported native modal API, without executing source.
export async function readNativeBindings(asarPath) {
  const file = await fs.open(asarPath, 'r');
  try {
    const head = Buffer.alloc(16); await file.read(head, 0, 16, 0);
    const base = 8 + head.readUInt32LE(4), size = head.readUInt32LE(12);
    if (size > 32 * 1024 * 1024) throw new Error('Unexpected archive header');
    const bytes = Buffer.alloc(size); await file.read(bytes, 0, size, 16);
    const entries = new Map();
    function walk(node, prefix = '') {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const full = prefix ? `${prefix}/${name}` : name;
        if (entry.files) walk(entry, full); else entries.set(full, entry);
      }
    }
    walk(JSON.parse(bytes.toString('utf8')));
    async function read(full) {
      const item = entries.get(full);
      if (!item || item.unpacked || item.size > 20 * 1024 * 1024) throw new Error('Native module unavailable');
      const content = Buffer.alloc(item.size); await file.read(content, 0, content.length, base + Number(item.offset));
      return content.toString('utf8');
    }
    function imports(source) {
      const map = new Map();
      for (const match of source.matchAll(/import\{([^}]+)\}from["']([^"']+)["']/g)) {
        for (const item of match[1].split(',')) {
          const parts = item.trim().split(/\s+as\s+/);
          map.set(parts[1] ?? parts[0], {module:path.posix.basename(match[2]), export:parts[0]});
        }
      }
      return map;
    }
    const profilePath = [...entries.keys()].find(name => /\/profile-dropdown-items-[^/]+\.js$/.test(name));
    if (!profilePath) return await readRspackUsage(asarPath);
    const source = await read(profilePath), names = imports(source);
    const open = source.match(/([\w$]+)\(([\w$]+),([\w$]+),\{defaultResetCreditsOpen:!0/);
    if (!open) throw new Error('Native usage opener not found');
    const storeName = open[2];
    const scopes = [...source.slice(0, open.index).matchAll(new RegExp(`\\b${storeName}=([\\w$]+)\\(([\\w$]+)\\)`, 'g'))];
    const scope = scopes.map(match => names.get(match[2])).findLast(binding => binding?.module.startsWith('app-shared-'));
    const callback = source.slice(open.index, open.index + 1000);
    const turn = callback.match(new RegExp(`${storeName}\\.get\\(([\\w$]+),([\\w$]+)\\)`));
    const record = callback.match(new RegExp(`([\\w$]+)\\(${storeName},\\{accountId:[^,]+,conversationId:[\\w$]+,turnId:`));
    if (!scope || !turn || !record) throw new Error('Native usage context not found');
    const conversationHook = [...source.slice(0, open.index).matchAll(new RegExp(`\\b${turn[2]}=([\\w$]+)\\(\\)`, 'g'))].map(match => names.get(match[1])).findLast(Boolean);
    let decodeConversation = null;
    if (conversationHook) {
      const modulePath = path.posix.join(path.posix.dirname(profilePath), conversationHook.module);
      const moduleSource = await read(modulePath), moduleNames = imports(moduleSource);
      const exportName = conversationHook.export.replace(/[$]/g, '\\$&');
      const local = moduleSource.slice(moduleSource.lastIndexOf('export{')).match(new RegExp(`([\\w$]+) as ${exportName}(?:,|})`))?.[1];
      const start = local ? moduleSource.indexOf(`function ${local}(`) : -1;
      if (start >= 0) {
        const cast = moduleSource.slice(start, start + 900).match(/\?([\w$]+)\([\w$]+\):null/);
        if (cast) decodeConversation = moduleNames.get(cast[1]) ?? null;
      }
    }
    const result = {profileModule:path.posix.basename(profilePath), scope, openModal:names.get(open[1]), usageModal:names.get(open[3]), turn:names.get(turn[1]), recordReset:names.get(record[1]), decodeConversation};
    if (!result.openModal || !result.usageModal || !result.turn || !result.recordReset || !decodeConversation) throw new Error('Incomplete native usage bindings');
    return result;
  } finally { await file.close(); }
}
