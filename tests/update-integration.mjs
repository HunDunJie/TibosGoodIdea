// Isolated real package + Windows worker handoff. No Codex, drafts or audible playback.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {generateKeyPairSync,sign} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkProgramUpdates,activatePending,resolveActive,launchWorker} from '../program-updates.mjs';
import {readPackage,sha256} from '../update-files.mjs';import {requestWorker} from '../worker-client.mjs';
if(process.platform!=='win32'){console.log('Windows update integration skipped');process.exit(0);}
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url))),temp=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'tibo-update-integration-')),root=path.join(temp,'installed with spaces'),state=path.join(temp,'state');
let livePid=null,passed=false;
const checkers=[];
async function run(exe,args,{cwd=source}={}){const child=spawn(exe,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>out+=c);const timer=setTimeout(()=>child.kill(),60000);try{const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});assert.equal(code,0,out.slice(-1400));return out;}finally{clearTimeout(timer);}}
try{
 const files=JSON.parse(await fs.readFile(path.join(source,'release-files.json'),'utf8'));
 await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(source,'install.ps1'),'-TargetDir',root,'-NoShortcut']);
 const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'pem'});await fs.writeFile(path.join(root,'updates/program-public-key.pem'),key);
 const marker=path.join(temp,'fetch-started'),loader=path.join(temp,'slow-fetch.mjs');
 await fs.writeFile(loader,`import fs from 'node:fs/promises';globalThis.fetch=async(url,{signal})=>{await fs.appendFile(${JSON.stringify(marker)},'started\\n');return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('slow fixture')),30000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason)},{once:true});});};`);
 async function startCheck(){const prior=await fs.readFile(marker,'utf8').catch(()=>''),child=spawn(path.join(root,'runtime/node.exe'),['--import',pathToFileURL(loader).href,path.join(root,'update-cli.mjs'),'check','--root',root,'--manual'],{windowsHide:true,stdio:'ignore'});const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});checkers.push({child,exited});for(let i=0;i<100;i++){if((await fs.readFile(marker,'utf8').catch(()=>''))!==prior)return exited;if(child.exitCode!==null)throw Error('Background checker exited before fetching');await delay(50);}throw Error('Background check did not start');}
 // Competing checks share a pipe; cancellation waits for the owner process to exit.
 const checking=startCheck();checking.catch(()=>{});for(let i=0;i<100&&!await fs.stat(marker).catch(()=>null);i++)await delay(50);
 await run(path.join(root,'runtime/node.exe'),['--import',pathToFileURL(loader).href,path.join(root,'update-cli.mjs'),'check','--root',root,'--manual']);
 assert.equal((await fs.readFile(marker,'utf8')).trim().split('\n').length,1);
 await run(path.join(root,'runtime/node.exe'),[path.join(root,'update-cli.mjs'),'stop','--root',root]);assert.equal(await checking,0);
 await fs.unlink(path.join(root,'program-update-state.json'));
 const version='0.8.0-rc.16',zipPath=path.join(temp,'candidate.zip');
 await run('python',['-X','utf8','-c',`import json,hashlib,zipfile,sys\nfrom pathlib import Path\nr=Path(sys.argv[1]); names=json.loads((r/'release-files.json').read_text('utf-8')); data={n:(r/n).read_bytes() for n in names}\nfor n in ['product.json','package.json']:\n d=json.loads(data[n]);d['version']=sys.argv[3];data[n]=(json.dumps(d,ensure_ascii=False,indent=2)+'\\n').encode()\nmanifest={n:hashlib.sha256(b).hexdigest() for n,b in data.items()}\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:\n for n,b in data.items():z.writestr('TibosGoodIdea/'+n,b)\n z.writestr('TibosGoodIdea/SHA256-MANIFEST.json',json.dumps(manifest))`,root,zipPath,version]);
 const bytes=await fs.readFile(zipPath),pkg=readPackage(bytes),client='c'.repeat(64),release={version,channel:'preview',kind:'fix',platform:'win32-x64',minimumUpdater:1,stateSchema:1,clients:[client],url:`https://github.com/HunDunJie/TibosGoodIdea/releases/download/v${version}/TibosGoodIdea-${version}-Windows-x64.zip`,bytes:bytes.length,sha256:sha256(bytes),manifestSha256:pkg.manifestSha256};
 const payload=Buffer.from(JSON.stringify({schema:1,productId:'bottom-bar-companion',revision:2,releases:[release]})),envelope={payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 await fs.mkdir(state);const configPath=path.join(root,'config.local.json');await fs.writeFile(configPath,JSON.stringify({language:'auto',timeZone:'UTC',extra:'preserve'}));
 const initial=await launchWorker(root,state,configPath);livePid=initial.workerPid;
 await requestWorker(state,'observe',{accountId:'isolated',resetsAt:Date.now()+3600000,remaining:0,updatedAt:Date.now()});
 await requestWorker(state,'toggle',{feature:'refresh',enabled:true});await requestWorker(state,'toggle',{feature:'completion',enabled:true});await requestWorker(state,'toggle',{feature:'send',enabled:true});
 let status=await requestWorker(state,'status'),alarmId=status.refresh.alarm.id,batchId=status.send.id,oldPid=livePid;
 let calls=0;assert.equal((await checkProgramUpdates(root,{client,key,fetchImpl:async()=>new Response(++calls===1?JSON.stringify(envelope):bytes)})).status,'ready');
 const lease=await requestWorker(state,'prepare-update',{root});await assert.rejects(requestWorker(state,'toggle',{feature:'completion',enabled:true}));assert.equal(await requestWorker(state,'claim-send'),null);await requestWorker(state,'cancel-update',{token:lease.token});
 assert.equal((await activatePending(root,{client,key,stateDir:state})).status,'activated');
 status=await requestWorker(state,'status');livePid=status.workerPid;
 assert.notEqual(livePid,oldPid);assert.equal(status.workerVersion,version);assert.equal(status.workerRoot,await resolveActive(root,{key}));
 assert.equal(status.refresh.enabled,true);assert.equal(status.completion.enabled,true);assert.equal(status.refresh.alarm.id,alarmId);assert.equal(status.send.id,batchId);assert.equal(status.send.phase,'armed');assert.equal(status.ringing,null);
 assert.equal(JSON.parse(await fs.readFile(configPath)).extra,'preserve');assert.equal((await requestWorker(state,'player-status')).notificationsShown,0);
 // Actual bootstrap routes settings into the new version while retaining root configuration.
 await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'bootstrap.ps1'),'-Script','settings.ps1','-NoUi','-TimeZone','UTC','-StateDir',state]);
 assert.equal(JSON.parse(await fs.readFile(configPath)).extra,'preserve');
 await requestWorker(state,'shutdown');for(let i=0;i<100;i++){try{process.kill(livePid,0);await delay(100);}catch{livePid=null;break;}}assert.equal(livePid,null);
 // The root uninstaller cancels a download and removes both payloads without Codex.
 const downloading=startCheck();downloading.catch(()=>{});for(let i=0;i<100&&(await fs.readFile(marker,'utf8')).trim().split('\n').length<2;i++)await delay(50);
 await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'bootstrap.ps1'),'-Script','uninstall.ps1','-NoShortcut','-StateDir',state,'-BackupDir',path.join(temp,'backup')],{cwd:temp});
 assert.equal(await downloading,0);await delay(200);
 assert.equal(await fs.stat(root).catch(()=>null),null);
 passed=true;console.log(JSON.stringify({passed,realSignedPackage:true,files:files.length,offlineNodeChecks:true,realWorkerHandoff:true,rootConfigPreserved:true,alarmsAndBatchPreserved:true,leaseBlocksNewWork:true,bootstrapRoutesSettings:true,concurrentChecksSerialized:true,uninstallCancelsDownload:true,allVersionsUninstalled:true,realCodexChanged:false,audibleSound:false}));
}finally{
 for(const {child,exited} of checkers){if(child.exitCode===null){child.kill();await exited.catch(()=>{});}}
 if(livePid){await requestWorker(state,'shutdown').catch(()=>{});for(let i=0;i<100;i++){try{process.kill(livePid,0);await delay(100);}catch{livePid=null;break;}}}
 if(passed&&path.basename(temp).startsWith('tibo-update-integration-'))await fs.rm(temp,{recursive:true,force:true});
}
