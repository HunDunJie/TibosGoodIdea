import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import {promisify} from 'node:util';
const here = path.dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
export async function readSystemVolume() {
  // A short-lived read-only query: no tray, playback, focus change or dependency on a running reminder worker.
  try {
    const {stdout} = await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(here,'audio-host.ps1'),'-ReadVolume'],{windowsHide:true,timeout:10000,maxBuffer:8192,encoding:'utf8'});
    const value = JSON.parse(stdout.trim());
    if (!Number.isFinite(value.percent) || value.percent < 0 || value.percent > 100 || typeof value.muted !== 'boolean') throw new Error();
    return {percent:value.percent,muted:value.muted};
  } catch { throw new Error('暂时无法读取系统音量'); }
}
export class WindowsAudioClient {
  constructor(config, onEvent) { this.config = config; this.onEvent = onEvent; this.child = null; this.nextId = 0; this.pending = new Map(); }
  async start() {
    if (this.child && !this.child.killed) return this.ready;
    const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(here,'audio-host.ps1'),'-Language',this.config.language ?? 'zh-CN'];
    if(this.config.codexPath)args.push('-CodexPath',this.config.codexPath);
    this.child = spawn('powershell.exe',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.ready = new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('托盘播放器启动超时')),12000);
      this.child.once('error',() => { clearTimeout(timeout); reject(new Error('无法启动 Windows 播放器')); });
      this.child.once('exit',() => {
        clearTimeout(timeout); this.child = null; reject(new Error('托盘播放器已退出'));
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('播放器已退出')); } this.pending.clear();
        this.onEvent?.({event:'player-exited'});
      });
      // Never forward PowerShell diagnostics or user paths to renderer logs.
      this.child.stderr.resume();
      createInterface({input:this.child.stdout}).on('line',line => {
        let value; try { value = JSON.parse(line); } catch { return; }
        if (value.event === 'ready') { clearTimeout(timeout); resolve(); }
        else if (value.event) this.onEvent?.(value);
        else if (this.pending.has(value.id)) {
          const p = this.pending.get(value.id); this.pending.delete(value.id); clearTimeout(p.timer);
          value.ok ? p.resolve(value.result) : p.reject(new Error(value.error ?? '音乐播放失败'));
        }
      });
    });
    return this.ready;
  }
  async call(method, payload = {}) {
    await this.start(); const id = ++this.nextId;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('播放器响应超时')); },10000);
      this.pending.set(id,{resolve,reject,timer}); this.child.stdin.write(JSON.stringify({id,method,...payload}) + '\n');
    });
  }
  file(feature) { return feature === 'refresh' ? this.config.refreshAudio : this.config.completionAudio; }
  async check(feature) {
    const file = this.file(feature);
    if (!file || !path.isAbsolute(file) || !/\.wav$/i.test(file)) throw new Error('请在 config.local.json 配置对应 WAV 文件');
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size > 128 * 1024 * 1024) throw new Error('音乐文件不存在或超过 128 MB');
    return this.call('check',{path:file});
  }
  play(feature,{notify = feature === 'refresh'} = {}) { return this.call('play',{path:this.file(feature),kind:feature,notify:feature === 'refresh' && notify}); }
  stop() { return this.child ? this.call('stop') : Promise.resolve(); }
  async close() { if (this.child) { await this.call('exit').catch(() => {}); this.child?.stdin.end(); } }
}
