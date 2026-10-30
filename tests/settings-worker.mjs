import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {ensureConfiguredWorker,requestWorker} from '../worker-client.mjs';
import {spawn} from 'node:child_process';
if(process.platform!=='win32'){console.log('Windows settings reload test skipped');process.exit(0);}
const tempRoot=await fs.realpath(os.tmpdir());
const dir=await fs.mkdtemp(path.join(tempRoot,'cqb-settings-test-')),configFile=path.join(dir,'settings.json');
let pid,passed=false;
async function withReadLock(name,action) {
  const file=path.join(dir,name),script=path.join(dir,'lock-state.ps1');
  const encoded=Buffer.from(file,'utf8').toString('base64');
  await fs.writeFile(script,'\ufeff'+`$file=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))\n$handle=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\ntry {Write-Output 'locked';Start-Sleep -Milliseconds 800} finally {$handle.Dispose()}\n`);
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('State lock not acquired')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',error=>{clearTimeout(timer);reject(error)})});
    return await action();
  } finally {assert.equal(await exited,0,'The isolated read-lock holder exited');}
}
try{
  await fs.writeFile(configFile,JSON.stringify({language:'zh-CN',timeZone:'UTC'}));
  await fs.writeFile(path.join(dir,'codex-language.json'),JSON.stringify({language:'en'}));
  let status=await ensureConfiguredWorker(dir,configFile);pid=status.workerPid;
  await requestWorker(dir,'codex-path',{path:path.join(dir,'Codex 路径','ChatGPT.exe')});
  assert.equal((await requestWorker(dir,'player-status')).codexConfigured,true);
  await assert.rejects(requestWorker(dir,'codex-path',{path:'ChatGPT.exe'}));
  await assert.rejects(requestWorker(dir,'codex-path',{path:path.join(dir,'other.exe')}));
  assert.equal((await requestWorker(dir,'player-status')).language,'en');
  await requestWorker(dir,'observe',{accountId:'fixture-only',resetsAt:Date.now()+86400000,remaining:20,updatedAt:Date.now()});
  await requestWorker(dir,'toggle',{feature:'refresh',enabled:true});
  status=await requestWorker(dir,'toggle',{feature:'completion',enabled:true});
  const due=status.refresh.alarm.due,oldPid=pid;
  status=await requestWorker(dir,'toggle',{feature:'send',enabled:true});const sendId=status.send.id;
  for(const [language,label] of [['ja','今回の通知音を停止'],['zh-CN','停止本次响铃'],['en','Stop sound'],['ja','今回の通知音を停止']]){
    await requestWorker(dir,'ui-language',{language});
    const player=await requestWorker(dir,'player-status');
    assert.equal(player.language,language);assert.equal(player.trayLabels[0],label);
    assert.equal(player.notificationsShown,0);assert.equal(player.playing,null);
    status=await ensureConfiguredWorker(dir,configFile);
    assert.equal(status.workerPid,pid,'Locale changes must not restart the worker');
    assert.equal(status.refresh.alarm.due,due);assert.equal(status.completion.enabled,true);assert.equal(status.send.id,sendId);
  }
  const afterLock=await withReadLock('features.json',()=>requestWorker(dir,'toggle',{feature:'completion',enabled:true}));
  assert.equal(afterLock.completion.enabled,true);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'features.json'),'utf8')).completionEnabled,true);
  await withReadLock('codex-language.json',()=>requestWorker(dir,'ui-language',{language:'en'}));
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'codex-language.json'),'utf8')).language,'en');
  await requestWorker(dir,'ui-language',{language:'ja'});
  assert.equal((await requestWorker(dir,'status')).workerPid,pid,'Transient locks must not exit the worker');
  await assert.rejects(requestWorker(dir,'ui-language',{language:'invalid'}));
  assert.equal((await requestWorker(dir,'player-status')).language,'ja');
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'codex-language.json'),'utf8')).language,'ja');
  assert.equal((await ensureConfiguredWorker(dir,configFile)).workerPid,pid,'Identical settings do not restart worker');
  await fs.writeFile(configFile,JSON.stringify({language:'en',timeZone:'Asia/Tokyo'}));
  status=await ensureConfiguredWorker(dir,configFile);pid=status.workerPid;
  assert.notEqual(pid,oldPid);assert.equal(status.refresh.enabled,true);assert.equal(status.completion.enabled,true);
  assert.equal(status.refresh.alarm.due,due,'Reload preserves scheduled alarm');
  assert.equal((await requestWorker(dir,'player-status')).language,'ja','Last Codex locale survives a restart without Codex');
  assert.equal((await requestWorker(dir,'player-status')).codexConfigured,true,'Reload must retain Codex mouse-stop detection without requiring a button click');
  assert.equal(status.send.id,sendId,'Language changes preserve an armed sending round');
  assert.equal(status.ringing,null);passed=true;
  console.log(JSON.stringify({passed,transientFeatureStateLock:true,transientLanguageStateLock:true,threeTrayLanguages:true,liveLanguageWithoutRestart:true,cachedLanguageSurvivesRestart:true,mouseStopConfigSurvivesRestart:true,invalidCodexPathsRejected:true,ignoresLegacyOverrides:true,unchangedConfigNoRestart:true,preservesSwitches:true,preservesSchedule:true,preservesArmedSend:true,audioPlayed:false}));
}finally{
  await requestWorker(dir,'shutdown').catch(()=>{});
  let stopped=!pid;
  for(let i=0;pid&&i<60;i++){try{process.kill(pid,0);await wait(100);}catch(e){if(e.code==='ESRCH'){stopped=true;break;}throw e;}}
  assert.ok(stopped,'Isolated worker clean shutdown');
  if(passed&&path.dirname(dir)===tempRoot&&path.basename(dir).startsWith('cqb-settings-test-'))await fs.rm(dir,{recursive:true,force:true});
}
