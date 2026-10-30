import test from 'node:test';
import assert from 'node:assert/strict';
import {FeatureEngine,MAX_PLAYBACK_MS} from '../feature-engine.mjs';
function fixture(initial = {}) {
  let time = 1000000, saved = null;
  const played = [], playCalls = [], stopped = [], audio = {check:async () => {},play:async (kind,options) => { played.push(kind); playCalls.push({kind,...options}); },stop:async () => { stopped.push(time); }};
  const engine = new FeatureEngine({state:initial,now:() => time,audio,save:async state => { saved = structuredClone(state); }});
  return {engine,played,playCalls,stopped,audio,get saved() { return saved; },at(value) { time = value; },sample:(reset = 1100000,remaining = 0,updatedAt = time,accountId = 'A') => ({accountId,resetsAt:reset,remaining,updatedAt})};
}

const noFiveHour=(updatedAt,accountId='A')=>({accountId,fiveHourLimit:'none',resetsAt:null,remaining:null,updatedAt});

test('confirmed no-five-hour accounts cancel old alarms and sends before an elapsed alarm can fire',async()=>{
  const f=fixture(); await f.engine.observe(f.sample());
  await f.engine.toggle('send',true); await f.engine.toggle('refresh',true); await f.engine.toggle('completion',true);
  f.engine.state.nextAlarm={...f.engine.state.alarm,id:'queued',reset:19000000,due:19060000};
  f.at(1160001); await f.engine.observe(noFiveHour(1160001)); await f.engine.tick();
  assert.equal(f.engine.status().fiveHourLimit,'none'); assert.equal(f.engine.state.alarm,null); assert.equal(f.engine.state.nextAlarm,null);
  assert.equal(f.engine.state.refreshEnabled,false); assert.equal(f.engine.state.send.phase,'cancelled'); assert.equal(await f.engine.claimSend(),null);
  assert.deepEqual(f.played,[]); assert.equal(f.engine.state.completionEnabled,true);
  await assert.rejects(f.engine.toggle('send',true),/没有五小时额度限制/);
  await assert.rejects(f.engine.toggle('refresh',true),/没有五小时额度限制/);
  await f.engine.completion({status:'completed',turnId:'1',conversationId:'A'});
  assert.deepEqual(f.played,['completion']);
});

test('no-five-hour applicability survives restart and a finite limit restores manual controls',async()=>{
  const f=fixture(); await f.engine.observe(noFiveHour(1000000));
  const restarted=fixture(f.saved); await restarted.engine.resume();
  assert.equal(restarted.engine.status().fiveHourLimit,'none');
  await assert.rejects(restarted.engine.toggle('refresh',true),/没有五小时额度限制/);
  restarted.at(1000010); await restarted.engine.observe(restarted.sample(1200000,50));
  assert.equal(restarted.engine.status().fiveHourLimit,'limited'); assert.equal(restarted.engine.state.refreshEnabled,false);
  await restarted.engine.toggle('refresh',true); await restarted.engine.toggle('send',true);
  assert.equal(restarted.engine.state.alarm.reset,1200000); assert.equal(restarted.engine.state.send.target,1200000);
});

test('stale and malformed no-five-hour samples cannot cancel a current finite schedule',async()=>{
  const f=fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('send',true);
  const id=f.engine.state.send.id;
  await f.engine.observe(noFiveHour(999999));
  await f.engine.observe({...noFiveHour(1000010),remaining:100});
  await f.engine.observe({...noFiveHour(1000010),resetsAt:1100000});
  await f.engine.observe({accountId:'A',resetsAt:null,remaining:null,updatedAt:1000010});
  assert.equal(f.engine.state.send.id,id); assert.equal(f.engine.state.alarm.reset,1100000);
  assert.equal(f.engine.status().fiveHourLimit,'limited');
});

test('no-five-hour observation stops refresh sound but preserves completion playback',async()=>{
  for(const kind of ['refresh','completion']) {
    const f=fixture({ringing:{kind,startedAt:1000000},completionEnabled:true,refreshEnabled:true});
    await f.engine.observe(noFiveHour(1000000));
    assert.equal(f.engine.state.ringing?.kind ?? null,kind==='completion'?'completion':null);
    assert.equal(f.stopped.length,kind==='refresh'?1:0); assert.equal(f.engine.state.completionEnabled,true);
  }
});

