// Maintainer tool. The signing private key must remain outside this repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sign,createPublicKey,generateKeyPairSync} from 'node:crypto';
import {readFeatureBindings} from '../feature-bindings.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--key'))throw Error('Required: --key <private key outside the repository>');
const keyPath=path.resolve(option('--key')),root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
if(keyPath.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Store the signing key outside the repository');
let key;
try{key=await fs.readFile(keyPath,'utf8');}catch(error){
  if(error.code!=='ENOENT'||!args.includes('--init'))throw error;
  const pair=generateKeyPairSync('ed25519');key=pair.privateKey.export({type:'pkcs8',format:'pem'});
  await fs.mkdir(path.dirname(keyPath),{recursive:true});await fs.writeFile(keyPath,key,{flag:'wx',mode:0o600});
  await fs.mkdir(new URL('../updates/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../updates/public-key.pem',import.meta.url),pair.publicKey.export({type:'spki',format:'pem'}));
}
const expected=await fs.readFile(new URL('../updates/public-key.pem',import.meta.url),'utf8');
if(createPublicKey(key).export({type:'spki',format:'pem'}).toString()!==expected)throw Error('Signing key does not match the pinned public key');
let data={schema:1,revision:0,entries:[]};
try{data=JSON.parse(await fs.readFile(new URL('../updates/entries.json',import.meta.url),'utf8'));}catch{}
if(args.includes('--asar')){
  const bindings=await readFeatureBindings(option('--asar')),fingerprints=bindings.fingerprints;
  delete bindings.fingerprints;delete bindings.discovery;
  data.entries=data.entries.filter(e=>JSON.stringify(e.fingerprints)!==JSON.stringify(fingerprints));
  data.entries.push({fingerprints,bindings});
}
data.revision++;
const bytes=Buffer.from(JSON.stringify(data)),envelope={payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
const {verifyCatalog}=await import('../adapter-updates.mjs');verifyCatalog(envelope);
await fs.writeFile(new URL('../updates/entries.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
await fs.writeFile(new URL('../updates/catalog.json',import.meta.url),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify({revision:data.revision,entries:data.entries.length,privateKeyPrinted:false}));
