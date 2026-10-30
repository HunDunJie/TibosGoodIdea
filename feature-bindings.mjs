import {createHash} from 'node:crypto';
import {parse} from './vendor/acorn/acorn.mjs';
import {openRendererArchive} from './asar-reader.mjs';

const literal = n => n?.type === 'Literal' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined;
const property = n => n?.computed ? literal(n.property ?? n.key) : (n.property ?? n.key)?.name ?? literal(n.key);
function visit(node, fn) {
  if (!node?.type) return;
  fn(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const item of value) if (item?.type) visit(item, fn); }
    else if (value?.type) visit(value, fn);
  }
}
function has(node, predicate) { let found = false; visit(node, n => { if (predicate(n)) found = true; }); return found; }
const hasText = (node, text) => has(node, n => literal(n) === text);
const hasMethod = (node, name) => has(node, n => n.type === 'MemberExpression' && property(n) === name);
const one = items => items.length === 1 ? items[0] : null;

// Read syntax only. No Codex source is evaluated, copied into a release or uploaded.
function indexModule(source) {
  const ast = parse(source, {ecmaVersion:'latest', sourceType:'module'}), exports = new Map(), imports = new Map(), globals = new Set(), definitions = new Map(), functions = [];
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration') for (const s of n.specifiers) exports.set(s.local.name, s.exported.name ?? s.exported.value);
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers) if (s.type === 'ImportSpecifier') imports.set(s.local.name, {module:n.source.value.split('/').at(-1), export:s.imported.name ?? s.imported.value});
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') globals.add(d.id.name);
    if (n.type === 'FunctionDeclaration') { globals.add(n.id.name); functions.push(n); }
  }
  function walk(n, owner = null) {
    if (!n?.type) return;
    if (n.type === 'FunctionDeclaration') owner = n;
    const name = n.type === 'AssignmentExpression' && n.left.type === 'Identifier' ? n.left.name : n.type === 'VariableDeclarator' && n.id.type === 'Identifier' ? n.id.name : null;
    const expr = n.type === 'AssignmentExpression' ? n.right : n.type === 'VariableDeclarator' ? n.init : null;
    if (name && expr && globals.has(name)) {
      const list = definitions.get(name) ?? []; list.push({name, expr, owner}); definitions.set(name, list);
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) { for (const item of value) if (item?.type) walk(item, owner); }
      else if (value?.type) walk(value, owner);
    }
  }
  walk(ast);
  const defs = [...definitions.values()].filter(list => list.length === 1).map(list => list[0]);
  return {exports, imports, defs, functions};
}

export function discoverFeatureBindings(initialSource, sharedSource, composerSource, names, initialIndex=null) {
  const m = initialIndex??indexModule(initialSource), shared = indexModule(sharedSource);
  const exported = d => d && m.exports.get(d.name), initializer = d => d?.owner && m.exports.get(d.owner.id.name);
  const calls = m.defs.filter(d => d.expr.type === 'CallExpression');
  const event = one(calls.filter(d => exported(d) && d.expr.arguments[2]?.type === 'ObjectExpression'
    && d.expr.arguments[2].properties.some(p => property(p) === 'onMount') && hasText(d.expr, 'turn-completed') && hasMethod(d.expr, 'subscribe')));
  const composerScope = one(calls.filter(d => exported(d) && literal(d.expr.arguments[0]) === 'ComposerScope'));
  const draftInit = one(m.functions.filter(f => m.exports.has(f.id.name) && hasText(f.body, 'composer-prompt-drafts-v2') && hasText(f.body, 'composer-prompt-drafts-v1')));
  const bindingInit = one(m.functions.filter(f => m.exports.has(f.id.name) && hasText(f.body, 'client-thread-bindings-v1')));
  const binding = one(calls.filter(d => exported(d) && d.owner === bindingInit && d.expr.arguments[1]?.type === 'ArrowFunctionExpression' && hasText(d.expr, 'local:')));
  const storage = [];
  if (binding) visit(binding.expr.arguments[1], n => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && m.exports.has(n.callee.name) && n.arguments.length === 2 && n.arguments[1].type === 'UnaryExpression' && n.arguments[1].operator === 'void') storage.push(n.callee.name);
  });
  const storageName = one([...new Set(storage)]);
  const navDefaults = one(m.defs.filter(d => d.expr.type === 'ObjectExpression' && ['navigate','navigateToLocalConversation','prepareNavigation'].every(key => d.expr.properties.some(p => property(p) === key))));
  const navigation = navDefaults && one(calls.filter(d => exported(d) && d.expr.arguments[1]?.name === navDefaults.name));
  const host = one(calls.filter(d => {
    const arrow = d.expr.arguments[1], last = arrow?.body?.type === 'BlockStatement' ? arrow.body.body.at(-1)?.argument : arrow?.body;
    return exported(d) && d.expr.arguments.length === 2 && hasMethod(d.expr, 'has') && hasMethod(d.expr, 'values') && hasMethod(d.expr, 'next') && last?.type === 'LogicalExpression' && last.operator === '??' && literal(last.right) === 'local';
  }));
  const rootImports = [event, binding, navigation].filter(Boolean).map(d => m.imports.get(d.expr.arguments[0]?.name)).filter(Boolean);
  const scopes = [...new Map(rootImports.map(b => [`${b.module}:${b.export}`,b])).values()], root = one(scopes);
  const rootValid = root?.module === names.shared && [...shared.exports.values()].includes(root.export);
  const completion = !!(rootValid && exported(event) && initializer(event));
  const submitShape = ['handleSubmit','submitDisabled','isResponseInProgress','focusComposerAfterSubmit','onAccepted'].every(key => composerSource.includes(key));
  const send = !!(rootValid && composerScope && initializer(composerScope) && draftInit && binding && initializer(binding) && storageName && navigation && initializer(navigation) && host && initializer(host) && submitShape);
  return {schema:2, discovery:'syntax', ...names, scope:rootValid ? root.export : null,
    initEvents:initializer(event), completionEvent:exported(event),
    initComposer:draftInit && m.exports.get(draftInit.id.name), composerScope:exported(composerScope),
    readStorage:storageName && m.exports.get(storageName), navigation:exported(navigation), conversationBinding:exported(binding), host:exported(host),
    navigationMode:'native-method',
    initSend:[initializer(composerScope), draftInit && m.exports.get(draftInit.id.name), initializer(binding), initializer(navigation), initializer(host)].filter(Boolean),
    capabilities:{completion,send}, reasons:{completion:completion ? null : 'completion-interface-unverified', send:send ? null : 'draft-interface-unverified'}};
}

