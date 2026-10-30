import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverFeatureBindings,readFeatureBindings} from '../feature-bindings.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const names={initial:'app-initial-fixture.js',shared:'app-shared-fixture.js'};
const shared='var rootScope={}; export {rootScope as rootExport};';
const composer='handleSubmit submitDisabled isResponseInProgress focusComposerAfterSubmit onAccepted';
const source=`import {rootExport as root} from './app-shared-fixture.js';
var eventAtom,composerScope,draftRecord,bindingKey,bindingAtom,navDefaults,navAtom,hostAtom;
function eventsInit(){eventAtom=atom(root,null,{onMount:()=>rpc.subscribe({event:'turn-completed'})})}
function scopeInit(){composerScope=scope('ComposerScope',{key:v=>v.id,parent:root,retain:{max:100}})}
function draftInit(){draftRecord=record('composer-prompt-drafts-v2',{legacyStorageKey:'composer-prompt-drafts-v1'})}
function storageRead(key,fallback){return localStorage[key]??fallback}
function bindingInit(){bindingKey='client-thread-bindings-v1';bindingAtom=derived(root,(key,{get})=>storageRead(bindingKey,void 0)?.[key]??'local:')}
function navigationInit(){navDefaults={navigate:noop,navigateToLocalConversation:noop,prepareNavigation:noop};navAtom=atom(root,navDefaults)}
function hostInit(){hostAtom=derived(root,(id,{get})=>{let hosts=get(id);return (hosts?.has('local')?'local':hosts?.values().next().value)??'local'})}
export {eventsInit as ei,eventAtom as ev,scopeInit as si,composerScope as cs,draftInit as di,storageRead as rs,bindingInit as bi,bindingAtom as ba,navigationInit as ni,navAtom as na,hostInit as hi,hostAtom as ha};`;
const discover=(s=source,c=composer)=>discoverFeatureBindings(s,shared,c,names);
test('discovers syntax across renamed exports, variables and quote styles',()=>{
  for(const quote of ["'",'"','`']){
    const changed=source.replaceAll("'",quote).replace(/from `([^`]+)`/,"from '$1'").replaceAll('eventAtom','renamedEvent').replaceAll(' as ev',' as changedExport');
    const b=discover(changed);assert.deepEqual(b.capabilities,{completion:true,send:true});assert.equal(b.completionEvent,'changedExport');assert.equal(b.scope,'rootExport');assert.equal(b.host,'ha');
  }
});
test('missing or ambiguous event disables only completion',()=>{
  assert.deepEqual(discover(source.replace('turn-completed','other-event')).capabilities,{completion:false,send:true});
  const duplicate=source+'var extraEvent; function extraInit(){extraEvent=atom(root,null,{onMount:()=>rpc.subscribe({event:"turn-completed"})})} export {extraEvent as ee,extraInit as ex};';
  assert.deepEqual(discover(duplicate).capabilities,{completion:false,send:true});
});
test('unknown draft shape disables only sending and does not execute source',()=>{
  globalThis.__tiboUntrustedSourceRan=false;
  const b=discover(source+'globalThis.__tiboUntrustedSourceRan=true;', 'changed composer');
  assert.deepEqual(b.capabilities,{completion:true,send:false});assert.equal(globalThis.__tiboUntrustedSourceRan,false);delete globalThis.__tiboUntrustedSourceRan;
  assert.equal(discover(source.replace('client-thread-bindings-v1','unknown')).capabilities.send,false);
});
async function archive(files){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-bindings-')),file=path.join(temp,'fixture.asar'),entries={};let offset=0;
  for(const [name,content]of Object.entries(files)){entries[name]={size:Buffer.byteLength(content),offset:String(offset)};offset+=Buffer.byteLength(content);}
  const index=Buffer.from(JSON.stringify({files:{webview:{files:{assets:{files:entries}}}}})),head=Buffer.alloc(16);head.writeUInt32LE(index.length,12);head.writeUInt32LE(index.length+8,4);
  await fs.writeFile(file,Buffer.concat([head,index,...Object.values(files).map(s=>Buffer.from(s))]));return {temp,file};
}
test('missing composer asset still permits verified completion events',async()=>{
  const {temp,file}=await archive({[names.initial]:source,[names.shared]:shared});
  try{assert.deepEqual((await readFeatureBindings(file)).capabilities,{completion:true,send:false,shutdown:false});}finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('signed catalog mapping is used only for the exact renderer fingerprints',async()=>{
  const {temp,file}=await archive({[names.initial]:source,[names.shared]:shared});
  try{
    const found=await readFeatureBindings(file),entry={fingerprints:found.fingerprints,bindings:{...found,scope:'patched'}};
    assert.equal((await readFeatureBindings(file,{catalog:[entry]})).scope,'patched');
    entry.fingerprints={...entry.fingerprints,[names.initial]:'0'.repeat(64)};
    assert.equal((await readFeatureBindings(file,{catalog:[entry]})).scope,'rootExport');
    await fs.writeFile(file,Buffer.alloc(8));await assert.rejects(()=>readFeatureBindings(file),/Truncated/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
