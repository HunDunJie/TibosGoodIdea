const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
(async () => {
  const root = path.resolve(__dirname,'..'), runtime = await fs.mkdtemp(path.join(os.tmpdir(),'cqb-controller-test-'));
  const silentFile = path.join(runtime,'silence.wav'), configPath = path.join(runtime,'config.json');
  const wav = Buffer.alloc(44 + 3200); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
  await fs.writeFile(silentFile,wav); await fs.writeFile(configPath,JSON.stringify({refreshAudio:silentFile,completionAudio:silentFile}));
  const {requestWorker} = await import(pathToFileURL(path.join(root,'worker-client.mjs')).href);
  let html = await fs.readFile(path.join(root,'preview.html'),'utf8');
  html = html.replace(/<link rel="stylesheet"[^>]*>/,'').replace(/<script src="(?:i18n|bottom-bar|feature-ui).js"><\/script>/g,'').replace(/<script>\s*\/\/ Preview controls[\s\S]*?<\/script>/,'');
  const server = http.createServer((req,res) => { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,channel:'msedge',args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9557']});
  let controller, exited = false, output = '', success = false;
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}}); await page.goto(`http://127.0.0.1:${server.address().port}`);
    controller = spawn(process.execPath,[path.join(root,'controller.mjs'),'--port','9557','--state-dir',runtime,'--config',configPath],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    controller.on('exit',() => { exited = true; }); controller.stdout.on('data',c => output += c); controller.stderr.on('data',c => output += c);
    await page.waitForFunction(() => window.__cqbFeatures?.status().connected,null,{timeout:18000});
    assert.equal(await page.evaluate(() => typeof window.__cqbPreviewHost),'undefined','real CDP binding, not preview mock');
    let state;
    for(let i=0;i<50;i++){state=JSON.parse(await fs.readFile(path.join(runtime,'controller.json'),'utf8'));if(state.installed===1)break;await sleep(100)}
    assert.equal(state.installed,1,'Controller reports the attached page after startup acknowledgement');
    await page.reload(); await page.waitForFunction(() => window.__cqbFeatures?.status().connected,null,{timeout:15000});
    assert.equal(await page.locator('#codex-bottom-bar-features').count(),1);
    // Check renderer -> CDP binding -> independent named pipe -> real Windows audio helper.
    // There is no quota sample in this fixture, so enabling cannot schedule or play music.
    await page.getByRole('button',{name:'刷新提醒',exact:true}).click();
    await page.waitForFunction(() => ['checked','unavailable'].includes(window.__cqbFeatures.status().volume.phase),null,{timeout:16000});
    assert.equal(await page.locator('#cqb-volume-dialog').count(),0);
    let worker = await requestWorker(runtime,'status'); assert.equal(worker.refresh.enabled,true); assert.equal(worker.refresh.alarm,null);
    for(const [language,button] of [['en-US','Reset reminder'],['ja-JP','更新通知']]){
      await page.evaluate(value=>document.documentElement.lang=value,language);
      await page.getByRole('button',{name:button,exact:true}).waitFor();
      const expected=language.startsWith('ja')?'ja':'en';let player;
      for(let i=0;i<30;i++){player=await requestWorker(runtime,'player-status');if(player.language===expected)break;await sleep(100)}
      assert.equal(player.language,expected,'Codex locale reaches the real tray through CDP');
      assert.equal((await requestWorker(runtime,'status')).workerPid,worker.workerPid,'Language changes do not restart reminders');
    }
    // Keep the real CDP/worker bridge; replace only the native task adapter with a never-send fixture.
    await page.evaluate(()=>{
      window.__cqbFeatures.dispose();window.__wakeDraftRounds=0;
      window.__cqbNativeFeatures={connect:async()=>({send:true,completion:true}),dispose(){},sendRound:async()=>{window.__wakeDraftRounds++;throw Error('No draft may be submitted in this test')}};
      window.__codexBottomBar.quotaSample=()=>({accountId:'wake-fixture-only',resetsAt:Date.now()+86400000,remaining:20,availableResets:2,updatedAt:Date.now()});
    });
    await page.addScriptTag({content:await fs.readFile(path.join(root,'feature-ui.js'),'utf8')});
    await page.waitForFunction(()=>window.__cqbFeatures.status().connected&&window.__cqbFeatures.status().capabilities.send);
    const shutdown=async()=>{
      const prior=await requestWorker(runtime,'status');await requestWorker(runtime,'shutdown');
      let alive=true;for(let i=0;i<100&&alive;i++){await sleep(50);try{process.kill(prior.workerPid,0)}catch{alive=false}}
      assert.equal(alive,false,'The isolated worker must finish exiting');
      return prior.workerPid;
    };
    await shutdown();
    await page.waitForFunction(()=>!window.__cqbFeatures.status().connected,null,{timeout:18000});
    assert.ok(await page.locator('#codex-bottom-bar-features button').evaluateAll(buttons=>buttons.every(button=>!button.disabled)),'Disconnected buttons remain clickable to wake the worker');
    await sleep(2500);await assert.rejects(requestWorker(runtime,'status'),'Polling must not restart a service the user exited');
    for(const feature of ['send','completion','refresh']){
      const button=page.locator(`[data-cqb-feature="${feature}"] button`);
      const enabled=status=>feature==='send'?status.send.phase==='armed':status[feature].enabled;
      for(let attempt=0;attempt<2;attempt++){
        await button.click();await page.waitForFunction(key=>{const button=document.querySelector(`[data-cqb-feature="${key}"] button`);return button.getAttribute('aria-busy')==='false'&&button.getAttribute('aria-pressed')==='true'&&window.__cqbFeatures.status().connected;},feature,{timeout:18000});
        worker=await requestWorker(runtime,'status');assert.equal(enabled(worker),true,'A single click wakes and enables '+feature);
        for(const other of ['send','completion','refresh'].filter(key=>key!==feature))assert.equal(other==='send'?worker.send.phase==='armed':worker[other].enabled,false,'Exited switches must not be restored accidentally');
        const player=await requestWorker(runtime,'player-status');assert.equal(player.playing,null);assert.equal(player.notificationsShown,0);assert.equal(player.language,'ja');
        if(feature==='send')assert.ok(worker.send.target>Date.now(),'Wake refreshes quota before arming a send');
        if(attempt===0 || feature!=='refresh'){
          const oldPid=await shutdown();assert.notEqual(oldPid,null);
          // Click again without waiting for the next UI poll; cached enabled state must not disable it.
        }
      }
    }
    assert.equal(await page.evaluate(()=>window.__wakeDraftRounds),0);
    await fs.writeFile(path.join(runtime,'stop.flag'),'restore');
    for (let i=0;i<40&&!exited;i++) await sleep(150);
    assert.ok(exited); assert.equal(controller.exitCode,0); assert.equal(await page.locator('#codex-bottom-bar-metrics').count(),0);
    assert.equal(process.kill(worker.workerPid,0),true,'restoring layout must not kill independent reminder');
    await page.reload(); await sleep(150); assert.equal(await page.locator('#codex-bottom-bar-metrics').count(),0);
    // Simulate elapsed grace time only in the isolated controller, then close its client.
    const clockFlag=path.join(runtime,'advance-clock'),clockModule=path.join(runtime,'clock.mjs');
    await fs.writeFile(clockModule,`import {existsSync} from 'node:fs';const realNow=Date.now;Date.now=()=>realNow()+(existsSync(${JSON.stringify(clockFlag)})?121000:0);`);
    exited=false;output='';
    controller=spawn(process.execPath,['--import',pathToFileURL(clockModule).href,path.join(root,'controller.mjs'),'--port','9557','--state-dir',runtime,'--no-features'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    controller.on('exit',()=>{exited=true});controller.stdout.on('data',c=>output+=c);controller.stderr.on('data',c=>output+=c);
    await page.waitForFunction(()=>window.__codexBottomBar?.status().attached,null,{timeout:12000});
    await fs.writeFile(clockFlag,'advance');await browser.close();
    for(let i=0;i<100&&!exited;i++)await sleep(100);
    assert.ok(exited,'A closed client must not leave stale CDP entries keeping the controller alive');
    assert.equal(controller.exitCode,0);assert.equal(JSON.parse(await fs.readFile(path.join(runtime,'controller.json'),'utf8')).stopped,true);
    assert.equal(process.kill(worker.workerPid,0),true,'Client exit leaves independent reminders running');
    await requestWorker(runtime,'shutdown'); success = true;
    console.log(JSON.stringify({passed:true,realRendererHostBridge:true,reload:true,toggleReachesWorker:true,allThreeButtonsWakeService:true,singleClickEnables:true,cachedEnabledStateIgnored:true,pollingDoesNotRestart:true,wakeRestoresLanguage:true,noRealDrafts:true,noAudibleSound:true,restore:true,reminderSurvivesControllerExit:true,noReinjection:true,closedClientControllerExited:true}));
  } catch (e) { console.error(output.slice(0,1800)); throw e; }
  finally {
    // Stop the controller first so an in-flight wake cannot create a worker after cleanup.
    if (controller && !exited) { await fs.writeFile(path.join(runtime,'stop.flag'),'restore'); await sleep(3500); if (!exited) controller.kill(); }
    const remaining=await requestWorker(runtime,'status',{},15000).catch(()=>null);
    if(remaining){
      await requestWorker(runtime,'shutdown',{},15000);
      let alive=true;for(let i=0;i<150&&alive;i++){await sleep(100);try{process.kill(remaining.workerPid,0)}catch{alive=false}}
      assert.equal(alive,false,'Test reminder service must exit after controller cleanup');
    }
    await browser.close(); server.close();
    if (success && path.dirname(runtime) === path.resolve(os.tmpdir()) && path.basename(runtime).startsWith('cqb-controller-test-')) { await sleep(300); await fs.rm(runtime,{recursive:true,force:true}); }
  }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
