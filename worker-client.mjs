import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {defaultStateDir, pipePath} from './runtime-paths.mjs';
import {readConfig,configFingerprint} from './locale-config.mjs';
import i18n from './i18n.js';
const here = path.dirname(fileURLToPath(import.meta.url));
export function requestWorker(stateDir, method, payload = {}, timeout = 5000) {
  return new Promise((resolve,reject) => {
    const socket = net.createConnection(pipePath(stateDir)); let data = '', done = false;
    const finish = (error,value) => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('提醒后台连接超时')), timeout);
    socket.on('error', () => finish(new Error('提醒后台未运行')));
    socket.on('connect', () => socket.write(JSON.stringify({method,payload}) + '\n'));
    socket.on('data', chunk => {
      data += chunk; if (data.length > 65536) return finish(new Error('无效后台响应'));
      const end = data.indexOf('\n'); if (end < 0) return;
      try { const r = JSON.parse(data.slice(0,end)); finish(r.ok ? null : new Error(r.error),r.result); }
      catch { finish(new Error('无效后台响应')); }
    });
  });
}
export async function ensureWorker(stateDir, configPath) {
  try { return await requestWorker(stateDir,'status'); } catch {}
  const args = [path.join(here,'alarm-worker.mjs'),'--state-dir',stateDir];
  if (configPath) args.push('--config',configPath);
  const child = spawn(process.execPath,args,{detached:true,stdio:'ignore',windowsHide:true}); child.unref();
  for (let i = 0; i < 40; i++) {
    await delay(150); try { return await requestWorker(stateDir,'status'); } catch {}
  }
  throw new Error('无法启动独立提醒进程');
}
export async function reloadWorker(stateDir,configPath) {
  let prior;try{prior=await requestWorker(stateDir,'status');}catch{}
  if(prior){
    if(prior.send?.phase==='running')throw Error('正在发送，请等待本轮结束');
    await requestWorker(stateDir,'restart');
    let stopped=false;
    for(let i=0;i<60;i++){await delay(100);try{process.kill(prior.workerPid,0);}catch(e){if(e.code==='ESRCH'){stopped=true;break;}throw e;}}
    if(!stopped)throw Error('The previous reminder service has not exited');
  }
  return ensureWorker(stateDir,configPath);
}
export async function ensureConfiguredWorker(stateDir,configPath) {
  const current=await ensureWorker(stateDir,configPath),config=await readConfig(configPath);
  return current.workerRoot===here&&current.configStamp===configFingerprint(config)?current:reloadWorker(stateDir,configPath);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--state-dir');
  const stateDir = at >= 0 ? args[at+1] : defaultStateDir();
  const configAt=args.indexOf('--config'),configPath=configAt>=0?path.resolve(args[configAt+1]):path.join(here,'config.local.json');
  try { console.log(JSON.stringify(args[0] === 'start' ? await ensureWorker(stateDir,configPath) : args[0]==='reload'?await reloadWorker(stateDir,configPath):args[0]==='start-configured'?await ensureConfiguredWorker(stateDir,configPath):await requestWorker(stateDir,args[0] ?? 'status'))); }
  catch (e) { const language=i18n.create({language:'auto'},process.env.BOTTOMBAR_UI_LANGUAGE??Intl.DateTimeFormat().resolvedOptions().locale);console.error(language.t(e.message));process.exitCode = 1; }
}
