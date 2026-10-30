import {readConfig} from './locale-config.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readNativeBindings } from './native-bindings.mjs';
import { readFeatureBindings } from './feature-bindings.mjs';
import {getAdapterCatalog} from './adapter-updates.mjs';
import {clientFingerprint} from './program-updates.mjs';
import { ensureWorker, requestWorker } from './worker-client.mjs';
import { defaultStateDir, controllerPipePath, controllerPortPipe } from './runtime-paths.mjs';
import { readSystemVolume } from './audio-client.mjs';
import {saveStateJson} from './state-file.mjs';
import {checkShutdownNetwork} from './shutdown-engine.mjs';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const packageVersion=JSON.parse(await fs.readFile(path.join(packageDir,'package.json'),'utf8')).version;
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9347'));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local debug port.');
const runtimeDir = path.resolve(option('--state-dir', defaultStateDir()));
const statePath = path.join(runtimeDir, 'controller.json');
const stopPath = path.join(runtimeDir, 'stop.flag');
const saveControllerState=record=>saveStateJson(statePath,record);
const connections = new Map();
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });

function localURL(value, protocol) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || (protocol && url.protocol !== protocol) || Number(url.port) !== port)
    throw new Error('Refusing a non-loopback debugging connection.');
  return url;
}
class CDP {
  constructor(url) {
    this.socket = new WebSocket(localURL(url, 'ws:'));
    this.nextId = 1; this.pending = new Map(); this.closed = false; this.handlers = new Map(); this.mainContext = null;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local debug connection timed out.')), 5000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Local debug connection failed.')); }, {once:true});
    });
    this.socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.method) { this.handlers.get(message.method)?.(message.params); return; }
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id); clearTimeout(waiting.timer);
      message.error ? waiting.reject(new Error(`CDP ${message.error.code}`)) : waiting.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      this.closed = true;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Local debug connection closed.')); }
      this.pending.clear();
    });
  }
  on(method,callback) { this.handlers.set(method,callback); }
  async call(method, params = {}) {
    await this.ready;
    if (this.closed) throw new Error('Local debug connection is closed.');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
      this.pending.set(id, {resolve, reject, timer});
      this.socket.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw new Error('Bottom bar evaluation failed.');
    return result.result?.value;
  }
  close() { this.socket.close(); }
}
async function targets({allowClosed=false}={}) {
  let response;
  try { response = await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(3000)}); }
  catch (error) {
    const cause=error.cause;
    const refused=cause?.code==='ECONNREFUSED' || (cause instanceof AggregateError && cause.errors.length>0 && cause.errors.every(item=>item?.code==='ECONNREFUSED'));
    if(allowClosed && refused)return null;
    throw error;
  }
  if (!response.ok) throw new Error('Local debug endpoint is not available.');
  return (await response.json()).filter(item => item.type === 'page' && item.webSocketDebuggerUrl);
}
const disposeExpression = 'window.__cqbFeatures?.dispose?.(); window.__codexBottomBar?.dispose?.(); window.__cqbI18n?.dispose?.(); true';
const probeExpression = '({rail:!!document.querySelector("nav[data-app-navigation-rail]"),frame:!!document.querySelector("[data-app-shell-frame]")})';
await fs.mkdir(runtimeDir, {recursive:true});

// Both normal startup and one-off recovery require exclusive controller ownership.
const instance=net.createServer(socket=>socket.end());
await new Promise((resolve,reject)=>{instance.once('error',reject);instance.listen(controllerPipePath(runtimeDir),resolve)});
instance.unref();
// State-directory locks alone cannot prevent two extracted copies injecting
// into the same Codex. Hold a second process-lifetime lease for the CDP port.
const clientInstance=net.createServer(socket=>socket.end());
await new Promise((resolve,reject)=>{clientInstance.once('error',reject);clientInstance.listen(controllerPortPipe(port),resolve)});
clientInstance.unref();
if (args.includes('--restore-once')) {
  let restored = 0;
  let prior; try { prior = JSON.parse(await fs.readFile(statePath, 'utf8')); } catch {}
  const pages=await targets({allowClosed:true});
  for (const target of pages ?? []) {
    const cdp = new CDP(target.webSocketDebuggerUrl);
    try {
      const probe = await cdp.evaluate(probeExpression);
      if (probe.rail && probe.frame) {
        const id = prior?.scripts?.[target.id];
        if (id) await cdp.call('Page.removeScriptToEvaluateOnNewDocument', {identifier:id}).catch(() => {});
        await cdp.evaluate(disposeExpression); restored++;
      }
    } finally { cdp.close(); }
  }
  await saveControllerState({pid:null,port,stopped:true,installed:0});
  console.log(JSON.stringify({restored,clientClosed:pages===null}));
  await new Promise(resolve=>instance.close(resolve));
  await new Promise(resolve=>clientInstance.close(resolve));
  process.exit(0);
}

