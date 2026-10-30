import fs from 'node:fs/promises';
import path from 'node:path';
import {verify,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {saveStateJson} from './state-file.mjs';
import {openRendererArchive} from './asar-reader.mjs';
import {sha256,safeRelative,noLinks,readPackage,removeOwnedDirectory} from './update-files.mjs';
import {requestWorker} from './worker-client.mjs';
export const PROGRAM_URL='https://raw.githubusercontent.com/HunDunJie/TibosGoodIdea/main/updates/program-catalog.json';
export const UPDATER_PROTOCOL=1;
const MAX_INDEX=128*1024,INTERVAL=12*3600000;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function parseVersion(value){const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.exec(value??'');if(!m||m.slice(1).some(v=>v!==undefined&&!Number.isSafeInteger(Number(v))))throw Error('Invalid program version');return m.slice(1).map(v=>v===undefined?Infinity:Number(v));}
export function compareVersion(a,b){const x=parseVersion(a),y=parseVersion(b);for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
export function verifyProgramCatalog(envelope,key){
  if(typeof envelope?.payload!=='string'||envelope.payload.length>MAX_INDEX*2||typeof envelope.signature!=='string'||envelope.signature.length!==88)throw Error('Invalid program catalog');
  const raw=Buffer.from(envelope.payload,'base64');if(raw.length>MAX_INDEX||!verify(null,raw,key,Buffer.from(envelope.signature,'base64')))throw Error('Program signature rejected');
  const data=JSON.parse(raw);
  if(!data||Object.keys(data).some(k=>!['schema','productId','revision','releases'].includes(k))||data.schema!==1||data.productId!=='bottom-bar-companion'||!Number.isSafeInteger(data.revision)||data.revision<1||!Array.isArray(data.releases)||data.releases.length>80)throw Error('Invalid program schema');
  const allowed=new Set(['version','channel','kind','platform','minimumUpdater','stateSchema','clients','url','sha256','bytes','manifestSha256']);
  const versions=new Set();
  for(const r of data.releases){
    if(!r||typeof r!=='object')throw Error('Invalid release');parseVersion(r.version);
    const expected=`https://github.com/HunDunJie/TibosGoodIdea/releases/download/v${r.version}/TibosGoodIdea-${r.version}-Windows-x64.zip`;
    if(Object.keys(r).some(k=>!allowed.has(k))||versions.has(r.version)||r.channel!==(r.version.includes('-')?'preview':'stable')||!['fix','feature','adapter'].includes(r.kind)||r.platform!=='win32-x64'||!Number.isSafeInteger(r.minimumUpdater)||r.minimumUpdater<1||!Number.isSafeInteger(r.stateSchema)||r.stateSchema<1||!Array.isArray(r.clients)||!r.clients.length||r.clients.length>40||r.clients.some(c=>!hash(c))||r.url!==expected||!hash(r.sha256)||!hash(r.manifestSha256)||!Number.isSafeInteger(r.bytes)||r.bytes<100||r.bytes>96*1024*1024)throw Error('Invalid program release');
    versions.add(r.version);
  }
  return data;
}
export function selectRelease(catalog,{version,channel=version.includes('-')?'preview':'stable',client,manual=false,automatic=false,quarantined=[]}){
  return catalog.releases.filter(r=>compareVersion(r.version,version)>0&&(r.channel===channel||channel==='preview'&&r.channel==='stable')&&r.minimumUpdater<=UPDATER_PROTOCOL&&r.stateSchema===1&&r.clients.includes(client)&&(!quarantined.includes(r.sha256))&&(manual||automatic||r.kind==='fix')).sort((a,b)=>compareVersion(b.version,a.version))[0]??null;
}
export async function clientFingerprint(asar){
  const archive=await openRendererArchive(asar);
  try{const names=archive.names.filter(n=>/^(app-initial|app-shared|composer-content)-[\w-]+\.js$/.test(n)).sort();if(names.length<2||names.length>12||!names.some(n=>n.startsWith('app-initial-'))||!names.some(n=>n.startsWith('app-shared-')))throw Error('Ambiguous client build');const records=[];for(const name of names)records.push([name,sha256(await archive.read(name))]);return sha256(JSON.stringify(records));}finally{await archive.close();}
}
async function json(file,fallback=null){try{const s=await fs.stat(file);if(s.size>512*1024)throw Error('State too large');return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function managedRoot(root){root=path.resolve(root);await noLinks(root);const info=await json(path.join(root,'install-info.json'));if(info?.productId!=='bottom-bar-companion')throw Error('Unmanaged installation');return root;}
function versionPath(root,relative){safeRelative(relative);if(!/^versions\/[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?-[a-f0-9]{12}$/.test(relative))throw Error('Invalid version directory');return path.join(root,relative);}
async function boundedFetch(url,{fetchImpl=fetch,limit,signal,redirects=0}={}){
  const u=new URL(url);if(u.protocol!=='https:'||!['raw.githubusercontent.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('Untrusted download host');
  const response=await fetchImpl(url,{redirect:'manual',signal,headers:{Accept:'application/octet-stream'}});
  if([301,302,303,307,308].includes(response.status)){if(redirects>=4)throw Error('Too many redirects');await response.body?.cancel();return boundedFetch(new URL(response.headers.get('location'),url).href,{fetchImpl,limit,signal,redirects:redirects+1});}
  if(!response.ok||Number(response.headers.get('content-length'))>limit)throw Error('Download rejected');let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Download too large');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
}
async function atomic(root,name,record){const file=path.join(root,name);await noLinks(root,file);await noLinks(root,file+'.tmp');await saveStateJson(file,record);}
export async function verifyVersion(root,relative,key,{hashFiles=true}={}){
  const directory=versionPath(root,relative);await noLinks(root,directory);
  await noLinks(root,path.join(directory,'version-record.json'));const record=await json(path.join(directory,'version-record.json'));
  if(!record)throw Error('Missing version record');
  const catalog=verifyProgramCatalog(record.envelope,key),release=catalog.releases.find(r=>r.sha256===record.sha256);
  if(!release||`${release.version}-${release.sha256.slice(0,12)}`!==path.basename(directory))throw Error('Version record mismatch');
  await noLinks(root,path.join(directory,'SHA256-MANIFEST.json'));const manifestBytes=await fs.readFile(path.join(directory,'SHA256-MANIFEST.json'));if(manifestBytes.length>128*1024||sha256(manifestBytes)!==release.manifestSha256)throw Error('Version inventory rejected');
  const manifest=JSON.parse(manifestBytes);if(!manifest||Array.isArray(manifest))throw Error('Invalid inventory');const files=Object.keys(manifest);if(files.length>256)throw Error('Version inventory too large');
  let total=0;for(const name of files){safeRelative(name);const file=path.join(directory,name);await noLinks(directory,file);if(!hash(manifest[name]))throw Error('Invalid inventory checksum');if(hashFiles){const s=await fs.stat(file);total+=s.size;if(s.size>128*1024*1024||total>256*1024*1024||sha256(await fs.readFile(file))!==manifest[name])throw Error('Installed version checksum mismatch');}}
  if(!hashFiles)return {directory,release,files};
  const inventory=await json(path.join(directory,'release-files.json'));if(!Array.isArray(inventory)||inventory.length!==files.length||inventory.some(n=>!files.includes(n)))throw Error('Invalid installed inventory');
  const product=await json(path.join(directory,'product.json'));if(product?.version!==release.version||product.productId!=='bottom-bar-companion')throw Error('Installed product mismatch');
  return {directory,release,files};
}
export async function resolveActive(root,{key}={}){
  root=await managedRoot(root);key??=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
  let pointer;try{pointer=await json(path.join(root,'active-release.json'));}catch{return root;}
  if(!pointer||pointer.active==='.')return root;
  try{return (await verifyVersion(root,pointer.active,key)).directory;}catch{
    if(pointer.previous&&pointer.previous!=='.')try{return (await verifyVersion(root,pointer.previous,key)).directory;}catch{}
    return root;
  }
}
export async function stageRelease(root,release,envelope,{key,fetchImpl=fetch,signal=AbortSignal.timeout(120000),health=offlineHealth}={}){
  if(!verifyProgramCatalog(envelope,key).releases.some(r=>JSON.stringify(r)===JSON.stringify(release)))throw Error('Unsigned release');
  root=await managedRoot(root);await noLinks(root,path.join(root,'versions'));await fs.mkdir(path.join(root,'versions'),{recursive:true});
  const relative=`versions/${release.version}-${release.sha256.slice(0,12)}`,directory=versionPath(root,relative);
  if(await fs.stat(directory).catch(()=>null)){
    try{const ready=await verifyVersion(root,relative,key);if(ready.release.manifestSha256!==release.manifestSha256)throw Error('Prepared inventory mismatch');return relative;}
    catch(e){e.rejectCandidate=true;throw e;}
  }
  const storage=await fs.statfs(root);if(storage.bavail*storage.bsize<release.bytes+256*1024*1024)throw Error('Insufficient update disk space');
  const bytes=await boundedFetch(release.url,{fetchImpl,limit:release.bytes,signal});if(bytes.length!==release.bytes||sha256(bytes)!==release.sha256)throw Error('Downloaded program checksum mismatch');
  let pkg;try{pkg=readPackage(bytes);if(pkg.manifestSha256!==release.manifestSha256)throw Error('Signed inventory mismatch');}catch(e){e.rejectCandidate=true;throw e;}
  const product=JSON.parse(pkg.entries.get('product.json')??'null');if(product?.version!==release.version||product.productId!=='bottom-bar-companion')throw Error('Downloaded product mismatch');
  if(!pkg.entries.get('updates/program-public-key.pem')?.equals(Buffer.from(key)))throw Error('Automatic trust-key replacement is not allowed');
  const staging=path.join(root,'versions','.incoming-'+randomUUID());await fs.mkdir(staging);const written=[];
  try{
    for(const [name,data] of pkg.entries){const file=path.join(staging,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data,{flag:'wx'});written.push(name);}
    await fs.writeFile(path.join(staging,'version-record.json'),JSON.stringify({envelope,sha256:release.sha256}));written.push('version-record.json');
    try{await health(staging);}catch(e){e.rejectCandidate=true;throw e;}signal.throwIfAborted();await fs.rename(staging,directory);await verifyVersion(root,relative,key);return relative;
  }catch(e){await removeOwnedDirectory(root,staging,written).catch(()=>{});throw e;}
}
export async function offlineHealth(directory){
  const node=path.join(directory,'runtime',process.platform==='win32'?'node.exe':'node');
  for(const name of ['start.ps1','settings.ps1','reload.ps1','restore.ps1','control-reminders.ps1','check.ps1','update.ps1','launcher-common.ps1','lifecycle-common.ps1','feature-engine.mjs','worker-client.mjs','state-file.mjs','audio-client.mjs','audio-host.ps1','bottom-bar.js','bottom-bar.css','native-features.js','feature-ui.js','i18n.js','locale-config.mjs'])if(!(await fs.stat(path.join(directory,name))).isFile())throw Error('New version entry point missing');
  for(const name of ['controller.mjs','alarm-worker.mjs','program-updates.mjs','update-cli.mjs'])await new Promise((resolve,reject)=>{
    const child=spawn(node,['--check',path.join(directory,name)],{windowsHide:true,stdio:'ignore'}),timer=setTimeout(()=>child.kill(),10000);
    child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('New version offline check failed'));});
  });
  if(process.platform==='win32')await new Promise((resolve,reject)=>{
    const command="$ErrorActionPreference='Stop';$root=$env:TIBO_HEALTH_ROOT;$names=[IO.File]::ReadAllText((Join-Path $root 'release-files.json'))|ConvertFrom-Json;foreach($name in $names){if($name.EndsWith('.ps1')){$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $root $name),[ref]$null,[ref]$errors);if($errors.Count){exit 1}}};exit 0";
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:'ignore',env:{...process.env,TIBO_HEALTH_ROOT:directory}}),timer=setTimeout(()=>child.kill(),10000);
    child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('New version PowerShell syntax check failed'));});
  });
}
export async function checkProgramUpdates(root,{client,key,fetchImpl=fetch,now=Date.now(),signal,manual=false,automatic=false,force=false,health}={}){
  root=await managedRoot(root);key??=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
  const statePath=path.join(root,'program-update-state.json');let state=await json(statePath,{});
  const active=await resolveActive(root,{key}),product=await json(path.join(active,'product.json'));
  const elapsed=now-(state.checkedAt??0),priority=client&&state.client!==client;
  if(!force&&!manual&&elapsed>=0&&elapsed<(priority?Math.min(state.retryAfter??300000,300000):(state.retryAfter??INTERVAL)))return {status:'cached'};
  let candidate=null;
  try{
    const bytes=await boundedFetch(PROGRAM_URL,{fetchImpl,limit:MAX_INDEX*2,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(3500)]):AbortSignal.timeout(3500)}),envelope=JSON.parse(bytes),catalog=verifyProgramCatalog(envelope,key);
    const floor=await json(path.join(root,'program-update-floor.json'),{revision:0});if(catalog.revision<Math.max(floor.revision,state.revision??0))throw Error('Program catalog rollback rejected');
    await atomic(root,'program-update-floor.json',{revision:catalog.revision});
    const quarantine=(state.quarantine??[]).filter(v=>v.client===client).map(v=>v.sha256);
    const release=selectRelease(catalog,{version:product.version,client,manual,automatic,quarantined:quarantine});candidate=release;
    const available=selectRelease(catalog,{version:product.version,client,manual:true,quarantined:quarantine});
    state={...state,checkedAt:now,client,revision:catalog.revision,retryAfter:null,failures:0,available:available?.version??null,status:release?'downloading':available?'optional':'current'};
    // Every successful index replaces the pending decision, so a withdrawn release cannot activate.
    await atomic(root,'pending-release.json',null);await atomic(root,'program-update-state.json',state);
    if(release){const relative=await stageRelease(root,release,envelope,{key,fetchImpl,signal,health});signal?.throwIfAborted();await atomic(root,'pending-release.json',{relative,envelope,sha256:release.sha256,client,checkedAt:now,manual,automatic});state.status='ready';await atomic(root,'program-update-state.json',state);}
    return {status:state.status,available:state.available};
  }catch(error){state={...state,checkedAt:now,client,failures:(state.failures??0)+1,status:'offline',error:String(error.message).slice(0,160)};if(error.rejectCandidate&&candidate)state.quarantine=[...(state.quarantine??[]).slice(-19),{client,sha256:candidate.sha256}];state.retryAfter=Math.min(INTERVAL,300000*2**Math.min(7,state.failures-1));await atomic(root,'program-update-state.json',state);return {status:'offline'};}
}
export async function activatePending(root,{client,key,stateDir,codexRunning=false,worker=requestWorker,launch=launchWorker,health=offlineHealth,fetchImpl=fetch,readClient,now=Date.now(),fault=()=>{}}={}){
  root=await managedRoot(root);key??=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
  if(codexRunning)return {status:'deferred',reason:'codex-running'};
  const pending=await json(path.join(root,'pending-release.json'));if(!pending)return {status:'none'};
  if(!client||pending.client!==client||now<pending.checkedAt)return {status:'deferred',reason:'recheck-required'};
  if(now-pending.checkedAt>INTERVAL){
    // Revalidate only the small index, so daily users can still activate a prepared update.
    // A new download is never performed on the launch path.
    try{
      const envelope=JSON.parse(await boundedFetch(PROGRAM_URL,{fetchImpl,limit:MAX_INDEX*2,signal:AbortSignal.timeout(3500)})),fresh=verifyProgramCatalog(envelope,key);
      const floor=await json(path.join(root,'program-update-floor.json'),{revision:0});if(fresh.revision<floor.revision)throw Error('Catalog rollback');
      await atomic(root,'program-update-floor.json',{revision:fresh.revision});
      if(!fresh.releases.some(r=>r.sha256===pending.sha256&&r.clients.includes(client))){await atomic(root,'pending-release.json',null);return {status:'withdrawn'};}
      pending.envelope=envelope;pending.checkedAt=now;await atomic(root,'pending-release.json',pending);
    }catch{return {status:'deferred',reason:'recheck-required'};}
  }
  const catalog=verifyProgramCatalog(pending.envelope,key),release=catalog.releases.find(r=>r.sha256===pending.sha256);
  const current=await resolveActive(root,{key}),version=(await json(path.join(current,'product.json'))).version;
  const state=await json(path.join(root,'program-update-state.json'),{});
  if(!release||!selectRelease({releases:[release]},{version,client,manual:pending.manual===true,automatic:pending.automatic===true,quarantined:(state.quarantine??[]).filter(q=>q.client===client).map(q=>q.sha256)}))return {status:'deferred',reason:'ineligible'};
  let staged;
  try{staged=await verifyVersion(root,pending.relative,key);await health(staged.directory);}
  catch(error){state.quarantine=[...(state.quarantine??[]).slice(-19),{client,sha256:release.sha256}];state.status='rejected';await atomic(root,'program-update-state.json',state);await atomic(root,'pending-release.json',null);return {status:'rejected',error:String(error.message).slice(0,160)};}
  let prior=null,lease=null;try{prior=await worker(stateDir,'status');}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))return {status:'deferred',reason:'worker-unavailable'};}
  if(prior){if(![root,current].includes(path.resolve(prior.workerRoot??'')))return {status:'deferred',reason:'foreign-worker'};try{lease=await worker(stateDir,'prepare-update',{root});}catch{return {status:'deferred',reason:'worker-busy'};}}
  if(readClient&&await readClient().catch(()=>null)!==client){if(lease)await worker(stateDir,'cancel-update',{token:lease.token}).catch(()=>{});return {status:'deferred',reason:'client-changed'};}
  // resolveActive may already have fallen back from a damaged payload. Roll back to that verified code.
  const oldPointer={active:current===root?'.':path.relative(root,current).split(path.sep).join('/')};
  try{
    // Journal before stopping the worker: a crash anywhere after this point is recoverable.
    await atomic(root,'update-transaction.json',{previous:oldPointer.active??'.',candidate:pending.relative,sha256:release.sha256,client,wasRunning:!!prior,phase:'switching'});
    if(prior){await worker(stateDir,'commit-update',{token:lease.token});for(let i=0;i<100;i++){try{await worker(stateDir,'status');await delay(100);}catch{break;}if(i===99)throw Error('Previous reminder service has not exited');}await waitForExit(prior.workerPid);}
    fault('before-pointer');
    await atomic(root,'active-release.json',{active:pending.relative,previous:oldPointer.active,sha256:release.sha256});fault('after-pointer');
    if(prior){const ready=await launch(staged.directory,stateDir,path.join(root,'config.local.json'));if(path.resolve(ready.workerRoot)!==staged.directory||ready.workerVersion!==release.version)throw Error('New worker handshake failed');}
    await atomic(root,'update-transaction.json',{phase:'committed'});await atomic(root,'pending-release.json',null);
    return {status:'activated',version:release.version};
  }catch(error){
    try{
      await atomic(root,'active-release.json',oldPointer);
      // Use the same confirmed stop/restart as crash recovery. A busy or failed worker keeps the journal open.
      await recoverTransaction(root,{stateDir,key,launch,worker});
    }catch(recoveryError){return {status:'recovery-required',error:String(error.message).slice(0,160),recoveryError:String(recoveryError.message).slice(0,160)};}
    const state=await json(path.join(root,'program-update-state.json'),{});state.status='rolled-back';await atomic(root,'program-update-state.json',state);await atomic(root,'update-transaction.json',{phase:'rolled-back'});
    return {status:'rolled-back',error:String(error.message).slice(0,160)};
  }finally{if(lease)await worker(stateDir,'cancel-update',{token:lease.token}).catch(()=>{});}
}
export async function launchWorker(directory,stateDir,configPath){
  const child=spawn(path.join(directory,'runtime/node.exe'),[path.join(directory,'alarm-worker.mjs'),'--state-dir',stateDir,'--config',configPath],{detached:true,stdio:'ignore',windowsHide:true});let failure=null;child.on('error',e=>{failure=e});child.unref();
  for(let i=0;i<70;i++){if(failure)throw failure;await delay(100);try{const status=await requestWorker(stateDir,'status');if(status.workerPid===child.pid)return status;}catch{}}
  throw Error('New reminder service did not become ready');
}
async function waitForExit(pid){if(!Number.isSafeInteger(pid)||pid<=0)return;for(let i=0;i<100;i++){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}await delay(100);}throw Error('Previous reminder process is still exiting');}
export async function recoverTransaction(root,{stateDir,key,launch=launchWorker,worker=requestWorker}={}){
  root=await managedRoot(root);key??=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');
  const transaction=await json(path.join(root,'update-transaction.json'));if(transaction?.phase!=='switching')return;
  let previous=root;
  if(transaction.previous!=='.')previous=(await verifyVersion(root,transaction.previous,key)).directory;
  const candidate=versionPath(root,transaction.candidate);
  let live=null;try{live=await worker(stateDir,'status');}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;}
  if(live&&(path.resolve(live.workerRoot??'')===candidate||path.resolve(live.workerRoot??'')===previous&&live.updateCommitted)){
    const pid=live.workerPid;
    if(!live.updateCommitted){const lease=await worker(stateDir,'prepare-update',{root});await worker(stateDir,'commit-update',{token:lease.token});}
    for(let i=0;i<100;i++){await delay(100);try{await worker(stateDir,'status');}catch{live=null;break;}}
    if(live)throw Error('Recovery deferred: reminder service is still running');await waitForExit(pid);
  }
  if(live&&path.resolve(live.workerRoot??'')!==previous)throw Error('Recovery deferred: another installation owns the service');
  await atomic(root,'active-release.json',{active:transaction.previous??'.'});
  if(transaction.wasRunning&&!live)await launch(previous,stateDir,path.join(root,'config.local.json'));
  const state=await json(path.join(root,'program-update-state.json'),{});state.quarantine=[...(state.quarantine??[]).slice(-19),{client:transaction.client,sha256:transaction.sha256}];state.status='recovered';await atomic(root,'program-update-state.json',state);await atomic(root,'pending-release.json',null);await atomic(root,'update-transaction.json',{phase:'recovered'});
}
export async function cleanProgramUpdates(root){
  root=await managedRoot(root);const versions=path.join(root,'versions');await noLinks(root,versions);
  const names=await fs.readdir(versions).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const name of names){if(!/^\d+\.\d+\.\d+(?:-rc\.\d+)?-[a-f0-9]{12}$/.test(name))continue;
    const directory=path.join(versions,name);let record;try{await noLinks(root,path.join(directory,'version-record.json'));record=await json(path.join(directory,'version-record.json'));}catch{continue;}if(!record)continue;
    const key=await fs.readFile(path.join(root,'updates/program-public-key.pem'),'utf8');let verified;
    try{verified=await verifyVersion(root,'versions/'+name,key,{hashFiles:false});}catch{continue;}
    await removeOwnedDirectory(root,directory,[...verified.files,'SHA256-MANIFEST.json','version-record.json']);
  }
  await fs.rmdir(versions).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});
  for(const name of ['active-release.json','pending-release.json','update-transaction.json','program-update-state.json','program-update-floor.json']){await noLinks(root,path.join(root,name));await fs.unlink(path.join(root,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
