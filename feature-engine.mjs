// Scheduling state is independent of the Codex window. No draft contents enter this process.
import {createHash, randomUUID} from 'node:crypto';
export const MAX_PLAYBACK_MS = 30 * 60 * 1000;
const NO_FIVE_HOUR_LIMIT = '当前账户没有五小时额度限制，定时发送和刷新提醒不适用';

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
    return {revision:this.revision, fiveHourLimit:this.quota?.fiveHourLimit ?? s.quotaCheckpoint?.fiveHourLimit ?? 'unknown', refresh:{enabled:s.refreshEnabled, alarm:s.alarm,
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
    if (enabled && ['send','refresh'].includes(feature) && this.status().fiveHourLimit === 'none') throw new Error(NO_FIVE_HOUR_LIMIT);
    if (feature === 'send') {
      if (this.state.send.phase === 'running') throw new Error('正在发送，请等待本轮结束');
      const reset = this.quota?.resetsAt;
      if (enabled && (!reset || reset <= this.now())) throw new Error('尚未取得下一次五小时重置时间，请稍后再开启');
      this.state.send = enabled ? {phase:'armed', id:randomUUID(), target:reset, account:this.quota.account, remaining:this.quota.remaining,
        availableResets:this.quota.availableResets, quotaUpdatedAt:this.quota.updatedAt, armedAt:this.now()} : {phase:'off'};
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
    if (resetsAt <= (this.state.refreshResetAfter ?? 0)) return;
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
    const noFiveHour=sample?.fiveHourLimit === 'none';
    if (!sample || (noFiveHour ? sample.resetsAt !== null || sample.remaining !== null
      : sample.resetsAt !== null && !Number.isFinite(sample.resetsAt) || !Number.isFinite(sample.remaining))) return this.status();
    const account = this.account(sample.accountId);
    if (!account) return this.status();
    const updatedAt=Number.isFinite(sample.updatedAt) ? sample.updatedAt : 0;
    const armed=this.state.send;
    const previousQuota=this.quota ?? this.state.quotaCheckpoint;
    // Multiple windows may report an older cached sample, including after a restart.
    if (previousQuota?.account === account && updatedAt < previousQuota.updatedAt ||
      armed.phase === 'armed' && armed.account === account && updatedAt < (armed.quotaUpdatedAt ?? 0)) return this.status();
    const before = JSON.stringify(this.state);
    const oldAccount = previousQuota?.account ?? this.state.alarm?.account;
    if (oldAccount && oldAccount !== account) {
      this.state.alarm = null; this.state.nextAlarm = null; this.state.refreshResetAfter = null;
      if (this.state.send.phase === 'armed') this.state.send = {phase:'cancelled', error:'账户已切换，本轮已取消'};
      if (this.state.ringing) await this.stop('account-change');
    }
    const availableResets=Number.isInteger(sample.availableResets) && sample.availableResets >= 0 ? sample.availableResets : null;
    if (noFiveHour) {
      // Clear obsolete schedules before tick: an elapsed alarm must not play for
      // an account that no longer has this quota cycle. Completion is independent.
      this.quota={account,fiveHourLimit:'none',resetsAt:null,remaining:null,availableResets,updatedAt};
      this.state.quotaCheckpoint={account,fiveHourLimit:'none',availableResets,updatedAt};
      this.state.refreshEnabled=false; this.state.alarm=null; this.state.nextAlarm=null; this.state.refreshResetAfter=null;
      delete this.state.refreshError;
      if (['armed','running'].includes(this.state.send.phase)) this.state.send={phase:'cancelled',error:NO_FIVE_HOUR_LIMIT};
      if (this.state.ringing?.kind === 'refresh') await this.stop('no-five-hour-limit');
      if (before !== JSON.stringify(this.state)) await this.commit();
      return this.status();
    }
    const previousResets=previousQuota?.availableResets ?? (this.state.quotaCheckpoint?.account === account ? this.state.quotaCheckpoint.availableResets : null);
    const resetCardUsed=previousQuota?.account === account && updatedAt > previousQuota.updatedAt &&
      Number.isInteger(previousResets) && availableResets !== null && availableResets < previousResets;
    const alarm=this.state.alarm;
    const correctedReset=alarm?.account === account && updatedAt > (previousQuota?.updatedAt ?? 0) &&
      updatedAt < alarm.reset && sample.resetsAt !== alarm.reset;
    // A card or pre-reset correction cancels the obsolete alarm BEFORE tick can play it.
    // Natural rollover keeps the old reset's +1 minute reminder.
    if (resetCardUsed || correctedReset) {
      this.state.alarm=null; this.state.nextAlarm=null; this.state.refreshResetAfter=updatedAt;
    }
    // Cancel the old account first; only its own samples may fire its elapsed alarm.
    await this.tick();
    this.quota = {account, fiveHourLimit:'limited', resetsAt:sample.resetsAt, remaining:sample.remaining, availableResets, updatedAt};
    // Persist only quota metadata; a fresh native response is still required to claim a send.
    this.state.quotaCheckpoint={account,fiveHourLimit:'limited',availableResets:availableResets ?? (previousQuota?.account === account ? previousResets : null),updatedAt};
    const send = this.state.send;
    if (send.phase === 'armed' && send.account !== account) this.state.send = {phase:'cancelled', error:'账户已切换，本轮已取消'};
    else if (send.phase === 'armed' && updatedAt > (send.quotaUpdatedAt ?? 0)) {
      const cardUsed=Number.isInteger(send.availableResets) && this.quota.availableResets !== null && this.quota.availableResets < send.availableResets;
      // Before the target, changed reset times belong to a rescheduled cycle.
      // At/after the target, a normal rollover must remain eligible for this round.
      if (cardUsed || sample.resetsAt !== send.target && (send.target === null || updatedAt < send.target)) {
        send.target=sample.resetsAt !== null && sample.resetsAt <= updatedAt ? null : sample.resetsAt;
        send.remaining=sample.remaining;
      }
      send.quotaUpdatedAt=updatedAt;
      if(this.quota.availableResets !== null)send.availableResets=this.quota.availableResets;
    }
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
    if (s.phase !== 'armed' || !Number.isFinite(s.target) || !q || this.now() < s.target || q.account !== s.account) return null;
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
