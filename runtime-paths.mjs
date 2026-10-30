import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
export function defaultStateDir() { return path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'CodexBottomBar'); }
export function pipePath(stateDir) {
  const id = createHash('sha256').update(path.resolve(stateDir).toLowerCase()).digest('hex').slice(0,24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\codex-bottom-bar-${id}` : path.join(stateDir, 'reminder.sock');
}
export function controllerPipePath(stateDir) {
  return process.platform === 'win32' ? pipePath(stateDir)+'-controller' : path.join(stateDir,'controller.sock');
}