test('account changes and older cached samples cannot revive a cancelled no-five-hour send',async()=>{
  const f=fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('send',true); await f.engine.toggle('refresh',true);
  f.at(1000020); await f.engine.observe(noFiveHour(1000020));
  await f.engine.observe(f.sample(1200000,100,1000010));
  assert.equal(f.engine.status().fiveHourLimit,'none'); assert.equal(f.engine.state.alarm,null);
  await f.engine.observe(f.sample(1300000,50,1000030,'B'));
  assert.equal(f.engine.status().fiveHourLimit,'limited'); assert.equal(f.engine.state.send.phase,'cancelled');
  assert.equal(f.engine.state.refreshEnabled,false); assert.equal(await f.engine.claimSend(),null);
});

test('removing a five-hour limit cancels a running batch and never retries an accepted round',async()=>{
  const f=fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('send',true);
  f.at(1100010); await f.engine.observe(f.sample(19000000,100)); const claim=await f.engine.claimSend();
  assert.ok(claim); assert.equal(f.engine.state.send.phase,'running');
  f.at(1100020); await f.engine.observe(noFiveHour(1100020));
  assert.equal(f.engine.state.send.phase,'cancelled');
  await f.engine.finishSend(claim.id,{sent:1}); assert.equal(f.engine.state.send.phase,'cancelled');
  const restarted=fixture(f.saved); await restarted.engine.resume(); assert.equal(await restarted.engine.claimSend(),null);
});
test('refresh alarm is +1 minute; repeated samples and enable calls do not duplicate',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  assert.equal(f.engine.state.alarm.due,1160000);
  for (let i = 0; i < 4; i++) { await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); }
  f.at(1159999); await f.engine.tick(); assert.deepEqual(f.played,[]);
  f.at(1160000); await f.engine.tick(); await f.engine.tick(); assert.deepEqual(f.played,['refresh']);
  assert.equal(f.saved.fired.length,1); assert.equal(f.engine.status().refresh.phase,'ringing');
});
test('next quota sample cannot erase the imminent +1 minute alarm',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  f.at(1100010); await f.engine.observe(f.sample(19000000,100));
  assert.equal(f.engine.state.alarm.reset,1100000); assert.equal(f.engine.state.nextAlarm.reset,19000000);
  f.at(1160000); await f.engine.tick(); assert.equal(f.engine.state.alarm.reset,19000000);
  assert.deepEqual(f.played,['refresh']);
});
test('disabling cancels only this service and clears its next alarm',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  f.at(1100000); await f.engine.observe(f.sample(19000000,100)); await f.engine.toggle('refresh',false);
  assert.equal(f.engine.state.alarm,null); assert.equal(f.engine.state.nextAlarm,null);
  f.at(20000000); await f.engine.tick(); assert.deepEqual(f.played,[]);
});

test('a corrected reset before the target replaces an imminent reminder',async () => {
  const f=fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  f.at(1099990); await f.engine.observe(f.sample(19000000,100));
  assert.equal(f.engine.state.alarm.reset,19000000); assert.equal(f.engine.state.nextAlarm,null);
  f.at(1160000); await f.engine.tick(); assert.deepEqual(f.playCalls,[]);
});

test('a reset card replaces both the imminent alarm and its queued successor',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('refresh',true);
  f.at(1100010); await f.engine.observe({...f.sample(19000000,100),availableResets:2});
  assert.equal(f.engine.state.nextAlarm.reset,19000000);
  f.at(1120000); await f.engine.observe({...f.sample(20000000,100),availableResets:1});
  assert.equal(f.engine.state.alarm.reset,20000000); assert.equal(f.engine.state.nextAlarm,null);
  f.at(1160000); await f.engine.tick(); assert.deepEqual(f.playCalls,[]);
  f.at(20060000); await f.engine.tick(); assert.equal(f.playCalls.length,1);
});

test('a reset card received at the old alarm time cancels before playing',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('refresh',true);
  f.at(1160000); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  assert.deepEqual(f.playCalls,[]); assert.equal(f.engine.state.alarm.reset,19000000);
});

