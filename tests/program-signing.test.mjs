import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign,createPublicKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyProgramCatalog} from '../program-updates.mjs';
const script=fileURLToPath(new URL('../scripts/sign-program-catalog.mjs',import.meta.url));
async function fixture(t){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-signing-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const root=path.join(folder,'project');await fs.mkdir(path.join(root,'updates'),{recursive:true});
  const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
  const payload={schema:1,productId:'bottom-bar-companion',revision:12,releases:[]},bytes=Buffer.from(JSON.stringify(payload));
  const envelope={payload:bytes.toString('base64'),signature:sign(null,bytes,pair.privateKey).toString('base64')};
  await fs.writeFile(path.join(root,'updates/program-public-key.pem'),publicKey);await fs.writeFile(path.join(root,'updates/program-catalog.json'),JSON.stringify(envelope));
  return {folder,root,publicKey,envelope,key:path.join(folder,'TibosGoodIdea-Maintainer/program-signing-private.pem'),run:(...args)=>spawnSync(process.execPath,[script,'--root',root,...args],{encoding:'utf8',windowsHide:true})};
}
test('explicit missing-key recovery preserves original trust evidence and signs a new empty catalog',async t=>{
  const f=await fixture(t),result=f.run('--rotate-key');assert.equal(result.status,0,result.stderr);
  const pub=await fs.readFile(path.join(f.root,'updates/program-public-key.pem'),'utf8'),key=await fs.readFile(f.key);
  assert.notEqual(pub,f.publicKey);assert.equal(createPublicKey(key).export({type:'spki',format:'pem'}),pub);
  const envelope=JSON.parse(await fs.readFile(path.join(f.root,'updates/program-catalog.json'),'utf8'));
  assert.equal(verifyProgramCatalog(envelope,pub).revision,13);assert.throws(()=>verifyProgramCatalog(envelope,f.publicKey),/signature/);
  const backup=JSON.parse(await fs.readFile(path.join(path.dirname(f.key),'program-signing-recovery.json'),'utf8'));
  assert.equal(backup.previousPublicKey,f.publicKey);assert.equal(verifyProgramCatalog(backup.previousEnvelope,f.publicKey).revision,12);
  assert.deepEqual(verifyProgramCatalog(envelope,pub).releases,[]);assert.equal(backup.manualUpgradeRequired,true);
});
test('recovery refuses an existing key and repeated rotation leaves all trust files unchanged',async t=>{
  const f=await fixture(t);assert.equal(f.run('--rotate-key').status,0);
  const pub=await fs.readFile(path.join(f.root,'updates/program-public-key.pem')),key=await fs.readFile(f.key);
  const result=f.run('--rotate-key');assert.notEqual(result.status,0);assert.match(result.stderr,/already exists/);
  assert.deepEqual(await fs.readFile(f.key),key);assert.deepEqual(await fs.readFile(path.join(f.root,'updates/program-public-key.pem')),pub);
});
test('invalid old signatures cannot trigger rotation or create a private key',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'updates/program-catalog.json'),JSON.stringify({...f.envelope,signature:'A'.repeat(88)}));
  const result=f.run('--rotate-key');assert.notEqual(result.status,0);assert.match(result.stderr,/signature/);
  await assert.rejects(fs.stat(f.key),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(f.root,'updates/program-public-key.pem'),'utf8'),f.publicKey);
});
test('private signing keys cannot be created inside the repository',async t=>{
  const f=await fixture(t),result=f.run('--rotate-key','--key',path.join(f.root,'private.pem'));
  assert.notEqual(result.status,0);assert.match(result.stderr,/outside the repository/);await assert.rejects(fs.stat(path.join(f.root,'private.pem')),{code:'ENOENT'});
});