// Only the owner may clear a stop request, inject scripts or write controller state.
await fs.rm(stopPath, {force:true});
const preferences = await readConfig(path.resolve(option('--config',path.join(packageDir,'config.local.json'))),runtimeDir);
const i18nJS = await fs.readFile(path.join(packageDir,'i18n.js'),'utf8');
const css = await fs.readFile(path.join(packageDir, 'bottom-bar.css'), 'utf8');
const js = await fs.readFile(path.join(packageDir, 'bottom-bar.js'), 'utf8');
const featureJS = await fs.readFile(path.join(packageDir,'feature-ui.js'),'utf8');
const nativeFeatureJS = await fs.readFile(path.join(packageDir,'native-features.js'),'utf8');
const workerDisabled = args.includes('--no-features'); // Isolated controller test fixtures only.
let featureBindings = null;
let nativeBindings = null;
let adapterUpdates={status:'not-checked',revision:null};
const appAsar = option('--app-asar', null);
if (appAsar) {
  try { nativeBindings = await readNativeBindings(appAsar); }
  catch { console.log('Native usage binding unavailable; protected menu fallback enabled.'); }
  let catalog=[];
  try { const result=await getAdapterCatalog(runtimeDir,{localOnly:true}); catalog=result.entries; adapterUpdates={status:result.status,revision:result.revision}; }
  catch { adapterUpdates={status:'unavailable',revision:null}; }
  try { featureBindings = await readFeatureBindings(appAsar,{catalog}); }
  catch { console.log('Native feature discovery unavailable; layout and independent reminders remain available.'); }
  // Network refresh never delays injection or changes draft interfaces during a live session.
  void (async()=>{const fingerprint=await clientFingerprint(appAsar),client=fingerprint+':'+JSON.stringify(featureBindings?.capabilities??null);const result=await getAdapterCatalog(runtimeDir,{client});adapterUpdates={status:result.status,revision:result.revision};})().catch(()=>{});
}
let wakingWorker=null;
async function wakeWorker() {
  if (!wakingWorker) wakingWorker=(async()=>{
    const status=await ensureWorker(runtimeDir,path.resolve(option('--config',path.join(packageDir,'config.local.json'))));
    if (appAsar) await requestWorker(runtimeDir,'codex-path',{path:path.join(path.dirname(path.dirname(appAsar)),'ChatGPT.exe')}).catch(() => {});
    return status;
  })().finally(()=>{wakingWorker=null;});
  return wakingWorker;
}
if (!workerDisabled) await wakeWorker();
const injection = `(()=>{const run=()=>{window.__cqbPreferences=${JSON.stringify({timeZone:preferences.uiTimeZone})};${i18nJS}\nwindow.__codexBottomBarBindings=${JSON.stringify(nativeBindings)};window.__codexBottomBarFeatureBindings=${JSON.stringify(featureBindings)};let style=document.getElementById('codex-bottom-bar-style');if(!style){style=document.createElement('style');style.id='codex-bottom-bar-style';(document.head||document.documentElement).append(style)}style.textContent=${JSON.stringify(css)};${js}\n${nativeFeatureJS}\n${featureJS}\n};if(document.documentElement)run();else document.addEventListener('DOMContentLoaded',run,{once:true})})()`;
const allowed = new Set(['wake-worker','status','toggle','observe','claim-send','finish-send','completion','interaction','stop','sound-settings','volume-status','ui-language']);
function installBridge(cdp, mainFrame) {
  cdp.on('Runtime.executionContextCreated',({context}) => {
    if (context.auxData?.isDefault && context.auxData.frameId === mainFrame) cdp.mainContext = context.id;
  });
  cdp.on('Runtime.bindingCalled',event => {
    if (event.name !== '__cqbHost' || event.executionContextId !== cdp.mainContext || event.payload.length > 8192) return;
    void (async () => {
      let message;
      try {
        message = JSON.parse(event.payload);
        if (!Number.isInteger(message.id) || typeof message.session !== 'string' || message.session.length > 80 || !allowed.has(message.method)) return;
        if (workerDisabled) throw new Error('提醒服务未在测试环境启动');
        const result = message.method === 'wake-worker' ? await wakeWorker() : message.method === 'volume-status' ? await readSystemVolume() : await requestWorker(runtimeDir,message.method,message.payload,12000);
        await cdp.evaluate(`window.__cqbBridgeReply?.(${JSON.stringify({id:message.id,session:message.session,ok:true,result})})`);
      } catch (e) {
        if (message?.id) await cdp.evaluate(`window.__cqbBridgeReply?.(${JSON.stringify({id:message.id,session:message.session,ok:false,error:e.message})})`).catch(() => {});
      }
    })();
  });
}
const startedAt = new Date().toISOString();
let installed = 0, available = 0;
async function state() {
  const record = {pid:process.pid, port, startedAt, installed, dataAvailable:available,packageRoot:packageDir,controllerVersion:packageVersion,
    adapterUpdates,nativeCapabilities:featureBindings?.capabilities ?? {send:false,completion:false},
    scripts:Object.fromEntries([...connections].map(([id, entry]) => [id, entry.scriptId]))};
  await saveControllerState(record);
}
console.log('Bottom bar controller started (loopback only).');
try {
  await state();
  while (!stopped) {
    try { await fs.access(stopPath); break; } catch {}
    try {
      const pages = await targets();
      const ids = new Set(pages.map(page => page.id));
      for (const [id, entry] of connections) if (!ids.has(id) || entry.cdp.closed) { entry.cdp.close(); connections.delete(id); }
      for (const page of pages) {
        if (connections.has(page.id)) continue;
        const cdp = new CDP(page.webSocketDebuggerUrl);
        try {
          const probe = await cdp.evaluate(probeExpression);
          if (!probe.rail || !probe.frame) { cdp.close(); continue; }
          await cdp.call('Page.enable');
          const tree = await cdp.call('Page.getFrameTree');
          installBridge(cdp,tree.frameTree.frame.id);
          await cdp.call('Runtime.enable');
          await cdp.call('Runtime.addBinding',{name:'__cqbHost'});
          const script = await cdp.call('Page.addScriptToEvaluateOnNewDocument', {source:injection});
          await cdp.evaluate(injection);
          connections.set(page.id, {cdp, scriptId:script.identifier});
        } catch { cdp.close(); }
      }
      installed = 0; available = 0;
      for (const entry of connections.values()) {
        let info = await entry.cdp.evaluate('window.__codexBottomBar?.status?.() ?? null').catch(() => null);
        if (!info?.attached) {
          const probe = await entry.cdp.evaluate(probeExpression).catch(() => null);
          if (probe?.rail && probe?.frame) {
            if (info) await entry.cdp.evaluate(disposeExpression).catch(() => {});
            await entry.cdp.evaluate(injection).catch(() => {});
            info = await entry.cdp.evaluate('window.__codexBottomBar?.status?.() ?? null').catch(() => null);
          }
        }
        if (info?.attached) installed++;
        if (info?.dataAvailable) available++;
      }
      if(!workerDisabled){
        const shutdown=await requestWorker(runtimeDir,'shutdown-heartbeat').catch(()=>null);
        if(shutdown?.request){
          const snapshots=await Promise.all([...connections.values()].map(entry=>entry.cdp.evaluate('window.__cqbNativeFeatures?.taskSnapshot?.() ?? {known:false}').catch(()=>({known:false}))));
          const snapshot={known:snapshots.length>0&&snapshots.every(s=>s?.known===true),busy:snapshots.some(s=>s?.busy===true),localSafe:snapshots.length>0&&snapshots.every(s=>s?.localSafe===true)};
          const network=snapshot.known&&snapshot.busy&&snapshot.localSafe?await checkShutdownNetwork({cdp:connections.values().next().value?.cdp}):{available:true};
          await requestWorker(runtimeDir,'shutdown-report',{id:shutdown.request.id,snapshot,network}).catch(()=>{});
        }
      }
      await state();
    } catch {
      // Once the client exits, /json/list fails too; closed sockets still need pruning.
      for (const [id,entry] of connections) if (entry.cdp.closed) {entry.cdp.close();connections.delete(id);}
      installed = 0; available = 0; await state();
      if (Date.now() - Date.parse(startedAt) > 120000 && !connections.size) break;
    }
    await delay(3000);
  }
} finally {
  if(!workerDisabled)await requestWorker(runtimeDir,'disable-shutdown').catch(()=>{});
  for (const entry of connections.values()) {
    await entry.cdp.call('Page.removeScriptToEvaluateOnNewDocument', {identifier:entry.scriptId}).catch(() => {});
    await entry.cdp.evaluate(disposeExpression).catch(() => {});
    await entry.cdp.call('Runtime.removeBinding',{name:'__cqbHost'}).catch(() => {});
    entry.cdp.close();
  }
  await saveControllerState({pid:null, port, stopped:true, installed:0});
  console.log('Bottom bar restored; controller stopped.');
  await new Promise(resolve=>instance.close(resolve));
  await new Promise(resolve=>clientInstance.close(resolve));
}
