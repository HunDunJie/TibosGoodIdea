import {readConfig,configFingerprint} from './locale-config.mjs';
// Detached service: survives Codex and the CDP controller. It exposes a local named pipe, never a TCP listener.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FeatureEngine} from './feature-engine.mjs';
import {WindowsAudioClient} from './audio-client.mjs';
import {defaultStateDir,pipePath} from './runtime-paths.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2);
const option = (name,fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
const stateDir = path.resolve(option('--state-dir',defaultStateDir()));
const {version:workerVersion} = JSON.parse(await fs.readFile(path.join(here,'package.json'),'utf8'));
await fs.mkdir(stateDir,{recursive:true});
const stateFile = path.join(stateDir,'features.json');
let config = {}, initial = {};
config = await readConfig(path.resolve(option('--config',path.join(here,'config.local.json'))),stateDir);
let reportedLanguage = null;
try { initial = JSON.parse(await fs.readFile(stateFile,'utf8')); } catch {}
let queue = Promise.resolve(), closing = false, timer = null;
const serial = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
let engine;
const audio = new WindowsAudioClient(config,event => {
  if (closing) return;
  void serial(async () => {
    if (event.event === 'stop') await engine.stop(event.reason);
    if (event.event === 'disable-refresh') await engine.toggle('refresh',false);
    if (event.event === 'disable-completion') await engine.toggle('completion',false);
    if (event.event === 'shutdown') await shutdown(true);
    if (event.event === 'player-exited' && engine.state.ringing) { engine.state.ringing = null; engine.state.refreshError = '播放器意外退出，可重新开关提醒'; await engine.commit(); }
  });
});
engine = new FeatureEngine({state:initial,audio,save:async state => {
  await fs.writeFile(`${stateFile}.tmp`,JSON.stringify(state,null,2),'utf8'); await fs.rename(`${stateFile}.tmp`,stateFile);
}});
async function dispatch(method,payload = {}) {
  switch (method) {
    case 'status': return {...engine.status(),workerPid:process.pid,workerVersion,workerRoot:here,configStamp:configFingerprint(config)};
    case 'player-status': return audio.call('status');
    case 'ui-language': {
      if (!['zh-CN','en','ja'].includes(payload.language)) throw new Error('Invalid Codex language');
      if (reportedLanguage !== payload.language) {
        await audio.call('language',{language:payload.language});
        config.language=payload.language;
        const languageFile=path.join(stateDir,'codex-language.json');
        await fs.writeFile(languageFile+'.tmp',JSON.stringify({language:payload.language}),'utf8');
        await fs.rename(languageFile+'.tmp',languageFile);
        reportedLanguage=payload.language;
      }
      return {language:config.language};
    }
    case 'restart': setTimeout(() => void serial(() => shutdown(false)),100); return {restarting:true};
    case 'toggle': return engine.toggle(payload.feature,payload.enabled);
    case 'observe': return engine.observe(payload);
    case 'claim-send': return engine.claimSend();
    case 'finish-send': return engine.finishSend(payload.id,payload.result);
    case 'completion': await engine.completion(payload); return engine.status();
    case 'interaction': if (engine.state.ringing) await engine.stop('codex-interaction'); return engine.status();
    case 'stop': return engine.stop('manual');
    case 'disable-refresh': return engine.toggle('refresh',false);
    case 'sound-settings': await audio.call('sound-settings'); return engine.status();
    case 'codex-path':
      if (typeof payload.path !== 'string' || !path.isAbsolute(payload.path) || path.basename(payload.path).toLowerCase() !== 'chatgpt.exe') throw new Error('无效客户端路径');
      await audio.call('codex',{path:payload.path}); return engine.status();
    case 'shutdown': await engine.disableAll(); setTimeout(() => void shutdown(false),100); return {stopped:true};
    default: throw new Error('未知后台命令');
  }
}
const sockets = new Set();
const server = net.createServer(socket => {
  sockets.add(socket); socket.on('close',() => sockets.delete(socket)); socket.on('error',() => {});
  socket.setTimeout(15000,() => socket.destroy()); let data = '', handled = false;
  socket.on('data',chunk => {
    if (handled) return; data += chunk;
    if (data.length > 8192) return socket.destroy();
    const end = data.indexOf('\n'); if (end < 0) return;
    handled = true;
    void serial(async () => {
      try { const message = JSON.parse(data.slice(0,end)); const result = await dispatch(message.method,message.payload); socket.end(JSON.stringify({ok:true,result})+'\n'); }
      catch (e) { socket.end(JSON.stringify({ok:false,error:String(e.message).slice(0,240)})+'\n'); }
    });
  });
});
// The pipe is also the single-instance lock. A second worker exits without touching state or audio.
server.on('error',() => process.exit(1));
await new Promise(resolve => server.listen(pipePath(stateDir),resolve));
await fs.writeFile(path.join(stateDir,'reminder-worker.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),pipe:pipePath(stateDir)}));
await serial(async () => { await audio.start(); await engine.resume(); });
timer = setInterval(() => void serial(() => engine.tick()),250);
async function shutdown(disable) {
  if (closing) return; closing = true; clearInterval(timer);
  if (disable) await engine.disableAll();
  for (const socket of sockets) socket.destroy(); server.close(); await audio.close();
  await fs.writeFile(path.join(stateDir,'reminder-worker.json'),JSON.stringify({pid:null,stopped:true})); process.exit(0);
}
process.on('SIGTERM',() => void serial(() => shutdown(false)));
process.on('SIGINT',() => void serial(() => shutdown(false)));
