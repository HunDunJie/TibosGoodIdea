import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {read}=createRequire(import.meta.url)('../quota-cache.js');
const legacy=['rate-limit-status'],scoped=['rate-limit-status','user-a','account-a'];
function fixture(account={accountId:'account-a',userId:'user-a'}) {
  const data=new Map(),states=new Map(),lookups=[];
  const client={getQueryData(key){lookups.push(key);return key[0]==='vscode'?account:data.get(JSON.stringify(key));},getQueryState:key=>states.get(JSON.stringify(key)),getQueryCache(){throw Error('Query enumeration is unnecessary');}};
  return {client,lookups,account,put(key,raw,updatedAt=100){data.set(JSON.stringify(key),raw);states.set(JSON.stringify(key),{dataUpdatedAt:updatedAt});}};
}
test('current user/account query takes precedence over stale legacy quota',()=>{
  const f=fixture();f.put(legacy,{account_id:'account-a',user_id:'previous-user'},200);f.put(scoped,{account_id:'account-a',user_id:'user-a',credits:{balance:'12'}},300);
  const result=read(f.client);assert.deepEqual(result.queryKey,scoped);assert.equal(result.raw.credits.balance,'12');assert.equal(result.updatedAt,300);
});
test('legacy Codex queries remain readable with and without a user identifier',()=>{
  for(const account of [{accountId:'account-a'}, {accountId:'account-a',userId:'user-a'}]){
    const f=fixture(account);f.put(legacy,{account_id:'account-a'},55);
    const result=read(f.client);assert.deepEqual(result.queryKey,legacy);assert.equal(result.updatedAt,55);assert.ok(result.raw);
  }
});
test('a pending, cleared or mismatched scoped query never uses stale legacy data',()=>{
  for(const raw of [undefined,null,{account_id:'other-account'},{account_id:'account-a',user_id:'other-user'}]){
    const f=fixture();f.put(legacy,{account_id:'account-a'},99);f.put(scoped,raw,0);
    const result=read(f.client);assert.equal(result.raw,null);assert.deepEqual(result.queryKey,scoped);
  }
});
test('switching users or accounts cannot reuse the previous scoped quota',()=>{
  const f=fixture();f.put(scoped,{account_id:'account-a',user_id:'user-a'});assert.ok(read(f.client).raw);
  f.account.userId='user-b';assert.equal(read(f.client).raw,null);
  f.account.userId='user-a';f.account.accountId='account-b';assert.equal(read(f.client).raw,null);
});
test('other-user legacy data is rejected and unrelated quota queries are never read',()=>{
  const f=fixture();f.put(legacy,{account_id:'account-a',user_id:'other-user'});f.put(['rate-limit-status','image-generation'],{account_id:'account-a'});
  assert.equal(read(f.client).raw,null);assert.ok(f.lookups.every(key=>key[0]==='vscode'||JSON.stringify(key)===JSON.stringify(legacy)||JSON.stringify(key)===JSON.stringify(scoped)));
});
test('missing account identity remains unknown',()=>{
  assert.equal(read(null),undefined);assert.equal(read(fixture({}).client),undefined);
});