export async function readRendererModules(asarPath) {
  const archive = await openRendererArchive(asarPath);
  try {
    async function select(prefix, minimum = 0) {
      const matches = [];
      for (const name of archive.names.filter(n => n.startsWith(prefix + '-') && n.endsWith('.js'))) {
        const bytes = await archive.read(name);
        if (bytes.length > minimum) matches.push({name,bytes});
      }
      const result = one(matches); if (!result) throw Error(`Ambiguous or missing ${prefix} asset`); return result;
    }
    const [initial,shared,composer] = await Promise.all([select('app-initial'),select('app-shared'),select('composer-content',1000).catch(() => ({name:null,bytes:Buffer.alloc(0)}))]);
    const modules = {initial,shared,composer};
    return {modules, fingerprints:Object.fromEntries(Object.values(modules).filter(m=>m.name).map(({name,bytes}) => [name,createHash('sha256').update(bytes).digest('hex')]))};
  } finally { await archive.close(); }
}
export async function readFeatureBindings(asarPath, {catalog = []} = {}) {
  const {modules:m, fingerprints} = await readRendererModules(asarPath);
  const patch = catalog.find(entry => Object.keys(entry.fingerprints).length === Object.keys(fingerprints).length && Object.entries(fingerprints).every(([name,hash]) => entry.fingerprints[name] === hash));
  const source=m.initial.bytes.toString('utf8'),parsed=indexModule(source);
  const bindings=patch ? {...patch.bindings, discovery:'signed-catalog'} : discoverFeatureBindings(source,m.shared.bytes.toString('utf8'),m.composer.bytes.toString('utf8'),{initial:m.initial.name,shared:m.shared.name},parsed);
  const monitor=discoverShutdownBindings(source,parsed);
  return {...bindings,monitor,capabilities:{...bindings.capabilities,shutdown:!!monitor},fingerprints};
}

export function discoverShutdownBindings(source,parsed=null) {
  const m=parsed??indexModule(source), exported=d=>d&&m.exports.get(d.name), init=d=>d?.owner&&m.exports.get(d.owner.id.name);
  const calls=m.defs.filter(d=>d.expr.type==='CallExpression'&&exported(d));
  const clients=one(calls.filter(d=>{
    const body=d.expr.arguments[1]?.body;
    return body?.type==='ObjectExpression'&&body.properties.some(p=>property(p)==='status'&&literal(p.value)==='unavailable')&&body.properties.some(p=>property(p)==='client'&&literal(p.value)===null);
  }));
  const connected=one(calls.filter(d=>d.expr.arguments[1]?.type==='ArrowFunctionExpression'&&hasText(d.expr,'ready')&&hasText(d.expr,'connected')&&hasText(d.expr,'loading')&&has(d.expr,n=>n.type==='Identifier'&&n.name===clients?.name)));
  const references=new Set();if(connected)visit(connected.expr,n=>{if(n.type==='Identifier')references.add(n.name);});
  const hostNames=new Set();
  for(const d of calls.filter(d=>references.has(d.name)))visit(d.expr,n=>{
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&property(n.callee)==='includes'){
      const name=n.callee.object?.arguments?.[0]?.name;
      const candidate=m.defs.find(d=>d.name===name);
      if(candidate?.expr.arguments?.[1]?.body?.type==='ArrayExpression'&&exported(candidate))hostNames.add(name);
    }
  });
  const hosts=m.defs.find(d=>d.name===one([...hostNames]));
  // A changed native method contract disables this capability rather than guessing an empty list.
  const methods=['getWorkInProgress','getCachedThreadIds','getLoadedConversationHistory','sendRequest'];
  if(!clients||!hosts||!init(clients)||!init(hosts)||!methods.every(name=>source.includes(name+'(')||source.includes('get '+name+'(')))return null;
  return {clients:exported(clients),hosts:exported(hosts),init:[...new Set([init(clients),init(hosts)])]};
}
