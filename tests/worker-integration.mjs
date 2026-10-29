import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {requestWorker,ensureWorker} from '../worker-client.mjs';
import {MAX_PLAYBACK_MS} from '../feature-engine.mjs';
if (process.platform !== 'win32') { console.log('Windows integration test skipped'); process.exit(0); }
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(),'cqb-worker-test-'));
const silentFile = path.join(stateDir,'silence.wav'), configPath = path.join(stateDir,'config.json');
// Test the real SoundPlayer loop using silence, without changing the user's volume.
const wav = Buffer.alloc(44 + 3200); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
await fs.writeFile(silentFile,wav); await fs.writeFile(configPath,JSON.stringify({refreshAudio:silentFile,completionAudio:silentFile}));
const parentPath = path.join(stateDir,'parent.mjs');
await fs.writeFile(parentPath,`import {ensureWorker,requestWorker} from ${JSON.stringify(new URL('../worker-client.mjs',import.meta.url).href)};
const dir=${JSON.stringify(stateDir)};
await ensureWorker(dir,${JSON.stringify(configPath)});
await requestWorker(dir,'observe',{accountId:'test-only',resetsAt:Date.now()-58000,remaining:0,updatedAt:Date.now()});
const value=await requestWorker(dir,'toggle',{feature:'refresh',enabled:true});
console.log(JSON.stringify({parentPid:process.pid,status:value}));`);
let workerPid, passed = false;
async function externalControl(action) {
  const child = spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'control-reminders.ps1'),'-Action',action,'-StateDir',stateDir],{windowsHide:true,stdio:'ignore'});
  const code = await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
  assert.equal(code,0,'independent Windows control script must work without Codex');
}
try {
  const parent = spawn(process.execPath,[parentPath],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output = '', error = ''; parent.stdout.on('data',c => output += c); parent.stderr.on('data',c => error += c);
  const code = await new Promise(resolve => parent.on('exit',resolve)); assert.equal(code,0,error);
  const result = JSON.parse(output.trim()); assert.equal(parent.exitCode,0);
  let status;
  for (let i = 0; i < 40; i++) { status = await requestWorker(stateDir,'status'); if (status.ringing === 'refresh') break; await wait(100); }
  workerPid = status.workerPid; assert.notEqual(workerPid,result.parentPid); assert.equal(status.ringing,'refresh','detached worker must fire after parent exits');
  let player = await requestWorker(stateDir,'player-status'); assert.equal(player.notificationsShown,1,'refresh requests a Windows notification');
  assert.equal(process.kill(workerPid,0),true);
  await externalControl('stop'); status = await requestWorker(stateDir,'status'); assert.equal(status.ringing,null); assert.equal(status.refresh.enabled,true);
  await requestWorker(stateDir,'toggle',{feature:'completion',enabled:true});
  status = await requestWorker(stateDir,'completion',{hostId:'test',conversationId:'fixture',turnId:'fixture',status:'completed'});
  player = await requestWorker(stateDir,'player-status'); assert.equal(player.notificationsShown,1,'completion must not add a notification');
  assert.equal(status.ringing,'completion'); status = await requestWorker(stateDir,'interaction'); assert.equal(status.ringing,null); assert.equal(status.completion.enabled,true);
  await externalControl('disable-refresh'); status = await requestWorker(stateDir,'status'); assert.equal(status.refresh.enabled,false); assert.equal(status.refresh.alarm,null);
  await externalControl('shutdown');
  for (let i = 0; i < 40; i++) { try { process.kill(workerPid,0); await wait(100); } catch { workerPid = null; break; } }
  assert.equal(workerPid,null,'shutdown must terminate the detached worker');
  // Resume a session that has already played almost 30 minutes, so the real timer can be checked quickly.
  const deadline = Date.now()+6000;
  await fs.writeFile(path.join(stateDir,'features.json'),JSON.stringify({completionEnabled:true,refreshEnabled:true,ringing:{kind:'completion',id:'timer-fixture',startedAt:deadline-MAX_PLAYBACK_MS}}));
  status = await ensureWorker(stateDir,configPath); workerPid = status.workerPid;
  assert.equal(status.maxPlaybackMs,1800000);
  const oldWorker = workerPid; await requestWorker(stateDir,'restart');
  for (let i=0;i<50;i++) { try { process.kill(oldWorker,0); await wait(100); } catch { break; } }
  status = await ensureWorker(stateDir,configPath); workerPid = status.workerPid; assert.notEqual(workerPid,oldWorker);
  assert.ok(status.ringingUntil === null || status.ringingUntil === deadline,'restart cannot reset the 30-minute deadline');
  for (let i=0;i<100;i++) { status = await requestWorker(stateDir,'status'); if (!status.ringing) break; await wait(100); }
  assert.equal(status.ringing,null); assert.equal(status.refresh.enabled,true); assert.equal(status.completion.enabled,true);
  const persisted = JSON.parse(await fs.readFile(path.join(stateDir,'features.json'),'utf8')); assert.equal(persisted.lastStop.reason,'timeout');
  player = await requestWorker(stateDir,'player-status'); assert.equal(player.playing,null); assert.equal(player.notificationsShown,0);
  await externalControl('shutdown');
  for (let i=0;i<50;i++) { try { process.kill(workerPid,0); await wait(100); } catch { workerPid=null; break; } }
  assert.equal(workerPid,null);
  passed = true; console.log(JSON.stringify({passed:true,independentProcess:true,parentExitedBeforeAlarm:true,realWindowsPlayer:true,audibleSound:false,stopWithoutCodex:true,cancelWithoutCodex:true,completion:true,thirtyMinuteExpiry:true,restartPreservesDeadline:true,refreshNotification:true,completionNotification:false,cleanShutdown:true}));
} finally {
  if (workerPid) await requestWorker(stateDir,'shutdown').catch(() => {});
  if (passed && path.dirname(stateDir) === path.resolve(os.tmpdir()) && path.basename(stateDir).startsWith('cqb-worker-test-')) await fs.rm(stateDir,{recursive:true,force:true});
}
