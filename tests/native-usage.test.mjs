import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverRspackUsage,discoverUsageChunks,readNativeBindings} from '../native-bindings.mjs';

const profile=`export const __webpack_modules__={profile(e,t,r){
var api=r('modal'),root=r('root'),usage=r('usage'),turn=r('turn'),history=r('history'),ids=r('ids');
function Profile(){let store=useStore(root.scope),conversation=useConversation(),remote=useRoute('/remote/:taskId');
let current=conversation??(remote?.params.taskId!=null?(0,ids.decode)(remote.params.taskId):null);
return ()=>{(0,api.open)(store,usage.modal,{defaultResetCreditsOpen:!0,initialAvailableCount:2,isRateLimitReached:!1,onResetComplete:()=>{
let last=conversation==null?null:store.get(turn.current,conversation);if(last!=null)(0,history.record)(store,{accountId:'account',conversationId:conversation,turnId:last});}})}}}};`;
const loader=`export const __webpack_modules__={loader(e,t,r){const lazy=()=>Promise.all([r.e(12),r.e(34)]).then(r.bind(r,'profile'));}};`;
const expected={profileId:'profile',scope:{id:'root',export:'scope'},openModal:{id:'modal',export:'open'},usageModal:{id:'usage',export:'modal'},turn:{id:'turn',export:'current'},recordReset:{id:'history',export:'record'},decodeConversation:{id:'ids',export:'decode'}};

async function fixture(files,callback){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-native-usage-')),file=path.join(temp,'fixture.asar'),tree={files:{}},chunks=[];let offset=0;
  for(const [name,text]of Object.entries(files)){
    const bytes=Buffer.from(text),parts=name.split('/');let parent=tree;
    for(const part of parts.slice(0,-1))parent=parent.files[part]??={files:{}};
    parent.files[parts.at(-1)]={size:bytes.length,offset:String(offset)};offset+=bytes.length;chunks.push(bytes);
  }
  const index=Buffer.from(JSON.stringify(tree)),head=Buffer.alloc(16);head.writeUInt32LE(index.length,12);head.writeUInt32LE(index.length+8,4);
  await fs.writeFile(file,Buffer.concat([head,index,...chunks]));
  try{await callback(file)}finally{await fs.rm(temp,{recursive:true,force:true})}
}
const modern={
  'webview/index.html':'<script src="/assets/123.hash.js"></script>',
  'webview/assets/123.hash.js':'export const __webpack_require__=()=>{}',
  'webview/assets/async/12.hash.js':profile+'// onRateLimitResetClick',
  'webview/assets/async/56.hash.js':loader,
};
test('native usage follows renamed Rspack imports and the reset completion callback without executing code',()=>{
  globalThis.__usageExecuted=false;
  assert.deepEqual(discoverRspackUsage(profile+'globalThis.__usageExecuted=true;'),expected);
  assert.equal(globalThis.__usageExecuted,false);delete globalThis.__usageExecuted;
  assert.deepEqual(discoverRspackUsage(profile.replaceAll('store','renamed').replaceAll('r(','load(').replace('profile(e,t,r)','profile(e,t,load)')),expected);
});
test('ambiguous or incomplete reset contexts fail instead of opening another modal',()=>{
  assert.throws(()=>discoverRspackUsage(profile.replace('history.record','history.missing').replace("history=r('history')","history=unknown")),/Incomplete/);
  assert.throws(()=>discoverRspackUsage(profile.replace('turn.current','unknown.current')),/Incomplete/);
  assert.throws(()=>discoverRspackUsage(profile.replace("'/remote/:taskId'","'/other/:taskId'")),/Incomplete/);
  const duplicate=profile.slice(profile.indexOf('profile(e,t,r)'),-2).replace('profile(','duplicate(');
  assert.throws(()=>discoverRspackUsage(profile.slice(0,-2)+','+duplicate+'};'),/Ambiguous/);
});
test('native profile loading uses its complete original group and validates the require owner',()=>{
  assert.deepEqual(discoverUsageChunks(loader,'profile'),[[12,34]]);
  assert.deepEqual(discoverUsageChunks(loader.replace('r.e(34)','other.e(34)'),'profile'),[]);
  assert.deepEqual(discoverUsageChunks(loader.replace("'profile'","'unrelated'"),'profile'),[]);
  assert.deepEqual(discoverUsageChunks("r.e(12).then(r.bind(r,'profile'));",'profile'),[[12]]);
});
test('numbered renderer archives resolve all native usage references and dependencies',()=>fixture(modern,async file=>{
  const {profileId,...refs}=expected;
  assert.deepEqual(await readNativeBindings(file),{schema:2,rspack:{entry:'123.hash.js',chunks:[12,34]},...refs});
}));
test('ambiguous profile or loading groups are rejected',async()=>{
  await fixture({...modern,'webview/assets/async/duplicate.js':modern['webview/assets/async/12.hash.js']},async file=>assert.rejects(readNativeBindings(file),/Ambiguous/));
  await fixture({...modern,'webview/assets/async/duplicate.js':loader.replace('r.e(12)','r.e(99)')},async file=>assert.rejects(readNativeBindings(file),/loading group/));
});
test('legacy profile module bindings remain compatible',()=>fixture({
  'webview/assets/profile-dropdown-items-old.js':`import{scope as root}from'./app-shared-old.js';import{open as show,modal as usage,turn as current,record as save}from'./app-initial-old.js';import{hook as useConversation}from'./conversation-old.js';function profile(){let store=useStore(root),id=useConversation();show(store,usage,{defaultResetCreditsOpen:!0,onResetComplete:()=>{let last=store.get(current,id);save(store,{accountId:'A',conversationId:id,turnId:last})}})}`,
  'webview/assets/conversation-old.js':`import{decode as cast}from'./app-initial-old.js';function hook(){let id=route();return id?cast(id):null}export{hook as hook};`,
},async file=>{
  const b=await readNativeBindings(file);assert.equal(b.profileModule,'profile-dropdown-items-old.js');assert.equal(b.rspack,undefined);assert.deepEqual(b.decodeConversation,{module:'app-initial-old.js',export:'decode'});
}));
