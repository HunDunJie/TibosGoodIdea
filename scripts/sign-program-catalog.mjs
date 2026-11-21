// Maintainer-only tool. The private signing key must stay outside the repository and release.
import fs from 'node:fs/promises';import path from 'node:path';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifyProgramCatalog,clientFingerprint,compareVersion} from '../program-updates.mjs';
import {readPackage,sha256} from '../update-files.mjs';
const args=process.argv.slice(2),opt=(n,d='')=>args.includes(n)?args[args.indexOf(n)+1]:d;
const root=path.resolve(opt('--root',path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const keyFile=path.resolve(opt('--key',path.join(path.dirname(root),'TibosGoodIdea-Maintainer','program-signing-private.pem')));
const relativeKey=path.relative(root,keyFile);
if(!relativeKey||!relativeKey.startsWith('..'+path.sep)&&!path.isAbsolute(relativeKey))throw Error('Keep the private key outside the repository');
// Reading a client fingerprint is read-only and does not require signing access.
if(opt('--fingerprint')){console.log(await clientFingerprint(opt('--fingerprint')));process.exit(0);}
if(args.includes('--rotate-key')){
  // Explicit maintainer recovery only. Existing clients require one manual upgrade.
  const publicFile=path.join(root,'updates/program-public-key.pem'),catalogFile=path.join(root,'updates/program-catalog.json');
  const previousPublicKey=await fs.readFile(publicFile,'utf8'),previousEnvelope=JSON.parse(await fs.readFile(catalogFile,'utf8'));
  const previous=verifyProgramCatalog(previousEnvelope,previousPublicKey);
  if(await fs.lstat(keyFile).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw Error('Signing key already exists; refusing to replace it');
  const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
  const payload={...previous,revision:previous.revision+1,releases:[]};
  const bytes=Buffer.from(JSON.stringify(payload)),envelope={payload:bytes.toString('base64'),signature:sign(null,bytes,pair.privateKey).toString('base64')};
  verifyProgramCatalog(envelope,publicKey);
  await fs.mkdir(path.dirname(keyFile),{recursive:true});
  const backup=path.join(path.dirname(keyFile),'program-signing-recovery.json');
  await fs.writeFile(backup,JSON.stringify({schema:1,createdAt:new Date().toISOString(),previousPublicKey,previousEnvelope,newPublicKey:publicKey,manualUpgradeRequired:true},null,2)+'\n',{flag:'wx',mode:0o600});
  await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
  await fs.writeFile(publicFile,publicKey);
  await fs.writeFile(catalogFile,JSON.stringify(envelope,null,2)+'\n');
  console.log(JSON.stringify({rotated:true,revision:payload.revision,manualUpgradeRequired:true,publicKeySha256:createHash('sha256').update(publicKey).digest('hex')}));process.exit(0);
}
if(args.includes('--init')){
  const pair=generateKeyPairSync('ed25519');await fs.mkdir(path.dirname(keyFile),{recursive:true});
  await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(root,'updates/program-public-key.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
}
const key=await fs.readFile(keyFile),publicKey=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
let payload={schema:1,productId:'bottom-bar-companion',revision:1,releases:[]};
if(opt('--input'))payload=JSON.parse(await fs.readFile(opt('--input'),'utf8'));
else if(!args.includes('--init')){const old=JSON.parse(await fs.readFile(path.join(root,'updates/program-catalog.json'),'utf8'));payload=verifyProgramCatalog(old,publicKey);payload.revision++;}
if(opt('--zip')){
  const keep=Number(opt('--keep','3'));if(!Number.isInteger(keep)||keep<1||keep>20)throw Error('Invalid release retention count');
  const zip=await fs.readFile(opt('--zip')),pkg=readPackage(zip),product=JSON.parse(pkg.entries.get('product.json'));
  const clients=args.flatMap((v,i)=>v==='--client'?[args[i+1]]:[]);
  payload.releases=payload.releases.filter(r=>r.version!==product.version);
  payload.releases.push({version:product.version,channel:product.version.includes('-')?'preview':'stable',kind:opt('--kind','fix'),platform:'win32-x64',minimumUpdater:1,stateSchema:1,clients,url:`https://github.com/HunDunJie/TibosGoodIdea/releases/download/v${product.version}/TibosGoodIdea-${product.version}-Windows-x64.zip`,sha256:sha256(zip),bytes:zip.length,manifestSha256:pkg.manifestSha256});
  payload.releases.sort((a,b)=>compareVersion(b.version,a.version));payload.releases=payload.releases.slice(0,keep);
}
const bytes=Buffer.from(JSON.stringify(payload)),envelope={payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
verifyProgramCatalog(envelope,publicKey);
await fs.writeFile(path.join(root,'updates/program-catalog.json'),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify({revision:payload.revision,releases:payload.releases.length}));
