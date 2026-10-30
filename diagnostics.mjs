import fs from 'node:fs/promises';
import {readFeatureBindings} from './feature-bindings.mjs';
import {getAdapterCatalog,verifyCatalog} from './adapter-updates.mjs';
import {defaultStateDir} from './runtime-paths.mjs';
const args=process.argv.slice(2),at=args.indexOf('--asar');
const product=JSON.parse(await fs.readFile(new URL('./product.json',import.meta.url),'utf8'));
const result={product:product.name,version:product.version,node:process.versions.node,platform:process.platform,architecture:process.arch,supportedCodexVersions:product.supportedCodexVersions};
try {
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required');
  if(at>=0){
    let catalog=[];
    try {
      if(args.includes('--offline'))catalog=verifyCatalog(JSON.parse(await fs.readFile(new URL('./updates/catalog.json',import.meta.url),'utf8'))).entries;
      else {const stateAt=args.indexOf('--state-dir'),updates=await getAdapterCatalog(stateAt>=0?args[stateAt+1]:defaultStateDir());catalog=updates.entries;result.adapterUpdates={status:updates.status,revision:updates.revision};}
    } catch {result.adapterUpdates={status:'unavailable'};}
    try {const binding=await readFeatureBindings(args[at+1],{catalog});result.capabilities=binding.capabilities;result.discovery=binding.discovery;result.rendererSupported=binding.capabilities.send&&binding.capabilities.completion;}
    catch {result.capabilities={send:false,completion:false};result.rendererSupported=false;}
    result.baseLayoutAvailable=true;
  }
  if(!args.includes('--quiet'))console.log(JSON.stringify(result,null,2));
} catch(e){console.error('Compatibility check failed: '+String(e.message).slice(0,160));process.exitCode=1;}
