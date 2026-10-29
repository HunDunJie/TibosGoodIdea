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
    const state = JSON.parse(await fs.readFile(path.join(runtime,'controller.json'),'utf8')); assert.equal(state.installed,1);
    await page.reload(); await page.waitForFunction(() => window.__cqbFeatures?.status().connected,null,{timeout:15000});
    assert.equal(await page.locator('#codex-bottom-bar-features').count(),1);
    // Check renderer -> CDP binding -> independent named pipe -> real Windows audio helper.
    // There is no quota sample in this fixture, so enabling cannot schedule or play music.
    await page.getByRole('button',{name:'刷新提醒',exact:true}).click();
    await page.waitForFunction(() => ['checked','unavailable'].includes(window.__cqbFeatures.status().volume.phase),null,{timeout:16000});
    assert.equal(await page.locator('#cqb-volume-dialog').count(),0);
    const worker = await requestWorker(runtime,'status'); assert.equal(worker.refresh.enabled,true); assert.equal(worker.refresh.alarm,null);
    await fs.writeFile(path.join(runtime,'stop.flag'),'restore');
    for (let i=0;i<40&&!exited;i++) await sleep(150);
    assert.ok(exited); assert.equal(controller.exitCode,0); assert.equal(await page.locator('#codex-bottom-bar-metrics').count(),0);
    assert.equal(process.kill(worker.workerPid,0),true,'restoring layout must not kill independent reminder');
    await page.reload(); await sleep(150); assert.equal(await page.locator('#codex-bottom-bar-metrics').count(),0);
    await requestWorker(runtime,'shutdown'); success = true;
    console.log(JSON.stringify({passed:true,realRendererHostBridge:true,reload:true,toggleReachesWorker:true,noAudibleSound:true,restore:true,reminderSurvivesControllerExit:true,noReinjection:true}));
  } catch (e) { console.error(output.slice(0,1800)); throw e; }
  finally {
    await requestWorker(runtime,'shutdown').catch(() => {});
    if (controller && !exited) { await fs.writeFile(path.join(runtime,'stop.flag'),'restore'); await sleep(3500); if (!exited) controller.kill(); }
    await browser.close(); server.close();
    if (success && path.dirname(runtime) === path.resolve(os.tmpdir()) && path.basename(runtime).startsWith('cqb-controller-test-')) { await sleep(300); await fs.rm(runtime,{recursive:true,force:true}); }
  }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
