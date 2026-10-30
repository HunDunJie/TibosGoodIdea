// A Windows task is only a wake-up signal. Never shut down without the live worker's final check.
import {requestWorker} from './worker-client.mjs';
const args=process.argv.slice(2),option=n=>args[args.indexOf(n)+1];
if(!args.includes('--state-dir')||!args.includes('--id')||!/^[a-f0-9-]{36}$/.test(option('--id')))process.exit(1);
try{await requestWorker(option('--state-dir'),'shutdown-fire',{id:option('--id')});}catch{process.exitCode=1;}
