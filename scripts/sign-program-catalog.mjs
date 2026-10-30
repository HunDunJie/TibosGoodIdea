// Maintainer-only tool. The private signing key must stay outside the repository and release.
import fs from 'node:fs/promises';import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifyProgramCatalog,clientFingerprint} from '../program-updates.mjs';
import {readPackage,sha256} from '../update-files.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2),opt=(n,d='')=>args.includes(n)?args[args.indexOf(n)+1]:d;
const keyFile=path.resolve(opt('--key',path.join(process.env.LOCALAPPDATA??'.','TibosGoodIdea-Maintainer','program-signing-private.pem')));
if(keyFile===root||keyFile.startsWith(root+path.sep))throw Error('Keep the private key outside the repository');
if(args.includes('--init')){
  const pair=generateKeyPairSync('ed25519');await fs.mkdir(path.dirname(keyFile),{recursive:true});
  await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(root,'updates/program-public-key.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
}
const key=await fs.readFile(keyFile),publicKey=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
if(opt('--fingerprint')){console.log(await clientFingerprint(opt('--fingerprint')));process.exit(0);}
let payload={schema:1,productId:'bottom-bar-companion',revision:1,releases:[]};
if(opt('--input'))payload=JSON.parse(await fs.readFile(opt('--input'),'utf8'));
else if(!args.includes('--init')){const old=JSON.parse(await fs.readFile(path.join(root,'updates/program-catalog.json'),'utf8'));payload=verifyProgramCatalog(old,publicKey);payload.revision++;}
if(opt('--zip')){
  const zip=await fs.readFile(opt('--zip')),pkg=readPackage(zip),product=JSON.parse(pkg.entries.get('product.json'));
  const clients=args.flatMap((v,i)=>v==='--client'?[args[i+1]]:[]);
  payload.releases=payload.releases.filter(r=>r.version!==product.version);
  payload.releases.push({version:product.version,channel:product.version.includes('-')?'preview':'stable',kind:opt('--kind','fix'),platform:'win32-x64',minimumUpdater:1,stateSchema:1,clients,url:`https://github.com/HunDunJie/TibosGoodIdea/releases/download/v${product.version}/TibosGoodIdea-${product.version}-Windows-x64.zip`,sha256:sha256(zip),bytes:zip.length,manifestSha256:pkg.manifestSha256});
}
const bytes=Buffer.from(JSON.stringify(payload)),envelope={payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
verifyProgramCatalog(envelope,publicKey);
await fs.writeFile(path.join(root,'updates/program-catalog.json'),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify({revision:payload.revision,releases:payload.releases.length}));
