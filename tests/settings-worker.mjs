import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {ensureConfiguredWorker,requestWorker} from '../worker-client.mjs';
if(process.platform!=='win32'){console.log('Windows settings reload test skipped');process.exit(0);}
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-settings-test-')),configFile=path.join(dir,'settings.json');
let pid,passed=false;
try{
  await fs.writeFile(configFile,JSON.stringify({language:'zh-CN',timeZone:'UTC'}));
  await fs.writeFile(path.join(dir,'codex-language.json'),JSON.stringify({language:'en'}));
  let status=await ensureConfiguredWorker(dir,configFile);pid=status.workerPid;
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
  await assert.rejects(requestWorker(dir,'ui-language',{language:'invalid'}));
  assert.equal((await requestWorker(dir,'player-status')).language,'ja');
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'codex-language.json'),'utf8')).language,'ja');
  assert.equal((await ensureConfiguredWorker(dir,configFile)).workerPid,pid,'Identical settings do not restart worker');
  await fs.writeFile(configFile,JSON.stringify({language:'en',timeZone:'Asia/Tokyo'}));
  status=await ensureConfiguredWorker(dir,configFile);pid=status.workerPid;
  assert.notEqual(pid,oldPid);assert.equal(status.refresh.enabled,true);assert.equal(status.completion.enabled,true);
  assert.equal(status.refresh.alarm.due,due,'Reload preserves scheduled alarm');
  assert.equal((await requestWorker(dir,'player-status')).language,'ja','Last Codex locale survives a restart without Codex');
  assert.equal(status.send.id,sendId,'Language changes preserve an armed sending round');
  assert.equal(status.ringing,null);passed=true;
  console.log(JSON.stringify({passed,threeTrayLanguages:true,liveLanguageWithoutRestart:true,cachedLanguageSurvivesRestart:true,ignoresLegacyOverrides:true,unchangedConfigNoRestart:true,preservesSwitches:true,preservesSchedule:true,preservesArmedSend:true,audioPlayed:false}));
}finally{
  await requestWorker(dir,'shutdown').catch(()=>{});
  let stopped=!pid;
  for(let i=0;pid&&i<60;i++){try{process.kill(pid,0);await wait(100);}catch(e){if(e.code==='ESRCH'){stopped=true;break;}throw e;}}
  assert.ok(stopped,'Isolated worker clean shutdown');
  if(passed&&path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('cqb-settings-test-'))await fs.rm(dir,{recursive:true,force:true});
}
