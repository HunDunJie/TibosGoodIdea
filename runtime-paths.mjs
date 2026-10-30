import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export function defaultStateDir() {
  if(process.env.TIBO_STATE_DIR)return process.env.TIBO_STATE_DIR;
  if(process.env.TIBO_INSTALL_ROOT)try{const root=process.env.TIBO_INSTALL_ROOT;if(JSON.parse(fs.readFileSync(path.join(root,'install-info.json'),'utf8')).mode==='portable')return path.join(root,'data');}catch{}
  return path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'CodexBottomBar');
}
export function portableOwnerPipe(){const id=createHash('sha256').update(os.homedir().toLowerCase()).digest('hex').slice(0,24);return process.platform==='win32'?`\\\\.\\pipe\\tibo-portable-${id}`:path.join(os.tmpdir(),`tibo-portable-${id}.sock`);}
export function controllerPortPipe(port){return process.platform==='win32'?portableOwnerPipe()+`-cdp-${port}`:path.join(os.tmpdir(),`tibo-controller-${port}.sock`);}
export function pipePath(stateDir) {
  const id = createHash('sha256').update(path.resolve(stateDir).toLowerCase()).digest('hex').slice(0,24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\codex-bottom-bar-${id}` : path.join(stateDir, 'reminder.sock');
}
export function controllerPipePath(stateDir) {
  return process.platform === 'win32' ? pipePath(stateDir)+'-controller' : path.join(stateDir,'controller.sock');
}
