const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const net=require('node:net');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(exe,args){
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  const timer=setTimeout(()=>child.kill(),45000);
  try {const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});return {code,output};}
  finally {clearTimeout(timer);}
}
(async()=>{
  if(process.platform!=='win32'){console.log('Windows lifecycle test skipped');return;}
  const tempRoot=await fs.realpath(os.tmpdir());
  const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(tempRoot,'cqb-lifecycle-test-'));
  const stateDir=path.join(temp,'state'),first=path.join(temp,'first install'),second=path.join(temp,'second install');
  const {requestWorker}=await import(pathToFileURL(path.join(root,'worker-client.mjs')).href);
  const quote=value=>`([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value,'utf8').toString('base64')}')))`;
  const ps=async(file,args=[])=>{const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...args]);assert.equal(result.code,0,result.output.slice(-1800));return result.output;};
  const launcher=path.join(temp,'launch.ps1'),stopper=path.join(temp,'stop.ps1');
  await fs.writeFile(launcher,'\ufeff'+`param([string]$PackageRoot,[string]$StateDir,[int]$Port)\n. ${quote(path.join(root,'launcher-common.ps1'))}\n. ${quote(path.join(root,'lifecycle-common.ps1'))}\nStart-CqbController (Join-Path $PackageRoot 'runtime\\node.exe') $PackageRoot $StateDir $Port\n`);
  await fs.writeFile(stopper,'\ufeff'+`param([string]$StateDir)\n. ${quote(path.join(root,'launcher-common.ps1'))}\n. ${quote(path.join(root,'lifecycle-common.ps1'))}\nStop-CqbController $StateDir\n`);
  const state=async()=>JSON.parse(await fs.readFile(path.join(stateDir,'controller.json'),'utf8'));
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  let browser,server,passed=false;
  try {
    for(const target of [first,second])await ps(path.join(root,'install.ps1'),['-TargetDir',target,'-NoShortcut']);
    let html=await fs.readFile(path.join(root,'preview.html'),'utf8');
    html=html.replace(/<link rel="stylesheet"[^>]*>/,'').replace(/<script src="(?:i18n|bottom-bar|feature-ui).js"><\/script>/g,'').replace(/<script>\s*\/\/ Preview controls[\s\S]*?<\/script>/,'');
    server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
    const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
    browser=await chromium.launch({headless:true,channel:'msedge',args:['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`]});
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
    const waitAttached=()=>page.waitForFunction(()=>window.__cqbFeatures?.status().connected && window.__codexBottomBar?.status().attached && document.querySelector('#codex-bottom-bar-features'),null,{timeout:20000});
    const start=target=>ps(launcher,['-PackageRoot',target,'-StateDir',stateDir,'-Port',String(port)]);
    // Two different copies racing from a clean state must serialize their handoff.
    await Promise.all([start(first),start(second)]);
    await waitAttached();
    const initialOwner=await state();
    await ps(stopper,['-StateDir',stateDir]);
    assert.equal(alive(initialOwner.pid),false);
    await fs.writeFile(path.join(stateDir,'controller.json'),JSON.stringify({...initialOwner,pid:process.pid}));
    await start(initialOwner.packageRoot);
    const current=await state(),other=current.packageRoot===first?second:first;
    assert.notEqual(current.pid,process.pid,'Reused cached PID does not block a fresh controller');
    assert.equal(alive(process.pid),true,'The unrelated process was not stopped');
    await waitAttached();
    const workerBefore=await requestWorker(stateDir,'status');
    assert.equal(workerBefore.workerRoot,current.packageRoot);
    assert.equal(workerBefore.refresh.enabled,false);assert.equal(workerBefore.completion.enabled,false);assert.equal(workerBefore.ringing,null);
    await requestWorker(stateDir,'observe',{accountId:'lifecycle-fixture-only',resetsAt:Date.now()+86400000,remaining:20,updatedAt:Date.now()});
    for(const feature of ['refresh','completion','send'])await requestWorker(stateDir,'toggle',{feature,enabled:true});
    const armed=await requestWorker(stateDir,'status');
    await start(current.packageRoot);
    assert.equal((await state()).pid,current.pid,'Starting the same copy reuses its controller');
    // An update at the same path must load both the new engine and injected UI.
    const metadataFile=path.join(current.packageRoot,'package.json');
    const metadata=JSON.parse(await fs.readFile(metadataFile,'utf8'));metadata.version+='-upgrade-fixture';
    await fs.writeFile(metadataFile,JSON.stringify(metadata));
    await start(current.packageRoot);
    const upgraded=await requestWorker(stateDir,'status');
    assert.notEqual(upgraded.workerPid,armed.workerPid);assert.equal(upgraded.workerVersion,metadata.version);
    assert.equal(upgraded.send.id,armed.send.id);assert.equal(upgraded.refresh.alarm.due,armed.refresh.alarm.due);
    assert.equal(upgraded.completion.enabled,true);
    const updatedController=await state();
    assert.notEqual(updatedController.pid,current.pid);assert.equal(updatedController.controllerVersion,metadata.version);
    assert.equal(alive(current.pid),false);await waitAttached();
    await start(other);
    const next=await state();
    assert.equal(next.packageRoot,other);assert.notEqual(next.pid,updatedController.pid);assert.equal(alive(updatedController.pid),false,'Previous controller exits before takeover');
    await waitAttached();
    assert.equal(await page.locator('#codex-bottom-bar-features').count(),1);
    const worker=await requestWorker(stateDir,'status');assert.equal(worker.workerRoot,other);
    assert.equal(worker.refresh.enabled,true);assert.equal(worker.completion.enabled,true);assert.equal(worker.refresh.alarm.due,armed.refresh.alarm.due);assert.equal(worker.send.id,armed.send.id);assert.equal(worker.send.phase,'armed');
    const player=await requestWorker(stateDir,'player-status');assert.equal(player.playing,null);assert.equal(player.notificationsShown,0);
    // Bypassing the launcher must still fail before touching shared state or injecting.
    const duplicate=await run(path.join(current.packageRoot,'runtime/node.exe'),[path.join(current.packageRoot,'controller.mjs'),'--port',String(port),'--state-dir',stateDir,'--no-features']);
    assert.notEqual(duplicate.code,0,'The named pipe rejects a second controller');
    assert.equal((await state()).pid,next.pid);assert.equal(alive(next.pid),true);
    const unsafeRestore=await run(path.join(other,'runtime/node.exe'),[path.join(other,'controller.mjs'),'--port',String(port),'--state-dir',stateDir,'--restore-once']);
    assert.notEqual(unsafeRestore.code,0,'One-off recovery cannot bypass an active controller');
    assert.equal((await state()).pid,next.pid);assert.equal(await page.locator('#codex-bottom-bar-features').count(),1);
    const processProbe=path.join(temp,'processes.ps1');
    await fs.writeFile(processProbe,'\ufeff'+`$processes=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.CommandLine -like '*controller.mjs*' -and $_.CommandLine.Contains(${quote(stateDir)})});@{count=$processes.Count}|ConvertTo-Json -Compress\n`);
    assert.equal(JSON.parse(await ps(processProbe)).count,1,'Exactly one controller owns this isolated state directory');
    // Recover a real orphaned renderer: only kill our verified isolated controller.
    let saved;
    for(let i=0;i<50;i++){saved=await state();if(Object.keys(saved.scripts??{}).length)break;await sleep(100)}
    assert.equal(saved.pid,next.pid);assert.ok(Object.keys(saved.scripts??{}).length);
    process.kill(next.pid,'SIGKILL');
    for(let i=0;i<100&&alive(next.pid);i++)await sleep(50);
    assert.equal(alive(next.pid),false);assert.equal(await page.locator('#codex-bottom-bar-features').count(),1,'Crash leaves the injected bar for one-off recovery');
    await ps(path.join(other,'restore.ps1'),['-StateDir',stateDir,'-Port',String(port)]);
    assert.equal((await state()).stopped,true);assert.equal(await page.locator('#codex-bottom-bar-features').count(),0);
    assert.equal(alive(worker.workerPid),true,'Orphan recovery must leave independent reminders running');
    await page.reload();await sleep(200);assert.equal(await page.locator('#codex-bottom-bar-features').count(),0,'No controller script remains after restore');
    passed=true;console.log(JSON.stringify({passed:true,samePathWorkerUpgrade:true,samePathControllerUpgrade:true,concurrentCopies:true,reusedPidStartup:true,unrelatedProcessPreserved:true,sameCopyReused:true,oldControllerExited:true,duplicateControllerRejected:true,unsafeRestoreRejected:true,reminderSwitchesPreserved:true,schedulePreserved:true,armedSendPreserved:true,orphanedRendererRecovery:true,restore:true,realCodexChanged:false,noMusic:true}));
  } finally {
    await ps(stopper,['-StateDir',stateDir]).catch(()=>{});
    const worker=await requestWorker(stateDir,'status').catch(()=>null);
    if(worker){await requestWorker(stateDir,'shutdown').catch(()=>{});for(let i=0;i<100&&alive(worker.workerPid);i++)await sleep(100);assert.equal(alive(worker.workerPid),false,'Test worker must exit');}
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
    if(passed&&path.dirname(temp)===tempRoot&&path.basename(temp).startsWith('cqb-lifecycle-test-'))await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
