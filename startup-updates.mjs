import fs from 'node:fs/promises';
import path from 'node:path';
import {checkProgramUpdates,activatePending,recoverTransaction} from './program-updates.mjs';
import {getAdapterCatalog} from './adapter-updates.mjs';
import {saveStateJson} from './state-file.mjs';
// Each launch checks both signed indexes. Running clients only stage code.
export async function startupUpdates(root,{stateDir,client,busy=false,isBusy=async()=>busy,program=checkProgramUpdates,adapter=getAdapterCatalog,activate=activatePending,recover=recoverTransaction,readClient,signal}={}){
  await fs.mkdir(stateDir,{recursive:true});
  const file=path.join(stateDir,'startup-update.json');let prior={};try{prior=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
  const clientChanged=!!client&&!!prior.client&&prior.client!==client;
  if(!busy)await recover(root,{stateDir});
  const adapters=await adapter(stateDir,{force:true,client}).catch(()=>({status:'offline'}));
  const result=await program(root,{client,force:true,automatic:true,signal});
  // A failed fresh check cannot authorize a stale/withdrawn pending decision.
  signal?.throwIfAborted();
  const activation=busy||await isBusy()?{status:'deferred',reason:'codex-running'}:result.status==='offline'?{status:'deferred',reason:'offline'}:await activate(root,{client,stateDir,readClient});
  const record={checkedAt:Date.now(),client,clientChanged,adapter:adapters.status,program:result.status,available:result.available??null,activation};
  await saveStateJson(file,record);return record;
}