test('temporarily missing reset inventory does not erase the reminder card baseline',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('refresh',true);
  f.at(1050000); await f.engine.observe(f.sample());
  f.at(1160000); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  assert.deepEqual(f.playCalls,[]); assert.equal(f.engine.state.alarm.reset,19000000);
});

test('refresh reminder remembers its reset-card baseline after a worker restart',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('refresh',true);
  const restarted=fixture(f.saved); restarted.at(1160000);
  await restarted.engine.observe({...restarted.sample(19000000,100),availableResets:1});
  assert.deepEqual(restarted.playCalls,[]); assert.equal(restarted.engine.state.alarm.reset,19000000);
});

test('a reset card with missing or expired time never revives its old reminder after restart',async () => {
  for(const reset of [null,1100000]){
    const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('refresh',true);
    f.at(1100010); await f.engine.observe({...f.sample(reset,100),availableResets:1});
    assert.equal(f.engine.state.alarm,null);
    const restarted=fixture(f.saved); restarted.at(1160000);
    await restarted.engine.observe({...restarted.sample(1100000,0,1000000),availableResets:2});
    await restarted.engine.tick(); assert.equal(restarted.engine.state.alarm,null); assert.deepEqual(restarted.playCalls,[]);
    await restarted.engine.observe({...restarted.sample(1100000,100),availableResets:1});
    assert.equal(restarted.engine.state.alarm,null);
    restarted.at(1160010); await restarted.engine.observe({...restarted.sample(19000000,80),availableResets:1});
    assert.equal(restarted.engine.state.alarm.reset,19000000);
  }
});
test('saved alarm fires with no Codex connection or quota polling',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  const restarted = fixture(f.saved); restarted.at(1160010); await restarted.engine.resume();
  assert.deepEqual(restarted.played,['refresh']);
});
test('stopping sound keeps the recurring switch and next scheduled cycle',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true);
  f.at(1160000); await f.engine.tick(); await f.engine.stop('tray');
  assert.equal(f.engine.state.refreshEnabled,true); assert.equal(f.engine.state.ringing,null);
  await f.engine.observe(f.sample(19000000,100)); assert.equal(f.engine.state.alarm.reset,19000000);
});
test('task completion ignores partial/failed/continuing turns and deduplicates hosts',async () => {
  const f = fixture(); await f.engine.toggle('completion',true);
  const e = {hostId:'local',conversationId:'chat-1',turnId:'t1',status:'completed'};
  await f.engine.completion({...e,status:'failed'}); await f.engine.completion({...e,hasPendingContinuation:true}); assert.deepEqual(f.played,[]);
  await f.engine.completion(e); await f.engine.completion(e); assert.deepEqual(f.played,['completion']);
  await f.engine.stop('codex-mouse-move'); assert.equal(f.engine.state.completionEnabled,true);
  await f.engine.completion({...e,conversationId:'chat-2'}); assert.deepEqual(f.played,['completion','completion']);
});
test('refresh music has priority over simultaneous task completion',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('completion',true);
  f.at(1160000); await f.engine.tick(); await f.engine.completion({hostId:'local',conversationId:'c',turnId:'t',status:'completed'});
  assert.deepEqual(f.played,['refresh']);
});
test('one-shot send needs both elapsed time and a fresh server-confirmed cycle',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('send',true);
  assert.equal(await f.engine.claimSend(),null);
  f.at(1100010); assert.equal(await f.engine.claimSend(),null);
  await f.engine.observe(f.sample(19000000,100,1000000)); assert.equal(await f.engine.claimSend(),null,'stale cached quota must not send');
  await f.engine.observe(f.sample(19000000,100)); const claim = await f.engine.claimSend(); assert.ok(claim?.id);
  assert.equal(f.saved.send.phase,'running'); assert.equal(await f.engine.claimSend(),null,'second window cannot claim again');
  await f.engine.finishSend(claim.id,{sent:2,failed:1,skipped:3}); assert.equal(f.engine.status().send.phase,'done');
  assert.equal(await f.engine.claimSend(),null);
});
test('an unused full bucket may have no next reset timestamp',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('send',true);
  f.at(1100010); await f.engine.observe(f.sample(null,100)); assert.ok(await f.engine.claimSend());
});

