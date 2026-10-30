import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sign,generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {verifyCatalog,getAdapterCatalog,UPDATE_URL} from '../adapter-updates.mjs';
const pair=generateKeyPairSync('ed25519'),key=pair.publicKey;
const envelope=(revision,entries=[])=>{const bytes=Buffer.from(JSON.stringify({schema:1,revision,entries}));return {payload:bytes.toString('base64'),signature:sign(null,bytes,pair.privateKey).toString('base64')};};
test('signature, fingerprint schema and export names are checked',()=>{
  assert.equal(verifyCatalog(envelope(1),key).revision,1);
  const damaged=envelope(2);damaged.payload=Buffer.from('{}').toString('base64');assert.throws(()=>verifyCatalog(damaged,key),/signature/);
  assert.throws(()=>verifyCatalog(envelope(2,[{fingerprints:{'../escape.js':'0'.repeat(64)},bindings:{}}]),key),/fingerprint/);
  const fingerprints={'app-initial-test.js':'1'.repeat(64),'app-shared-test.js':'2'.repeat(64)},bindings={schema:2,initial:'app-initial-test.js',shared:'app-shared-test.js',scope:'root',capabilities:{send:false,completion:false}};
  assert.equal(verifyCatalog(envelope(2,[{fingerprints,bindings}]),key).entries.length,1);
  assert.throws(()=>verifyCatalog(envelope(3,[{fingerprints,bindings:{...bindings,scope:'run()'}}]),key),/export/);
  assert.throws(()=>verifyCatalog(envelope(3,[{fingerprints,bindings:{...bindings,script:'anything'}}]),key),/bindings/);
});
test('updates silently, caches, rejects rollback and survives offline or corrupt responses',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-updates-'));let calls=0;
  const opts={key,bundledEnvelope:envelope(1),now:1700000000000,fetchImpl:async(url,options)=>{calls++;assert.equal(url,UPDATE_URL);assert.equal(options.redirect,'error');return new Response(JSON.stringify(envelope(2)));}};
  try{
    assert.equal((await getAdapterCatalog(dir,opts)).status,'updated');
    assert.equal((await getAdapterCatalog(dir,{...opts,now:opts.now+1000})).status,'cached');assert.equal(calls,1);
    const rollback=await getAdapterCatalog(dir,{...opts,force:true,fetchImpl:async()=>new Response(JSON.stringify(envelope(1)))});
    assert.equal(rollback.revision,2);assert.equal(rollback.status,'offline');
    for(const fetchImpl of [async()=>{throw Error('offline')},async()=>new Response('invalid'),async()=>new Response('x',{headers:{'content-length':'999999'}})]){
      const result=await getAdapterCatalog(dir,{...opts,force:true,fetchImpl});assert.equal(result.revision,2);assert.equal(result.status,'offline');
    }
    await fs.writeFile(path.join(dir,'adapter-catalog.json'),'corrupt');
    assert.equal((await getAdapterCatalog(dir,{...opts,fetchImpl:async()=>{throw Error('offline')}})).revision,1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
