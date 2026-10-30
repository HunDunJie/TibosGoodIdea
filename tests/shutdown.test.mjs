import test from 'node:test';
import assert from 'node:assert/strict';
import {ShutdownEngine,CHECK_MS,COUNTDOWN_MS,checkShutdownNetwork} from '../shutdown-engine.mjs';
import {WindowsShutdown} from '../shutdown-system.mjs';
import {updateBusy} from '../update-lease.mjs';
const idle={known:true,busy:false,localSafe:true},busy={known:true,busy:true,localSafe:true};
function fixture(){
  let now=1000000;const calls=[],saved=[];
  const scheduler={schedule:async p=>calls.push(['schedule',p.id,p.due]),cancel:async()=>calls.push(['cancel']),execute:async()=>calls.push(['execute'])};
  const engine=new ShutdownEngine({scheduler,now:()=>now,save:async s=>saved.push(structuredClone(s)),notice:async p=>calls.push(['notice',p.id])});
  return {engine,calls,saved,scheduler,async advance(ms,send){while(ms>0){const n=Math.min(ms,10000);now+=n;ms-=n;await engine.heartbeat(send);}},jump:ms=>now+=ms,async enable(send){await engine.heartbeat(send);await engine.toggle(true,send);},async report(snapshot=idle,network={available:true}){return engine.report({id:engine.state.request?.id,snapshot,network});}};
}
test('idle creates one five minute system plan, final fresh check precedes exactly one shutdown',async()=>{
  const f=fixture();await f.enable();await f.report();const due=f.engine.state.plan.due;
  assert.equal(due,1000000+COUNTDOWN_MS);assert.equal(f.calls.filter(x=>x[0]==='schedule').length,1);
  await f.advance(CHECK_MS-1);assert.equal(f.engine.state.request,null);
  await f.advance(1);await f.report();assert.equal(f.engine.state.plan.due,due);
  await f.advance(COUNTDOWN_MS-CHECK_MS);assert.equal(f.engine.state.request.final,true);assert.equal(f.calls.some(x=>x[0]==='execute'),false);
  await f.report();await f.advance(CHECK_MS);assert.equal(f.calls.filter(x=>x[0]==='execute').length,1);
});
test('scheduled sending pauses all checks even when offline; resumption checks immediately',async()=>{
  const f=fixture();await f.enable({phase:'armed'});await f.advance(720000,{phase:'armed'});
  assert.equal(f.engine.state.request,null);assert.equal(f.engine.state.phase,'paused');assert.equal(f.calls.some(x=>x[0]==='schedule'),false);
  await f.engine.heartbeat({phase:'done'});assert.ok(f.engine.state.request);await f.report();assert.ok(f.engine.state.plan);
  await f.engine.tick({phase:'running'});assert.equal(f.engine.state.plan,null);assert.equal(f.engine.state.phase,'paused');
});
test('new work cancels the plan and a later idle check receives a full new countdown',async()=>{
  const f=fixture();await f.enable();await f.report();const first=f.engine.state.plan;
  await f.advance(CHECK_MS);await f.report(busy);assert.equal(f.engine.state.plan,null);
  await f.advance(CHECK_MS);await f.report();assert.notEqual(f.engine.state.plan.id,first.id);assert.equal(f.engine.state.plan.due,1000000+2*CHECK_MS+COUNTDOWN_MS);
});
test('manual and tray cancellation invalidate issued reports and scheduled guard calls',async()=>{
  const f=fixture();await f.enable();const oldRequest=f.engine.state.request.id;await f.report();const plan=f.engine.state.plan;
  await f.engine.disable();await f.engine.report({id:oldRequest,snapshot:idle});await f.advance(COUNTDOWN_MS);await f.engine.fire(plan.id);
  assert.equal(f.engine.state.enabled,false);assert.equal(f.engine.state.plan,null);assert.equal(f.calls.some(x=>x[0]==='execute'),false);
});
test('a late report from before cancellation cannot affect a new session',async()=>{
  const f=fixture();await f.enable();const id=f.engine.state.request.id;await f.engine.disable();await f.enable();
  await f.engine.report({id,snapshot:idle});assert.equal(f.engine.state.plan,null);
});
test('unknown, malformed, timed out and disconnected state never counts as idle',async()=>{
  for(const snapshot of [{known:false},null,{known:true,busy:false},{known:true,busy:'false',localSafe:true}]){
    const f=fixture();await f.enable();await f.report(snapshot);assert.equal(f.engine.state.plan,null);
  }
  const f=fixture();await f.enable();await f.report();f.jump(21000);await f.engine.tick();assert.equal(f.engine.state.plan,null);
  const g=fixture();await g.enable();await g.advance(40000);assert.equal(g.engine.state.request,null);assert.equal(g.engine.state.phase,'waiting');
});
test('sleep and backwards clock jumps revoke rather than firing an old deadline',async()=>{
  for(const gap of [600000,-60000]){const f=fixture();await f.enable();await f.report();f.jump(gap);await f.engine.heartbeat();assert.equal(f.engine.state.plan,null);assert.equal(f.calls.some(x=>x[0]==='execute'),false);}
});
test('busy final check aborts even after an idle mid-countdown check',async()=>{
  const f=fixture();await f.enable();await f.report();await f.advance(CHECK_MS);await f.report();await f.advance(COUNTDOWN_MS-CHECK_MS);await f.report(busy);
  assert.equal(f.engine.state.plan,null);assert.equal(f.calls.some(x=>x[0]==='execute'),false);
});
test('persistent offline model stall can shut down, and reconnection cancels its plan',async()=>{
  const f=fixture();await f.enable();await f.report(busy,{available:false});assert.equal(f.engine.state.plan,null);
  await f.advance(CHECK_MS);await f.report(busy,{available:false});assert.equal(f.engine.state.reason,'network');assert.ok(f.engine.state.plan);
  await f.advance(CHECK_MS);await f.report(busy,{available:true});assert.equal(f.engine.state.plan,null);
});
test('local tool work, approvals, missing task data and intermittent outages block offline shutdown',async()=>{
  for(const snapshot of [{...busy,localSafe:false},{known:false,busy:true,localSafe:true}]){
    const f=fixture();await f.enable();await f.report(snapshot,{available:false});await f.advance(CHECK_MS);await f.report(snapshot,{available:false});assert.equal(f.engine.state.plan,null);
  }
  const f=fixture();await f.enable();await f.report(busy,{available:false});await f.advance(CHECK_MS);await f.report(busy,{available:true});await f.advance(CHECK_MS);await f.report(busy,{available:false});assert.equal(f.engine.state.plan,null);
});
test('cancellation is persisted before touching Windows and still invalidates a failed deletion',async()=>{
  const f=fixture();await f.enable();await f.report();f.scheduler.cancel=async()=>{assert.equal(f.saved.at(-1).plan,null);assert.equal(f.saved.at(-1).enabled,false);throw Error('denied')};
  await f.engine.disable();assert.equal(f.engine.state.enabled,false);assert.equal(f.engine.state.plan,null);assert.ok(f.engine.state.error);
});
test('Windows scheduling and shutdown failures are visible without repeated shutdown attempts',async()=>{
  const f=fixture();await f.enable();f.scheduler.schedule=async()=>{throw Error('disabled service')};await f.report();assert.equal(f.engine.state.phase,'failed');assert.equal(f.engine.state.enabled,false);
  const g=fixture();await g.enable();await g.report();await g.advance(CHECK_MS);await g.report();await g.advance(COUNTDOWN_MS-CHECK_MS);g.scheduler.execute=async()=>{g.calls.push(['execute']);throw Error('denied')};await g.report();await g.advance(CHECK_MS);assert.equal(g.engine.state.phase,'failed');assert.equal(g.calls.filter(x=>x[0]==='execute').length,1);
});
test('network probes use the client session without credentials and require both destinations to fail',async()=>{
  const closed=[];let resources=[{success:false,netError:-105,netErrorName:'net::ERR_NAME_NOT_RESOLVED'},{success:false,netError:-106,netErrorName:'net::ERR_INTERNET_DISCONNECTED'}];
  const cdp={call:async(method,p)=>{
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'client-frame'}}};
    if(method==='IO.close'){closed.push(p.handle);return {};}
    assert.equal(method,'Network.loadNetworkResource');assert.equal(p.frameId,'client-frame');assert.deepEqual(p.options,{disableCache:true,includeCredentials:false});return {resource:resources.shift()};
  }};
  assert.equal((await checkShutdownNetwork({cdp})).available,false);
  resources=[{success:false,netError:-106},{success:true,httpStatusCode:403,stream:'discard-body'}];
  assert.equal((await checkShutdownNetwork({cdp})).available,true);assert.deepEqual(closed,['discard-body']);
});

