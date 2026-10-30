import fs from 'node:fs/promises';
import path from 'node:path';
import {verify} from 'node:crypto';
import {saveStateJson} from './state-file.mjs';

export const UPDATE_URL='https://raw.githubusercontent.com/HunDunJie/TibosGoodIdea/main/updates/catalog.json';
const MAX_BYTES=512*1024, INTERVAL=12*60*60*1000;
const publicKey=await fs.readFile(new URL('./updates/public-key.pem',import.meta.url),'utf8');
const bindingKeys=new Set(['schema','initial','shared','scope','initEvents','completionEvent','initComposer','composerScope','readStorage','navigation','conversationBinding','host','navigationMode','navigateLocal','initSend','capabilities','reasons']);
const identifier=value=>typeof value==='string' && /^[A-Za-z_$][\w$]{0,100}$/.test(value);
const moduleName=value=>typeof value==='string' && /^(app-initial|app-shared|composer-content)-[\w-]+\.js$/.test(value);
export function verifyCatalog(envelope,key=publicKey) {
  if (!envelope || typeof envelope.payload!=='string' || typeof envelope.signature!=='string' || envelope.payload.length>MAX_BYTES || envelope.signature.length!==88) throw Error('Invalid adapter catalog envelope');
  const bytes=Buffer.from(envelope.payload,'base64');
  if (!verify(null,bytes,key,Buffer.from(envelope.signature,'base64'))) throw Error('Adapter signature rejected');
  const data=JSON.parse(bytes.toString('utf8'));
  if (data.schema!==1 || !Number.isSafeInteger(data.revision) || data.revision<1 || !Array.isArray(data.entries) || data.entries.length>100) throw Error('Unsupported adapter catalog schema');
  for (const entry of data.entries) {
    const b=entry?.bindings, fingerprints=entry?.fingerprints;
    if (!b || !fingerprints || typeof fingerprints!=='object' || Array.isArray(fingerprints) || Object.keys(fingerprints).length<2 || Object.keys(fingerprints).length>3 || Object.entries(fingerprints).some(([name,hash])=>!moduleName(name)||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))) throw Error('Invalid adapter fingerprint');
    if (b.schema!==2 || !moduleName(b.initial) || !b.initial.startsWith('app-initial-') || !moduleName(b.shared) || !b.shared.startsWith('app-shared-') || !fingerprints[b.initial] || !fingerprints[b.shared] || Object.keys(b).some(k=>!bindingKeys.has(k))) throw Error('Invalid adapter bindings');
    if (!b.capabilities || ['send','completion'].some(k=>typeof b.capabilities[k]!=='boolean')) throw Error('Invalid adapter capabilities');
    for(const [name,value] of Object.entries(b)) {
      if(['schema','initial','shared','initSend','capabilities','reasons','navigationMode'].includes(name))continue;
      if(value!=null&&!identifier(value))throw Error('Invalid adapter export');
    }
    if (b.navigationMode!==undefined && !['native-method','legacy-helper'].includes(b.navigationMode)) throw Error('Invalid navigation mode');
    if (b.initSend!==undefined && (!Array.isArray(b.initSend)||b.initSend.length>12||b.initSend.some(n=>!identifier(n)))) throw Error('Invalid adapter initializer');
    if (b.reasons && Object.entries(b.reasons).some(([k,v])=>!['send','completion'].includes(k)||v!==null&&!['completion-interface-unverified','draft-interface-unverified'].includes(v))) throw Error('Invalid adapter reason');
  }
  return data;
}
async function boundedResponse(response) {
  if (!response.ok) throw Error(`Adapter source HTTP ${response.status}`);
  if (Number(response.headers.get('content-length'))>MAX_BYTES) throw Error('Adapter catalog too large');
  const chunks=[];let size=0;
  for await (const chunk of response.body) {size+=chunk.byteLength;if(size>MAX_BYTES)throw Error('Adapter catalog too large');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function getAdapterCatalog(stateDir,{fetchImpl=fetch,now=Date.now(),force=false,bundledEnvelope=null,key=publicKey}={}) {
  const bundled=bundledEnvelope ?? JSON.parse(await fs.readFile(new URL('./updates/catalog.json',import.meta.url),'utf8'));
  let envelope=bundled,data=verifyCatalog(bundled,key),checkedAt=0;
  const cachePath=path.join(stateDir,'adapter-catalog.json');
  try {
    const stat=await fs.stat(cachePath); if(stat.size>MAX_BYTES*2)throw Error('Cache too large');
    const cached=JSON.parse(await fs.readFile(cachePath,'utf8')), candidate=verifyCatalog(cached.envelope,key);
    if(candidate.revision>=data.revision){data=candidate;envelope=cached.envelope;}
    if(Number.isFinite(cached.checkedAt)&&cached.checkedAt<=now)checkedAt=cached.checkedAt;
  }catch{}
  if(!force && checkedAt && now-checkedAt<INTERVAL)return {entries:data.entries,revision:data.revision,status:'cached'};
  let status='current';
  try {
    const response=await fetchImpl(UPDATE_URL,{signal:AbortSignal.timeout(3500),redirect:'error',headers:{Accept:'application/json'}});
    const remote=await boundedResponse(response),candidate=verifyCatalog(remote,key);
    if(candidate.revision<data.revision)throw Error('Adapter catalog rollback rejected');
    if(candidate.revision>data.revision){envelope=remote;data=candidate;status='updated';}
  }catch{status='offline';}
  await fs.mkdir(stateDir,{recursive:true});
  await saveStateJson(cachePath,{checkedAt:now,envelope}).catch(()=>{});
  return {entries:data.entries,revision:data.revision,status};
}
