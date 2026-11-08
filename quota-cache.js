/* Share current-account quota reads and bounded refreshes across TiBo features. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.__cqbQuotaCache = api;
})(function () {
  'use strict';
  const requests = new WeakMap();
  const identityKey = usage => JSON.stringify([usage.userId,usage.accountId,usage.queryKey]);
  const matches = (raw,usage) => raw?.account_id === usage.accountId && (!usage.userId || raw.user_id == null || raw.user_id === usage.userId);
  const hasPayload = raw => raw && ['rate_limit','additional_rate_limits','credits','rate_limit_reset_credits'].some(key=>raw[key]!=null);
  function read(client) {
    if (typeof client?.getQueryData !== 'function') return undefined;
    const account = client.getQueryData(['vscode', 'account-info']);
    if (!account?.accountId) return undefined;
    let queryKey = ['rate-limit-status'], raw, state, scopedKey;
    if (typeof account.userId === 'string' && account.userId) {
      scopedKey = ['rate-limit-status', account.userId, account.accountId];
      raw = client.getQueryData(scopedKey);
      state = client.getQueryState?.(scopedKey);
      // A pending or empty scoped query must never fall back to an old identity's data.
      if (raw !== undefined || state !== undefined) queryKey = scopedKey;
    }
    if (queryKey.length === 1) {
      raw = client.getQueryData(queryKey);
      state = client.getQueryState?.(queryKey);
      if (raw === undefined && state === undefined && scopedKey) queryKey = scopedKey;
    }
    const usage = {client, accountId:account.accountId, userId:account.userId ?? null, queryKey, updatedAt:state?.dataUpdatedAt ?? 0};
    return {...usage,raw:matches(raw,usage) ? raw : null};
  }
  async function refresh(client,{fetchNative,force=true,now=Date.now}={}) {
    const usage=read(client);if(!usage)return {status:'unavailable'};
    const identity=identityKey(usage),time=now();
    let record=requests.get(client);
    if(record?.identity!==identity){record?.controller?.abort();record={identity,lastAttempt:null,lastSuccess:null,failures:0,promise:null};requests.set(client,record);}
    if(record.promise)return record.promise;
    const age=time-usage.updatedAt;
    if(!force&&hasPayload(usage.raw)&&usage.updatedAt>0&&age>=0&&age<30000)return {status:'fresh'};
    const cooldown=force?10000:Math.min(300000,30000*2**Math.min(record.failures,4));
    if(record.lastAttempt!==null&&time-record.lastAttempt>=0&&time-record.lastAttempt<cooldown)return {status:'throttled'};
    const query=client.getQueryCache?.().find?.({queryKey:usage.queryKey,exact:true});
    if(typeof fetchNative!=='function'&&typeof query?.fetch!=='function')return {status:'unavailable'};
    record.lastAttempt=time;record.controller=new AbortController();
    const signal=record.controller.signal,timer=setTimeout(()=>record.controller.abort(),15000);
    record.promise=(async()=>{
      await Promise.resolve();
      try {
        signal.throwIfAborted();
        const aborted=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Quota refresh cancelled')),{once:true}));
        // query.fetch executes disabled legacy queries; refetchQueries silently skips them.
        // Modern clients use the verified native reader to bypass push-only cached queryFns.
        const raw=await Promise.race([typeof fetchNative==='function'?fetchNative({signal}):query.fetch(undefined,{cancelRefetch:false}),aborted]);
        signal.throwIfAborted();
        const current=read(client);
        if(!current||identityKey(current)!==identity)return {status:'account-changed'};
        if(!matches(raw,usage)||!hasPayload(raw))throw new Error('Quota response does not match the current account');
        // A push/query update that arrived during the request stays authoritative.
        if(!(current.updatedAt>usage.updatedAt&&current.raw!==usage.raw)){
          if(typeof client.setQueryData!=='function')throw new Error('Quota cache update unavailable');
          client.setQueryData(usage.queryKey,raw,{updatedAt:now()});
        }
        record.failures=0;record.lastSuccess=now();return {status:'refreshed'};
      } catch(error) {if(!signal.aborted)record.failures++;throw error;}
      finally {clearTimeout(timer);record.promise=null;record.controller=null;}
    })();
    return record.promise;
  }
  function cancel(client){const record=client&&requests.get(client);record?.controller?.abort();if(client)requests.delete(client);}
  function status(client){const r=client&&requests.get(client);return r?{pending:!!r.promise,lastAttempt:r.lastAttempt,lastSuccess:r.lastSuccess,failures:r.failures}:null;}
  return {read,refresh,cancel,status};
});