test('an unsupported or blocked client network probe is unknown instead of an outage',async()=>{
  assert.equal((await checkShutdownNetwork({cdp:{call:async()=>{throw Error('unsupported')}}})).available,null);
  const cdp={call:async method=>method==='Page.getFrameTree'?{frameTree:{frame:{id:'frame'}}}:{resource:{success:false,netError:-20,netErrorName:'net::ERR_BLOCKED_BY_CLIENT'}}};
  assert.equal((await checkShutdownNetwork({cdp})).available,null);
  const f=fixture();await f.enable();await f.report(busy,{available:null});await f.advance(CHECK_MS);await f.report(busy,{available:null});assert.equal(f.engine.state.plan,null);
});
test('system executor uses the absolute Windows shutdown binary, no shell, and explicit force',async()=>{
  const calls=[];const system=new WindowsShutdown('C:/test only',{run:async(...args)=>calls.push(args)});
  await system.execute();assert.match(calls[0][0],/System32[\\/]shutdown.exe$/);assert.deepEqual(calls[0][1],['/s','/f','/t','0']);assert.equal(calls[0][2].windowsHide,true);assert.equal(calls[0][2].shell,undefined);
  assert.equal(updateBusy({shutdown:{enabled:true}}),'shutdown-monitor');
});
test('a cancellation arriving during final persistence wins before the Windows command',async()=>{
  const f=fixture();await f.enable();await f.report();await f.advance(CHECK_MS);await f.report();await f.advance(COUNTDOWN_MS-CHECK_MS);
  const original=f.engine.save;f.engine.save=async state=>{await original(state);if(state.phase==='executing')f.engine.cancelEpoch++;};
  await f.report();await f.engine.disable();assert.equal(f.calls.some(x=>x[0]==='execute'),false);
});

test('a cancellation already received while the final report was queued vetoes shutdown',async()=>{
  const f=fixture();await f.enable();await f.report();await f.advance(CHECK_MS);await f.report();await f.advance(COUNTDOWN_MS-CHECK_MS);
  f.engine.cancelEpoch++;
  await f.report();assert.equal(f.calls.some(x=>x[0]==='execute'),false);assert.equal(f.engine.state.plan,null);
});
test('failed task cleanup remains recorded and is retried even after its plan was invalidated',async()=>{
  const f=fixture();await f.enable();await f.report();const original=f.scheduler.cancel;
  f.scheduler.cancel=async()=>{throw Error('unavailable')};await f.engine.disable();
  assert.equal(f.engine.state.plan,null);assert.equal(f.engine.state.cleanupPending,true);
  f.scheduler.cancel=original;await f.engine.disable();assert.equal(f.engine.state.cleanupPending,false);
});
