import test from 'node:test';
import assert from 'node:assert/strict';
import {FeatureEngine,RESET_DELAY_MS} from '../feature-engine.mjs';
function fixture(){
  let now=1000000,saved;const played=[];
  const audio={check:async()=>{},play:async()=>played.push(now),stop:async()=>{}};
  const engine=new FeatureEngine({now:()=>now,audio,save:async s=>{saved=structuredClone(s)}});
  const sample=(five=1100000,fiveRemaining=0,week=2000000,weeklyRemaining=0)=>({accountId:'A',resetsAt:five,remaining:fiveRemaining,weeklyLimit:'limited',weekly:{resetsAt:week,remaining:weeklyRemaining},updatedAt:now});
  return {engine,sample,played,audio,at:n=>now=n,get saved(){return saved}};
}
test('both exhausted windows wait for the later reset plus three minutes and fresh usable quotas',async()=>{
  for(const [five,week] of [[1100000,2000000],[2000000,1100000]]){
    const f=fixture(),target=Math.max(five,week);await f.engine.observe(f.sample(five,0,week,0));
    await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
    assert.equal(f.engine.state.send.target,target);assert.equal(f.engine.state.send.due,target+180000);assert.equal(f.engine.state.alarm.due,target+180000);
    f.at(1280000);await f.engine.tick();assert.deepEqual(f.played,[]);assert.equal(await f.engine.claimSend(),null);
    f.at(target+179999);await f.engine.observe(f.sample(five+18000000,100,week+604800000,100));assert.equal(await f.engine.claimSend(),null);assert.deepEqual(f.played,[]);
    f.at(target+180000);assert.equal(await f.engine.claimSend(),null,'A pre-delay sample cannot claim');
    await f.engine.observe(f.sample(five+18000000,100,week+604800000,100));assert.ok(await f.engine.claimSend());assert.equal(await f.engine.claimSend(),null);assert.equal(f.played.length,1);
  }
});
test('only the exhausted window determines recovery; healthy windows do not extend the wait',async()=>{
  for(const [fiveRemaining,weekRemaining,expected] of [[80,0,1500000],[0,80,2000000],[80,80,1500000]]){
    const f=fixture();await f.engine.observe(f.sample(2000000,fiveRemaining,1500000,weekRemaining));await f.engine.toggle('send',true);assert.equal(f.engine.state.send.target,expected);
  }
});
test('weekly exhaustion observed during the grace period postpones both actions before playback',async()=>{
  const f=fixture();await f.engine.observe(f.sample(1100000,0,2000000,50));await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
  f.at(1280000);await f.engine.observe(f.sample(19000000,100,2000000,0));assert.deepEqual(f.played,[]);assert.equal(await f.engine.claimSend(),null);
  assert.equal(f.engine.state.send.due,2180000);assert.equal(f.engine.state.alarm.due,2180000);
});
test('weekly correction and unknown quota cannot trigger an obsolete recovery',async()=>{
  const f=fixture();await f.engine.observe(f.sample());await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
  f.at(1200000);await f.engine.observe(f.sample(19000000,100,3000000,0));assert.equal(f.engine.state.send.target,3000000);assert.equal(f.engine.state.alarm.reset,3000000);
  f.at(3180000);await f.engine.observe({...f.sample(),weeklyLimit:'unknown',weekly:null});assert.equal(await f.engine.claimSend(),null);assert.deepEqual(f.played,[]);
});
test('offline reminder and weekly blocker survive worker restart and stale samples',async()=>{
  const f=fixture();await f.engine.observe(f.sample());await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
  const e=new FeatureEngine({state:f.saved,now:()=>2180000,audio:f.audio});await e.resume();assert.equal(f.played.length,1);assert.equal(await e.claimSend(),null);
  await e.observe({...f.sample(1100000,100,2000000,100),updatedAt:999999});assert.equal(await e.claimSend(),null);assert.equal(e.state.send.target,2000000);
});
test('legacy schedules require both quota windows after upgrade',async()=>{
  const f=fixture();await f.engine.observe(f.sample());await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
  const old=f.saved;delete old.quotaPolicy;delete old.quotaCheckpoint.weeklyLimit;
  const e=new FeatureEngine({state:old,now:()=>1280000,audio:f.audio});await e.resume();assert.equal(e.state.alarm,null);assert.equal(e.state.send.target,null);assert.deepEqual(f.played,[]);
  await e.observe({...f.sample(),updatedAt:1280000});assert.equal(e.state.send.target,2000000);assert.equal(e.state.alarm.due,2000000+RESET_DELAY_MS);
});
test('an unrelated healthy weekly timestamp correction preserves the elapsed five-hour round',async()=>{
 const f=fixture();await f.engine.observe(f.sample(1100000,0,2000000,80));await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
 f.at(1150000);await f.engine.observe(f.sample(19000000,100,3000000,80));assert.equal(f.engine.state.send.target,1100000);assert.equal(f.engine.state.alarm.reset,1100000);
 f.at(1280000);await f.engine.observe(f.sample(19000000,100,3000000,80));assert.ok(await f.engine.claimSend());assert.equal(f.played.length,1);
});
test('a newly exhausted window can move a healthy future plan to its earlier recovery',async()=>{
 const f=fixture();await f.engine.observe(f.sample(null,100,3000000,80));await f.engine.toggle('send',true);assert.equal(f.engine.state.send.target,3000000);
 f.at(1050000);await f.engine.observe(f.sample(2000000,0,3000000,80));assert.equal(f.engine.state.send.target,2000000);
});
test('temporarily unknown weekly usage blocks execution without losing the delayed round, including restart',async()=>{
 const f=fixture();await f.engine.observe(f.sample(1100000,0,2000000,80));await f.engine.toggle('send',true);await f.engine.toggle('refresh',true);
 f.at(1150000);await f.engine.observe({...f.sample(19000000,100),weeklyLimit:'unknown',weekly:null});assert.equal(f.engine.state.send.target,1100000);assert.equal(f.engine.state.alarm.reset,1100000);
 const e=new FeatureEngine({state:f.saved,now:()=>1280000,audio:f.audio});await e.resume();assert.deepEqual(f.played,[]);assert.equal(await e.claimSend(),null);
 await e.observe({...f.sample(19000000,100,2000000,80),updatedAt:1280000});assert.equal(f.played.length,1);assert.ok(await e.claimSend());assert.equal(await e.claimSend(),null);
});
