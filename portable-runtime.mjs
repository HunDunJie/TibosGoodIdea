// Portable ownership and one-time legacy handoff. No program files are copied.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {noLinks,safeRelative,sha256} from './update-files.mjs';
import {saveStateJson} from './state-file.mjs';
import {requestWorker} from './worker-client.mjs';
import {portableOwnerPipe} from './runtime-paths.mjs';
const productId='bottom-bar-companion';
async function json(file){try{const s=await fs.stat(file);if(s.size>512*1024)throw Error('Portable state too large');return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function localSave(root,file,value){await noLinks(root,file);await noLinks(root,file+'.tmp');await saveStateJson(file,value);}
export async function initializePortable(root){
  root=path.resolve(root);await noLinks(root);
  const marker=path.join(root,'install-info.json');await noLinks(root,marker);
  const prior=await json(marker);
  if(prior){if(prior.productId!==productId)throw Error('Unexpected folder owner');return prior;}
  for(const name of ['product.json','release-files.json','SHA256-MANIFEST.json'])await noLinks(root,path.join(root,name));
  const product=await json(path.join(root,'product.json')),files=await json(path.join(root,'release-files.json')),manifest=await json(path.join(root,'SHA256-MANIFEST.json'));
  if(product?.productId!==productId||!Array.isArray(files)||!files.length||files.length>256||!manifest||Array.isArray(manifest)||Object.keys(manifest).length!==files.length||new Set(files).size!==files.length)throw Error('Extract the complete Windows ZIP before starting TiBo');
  for(const name of files){safeRelative(name);const file=path.join(root,name);await noLinks(root,file);if(!/^[a-f0-9]{64}$/.test(manifest[name]??'')||sha256(await fs.readFile(file))!==manifest[name])throw Error('Portable package checksum mismatch: '+name);}
  const info={productId,version:product.version,mode:'portable',files,initializedAt:new Date().toISOString()};
  await localSave(root,marker,info);return info;
}
export async function portableOwner(){
  return new Promise((resolve,reject)=>{
    const s=net.createConnection(portableOwnerPipe());let data='',done=false;
    const end=(e,v)=>{if(done)return;done=true;s.destroy();e?reject(e):resolve(v);};
    s.setTimeout(2000,()=>end(Error('Portable service did not respond')));
    s.on('error',e=>['ENOENT','ECONNREFUSED'].includes(e.code)?end(null,null):end(e));
    s.on('end',()=>end(Error('Portable service closed without an owner')));
    s.on('close',()=>{if(!done)end(Error('Portable service closed without an owner'));});
    s.on('data',b=>{data+=b;if(data.length>8192)return end(Error('Invalid portable owner'));if(data.includes('\n'))try{const v=JSON.parse(data);if(!path.isAbsolute(v.root)||!path.isAbsolute(v.stateDir)||!Number.isSafeInteger(v.pid)||v.pid<=0)throw Error('Invalid portable owner');end(null,v);}catch(e){end(e);}});
  });
}
export async function migrateLegacy(root,stateDir,{busy=false,localAppData=process.env.LOCALAPPDATA??os.homedir(),worker=requestWorker,ownerCheck=portableOwner}={}){
  root=path.resolve(root);stateDir=path.resolve(stateDir);await noLinks(root,stateDir);
  const owner=await ownerCheck();
  if(owner&&path.resolve(owner.root)!==root)throw Error('Another TiBo folder is active: '+owner.root+' — exit TiBo from its tray menu first');
  const receipt=path.join(stateDir,'portable-migration.json');await noLinks(root,receipt);
  const completed=await json(receipt);
  const legacyRoot=path.join(localAppData,'Programs','TibosGoodIdea'),legacyState=path.join(localAppData,'CodexBottomBar');
  const marker=await json(path.join(legacyRoot,'install-info.json'));
  let live=null;try{live=await worker(legacyState,'status');}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;}
  if(live){
    if(!Number.isSafeInteger(live.workerPid)||live.workerPid<=0)throw Error('Invalid legacy service owner');
    const ownerRoot=path.resolve(live.workerRoot??'');
    if(marker?.productId!==productId||ownerRoot!==legacyRoot&&!ownerRoot.startsWith(path.join(legacyRoot,'versions')+path.sep))throw Error('A different reminder service is running; exit it from the tray first');
    if(busy||live.send?.phase==='running')throw Error('Finish tasks and close Codex before switching to portable TiBo');
    await worker(legacyState,'restart');
    let stopped=false;
    for(let i=0;i<100;i++){try{process.kill(live.workerPid,0);}catch(e){if(e.code==='ESRCH'){stopped=true;break;}throw e;}await delay(100);}
    if(!stopped)throw Error('The old reminder service has not exited');
  }
  if(completed)return {status:'complete'};
  await fs.mkdir(stateDir,{recursive:true});
  // Missing destinations only: an interrupted migration can safely resume.
  const copy=async(from,to,transform=v=>v)=>{await noLinks(root,to);if(await json(to)!==null)return;const value=await json(from);if(value!==null)await localSave(root,to,transform(value));};
  if(marker?.productId===productId&&path.resolve(legacyRoot)!==root){
    await copy(path.join(legacyRoot,'config.local.json'),path.join(root,'config.local.json'),config=>{
      for(const k of ['completionAudio','refreshAudio'])if(typeof config[k]==='string'&&path.isAbsolute(config[k])&&config[k].toLowerCase().startsWith(legacyRoot.toLowerCase()+path.sep)&&/[/\\]sounds[/\\](?:completion|refresh)\.wav$/i.test(config[k]))config[k]='';
      return config;
    });
    await copy(path.join(legacyState,'features.json'),path.join(stateDir,'features.json'),state=>{
      // Preserve deduplication and once-only send IDs; never resume an uncertain send.
      if(state.send?.phase==='running')state.send={phase:'interrupted',error:'Previous send interrupted; check chats before re-enabling'};
      return state;
    });
    await copy(path.join(legacyState,'codex-language.json'),path.join(stateDir,'codex-language.json'));
  }
  await localSave(root,receipt,{completedAt:new Date().toISOString(),legacy:marker?.productId===productId});
  return {status:'complete'};
}
