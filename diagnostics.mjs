import fs from 'node:fs/promises';
import {readFeatureBindings} from './feature-bindings.mjs';
const args=process.argv.slice(2),at=args.indexOf('--asar');
const product=JSON.parse(await fs.readFile(new URL('./product.json',import.meta.url),'utf8'));
const result={product:product.name,version:product.version,node:process.versions.node,platform:process.platform,architecture:process.arch,supportedCodexVersions:product.supportedCodexVersions};
try {
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required');
  if(at>=0){const binding=await readFeatureBindings(args[at+1]);result.rendererSupported=!!binding;}
  if(!args.includes('--quiet'))console.log(JSON.stringify(result,null,2));
} catch(e){console.error('Compatibility check failed: '+String(e.message).slice(0,160));process.exitCode=1;}