test('reset card moves an armed round to the new reset and never sends at the old time',async () => {
  const f = fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  const id=f.engine.state.send.id;
  f.at(1050000); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  assert.equal(f.engine.state.send.target,19000000); assert.equal(f.saved.send.target,19000000); assert.equal(f.engine.state.send.id,id);
  f.at(1100010); assert.equal(await f.engine.claimSend(),null);
  f.at(19000001); await f.engine.observe({...f.sample(37000000,100),availableResets:1});
  assert.equal(f.engine.state.send.target,19000000,'Natural refresh must not postpone the armed round');
  assert.deepEqual(await f.engine.claimSend(),{id}); assert.equal(await f.engine.claimSend(),null);
  await f.engine.finishSend(id,{sent:2}); assert.equal(f.engine.state.send.phase,'done');
});

test('a reset correction before the target can move a round earlier without reset inventory',async () => {
  const f=fixture(); await f.engine.observe(f.sample(1300000)); await f.engine.toggle('send',true);
  f.at(1020000); await f.engine.observe(f.sample(1150000,100));
  assert.equal(f.engine.state.send.target,1150000);
  f.at(1150001); await f.engine.observe(f.sample(19000000,100)); assert.ok(await f.engine.claimSend());
});

test('reset card without a new timestamp waits, polls again, and never treats null as a due time',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  f.at(1050000); await f.engine.observe({...f.sample(null,100),availableResets:1});
  assert.equal(f.engine.state.send.phase,'armed'); assert.equal(f.engine.state.send.target,null);
  f.at(1100010); assert.equal(await f.engine.claimSend(),null);
  const resumed=fixture(f.saved); resumed.at(1200000);
  await resumed.engine.observe({...resumed.sample(19000000,80),availableResets:1});
  assert.equal(resumed.engine.state.send.target,19000000); assert.equal(await resumed.engine.claimSend(),null);
});

test('stale quota cannot revert a rescheduled round after worker restart',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  f.at(1050000); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  const resumed=fixture(f.saved); resumed.at(1100010);
  await resumed.engine.observe({...resumed.sample(1100000,0,1000000),availableResets:2});
  assert.equal(resumed.engine.state.send.target,19000000); assert.equal(await resumed.engine.claimSend(),null);
  await resumed.engine.observe({...resumed.sample(19000000,90,1100010),availableResets:1});
  assert.equal(resumed.engine.state.send.target,19000000); assert.equal(resumed.engine.state.send.phase,'armed');
});

test('confirmed reset-card use after an old due time reschedules instead of sending immediately',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  f.at(1100010); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  assert.equal(f.engine.state.send.target,19000000); assert.equal(await f.engine.claimSend(),null);
});

test('reset-card data that still carries an expired timestamp waits for a valid next target',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  f.at(1100010); await f.engine.observe({...f.sample(1100000,100),availableResets:1});
  assert.equal(f.engine.state.send.target,null); assert.equal(await f.engine.claimSend(),null);
  f.at(1100020); await f.engine.observe({...f.sample(19000000,100),availableResets:1});
  assert.equal(f.engine.state.send.target,19000000); assert.equal(await f.engine.claimSend(),null);
});

test('reset cards never rearm a running or completed sending round',async () => {
  const f=fixture(); await f.engine.observe({...f.sample(),availableResets:2}); await f.engine.toggle('send',true);
  f.at(1100010); await f.engine.observe({...f.sample(19000000,100),availableResets:2}); const claim=await f.engine.claimSend();
  f.at(1200000); await f.engine.observe({...f.sample(20000000,100),availableResets:1});
  assert.equal(f.engine.state.send.phase,'running'); assert.equal(f.engine.state.send.target,1100000);
  await f.engine.finishSend(claim.id,{sent:1});
  f.at(1300000); await f.engine.observe({...f.sample(21000000,100),availableResets:0});
  assert.equal(f.engine.state.send.phase,'done'); assert.equal(await f.engine.claimSend(),null);
});
test('account change cancels armed send and replaces owned alarm',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('send',true);
  await f.engine.observe(f.sample(1200000,80,1000000,'B'));
  assert.equal(f.engine.state.send.phase,'cancelled'); assert.equal(f.engine.state.alarm.reset,1200000);
});

