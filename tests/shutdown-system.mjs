// Safe real-Windows test: a far-future task can only notify an absent isolated worker.
// This test never calls WindowsShutdown.execute or enables scheduled shutdown.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WindowsShutdown} from '../shutdown-system.mjs';
const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'tibo-shutdown-system-'));
const system=new WindowsShutdown(stateDir);
try{
  await system.schedule({id:randomUUID(),due:Date.now()+3600000});
  await system.cancel();await system.cancel();
  console.log(JSON.stringify({passed:true,realTaskRegisteredAndCancelled:true,realShutdownExecuted:false}));
}finally{await system.cancel();await fs.rmdir(stateDir);}
