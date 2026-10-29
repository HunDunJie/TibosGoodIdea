// Scheduling state is independent of the Codex window. No draft contents enter this process.
import {createHash, randomUUID} from 'node:crypto';
export const MAX_PLAYBACK_MS = 30 * 60 * 1000;

export class FeatureEngine {
  constructor({state = {}, now = Date.now, save = async () => {}, audio, onChange = () => {}}) {
    this.now = now; this.save = save; this.audio = audio; this.onChange = onChange;
    this.state = {schema:1, completionEnabled:false, refreshEnabled:false, alarm:null,
      fired:[], completionEvents:[], ringing:null, send:{phase:'off'}, ...state};
    // An interrupted send is never retried: its server acceptance may be unknown.
    if (this.state.send.phase === 'running') this.state.send = {phase:'interrupted', error:'上次发送中断，请检查聊天；不会自动重发'};
    this.quota = null; this.revision = 0;
  }
  account(value) { return typeof value === 'string' && value ? createHash('sha256').update(value).digest('hex').slice(0,24) : null; }
  async commit() { this.revision++; await this.save(this.state); this.onChange(this.status()); }
  status() {
    const s = this.state;
    return {revision:this.revision, refresh:{enabled:s.refreshEnabled, alarm:s.alarm,
      phase:s.ringing?.kind === 'refresh' ? 'ringing' : !s.refreshEnabled ? 'off' : s.alarm ? 'scheduled' : 'waiting', error:s.refreshError ?? null},
      completion:{enabled:s.completionEnabled, phase:s.ringing?.kind === 'completion' ? 'ringing' : s.completionEnabled ? 'listening' : 'off', error:s.completionError ?? null},
      send:{...s.send}, ringing:s.ringing?.kind ?? null,
      ringingUntil:s.ringing && Number.isFinite(s.ringing.startedAt) ? s.ringing.startedAt + MAX_PLAYBACK_MS : null,
      maxPlaybackMs:MAX_PLAYBACK_MS};
  }
  async expirePlayback() {
    const ringing = this.state.ringing;
    if (ringing && (!Number.isFinite(ringing.startedAt) || this.now() >= ringing.startedAt + MAX_PLAYBACK_MS)) await this.stop('timeout');
  }
  async resume() {
    await this.expirePlayback();
    if (this.state.ringing) {
      try { await this.audio.play(this.state.ringing.kind,{notify:false}); }
      catch (e) { this.state[`${this.state.ringing.kind}Error`] = e.message; this.state.ringing = null; }
    }
    await this.tick(); await this.commit();
  }
  async toggle(feature, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('无效开关状态');
    if (feature === 'send') {
      if (this.state.send.phase === 'running') throw new Error('正在发送，请等待本轮结束');
      const reset = this.quota?.resetsAt;
      if (enabled && (!reset || reset <= this.now())) throw new Error('尚未取得下一次五小时重置时间，请稍后再开启');
      this.state.send = enabled ? {phase:'armed', id:randomUUID(), target:reset, account:this.quota.account, remaining:this.quota.remaining, armedAt:this.now()} : {phase:'off'};
    } else if (feature === 'completion' || feature === 'refresh') {
      if (enabled) await this.audio.check(feature); // Fail visibly if no playable file exists.
      this.state[`${feature}Enabled`] = enabled; delete this.state[`${feature}Error`];
      if (feature === 'refresh') {
        if (!enabled) { this.state.alarm = null; this.state.nextAlarm = null; }
        else this.schedule();
      }
      if (!enabled && this.state.ringing?.kind === feature) await this.stop('disabled');
    } else throw new Error('未知功能');
    await this.commit(); return this.status();
  }
  schedule() {
    if (!this.state.refreshEnabled || !this.quota?.resetsAt) return;
    const {account, resetsAt} = this.quota;
    const id = `${account}:${resetsAt}`;
    if (this.state.fired.includes(id)) return;
    // A refresh sample can arrive after the old reset, but before its +1 minute alarm.
    // Keep that imminent alarm, and remember the next one separately.
    const alarm = {id, account, reset:resetsAt, due:resetsAt + 60000};
    if (alarm.due <= this.now() - 5 * 3600000) return;
    if (this.state.alarm?.id === id) return;
    if (this.state.alarm && this.state.alarm.account === account && this.state.alarm.due <= this.now() + 60000) {
      if (resetsAt > this.state.alarm.reset) this.state.nextAlarm = alarm;
      return;
    }
    this.state.alarm = alarm;
  }
  async observe(sample) {
    if (!sample || sample.resetsAt !== null && !Number.isFinite(sample.resetsAt) || !Number.isFinite(sample.remaining)) return this.status();
    const account = this.account(sample.accountId);
    if (!account) return this.status();
    // Process an elapsed alarm before replacing its quota cycle.
    await this.tick();
    const before = JSON.stringify(this.state);
    const oldAccount = this.quota?.account ?? this.state.alarm?.account;
    if (oldAccount && oldAccount !== account) {
      this.state.alarm = null; this.state.nextAlarm = null;
      if (this.state.send.phase === 'armed') this.state.send = {phase:'cancelled', error:'账户已切换，本轮已取消'};
      if (this.state.ringing) await this.stop('account-change');
    }
    this.quota = {account, resetsAt:sample.resetsAt, remaining:sample.remaining,
      updatedAt:Number.isFinite(sample.updatedAt) ? sample.updatedAt : 0};
    const send = this.state.send;
    if (send.phase === 'armed' && send.account !== account) this.state.send = {phase:'cancelled', error:'账户已切换，本轮已取消'};
    this.schedule(); if (before !== JSON.stringify(this.state)) await this.commit(); return this.status();
  }
  async tick() {
    await this.expirePlayback();
    if (this.state.send.phase === 'running' && this.now() - this.state.send.startedAt > 15 * 60000) {
      this.state.send = {phase:'interrupted',error:'本轮发送超时或客户端已退出，请检查聊天；不会自动重发'}; await this.commit();
    }
    const alarm = this.state.alarm;
    if (this.state.refreshEnabled && alarm && this.now() >= alarm.due) {
      this.state.fired = [...this.state.fired, alarm.id].slice(-64);
      this.state.alarm = this.state.nextAlarm ?? null; this.state.nextAlarm = null;
      // Persist the claim BEFORE playing so a reconnect cannot create a second alarm.
      this.state.ringing = {kind:'refresh', id:alarm.id, startedAt:this.now()};
      await this.commit();
      try { await this.audio.play('refresh',{notify:true}); delete this.state.refreshError; }
      catch (e) { this.state.refreshError = e.message; this.state.ringing = null; }
      this.schedule(); await this.commit();
    }
  }
  async claimSend() {
    const s = this.state.send, q = this.quota;
    if (s.phase !== 'armed' || !q || this.now() < s.target || q.account !== s.account) return null;
    if (this.now() > s.target + 5 * 3600000) {
      this.state.send = {phase:'expired', error:'错过本轮刷新，已关闭；没有发送草稿'}; await this.commit(); return null;
    }
    // A fresh native quota response must confirm the next cycle and available quota.
    const freshCycle = q.resetsAt > s.target || q.remaining > s.remaining || q.resetsAt === null && q.remaining === 100;
    if (q.updatedAt < s.target || !freshCycle || q.remaining <= 0) return null;
    this.state.send = {...s, phase:'running', startedAt:this.now()};
    await this.commit(); return {id:s.id};
  }
  async finishSend(id, result) {
    if (this.state.send.id !== id || this.state.send.phase !== 'running') return this.status();
    const counts = Object.fromEntries(['sent','failed','skipped'].map(k => [k, Math.max(0, Math.min(10000, Math.trunc(Number(result?.[k]) || 0)))]));
    this.state.send = {phase:'done', ...counts, completedAt:this.now(), error:result?.error ? String(result.error).slice(0,180) : null};
    await this.commit(); return this.status();
  }
  async completion(event) {
    if (!this.state.completionEnabled || event?.status !== 'completed' || event.hasPendingContinuation || !event.turnId || !event.conversationId) return;
    await this.expirePlayback();
    const id = this.account(`${event.hostId}:${event.conversationId}:${event.turnId}`);
    if (this.state.completionEvents.includes(id)) return;
    this.state.completionEvents = [...this.state.completionEvents,id].slice(-256);
    // A quota alarm has priority. More completions never extend an existing 30-minute session.
    if (!this.state.ringing) {
      this.state.ringing = {kind:'completion', id, startedAt:this.now()};
      await this.commit();
      try { await this.audio.play('completion',{notify:false}); delete this.state.completionError; }
      catch (e) { this.state.completionError = e.message; this.state.ringing = null; }
    }
    await this.commit();
  }
  async stop(reason = 'manual') {
    await this.audio.stop(); this.state.ringing = null; this.state.lastStop = {reason, at:this.now()}; await this.commit();
    return this.status();
  }
  async disableAll() {
    this.state.completionEnabled = false; this.state.refreshEnabled = false;
    this.state.alarm = null; this.state.nextAlarm = null; this.state.send = {phase:'off'};
    return this.stop('shutdown');
  }
}
