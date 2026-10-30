// Real Windows scripts and worker, isolated folder/LOCALAPPDATA. No live Codex.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';import assert from 'node:assert/strict';
import {sha256} from '../update-files.mjs';import {requestWorker} from '../worker-client.mjs';
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url))),parent=await fs.realpath(os.tmpdir()),temp=await fs.mkdtemp(path.join(parent,'tibo-portable-test-'));
const root=path.join(temp,'便携 folder'),local=path.join(temp,'local'),state=path.join(root,'data');let passed=false,pid=null,legacyPid=null;
const files=JSON.parse(await fs.readFile(path.join(source,'release-files.json'),'utf8'));
async function run(exe,args,{env={},expected=0}={}){const child=spawn(exe,args,{cwd:temp,windowsHide:true,env:{...process.env,LOCALAPPDATA:local,...env},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);const timer=setTimeout(()=>child.kill(),45000);try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});expected?assert.notEqual(code,0,out.slice(-1200)):assert.equal(code,0,out.slice(-1200));return out;}finally{clearTimeout(timer);}}
const ps=(file,args=[],options={})=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...args],options);
const quote=v=>"'"+v.replaceAll("'","''")+"'";
try{
 await fs.mkdir(root);for(const name of files){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.copyFile(path.join(source,name),path.join(root,name));}
 assert.deepEqual(files.filter(n=>n.toLowerCase().endsWith('.cmd')),['Start.cmd']);
 assert.deepEqual((await fs.readdir(source)).filter(n=>n.toLowerCase().endsWith('.cmd')),['Start.cmd'],'Source root also exposes one entry only');
 // Stub only the native client launch. The shipping bootstrap and update coordinator run unchanged.
 await fs.writeFile(path.join(root,'start.ps1'),'\ufeff'+`param([switch]$Restart,[int]$Port=9347,[string]$StateDir='')\n. (Join-Path $PSScriptRoot 'launcher-common.ps1')\n@{ready=$env:TIBO_STARTUP_READY;root=$env:TIBO_INSTALL_ROOT;state=(Get-CqbStateDir);portable=$env:TIBO_PORTABLE_ROOT}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $env:TIBO_INSTALL_ROOT 'started.json') -Encoding utf8\n`);
 const inventory={};for(const name of files)inventory[name]=sha256(await fs.readFile(path.join(root,name)));await fs.writeFile(path.join(root,'SHA256-MANIFEST.json'),JSON.stringify(inventory));
 const loader=path.join(temp,'network.mjs'),requests=path.join(temp,'requests.log');
 await fs.writeFile(loader,`import fs from 'node:fs/promises';globalThis.fetch=async url=>{await fs.appendFile(${JSON.stringify(requests)},String(url)+'\\n');if(process.env.TIBO_TEST_OFFLINE)throw Error('offline fixture');return new Response(await fs.readFile(${JSON.stringify(root)}+'/updates/'+(String(url).endsWith('program-catalog.json')?'program-catalog.json':'catalog.json')));};`);
 const driver=path.join(temp,'start-driver.ps1');await fs.writeFile(driver,'\ufeff'+`function Get-AppxPackage { [pscustomobject]@{Version='1.0';InstallLocation=${quote(path.join(temp,'Fake Codex'))}} }\nfunction Get-CimInstance { return }\n& ${quote(path.join(root,'bootstrap.ps1'))}\n`);
 const env={NODE_OPTIONS:`--import=${pathToFileURL(loader).href}`};
 // Seed a real legacy service in redirected AppData, then verify its complete
 // process exit and preference handoff without touching the user's installation.
 const legacyRoot=path.join(local,'Programs/TibosGoodIdea'),legacyState=path.join(local,'CodexBottomBar');
 await ps(path.join(source,'install.ps1'),['-TargetDir',legacyRoot,'-NoShortcut']);
 const legacyMarker=await fs.readFile(path.join(legacyRoot,'install-info.json'),'utf8');
 const legacy=JSON.parse(await run(path.join(legacyRoot,'runtime/node.exe'),[path.join(legacyRoot,'worker-client.mjs'),'start-configured','--state-dir',legacyState,'--config',path.join(legacyRoot,'config.local.json')]));legacyPid=legacy.workerPid;
 await requestWorker(legacyState,'observe',{accountId:'portable-fixture',resetsAt:Date.now()+86400000,remaining:5,updatedAt:Date.now()});
 await requestWorker(legacyState,'toggle',{feature:'refresh',enabled:true});
 const armed=await requestWorker(legacyState,'toggle',{feature:'send',enabled:true});
 await ps(driver,[],{env});
 assert.equal(JSON.parse(await fs.readFile(path.join(state,'features.json'))).send.id,armed.send.id);
 assert.throws(()=>process.kill(legacyPid,0),{code:'ESRCH'});legacyPid=null;
 const started=JSON.parse((await fs.readFile(path.join(root,'started.json'),'utf8')).replace(/^\ufeff/,''));assert.equal(started.root,root);assert.equal(started.portable,root);assert.equal(started.state,state);assert.equal(started.ready,'1');
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'install-info.json'))).mode,'portable');assert.equal(await fs.readFile(path.join(legacyRoot,'install-info.json'),'utf8'),legacyMarker);assert.deepEqual(await fs.readdir(path.join(local,'Programs')),['TibosGoodIdea']);
 await ps(driver,[],{env});assert.equal((await fs.readFile(requests,'utf8')).trim().split('\n').length,4,'Every launch fetches both signed indexes');
 await ps(driver,[],{env:{...env,TIBO_TEST_OFFLINE:'1'}});assert.equal(JSON.parse(await fs.readFile(path.join(state,'startup-update.json'))).program,'offline');
 await ps(path.join(root,'bootstrap.ps1'),['-Script','settings.ps1','-NoUi','-TimeZone','UTC']);assert.equal(JSON.parse(await fs.readFile(path.join(root,'config.local.json'))).timeZone,'UTC');
 // Launch the real worker using the portable root; test same-folder re-use and exit without audio.
 const portableEnv={TIBO_INSTALL_ROOT:root,TIBO_PORTABLE_ROOT:root,TIBO_STATE_DIR:state};
 const status=JSON.parse(await run(path.join(root,'runtime/node.exe'),[path.join(root,'worker-client.mjs'),'start-configured','--state-dir',state,'--config',path.join(root,'config.local.json')],{env:portableEnv}));pid=status.workerPid;
 assert.equal((await requestWorker(state,'status')).workerPid,pid);assert.equal((await requestWorker(state,'player-status')).playing,null);
 await ps(path.join(root,'bootstrap.ps1'),['-Script','manage.ps1','-Action','exit','-StateDir',state],{env:portableEnv});
 let stopped=false;for(let i=0;i<100;i++){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){stopped=true;break;}throw e;}await delay(100);}assert.equal(stopped,true);pid=null;
 assert.equal(JSON.parse(await fs.readFile(path.join(state,'shutdown-state.json'))).enabled,false);
 assert.equal(await fs.readFile(path.join(legacyRoot,'install-info.json'),'utf8'),legacyMarker);
 passed=true;console.log(JSON.stringify({passed,oneCmd:true,portableInPlace:true,everyLaunchChecks:true,offlineFallback:true,settingsInPlace:true,legacyWorkerHandoff:true,legacyFilesRetained:true,armedSendPreserved:true,workerExitConfirmed:true,noLiveCodex:true,noAudiblePlayback:true,noRealShutdown:true}));
}finally{
 if(pid)await requestWorker(state,'shutdown').catch(()=>{});
 if(legacyPid)await requestWorker(path.join(local,'CodexBottomBar'),'shutdown').catch(()=>{});
 if(passed&&path.dirname(temp)===parent&&path.basename(temp).startsWith('tibo-portable-test-'))await fs.rm(temp,{recursive:true,force:true});
}
