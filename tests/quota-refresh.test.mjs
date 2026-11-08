import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {read,refresh,cancel,status}=createRequire(import.meta.url)('../quota-cache.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function fixture(){
  let time=100000;const account={accountId:'A',userId:'user-A'},data=new Map(),states=new Map(),writes=[],queries=[];
  const key=()=>['rate-limit-status',account.userId,account.accountId];
  const raw=(used=25,id=account.accountId,user=account.userId)=>({account_id:id,user_id:user,rate_limit:{primary_window:{used_percent:used,reset_at:5000,limit_window_seconds:18000}}});
  const client={
    getQueryData:k=>k[0]==='vscode'?account:data.get(JSON.stringify(k)),getQueryState:k=>states.get(JSON.stringify(k)),
    setQueryData(k,value,options={}){writes.push({key:k,value});data.set(JSON.stringify(k),value);states.set(JSON.stringify(k),{dataUpdatedAt:options.updatedAt??time})},
    getQueryCache:()=>({find:options=>{queries.push(options);return f.query}}),
    refetchQueries(){throw Error('Disabled queries would silently skip this call')},
  };
  const f={client,account,data,states,writes,queries,key,raw,query:null,now:()=>time,advance:n=>{time+=n},put(value=raw(),stamp=time-60000,k=key()){data.set(JSON.stringify(k),value);states.set(JSON.stringify(k),{dataUpdatedAt:stamp})}};
  return f;
}
test('native reads refresh a disabled query and preserve the exact current account key',async()=>{
 const f=fixture();f.put();f.query={isDisabled:()=>true,fetch(){throw Error('Cached push query must be bypassed')}};
 assert.equal((await refresh(f.client,{fetchNative:async()=>f.raw(40),now:f.now})).status,'refreshed');
 assert.equal(read(f.client).raw.rate_limit.primary_window.used_percent,40);assert.equal(read(f.client).updatedAt,f.now());assert.deepEqual(f.writes[0].key,f.key());
});
test('missing cache is seeded for the signed-in user and legacy disabled queries execute directly',async()=>{
 const f=fixture();assert.deepEqual(read(f.client).queryKey,f.key());
 await refresh(f.client,{fetchNative:async()=>f.raw(),now:f.now});assert.ok(read(f.client).raw);
 f.advance(60000);let calls=0;f.query={fetch:async()=>{calls++;return f.raw(45)}};
 await refresh(f.client,{now:f.now});assert.equal(calls,1);assert.equal(read(f.client).raw.rate_limit.primary_window.used_percent,45);
});
test('an account-only placeholder is not treated as a fresh usage response',async()=>{
 const f=fixture();f.put({account_id:'A',user_id:'user-A'},f.now());let calls=0;
 await refresh(f.client,{force:false,now:f.now,fetchNative:async()=>{calls++;return f.raw(50)}});assert.equal(calls,1);
});
test('overlapping requests share one read and periodic polling respects fresh cache and force limits',async()=>{
 const f=fixture();f.put();const d=deferred();let calls=0;const options={fetchNative:()=>{calls++;return d.promise},now:f.now};
 const a=refresh(f.client,options),b=refresh(f.client,options);await Promise.resolve();assert.equal(calls,1);
 d.resolve(f.raw());await Promise.all([a,b]);assert.equal(f.writes.length,1);
 assert.equal((await refresh(f.client,{...options,force:false})).status,'fresh');
 assert.equal((await refresh(f.client,options)).status,'throttled');f.advance(10000);
 assert.equal((await refresh(f.client,options)).status,'refreshed');assert.equal(calls,2);
});
test('switching account or user discards an in-flight response without a cache write',async()=>{
 for(const change of [f=>{f.account.accountId='B'},f=>{f.account.userId='user-B'}]){
  const f=fixture();f.put();const raw=f.raw(),d=deferred(),p=refresh(f.client,{fetchNative:()=>d.promise,now:f.now});await Promise.resolve();change(f);d.resolve(raw);
  assert.equal((await p).status,'account-changed');assert.equal(f.writes.length,0);
 }
});
test('a new identity can refresh immediately and aborts the previous request',async()=>{
 const f=fixture();f.put();const d=deferred(),old=refresh(f.client,{fetchNative:()=>d.promise,now:f.now});await Promise.resolve();
 f.account.accountId='B';f.account.userId='user-B';const newer=refresh(f.client,{fetchNative:async()=>f.raw(60),now:f.now});
 await assert.rejects(old,/cancelled/);await newer;assert.equal(read(f.client).raw.account_id,'B');assert.equal(f.writes.length,1);
});
test('a newer native push update is not overwritten by the slower read',async()=>{
 const f=fixture();f.put();const raw=f.raw(40),d=deferred(),p=refresh(f.client,{fetchNative:()=>d.promise,now:f.now});await Promise.resolve();
 f.advance(1000);f.put(f.raw(55),f.now());d.resolve(raw);await p;
 assert.equal(read(f.client).raw.rate_limit.primary_window.used_percent,55);assert.equal(f.writes.length,0);
});
test('wrong-account, wrong-user and empty responses do not become fresh data',async()=>{
 for(const response of [f=>f.raw(2,'B'),f=>f.raw(2,'A','other-user'),()=>null,()=>({account_id:'A'})]){
  const f=fixture();f.put();const stamp=read(f.client).updatedAt;
  await assert.rejects(refresh(f.client,{fetchNative:async()=>response(f),now:f.now}),/does not match/);
  assert.equal(read(f.client).updatedAt,stamp);assert.equal(f.writes.length,0);
 }
});
test('failed reads back off, synchronous failures recover, and clock rollback cannot freeze polling',async()=>{
 const f=fixture();f.put();let calls=0;const options={now:f.now,force:false,fetchNative:()=>{calls++;throw Error('offline')}};
 await assert.rejects(refresh(f.client,options),/offline/);assert.equal(status(f.client).pending,false);
 f.advance(30000);assert.equal((await refresh(f.client,options)).status,'throttled');assert.equal(calls,1);
 f.advance(30000);await assert.rejects(refresh(f.client,options),/offline/);assert.equal(calls,2);
 f.advance(-150000);await assert.rejects(refresh(f.client,options),/offline/);assert.equal(calls,3);
});
test('disposal cancels an outstanding read and prevents a late cache write',async()=>{
 const f=fixture();f.put();const d=deferred(),p=refresh(f.client,{fetchNative:()=>d.promise,now:f.now});await Promise.resolve();
 cancel(f.client);await assert.rejects(p,/cancelled/);d.resolve(f.raw(99));await Promise.resolve();assert.equal(f.writes.length,0);assert.equal(status(f.client),null);
});
test('no identity or native fetch capability remains unavailable without issuing another request',async()=>{
 const f=fixture();assert.equal((await refresh(null)).status,'unavailable');assert.equal((await refresh(f.client,{now:f.now})).status,'unavailable');assert.equal(status(f.client).lastAttempt,null);
});
