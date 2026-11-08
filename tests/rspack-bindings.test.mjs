import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverRspackBindings} from '../rspack-bindings.mjs';
import {readFeatureBindings} from '../feature-bindings.mjs';
import {clientFingerprint} from '../program-updates.mjs';
import {sha256} from '../update-files.mjs';

const source=`export const __webpack_modules__={
 root(e,t,r){let scope={};r.d(t,{}, {u:scope})},
 event(e,t,r){var a=r('root');let atom=make(a.u,null,{onMount:()=>client.subscribe({event:'turn-completed'})});r.d(t,{ev:()=>atom})},
 composer(e,t,r){let scope=make('ComposerScope');const storageKey='composer-prompt-drafts-v2';r.d(t,{}, {cs:scope})},
 binding(e,t,r){var a=r('root'),s=r('storage');let key='client-thread-bindings-v1',atom=make(a.u,(e,{get})=>s.read(key,void 0)??'local:');r.d(t,{}, {binding:atom})},
 navigation(e,t,r){var a=r('root');let atom=make(a.u,{navigate:noop,navigateToLocalConversation:noop,prepareNavigation:noop});r.d(t,{}, {nav:atom})},
 host(e,t,r){var a=r('root');let atom=make(a.u,(e,{get})=>{let ids=get(e);return (ids.has('local')?'local':ids.values().next().value)??'local'});r.d(t,{}, {host:atom})},
 clients(e,t,r){var a=r('root'),h=r('hosts');let atom=make(a.u,e=>({status:'unavailable',client:null})),connected=make(a.u,e=>get(h.ids).includes(e));r.d(t,{}, {clients:atom});function contract(){rpc.getWorkInProgress();rpc.getCachedThreadIds();rpc.getLoadedConversationHistory();rpc.sendRequest()}},
 hosts(e,t,r){let ids=['local','durable'];r.d(t,{}, {ids})},
 storage(e,t,r){function read(key,fallback){return fallback}r.d(t,{read:()=>read})}
};`;
const composer='handleSubmit submitDisabled isResponseInProgress focusComposerAfterSubmit onAccepted';
const options={entry:'runtime.hash.js',chunk:'async/main.hash.js',composerSource:composer};
async function fixture(files,fn){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-rspack-')),asar=path.join(temp,'fixture.asar');
  const tree={files:{}},chunks=[];let offset=0;
  for(const [name,value]of Object.entries(files)){
    const bytes=Buffer.from(value),parts=name.split('/');let parent=tree;
    for(const part of parts.slice(0,-1))parent=parent.files[part]??=( {files:{}} );
    parent.files[parts.at(-1)]={size:bytes.length,offset:String(offset)};chunks.push(bytes);offset+=bytes.length;
  }
  const index=Buffer.from(JSON.stringify(tree)),head=Buffer.alloc(16);head.writeUInt32LE(index.length,12);head.writeUInt32LE(index.length+8,4);
  await fs.writeFile(asar,Buffer.concat([head,index,...chunks]));
  try{await fn(asar)}finally{await fs.rm(temp,{recursive:true,force:true})}
}
const modern={
 'webview/index.html':'<script type="module" src="/assets/runtime.hash.js"></script><script type="module" src="/assets/shared.hash.js"></script>',
 'webview/assets/runtime.hash.js':'export const __webpack_require__=()=>{};',
 'webview/assets/shared.hash.js':'export const shared=true;',
 'webview/assets/async/main.hash.js':source,
 'webview/assets/async/composer.hash.js':composer+' '.repeat(1100)
};
test('Rspack syntax discovers independent event, draft and task interfaces with eager and lazy exports',()=>{
 const b=discoverRspackBindings(source,options);
 assert.deepEqual(b.capabilities,{completion:true,send:true,shutdown:true});assert.equal(b.scope,'root:u');assert.equal(b.completionEvent,'event:ev');assert.equal(b.readStorage,'storage:read');assert.equal(b.monitor.hosts,'hosts:ids');
});
test('changed or ambiguous Rspack contracts disable only the affected verified capabilities',()=>{
 assert.equal(discoverRspackBindings(source.replace('turn-completed','unknown-event'),options).capabilities.completion,false);
 const noBinding=discoverRspackBindings(source.replace('client-thread-bindings-v1','unknown-key'),options);assert.equal(noBinding.capabilities.send,false);assert.equal(noBinding.capabilities.completion,true);
 assert.equal(discoverRspackBindings(source,{...options,composerSource:''}).capabilities.send,false);
 const changedRoot=source.replace("make(a.u,{navigate:","make(a.other,{navigate:");assert.deepEqual(discoverRspackBindings(changedRoot,options).capabilities,{completion:false,send:false,shutdown:false});
});
test('mounted native navigation resolves an imported atom only for the verified root store',()=>{
 const changed=source.replace("let atom=make(a.u,{navigate:noop,navigateToLocalConversation:noop,prepareNavigation:noop});","let atom={};function mount(){let store=useStore(a.u);store.set(a.navigation,{navigate:noop,navigateToLocalConversation:noop,prepareNavigation:noop})}");
 assert.equal(discoverRspackBindings(changed,options).navigation,'root:navigation');
 assert.equal(discoverRspackBindings(changed,options).capabilities.send,true);
 assert.equal(discoverRspackBindings(changed.replace('useStore(a.u)','useStore(a.other)'),options).capabilities.send,false);
 const duplicate=changed.replace('store.set(a.navigation,','store.set(a.other, {navigate:noop,navigateToLocalConversation:noop,prepareNavigation:noop});store.set(a.navigation,');
 assert.equal(discoverRspackBindings(duplicate,options).capabilities.send,false);
});
test('quota reader follows the exported native wrapper and rejects unrelated or ambiguous readers',()=>{
 const quota=`quota(e,t,r){function native(store,options){return client.CodexRequest.safeGet('/wham/usage',options)}function fetch(store,options){return native(store,{...options,expectedIdentity:identity(store)})}r.d(t,{}, {fetch})}`;
 const s=source.slice(0,-2)+','+quota+'};';
 assert.equal(discoverRspackBindings(s,options).quotaFetch,'quota:fetch');
 assert.equal(discoverRspackBindings(s.replace('/wham/usage','/other'),options).quotaFetch,null);
 assert.equal(discoverRspackBindings(s.replace('expectedIdentity','unrelated'),options).quotaFetch,null);
 assert.equal(discoverRspackBindings(source.slice(0,-2)+','+quota+','+quota.replace('quota(e','other(e')+'};',options).quotaFetch,null);
});
test('new archives use HTML entry points for fingerprints and resolve nested application chunks',()=>fixture(modern,async asar=>{
 const b=await readFeatureBindings(asar);assert.deepEqual(b.capabilities,{completion:true,send:true,shutdown:true});assert.equal(b.rspack.entry,'runtime.hash.js');assert.equal(b.rspack.chunk,'async/main.hash.js');
 assert.match(await clientFingerprint(asar),/^[a-f0-9]{64}$/);
}));
test('legacy fingerprints stay byte-identical to published catalogs',()=>fixture({'webview/assets/app-initial-a.js':'initial','webview/assets/app-shared-b.js':'shared'},async asar=>{
 assert.equal(await clientFingerprint(asar),sha256(JSON.stringify([['app-initial-a.js',sha256('initial')],['app-shared-b.js',sha256('shared')]])));
}));
test('entry changes alter fingerprints and missing or unrecognized entry points fail clearly',async()=>{
 let old;await fixture(modern,async asar=>{old=await clientFingerprint(asar)});
 await fixture({...modern,'webview/assets/shared.hash.js':'export const shared=false;'},async asar=>assert.notEqual(await clientFingerprint(asar),old));
 await fixture({...modern,'webview/index.html':'<script src="/assets/missing.js"></script>'},async asar=>assert.rejects(clientFingerprint(asar),/entry points/));
 await fixture({'webview/assets/unknown.js':'unknown'},async asar=>assert.rejects(clientFingerprint(asar),/Unrecognized/));
});
test('duplicate modern application chunks are rejected instead of choosing an arbitrary one',()=>fixture({...modern,'webview/assets/async/duplicate.js':source},async asar=>{
 await assert.rejects(readFeatureBindings(asar),/Ambiguous Rspack application chunk/);
}));
