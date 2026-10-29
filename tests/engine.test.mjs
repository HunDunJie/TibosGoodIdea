import test from 'node:test';
import assert from 'node:assert/strict';
import {FeatureEngine,MAX_PLAYBACK_MS} from '../feature-engine.mjs';
function fixture(initial = {}) {
  let time = 1000000, saved = null;
  const played = [], playCalls = [], stopped = [], audio = {check:async () => {},play:async (kind,options) => { played.push(kind); playCalls.push({kind,...options}); },stop:async () => { stopped.push(time); }};
  const engine = new FeatureEngine({state:initial,now:() => time,audio,save:async state => { saved = structuredClone(state); }});
  return {engine,played,playCalls,stopped,audio,get saved() { return saved; },at(value) { time = value; },sample:(reset = 1100000,remaining = 0,updatedAt = time,accountId = 'A') => ({accountId,resetsAt:reset,remaining,updatedAt})};
}
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
test('account change cancels armed send and replaces owned alarm',async () => {
  const f = fixture(); await f.engine.observe(f.sample()); await f.engine.toggle('refresh',true); await f.engine.toggle('send',true);
  await f.engine.observe(f.sample(1200000,80,1000000,'B'));
  assert.equal(f.engine.state.send.phase,'cancelled'); assert.equal(f.engine.state.alarm.reset,1200000);
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
