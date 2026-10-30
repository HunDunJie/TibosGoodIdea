import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverShutdownBindings} from '../feature-bindings.mjs';
const source=`var hosts,clients,member,connected;
function hi(){hosts=atom(root,()=>[local])}
function ci(){clients=atom(root,e=>({status:'unavailable',client:null}));member=derived(root,(e,{get:t})=>t(hosts).includes(e));connected=derived(root,(e,{get:t})=>{const c=t(clients,e);if(t(member,e)&&c.status==='connected')return 'ready';return 'loading'})}
class Rpc {getWorkInProgress(){}getCachedThreadIds(){}getLoadedConversationHistory(){}sendRequest(){}}
export {hosts as hs,clients as cs,member as mm,connected as cc,hi as ih,ci as ic};`;
test('shutdown host discovery survives renamed symbols and exported aliases',()=>{
  assert.deepEqual(discoverShutdownBindings(source),{clients:'cs',hosts:'hs',init:['ic','ih']});
  assert.deepEqual(discoverShutdownBindings(source.replaceAll('clients','renamed').replace(' as cs',' as other')),{clients:'other',hosts:'hs',init:['ic','ih']});
});
test('missing or ambiguous monitoring interface disables only the shutdown binding',()=>{
  assert.equal(discoverShutdownBindings(source.replaceAll('getWorkInProgress','changedMethod')),null);
  assert.equal(discoverShutdownBindings(source+`var other;function oi(){other=atom(root,e=>({status:'unavailable',client:null}))}export{other as oo,oi as ii};`),null);
});
