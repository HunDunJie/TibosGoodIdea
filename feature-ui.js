(function () {
  'use strict';
  const win = window, doc = document;
  let {t,locale,timeZone,zone} = win.__cqbI18n ?? {t:(key,values={})=>key.replace(/\{(\w+)\}/g,(m,k)=>values[k] ?? m),locale:'zh-CN',timeZone:'Asia/Shanghai',zone:'北京时间'};
  win.__cqbFeatures?.dispose?.();
  const nativeAdapter = win.__cqbNativeFeatures;
  const session = win.crypto.randomUUID();
  let active = true, state = null, connected = false, busy = false, syncing = false, operation = 0, nextId = 0, lastInteraction = 0, lastRefetch = 0;
  let controls = null, connectedNative = false, nativeError = '', capabilities = {completion:false,send:false};
  let volumeGeneration = 0, volumeNoticeTimer = null, volumeCheck = {phase:'idle'};
  const localErrors = {};
  const pending = new Map();
  function setTooltip(element,text) { win.__codexBottomBar?.setTooltip(element,text); }
  function call(method,payload = {}) {
    if (win.__cqbPreviewHost) return Promise.resolve(win.__cqbPreviewHost(method,payload));
    if (typeof win.__cqbHost !== 'function') return Promise.reject(new Error('请通过底栏启动器连接后台'));
    const id = ++nextId;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('提醒后台响应超时')); },15000);
      pending.set(id,{resolve,reject,timer}); win.__cqbHost(JSON.stringify({id,session,method,payload}));
    });
  }
  win.__cqbBridgeReply = reply => {
    if (reply.session !== session) return;
    const item = pending.get(reply.id); if (!item) return;
    pending.delete(reply.id); clearTimeout(item.timer); reply.ok ? item.resolve(reply.result) : item.reject(new Error(reply.error));
  };
  const nameKeys = {send:'定时发送',completion:'完成提醒',refresh:'刷新提醒'};
  let reportedLocale = null, reportingLocale = false;
  async function reportLanguage() {
    if (reportedLocale === locale || reportingLocale || !active) return;
    reportingLocale = true; const selected = locale;
    try { await call('ui-language',{language:selected}); reportedLocale = selected; } catch {}
    finally { reportingLocale = false; if(active && selected !== locale)void reportLanguage(); }
  }
  function languageChanged() {
    ({t,locale,timeZone,zone} = win.__cqbI18n);
    render();
    const note = doc.getElementById('cqb-volume-notice');
    if(note && volumeNoticeKey)note.textContent=t(volumeNoticeKey);
    void reportLanguage();
  }
  const iconShapes = {
    send:[['path',{d:'M10 18.5 7.8 13.4 2.5 11.2 20 3l-3.1 7.2M7.8 13.4 20 3'}],['circle',{cx:17,cy:17,r:4.5}],['path',{d:'M17 14.5v2.7l1.8 1.1'}]],
    completion:[['path',{d:'M18 10V9A6 6 0 0 0 6 9c0 6-3 7-3 9h8m-1 3h3m1-4 2.5 2.5L22 14'}]],
    refresh:[['path',{d:'M13 6.8A5 5 0 0 0 5 11c0 5-2 5.5-2 7h14c0-1.5-2-2-2-7M8 21h4M14 5a4 4 0 1 1 4 4M14 2v3h3'}]]
  };
  function createIcon(feature) {
    const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns,'svg');
    for (const [name,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'})) svg.setAttribute(name,value);
    for (const [tag,attributes] of iconShapes[feature]) {
      const shape = doc.createElementNS(ns,tag); for (const [name,value] of Object.entries(attributes)) shape.setAttribute(name,String(value)); svg.append(shape);
    }
    return svg;
  }
  function description(feature) {
    if (feature !== 'completion' && win.__codexBottomBar?.status?.().fiveHourLimit === 'none')
      return {text:t('不适用'),enabled:false,inapplicable:true};
    if (!connected) return {text:t('未连接'),enabled:false,error:t('点击按钮重新启动提醒服务')};
    const item = state?.[feature] ?? {};
    let text;
    if (feature === 'send') text = ({off:t('已关闭'),armed:t('等待刷新'),running:t('发送中'),done:t('完成 {sent} / 跳过 {skipped}',{sent:item.sent ?? 0,skipped:(item.failed ?? 0)+(item.skipped ?? 0)}),interrupted:t('发送中断'),cancelled:t('已取消'),expired:t('已过期')})[item.phase] ?? t('已关闭');
    else if (feature === 'completion') text = item.phase === 'ringing' ? t('播放中') : item.enabled ? capabilities.completion ? t('监听中') : t('等待连接') : t('已关闭');
    else text = item.phase === 'ringing' ? t('响铃中') : !item.enabled ? t('已关闭') : item.alarm ? t('已安排') : t('等刷新时间');
    if (item.error) text = feature === 'send' ? text : t('需处理');
    if (feature === 'send' && localErrors.send) text = t('未开启');
    const error=localErrors[feature] ?? item.error ?? (feature!=='refresh' && connectedNative && !capabilities[feature] ? capabilities.reasons?.[feature] : null);
    return {text,enabled:feature === 'send' ? ['armed','running'].includes(item.phase) : !!item.enabled,error:error ? t(error) : null};
  }
  function render() {
    if (!controls) return;
    controls.setAttribute('aria-label',t('聊天与额度提醒'));
    for (const feature of Object.keys(nameKeys)) {
      const group = controls.querySelector(`[data-cqb-feature="${feature}"]`), item = description(feature);
      const button = group.querySelector('.cqb-feature-button');
      button.setAttribute('aria-label',t(nameKeys[feature]));
      button.setAttribute('aria-pressed',String(item.enabled));
      const hasHost=typeof win.__cqbHost === 'function' || typeof win.__cqbPreviewHost === 'function';
      button.disabled = !hasHost || item.inapplicable || connected && feature === 'send' && state?.send?.phase === 'running';
      button.setAttribute('aria-busy',String(busy));
      const formatTime = value => Number.isFinite(value) ? new Intl.DateTimeFormat(locale,{timeZone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value) : null;
      let detail;
      if (feature === 'send') {
        const time = formatTime(state?.send?.target);
        detail = item.enabled ? time ? t('将于{time}发送所有聊天中的草稿，全部发送后将关闭定时发送',{time}) : t('暂未取得刷新时间')
          : t('可开启，用于在额度刷新时自动发送所有聊天中的草稿，所有草稿发送后将关闭定时发送');
      }
      else if (feature === 'completion') detail = t(item.enabled
        ? '任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟'
        : '可开启，用于在任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟');
      else {
        const time = formatTime(state?.refresh?.alarm?.due);
        detail = item.enabled ? time ? t('将于{time}播放音乐提醒',{time}) : t('暂未取得刷新时间')
          : t('可开启，用于额度刷新时播放音乐进行提醒，播放时长最多30分钟，退出Codex仍然有效');
      }
      if (item.inapplicable) detail=t('当前账户没有五小时额度限制，定时发送和刷新提醒不适用');
      const phase = state?.[feature]?.phase;
      const special = !connected || item.error || ['running','done','interrupted','cancelled','expired','ringing'].includes(phase) || item.enabled && (feature === 'completion' && !capabilities.completion || feature === 'refresh' && !state?.refresh?.alarm);
      const status = special ? ` · ${item.text}${item.error ? `：${item.error}` : ''}` : '';
      const stateLine = item.inapplicable ? t('不适用') : connected ? t(item.enabled ? '已开启' : '已关闭') : t('未连接');
      const tooltip = `${t(nameKeys[feature])}\n${stateLine}${item.inapplicable ? '' : status}\n${detail}`.replace(/。|\.(?=\s|$)/g,'');
      setTooltip(group,tooltip); setTooltip(button,tooltip);
      button.setAttribute('aria-description',tooltip.split('\n').slice(1).join('\n'));
      group.dataset.enabled = String(item.enabled);
    }
  }
  function announce(error,feature) {
    localErrors[feature] = error.message;
    render();
  }
  let volumeNoticeKey = null;
  function clearVolumeNotice() {
    volumeNoticeKey = null;
    clearTimeout(volumeNoticeTimer); volumeNoticeTimer = null; doc.getElementById('cqb-volume-notice')?.remove();
  }
  async function checkRefreshVolume(generation) {
    volumeCheck = {phase:'checking'};
    try {
      const value = await call('volume-status');
      if (!active || generation !== volumeGeneration || !state?.refresh?.enabled) return;
      if (!Number.isFinite(value?.percent) || value.percent < 0 || value.percent > 100 || typeof value.muted !== 'boolean') throw new Error();
      volumeCheck = {phase:'checked',...value};
      const message = value.muted ? '当前系统已静音，可能听不到刷新提醒'
        : value.percent < 1 ? '当前音量低于 1%，可能听不到刷新提醒' : null;
      if (!message) return;
      clearVolumeNotice();
      const note = doc.createElement('div'); note.id = 'cqb-volume-notice'; note.setAttribute('role','status'); note.setAttribute('aria-live','polite');
      volumeNoticeKey = message; note.textContent = t(message); doc.body.append(note); volumeNoticeTimer = setTimeout(clearVolumeNotice,6000);
    } catch {
      // An unavailable endpoint/query must not turn off an already-enabled reminder or invent a 0% volume.
      if (active && generation === volumeGeneration) volumeCheck = {phase:'unavailable'};
    }
  }
  async function toggle(feature) {
    if (!active || busy) return; busy = true; operation++; render();
    try {
      const current=await call('wake-worker');
      if (!active) return;
      state=current; connected=true; reportedLocale=null; void reportLanguage();
      const sample=win.__codexBottomBar?.quotaSample?.();
      if (sample) state=await call('observe',sample);
      if (!active) return;
      if (description(feature).inapplicable) return;
      const enabled = !description(feature).enabled;
      if (enabled && feature !== 'refresh' && !connectedNative) {
        try {await connectNative();} catch(e) {nativeError=e.message;}
      }
      if (!active) return;
      if (enabled && feature !== 'refresh' && !capabilities[feature]) throw new Error(capabilities.reasons?.[feature] || nativeError || '尚未连接到当前客户端的任务与草稿接口，请稍后重试');
      state = await call('toggle',{feature,enabled}); connected = true;
      delete localErrors[feature];
      if (feature === 'refresh') {
        clearVolumeNotice(); volumeGeneration++; volumeCheck = {phase:'idle'};
        if (enabled) void checkRefreshVolume(volumeGeneration);
      }
    } catch (e) { announce(e,feature); }
    finally { busy = false; render(); }
  }
  async function connectNative() {
    if (!connectedNative && nativeAdapter) {
      capabilities=await nativeAdapter.connect(event=>{if(active)void call('completion',event).catch(()=>{});});
      connectedNative=true;nativeError='';
    }
  }
  function attach() {
    const metrics = doc.getElementById('codex-bottom-bar-metrics');
    if (!metrics || controls?.isConnected && controls.parentElement === metrics) return;
    controls?.remove(); controls = doc.createElement('div'); controls.id = 'codex-bottom-bar-features';
    controls.setAttribute('aria-label',t('聊天与额度提醒'));
    for (const feature of ['send','completion','refresh']) {
      const group = doc.createElement('div'); group.className = 'cqb-feature'; group.dataset.cqbFeature = feature;
      const button = doc.createElement('button'); button.className = 'cqb-feature-button'; button.type = 'button'; button.setAttribute('aria-label',t(nameKeys[feature])); button.append(createIcon(feature));
      button.addEventListener('click',() => void toggle(feature)); group.append(button); controls.append(group);
    }
    metrics.prepend(controls); render();
  }
  async function sync() {
    if (!active || syncing || busy) return; syncing = true;
    const generation=operation;
    try {
      try {await connectNative();} catch(e) {nativeError=e.message;}
      if (!active || generation!==operation) return;
      const sample = win.__codexBottomBar?.quotaSample?.();
      const current=sample ? await call('observe',sample) : await call('status');
      if (!active || generation!==operation) return;
      state=current; connected=true;
      const target = state?.send?.phase === 'armed' ? state.send.target : state?.refresh?.alarm?.reset;
      const waitingSendTime=state?.send?.phase === 'armed' && !Number.isFinite(target);
      if ((Number.isFinite(target) && Date.now() >= target || waitingSendTime || state?.refresh?.enabled && !state.refresh.alarm) && Date.now()-lastRefetch > 10000) {
        lastRefetch = Date.now(); await win.__codexBottomBar?.refreshQuota?.().catch(() => {});
      }
      if (capabilities.send && state?.send?.phase === 'armed' && Number.isFinite(state.send.target) && Date.now() >= state.send.target) {
        const claim = await call('claim-send');
        if (claim) {
          state = await call('status'); render();
          void (async () => {
            try {
              const result = await nativeAdapter.sendRound({isCurrent:() => active && state?.send?.phase === 'running' && state.send.id === claim.id});
              state = await call('finish-send',{id:claim.id,result});
            } catch (e) { if (active) state = await call('finish-send',{id:claim.id,result:{failed:1,error:e.message}}); }
            render();
          })().catch(() => {});
        }
      }
      attach(); render(); void reportLanguage();
    } catch { if(active && generation===operation){connected=false;reportedLocale=null;render();} }
    finally { syncing = false; }
  }
  function interaction(event) {
    if (!state?.ringing || !event.isTrusted || Date.now()-lastInteraction < 50) return;
    lastInteraction = Date.now(); void call('interaction').then(value => { state = value; render(); }).catch(() => {});
  }
  const events = ['pointermove','pointerdown','keydown','wheel','input'];
  for (const name of events) doc.addEventListener(name,interaction,{capture:true,passive:true});
  const observer = new MutationObserver(attach); observer.observe(doc.documentElement,{childList:true,subtree:true});
  const timer = setInterval(() => void sync(),2000);
  win.__cqbFeatures = {status:() => ({connected,capabilities,state,volume:volumeCheck}),dispose() {
    active = false; win.removeEventListener('cqb-languagechange',languageChanged); volumeGeneration++; clearVolumeNotice(); clearInterval(timer); observer.disconnect(); controls?.remove(); doc.getElementById('cqb-feature-message')?.remove();
    nativeAdapter?.dispose?.(); for (const name of events) doc.removeEventListener(name,interaction,true);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(t('底栏已恢复'))); } pending.clear(); delete win.__cqbBridgeReply;
  }};
  win.addEventListener('cqb-languagechange',languageChanged);
  attach(); void sync();
})();
