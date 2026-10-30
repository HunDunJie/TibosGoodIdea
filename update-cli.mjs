// One bounded background download per installation; cancellation is acknowledged after writes stop.
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {defaultStateDir} from './runtime-paths.mjs';
import {managedRoot,clientFingerprint,checkProgramUpdates,activatePending,resolveActive,recoverTransaction,cleanProgramUpdates} from './program-updates.mjs';
import {initializePortable,migrateLegacy} from './portable-runtime.mjs';
import {startupUpdates} from './startup-updates.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const args=process.argv.slice(2),option=(n,d='')=>args.includes(n)?args[args.indexOf(n)+1]:d;
const root=path.resolve(option('--root','.')),action=args[0],stateDir=option('--state-dir',defaultStateDir());
const pipe='\\\\.\\pipe\\tibo-update-'+createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,24);
async function codexBusy(){
  if(args.includes('--busy'))return true;
  const exe=option('--codex-exe');if(!exe)return false;
  if(!path.isAbsolute(exe)||path.basename(exe).toLowerCase()!=='chatgpt.exe')return true;
  try{const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$items=@(Get-CimInstance Win32_Process -Filter \"Name='ChatGPT.exe'\"|Where-Object {-not $_.ExecutablePath -or $_.ExecutablePath -ieq $env:TIBO_CODEX_EXE});if($items.Count){'busy'}else{'idle'}"],{windowsHide:true,timeout:10000,maxBuffer:2048,env:{...process.env,TIBO_CODEX_EXE:exe}});return stdout.trim()!=='idle';}catch{return true;}
}
async function contact(){return new Promise((resolve,reject)=>{const s=net.createConnection(pipe);let data='';s.setTimeout(2000,()=>s.destroy(Error('Update cancellation timed out')));s.once('error',reject);s.once('connect',()=>s.write('stop\n'));s.on('data',b=>{data+=b;if(data.length>1024)return s.destroy(Error('Invalid update acknowledgement'));if(data.includes('\n')){try{const owner=JSON.parse(data);if(path.resolve(owner.root)!==root||!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('Invalid update owner');s.destroy();resolve(owner.pid);}catch(e){s.destroy();reject(e);}}});});}
async function stop(){const pid=await contact().catch(e=>{if(['ENOENT','ECONNREFUSED'].includes(e.code))return null;throw e;});if(!pid)return;for(let i=0;i<160;i++){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}await delay(100);}throw Error('Update check is still stopping');}
async function checked(task){
  const abort=new AbortController(),sockets=new Set();
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.setTimeout(2000,()=>socket.destroy());socket.once('data',()=>{socket.end(JSON.stringify({pid:process.pid,root})+'\n');abort.abort();});});
  const owned=await new Promise(resolve=>{server.once('error',()=>resolve(false));server.listen(pipe,()=>resolve(true));});
  if(!owned)return;
  const timer=setTimeout(()=>abort.abort(),120000);
  try{return await task(abort.signal);}finally{clearTimeout(timer);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
try{
  if(action==='initialize'){console.log(JSON.stringify(await initializePortable(root)));process.exit(0);}
  await managedRoot(root);
  if(action==='migrate')console.log(JSON.stringify(await migrateLegacy(root,stateDir,{busy:args.includes('--busy')})));
  else if(action==='startup'){
    await stop();
    const client=option('--asar')?await clientFingerprint(option('--asar')).catch(()=>null):null;
    await checked(async signal=>console.log(JSON.stringify(await startupUpdates(root,{client,stateDir,busy:args.includes('--busy'),isBusy:codexBusy,readClient:async()=>await codexBusy()?null:option('--asar')?clientFingerprint(option('--asar')):null,signal}))));
  }
  else if(action==='stop')await stop();
  else if(action==='clean'){await stop();await cleanProgramUpdates(root);}
  else if(action==='resolve')console.log(await resolveActive(root));
  else if(action==='activate'){
    await stop();
    if(args.includes('--busy')){console.log(JSON.stringify({status:'deferred',reason:'codex-running'}));process.exit(0);}
    await recoverTransaction(root,{stateDir});
    const client=option('--asar')?await clientFingerprint(option('--asar')):null;
    const result=await activatePending(root,{client,stateDir,readClient:async()=>option('--asar')?clientFingerprint(option('--asar')):null});
    console.log(JSON.stringify(result));
  }else if(action==='check'){
    await checked(async signal=>{const client=option('--asar')?await clientFingerprint(option('--asar')):null;console.log(JSON.stringify(await checkProgramUpdates(root,{client,manual:args.includes('--manual'),signal})));});
  }else throw Error('Unknown update command');
}catch(e){console.error(String(e.message).slice(0,240));process.exitCode=1;}