test('a new account sample cancels a due alarm before any old-account music or notification',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('send',true);
  f.at(1160000); await f.engine.observe(f.sample(19000000,80,1160000,'B'));
  assert.deepEqual(f.playCalls,[],'The new account must not trigger the previous account alarm');
  assert.equal(f.engine.state.send.phase,'cancelled');
  assert.equal(f.engine.state.alarm.reset,19000000);
  assert.equal(f.engine.state.fired.length,0);
});
test('a crashed sending round never retries on service restart',async () => {
  const f = fixture({send:{phase:'running',id:'crashed'}}); assert.equal(f.engine.state.send.phase,'interrupted'); assert.equal(await f.engine.claimSend(),null);
});
test('failure to open music is visible and does not report an enabled reminder',async () => {
  const f = fixture(); f.audio.check = async () => { throw new Error('missing WAV'); };
  await assert.rejects(f.engine.toggle('refresh',true),/missing WAV/); assert.equal(f.engine.state.refreshEnabled,false);
});
test('shutdown cancels alarm, one-shot send, both switches and sound',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('completion',true); await f.engine.toggle('send',true);
  await f.engine.disableAll(); assert.equal(f.engine.state.refreshEnabled,false); assert.equal(f.engine.state.completionEnabled,false);
  assert.equal(f.engine.state.alarm,null); assert.equal(f.engine.state.send.phase,'off'); assert.equal(f.engine.state.ringing,null);
});

for (const kind of ['completion','refresh']) test(`${kind} stops at 30 minutes while its switch remains on`,async () => {
  const f = fixture(); await f.engine.toggle(kind,true);
  if (kind === 'refresh') { await f.engine.observe(f.sample()); f.at(1160000); await f.engine.tick(); }
  else await f.engine.completion({hostId:'local',conversationId:'c',turnId:'t',status:'completed'});
  const deadline = f.engine.status().ringingUntil;
  assert.equal(MAX_PLAYBACK_MS,1800000); assert.equal(deadline,f.engine.state.ringing.startedAt+1800000);
  f.at(deadline-1); await f.engine.tick(); assert.equal(f.engine.status().ringing,kind);
  f.at(deadline); await f.engine.tick(); assert.equal(f.engine.status().ringing,null);
  assert.equal(f.engine.state[`${kind}Enabled`],true); assert.equal(f.saved.lastStop.reason,'timeout');
  assert.equal(f.playCalls[0].notify,kind === 'refresh','only a fresh refresh alert requests a notification');
});

test('further completions do not extend or restart the current music session',async () => {
  const f = fixture(); await f.engine.toggle('completion',true);
  const event = {hostId:'local',conversationId:'c',turnId:'first',status:'completed'};
  await f.engine.completion(event); const deadline = f.engine.status().ringingUntil;
  f.at(deadline-100); await f.engine.completion({...event,turnId:'second'});
  assert.equal(f.engine.status().ringingUntil,deadline); assert.equal(f.played.length,1);
  f.at(deadline); await f.engine.tick(); assert.equal(f.engine.status().ringing,null);
  await f.engine.completion({...event,turnId:'third'}); assert.equal(f.played.length,2);
  assert.equal(f.engine.status().ringingUntil,deadline+MAX_PLAYBACK_MS);
});

test('resuming music preserves its original deadline and never repeats the refresh notification',async () => {
  const f = fixture({refreshEnabled:true,ringing:{kind:'refresh',id:'saved',startedAt:900000}});
  await f.engine.resume(); assert.deepEqual(f.playCalls,[{kind:'refresh',notify:false}]);
  assert.equal(f.engine.status().ringingUntil,2700000);
  f.at(2700000); await f.engine.tick(); assert.equal(f.engine.status().ringing,null);
});

test('expired saved music is stopped on resume without starting it again',async () => {
  const f = fixture({completionEnabled:true,ringing:{kind:'completion',id:'old',startedAt:1000000-MAX_PLAYBACK_MS}});
  await f.engine.resume(); assert.deepEqual(f.played,[]); assert.equal(f.engine.status().ringing,null);
  assert.equal(f.saved.lastStop.reason,'timeout'); assert.equal(f.engine.state.completionEnabled,true);
});

test('legacy playback without a timestamp cannot loop forever',async () => {
  const f = fixture({completionEnabled:true,ringing:{kind:'completion',id:'legacy'}});
  await f.engine.resume(); assert.deepEqual(f.played,[]); assert.equal(f.engine.status().ringing,null);
});
