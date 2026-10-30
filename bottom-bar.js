/* Codex bottom navigation. No automatic reset-credit operations. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.install(window);
})(function () {
  'use strict';
  const VERSION = '0.8.0-rc.4';
  const localeAPI = typeof module === 'object' && module.exports ? require('./i18n.js') : null;
  const TIME_MODES_KEY = 'codex-bottom-bar.time-modes.v1';
  const NUMBER = value => typeof value === 'number' && Number.isFinite(value);
  const object = value => value !== null && typeof value === 'object';
  function creditBalance(value) {
    if (typeof value === 'string') {
      const text = value.trim(); if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
      value = Number(text);
    }
    return NUMBER(value) && value >= 0 ? value : null;
  }
  function creditText(value,unlimited = false,locale = 'zh-CN') {
    return value == null ? unlimited ? locale === 'en' ? 'Unlimited' : locale === 'ja' ? '無制限' : '不限' : '--' : new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2,useGrouping:false}).format(value);
  }
  function timestamp(value) {
    if (value == null || value === '') return null;
    let milliseconds;
    if (NUMBER(value)) milliseconds = value < 1e12 ? value * 1000 : value;
    else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return timestamp(Number(value));
    else if (typeof value === 'string') milliseconds = Date.parse(value);
    else return null;
    return NUMBER(milliseconds) && milliseconds >= Date.UTC(2020, 0, 1) && milliseconds < Date.UTC(2100, 0, 1)
      ? milliseconds : null;
  }
  function normalize(raw) {
    if (!object(raw)) return null;
    const limit = raw.rate_limit ?? raw.rateLimit ?? raw;
    const windows = [limit.primary_window, limit.secondary_window, limit.primary, limit.secondary].filter(object);
    const read = minutes => {
      const window = windows.find(item => {
        const duration = item.limit_window_seconds != null ? item.limit_window_seconds / 60 : item.windowDurationMins;
        return NUMBER(duration) && Math.abs(duration - minutes) <= 1;
      });
      if (!window) return null;
      const used = window.used_percent ?? window.usedPercent;
      return {
        remaining: NUMBER(used) ? Math.max(0, Math.min(100, 100 - used)) : null,
        resetsAt: timestamp(window.reset_at ?? window.resetsAt),
      };
    };
    const count = raw.rate_limit_reset_credits?.available_count ?? raw.rateLimitResetCredits?.availableCount;
    const result = {
      fiveHour: read(300), weekly: read(10080),
      resets: NUMBER(count) && Number.isInteger(count) && count >= 0 ? count : null,
      creditBalance:creditBalance(raw.credits?.balance), creditsUnlimited:raw.credits?.unlimited === true,
    };
    return result.fiveHour || result.weekly || result.resets !== null || result.creditBalance !== null || result.creditsUnlimited ? result : null;
  }
  function resetDate(value,locale = 'zh-CN',timeZone = 'Asia/Shanghai') {
    if (value == null) return locale === 'en' ? 'Time unavailable' : locale === 'ja' ? '時刻を取得できません' : '时间暂不可用';
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone, month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value ?? '--';
    return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  }
  function countdown(value,kind,now = Date.now(),locale = 'zh-CN') {
    if (!NUMBER(value)) return locale === 'en' ? 'Time unavailable' : locale === 'ja' ? '時刻を取得できません' : '时间暂不可用';
    if (value <= now) return locale === 'en' ? 'Awaiting reset' : locale === 'ja' ? '更新待ち' : '等待刷新';
    const minutes = Math.ceil((value-now)/60000), rest = minutes%60;
    const hours = Math.floor(minutes/60);
    if (locale === 'en') return kind === 'weekly' ? `${Math.floor(hours/24)}d ${hours%24}h ${rest}m` : `${hours}h ${rest}m`;
    if (locale === 'ja') return kind === 'weekly' ? `${Math.floor(hours/24)}日${hours%24}時間${rest}分` : `${hours}時間${rest}分`;
    return kind === 'weekly' ? `${Math.floor(hours/24)}天${hours%24}小时${rest}分` : `${hours}小时${rest}分`;
  }
  function remaining(value) {
    if (value == null) return '--';
    return `${Number(value.toFixed(1))}%`;
  }
  function install(win) {
    const doc = win.document;
    const language = win.__cqbI18n ?? localeAPI?.create(win.__cqbPreferences ?? {},win.navigator?.language) ?? {locale:'zh-CN',timeZone:'Asia/Shanghai',zone:'北京时间',t:(key,values={})=>key.replace(/\{(\w+)\}/g,(m,k)=>values[k] ?? m)};
    let {t,locale,timeZone,zone} = language;
    if (win.__codexBottomBar?.version === VERSION) return;
    win.__codexBottomBar?.dispose?.();
    const originalAttribute = doc.documentElement.getAttribute('data-cqb');
    let rail = null, frame = null, backdrop = null, metrics = null, active = true;
    let lastSnapshot = null, reading = false, scanToken = 0, queued = false, usageClient = null, openingUsage = false;
    let nativeInterface = null, lastUsagePath = null, transitionStyle = null;
    let mutationObserver, resizeObserver, scanTimer, refreshTimer, minuteTimer;
    let tooltip = null, tooltipTarget = null, pendingTooltip = null, tooltipTimer = null, focusedTooltip = null, hoveredTooltip = null;
    function hideTooltip() {
      win.clearTimeout(tooltipTimer); tooltipTimer = null; pendingTooltip = null;
      if (tooltipTarget) {
        const ids = (tooltipTarget.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== 'codex-bottom-bar-tooltip');
        if (ids.length) tooltipTarget.setAttribute('aria-describedby',ids.join(' ')); else tooltipTarget.removeAttribute('aria-describedby');
      }
      tooltip?.remove(); tooltip = null; tooltipTarget = null;
    }
    function positionTooltip() {
      if (!tooltip || !tooltipTarget?.isConnected) { hideTooltip(); return; }
      tooltip.style.left = '0px'; tooltip.style.top = '0px';
      const anchor = tooltipTarget.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
      const ratio = box.width / (tooltip.offsetWidth || box.width) || 1;
      const scale = Math.abs(ratio-1) < .01 ? 1 : ratio;
      const left = Math.max(8,Math.min(anchor.left + (anchor.width-box.width)/2,win.innerWidth-box.width-8));
      const top = Math.max(8,Math.min(anchor.top,metrics.getBoundingClientRect().top)-box.height-8);
      tooltip.style.left = `${(left-box.left)/scale}px`; tooltip.style.top = `${(top-box.top)/scale}px`;
    }
    function setTooltip(element,text) {
      text = String(text ?? '').replace(/。|\.(?=\s|$)/g,'');
      element.dataset.cqbTooltip = text ?? ''; element.removeAttribute('title');
      if (tooltipTarget === element && tooltip) {
        if (!text) hideTooltip();
        else if (tooltip.textContent !== text) { tooltip.textContent = text; positionTooltip(); }
      }
    }
    function tooltipFor(node) {
      const target = node?.closest?.('[data-cqb-tooltip]');
      return target && metrics?.contains(target) && target.dataset.cqbTooltip ? target : null;
    }
    function requestTooltip(target,delay = 450) {
      if (target && (target === tooltipTarget || target === pendingTooltip)) return;
      hideTooltip(); if (!target) return;
      pendingTooltip = target;
      tooltipTimer = win.setTimeout(() => {
        pendingTooltip = null;
        if (!active || !target.isConnected || !target.dataset.cqbTooltip) return;
        tooltipTarget = target; tooltip = doc.createElement('div'); tooltip.id = 'codex-bottom-bar-tooltip'; tooltip.setAttribute('role','tooltip');
        tooltip.textContent = target.dataset.cqbTooltip; doc.body.append(tooltip);
        const ids = new Set((target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)); ids.add(tooltip.id);
        target.setAttribute('aria-describedby',[...ids].join(' ')); positionTooltip();
      },delay);
    }
    function tooltipOver(event) { hoveredTooltip = tooltipFor(event.target); requestTooltip(hoveredTooltip); }
    function tooltipOut(event) { hoveredTooltip = tooltipFor(event.relatedTarget); requestTooltip(hoveredTooltip ?? focusedTooltip); }
    function tooltipFocus(event) { focusedTooltip = event.target.matches?.(':focus-visible') ? tooltipFor(event.target) : null; if (focusedTooltip) requestTooltip(focusedTooltip,0); }
    function tooltipFocusOut(event) {
      focusedTooltip = event.relatedTarget?.matches?.(':focus-visible') ? tooltipFor(event.relatedTarget) : null;
      requestTooltip(hoveredTooltip ?? focusedTooltip,0);
    }
    function tooltipBlur() { hoveredTooltip = null; focusedTooltip = null; hideTooltip(); }
    function tooltipPointerDown(event) {
      const target = tooltipFor(event.target);
      if (target?.matches('.cqb-feature-button,.cqb-feature,.cqb-time')) { requestTooltip(target,0); return; }
      hideTooltip();
    }
    function tooltipKey(event) { if (event.key === 'Escape') hideTooltip(); }
    function tooltipVisibility() { if (doc.hidden) hideTooltip(); }
    function tooltipScroll(event) { if (event.target === doc || event.target === metrics || metrics?.contains(event.target)) hideTooltip(); }
    function loadTimeModes() {
      let saved; try { saved = JSON.parse(win.localStorage.getItem(TIME_MODES_KEY)); } catch {}
      return {fiveHour:saved?.fiveHour === 'countdown' ? 'countdown' : 'date',weekly:saved?.weekly === 'countdown' ? 'countdown' : 'date'};
    }
    let timeModes = loadTimeModes();
    function switchTimeMode(key) {
      timeModes[key] = timeModes[key] === 'countdown' ? 'date' : 'countdown';
      try { win.localStorage.setItem(TIME_MODES_KEY,JSON.stringify(timeModes)); } catch {}
      render(lastSnapshot);
    }
    function scheduleMinute() {
      win.clearTimeout(minuteTimer);
      if (active) minuteTimer = win.setTimeout(() => { render(lastSnapshot); scheduleMinute(); },60000-win.Date.now()%60000);
    }
    function refreshTimeDisplay() { if (active) { render(lastSnapshot); scheduleMinute(); } }
    function storageChanged(event) {
      if (event.key === TIME_MODES_KEY || event.key === null) { timeModes = loadTimeModes(); refreshTimeDisplay(); }
    }
    const ownedStyles = new Map();
    let railAncestors = [];
    const restoreStyle = (element, name) => {
      const original = ownedStyles.get(element)?.get(name);
      if (!original) return;
      original.value ? element.style.setProperty(name, original.value, original.priority) : element.style.removeProperty(name);
    };
    const setStyle = (element, name, value) => {
      if (!ownedStyles.has(element)) ownedStyles.set(element, new Map());
      const styles = ownedStyles.get(element);
      if (!styles.has(name)) styles.set(name, {value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name)});
      if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value, 'important');
    };
    function releaseRailClipping() {
      for (const [element, names] of railAncestors) for (const name of names) restoreStyle(element, name);
      railAncestors = [];
      // Native sidebar containment creates a local fixed-position viewport and clips the rail.
      // Keep React's original DOM and handlers, but let this rail reach the reserved bottom row.
      for (let element = rail.parentElement; element && element !== frame; element = element.parentElement) {
        const style = win.getComputedStyle(element), names = [];
        if (style.contain !== 'none') { setStyle(element, 'contain', 'none'); names.push('contain'); }
        if (['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY)) {
          setStyle(element, 'overflow', 'visible'); names.push('overflow');
        }
        if (names.length) railAncestors.push([element, names]);
      }
    }
    function render(snapshot) {
      lastSnapshot = snapshot;
      if (!metrics) return;
      metrics.setAttribute('aria-label',t('Codex 剩余额度与可用重置'));
      for (const [key,label] of [['credits',t('额度 ')],['fiveHour',t('5小时')],['weekly',t('每周')],['resets',t('可用重置')]]) metrics.querySelector(`[data-cqb-slot="${key}"] .cqb-label`).textContent = label;
      setTooltip(metrics.querySelector('[data-cqb-slot="resets"]'),t('点击打开使用量页面'));
      for (const [key, label] of [['fiveHour', t('5小时')], ['weekly', t('每周')]]) {
        const item = snapshot?.[key];
        const slot = metrics.querySelector(`[data-cqb-slot="${key}"]`);
        slot.querySelector('.cqb-value').textContent = remaining(item?.remaining);
        const time = slot.querySelector('.cqb-time'), relative = timeModes[key] === 'countdown';
        const text = relative ? countdown(item?.resetsAt,key,win.Date.now(),locale) : resetDate(item?.resetsAt,locale,timeZone);
        time.textContent = text; time.setAttribute('aria-pressed',String(relative));
        setTooltip(time,relative ? t('点击切换为日期时间（{zone}）',{zone}) : t('点击切换为剩余时间'));
        time.setAttribute('aria-label',t('{label}刷新时间，{time}，{zone}，{action}',{label,time:text,zone,action:t(relative ? '点击显示日期时间' : '点击显示剩余时间')}));
        slot.setAttribute('aria-label', t('{label}额度，剩余 {value}，{time}，{zone}',{label,value:remaining(item?.remaining),time:text,zone}));
      }
      const credits = metrics.querySelector('[data-cqb-slot="credits"]');
      credits.querySelector('.cqb-value').textContent = creditText(snapshot?.creditBalance,snapshot?.creditsUnlimited,locale);
      setTooltip(credits,t('购买额度的剩余点数：{value}',{value:snapshot?.creditBalance ?? t(snapshot?.creditsUnlimited ? '不限' : '暂不可用')}));
      metrics.querySelector('[data-cqb-slot="resets"] .cqb-value').textContent = snapshot?.resets == null ? t('-- 次') : t('{count} 次',{count:snapshot.resets});
      metrics.querySelector('[data-cqb-slot="resets"]').setAttribute('aria-label', t('可用重置 {count}，打开额度页面',{count:snapshot?.resets == null ? t('次数未知') : t('{count} 次',{count:snapshot.resets})}));
      metrics.dataset.state = snapshot ? 'available' : 'unavailable';
      scheduleLayout();
    }
    function languageChanged() {
      ({t,locale,timeZone,zone} = win.__cqbI18n);
      render(lastSnapshot);
    }
    function createMetrics() {
      const node = doc.createElement('section');
      node.id = 'codex-bottom-bar-metrics';
      node.setAttribute('aria-label', t('Codex 剩余额度与可用重置'));
      node.addEventListener('wheel', event => {
        if (node.scrollWidth <= node.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        const before = node.scrollLeft;
        node.scrollLeft += event.deltaY;
        if (node.scrollLeft !== before) event.preventDefault();
      }, {passive: false});
      for (const [key, label] of [['credits',t('额度 ')], ['fiveHour', t('5小时')], ['weekly', t('每周')], ['resets', t('可用重置')]]) {
        const slot = doc.createElement(key === 'resets' ? 'button' : 'div');
        slot.className = 'cqb-slot'; slot.dataset.cqbSlot = key;
        if (key === 'resets') {
          slot.type = 'button'; slot.classList.add('cqb-action'); setTooltip(slot,t('点击打开使用量页面'));
          slot.addEventListener('click', () => { void openNativeUsage(slot); });
        }
        const heading = doc.createElement('span'); heading.className = 'cqb-heading';
        const caption = doc.createElement('span'); caption.className = 'cqb-label'; caption.textContent = label;
        const value = doc.createElement('strong'); value.className = 'cqb-value'; value.textContent = key === 'resets' ? t('-- 次') : '--';
        heading.append(caption, value); slot.append(heading);
        if (key === 'fiveHour' || key === 'weekly') {
          const date = doc.createElement('button'); date.type = 'button'; date.className = 'cqb-time'; date.textContent = t('时间暂不可用');
          date.addEventListener('click',() => switchTimeMode(key)); slot.append(date);
        }
        node.append(slot);
      }
      return node;
    }
    function profileTrigger() {
      return rail?.querySelector('button:is([aria-label*="个人资料"],[aria-label*="profile" i],[aria-label="账户"],[aria-label*="account" i],[aria-label*="プロフィール"],[aria-label*="アカウント"])');
    }
    function nativeProfileMenu(trigger) {
      const menuId = trigger.getAttribute('aria-controls');
      const menu = menuId ? doc.getElementById(menuId) : trigger.id ? doc.querySelector(`[role="menu"][aria-labelledby="${win.CSS.escape(trigger.id)}"]`) : null;
      return menu?.getClientRects().length ? menu : null;
    }
    function nativeUsageAction(trigger) {
      const menu = nativeProfileMenu(trigger);
      if (!menu) return null;
      const pending = [rootFiber()], visited = new WeakSet(); let checked = 0;
      while (pending.length && checked++ < 16000) {
        const fiber = pending.pop();
        if (!object(fiber) || visited.has(fiber)) continue;
        visited.add(fiber);
        const props = fiber.memoizedProps;
        if (typeof props?.onRateLimitResetClick === 'function') {
          for (let owner = fiber.return, depth = 0; owner && depth++ < 70; owner = owner.return) {
            const parent = owner.memoizedProps;
            if (parent?.open === true && parent.sidebarFooter && typeof parent.onClose === 'function') return props.onRateLimitResetClick;
          }
        }
        if (fiber.sibling) pending.push(fiber.sibling);
        if (fiber.child) pending.push(fiber.child);
      }
      // Fallback for clients without exposed component props: activate the native menu entry.
      const entry = [...menu.querySelectorAll('button,[role="menuitem"],a')].find(node => /可用重置|available resets|利用可能なリセット/i.test(node.textContent ?? ''));
      return entry ? () => entry.click() : null;
    }
    async function openUsageDirectly() {
      const bindings = win.__codexBottomBarBindings;
      if (!bindings) return false;
      if (!nativeInterface) nativeInterface = (async () => {
        const entry = [...doc.scripts].find(node => node.src && /index-[^/]+\.js(?:\?|$)/.test(node.src));
        if (!entry) return null;
        const base = new win.URL('.', entry.src);
        // Importing the existing native module initializes its API without mounting a menu.
        await import(new win.URL(bindings.profileModule, base).href);
        const load = async binding => (await import(new win.URL(binding.module, base).href))[binding.export];
        const [scope, openModal, usageModal, turn, recordReset, decodeConversation] = await Promise.all([
          load(bindings.scope), load(bindings.openModal), load(bindings.usageModal),
          load(bindings.turn), load(bindings.recordReset), load(bindings.decodeConversation),
        ]);
        return typeof openModal === 'function' && typeof usageModal === 'function' && typeof recordReset === 'function'
          && typeof decodeConversation === 'function' ? {scope, openModal, usageModal, turn, recordReset, decodeConversation} : null;
      })().catch(() => null);
      const api = await nativeInterface;
      if (!api || !active) return false;
      const trigger = profileTrigger();
      const key = trigger && Object.keys(trigger).find(name => name.startsWith('__reactFiber$'));
      let fiber = key ? trigger[key] : null, store = null;
      for (let depth = 0; fiber && depth < 70 && !store; depth++, fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let count = 0; hook && count < 180; count++, hook = hook.next) {
          const value = hook.memoizedState?.current;
          if (value?.scope === api.scope && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.watch === 'function') { store = value; break; }
        }
      }
      if (!store) return false;
      const raw = store.queryClient.getQueryData(['rate-limit-status']);
      const accountId = raw?.account_id ?? null;
      const match = win.location.pathname.match(/\/(?:local|remote|hotkey-window\/thread)\/([^/]+)\/?$/);
      const conversationId = match ? api.decodeConversation(decodeURIComponent(match[1])) : null;
      api.openModal(store, api.usageModal, {
        defaultResetCreditsOpen:true, initialAvailableCount:raw?.rate_limit_reset_credits?.available_count ?? lastSnapshot?.resets ?? 0,
        isRateLimitReached:false,
        onResetComplete:() => {
          const turnId = conversationId == null ? null : store.get(api.turn, conversationId);
          if (conversationId != null && accountId != null && turnId != null) api.recordReset(store, {accountId, conversationId, turnId});
        },
      });
      lastUsagePath = 'direct';
      return true;
    }
    function protectMenuTransition(trigger) {
      transitionStyle?.remove();
      if (!trigger.id) return;
      const id = win.CSS.escape(trigger.id);
      transitionStyle = doc.createElement('style');
      transitionStyle.id = 'codex-bottom-bar-transition-style';
      transitionStyle.textContent = `[role="menu"][aria-labelledby="${id}"],[data-radix-popper-content-wrapper]:has([role="menu"][aria-labelledby="${id}"]){visibility:hidden!important;opacity:0!important;pointer-events:none!important;animation:none!important;transition:none!important}`;
      (doc.head || doc.documentElement).append(transitionStyle);
    }
    async function openNativeUsage(button) {
      if (openingUsage || !active) return;
      openingUsage = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
      try {
        if (await openUsageDirectly()) return;
        if (!active) return;
        const trigger = profileTrigger();
        if (!trigger) throw new Error('Profile entry unavailable');
        protectMenuTransition(trigger);
        let action = nativeUsageAction(trigger);
        if (!action) {
          trigger.click();
          let usedKeyboard = false, expandedSummary = false;
          for (let attempt = 0; active && attempt < 40 && !action; attempt++) {
            await new Promise(resolve => win.setTimeout(resolve, 100));
            let menu = nativeProfileMenu(trigger);
            // Radix profile triggers use keyboard/pointer-down events rather than click alone.
            if (!menu && !usedKeyboard && trigger.getAttribute('aria-expanded') !== 'true') {
              usedKeyboard = true; trigger.focus({preventScroll:true});
              trigger.dispatchEvent(new win.KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true, cancelable:true}));
              menu = nativeProfileMenu(trigger);
            }
            action = nativeUsageAction(trigger);
            if (!action && menu && !expandedSummary) {
              const summary = [...menu.querySelectorAll('button,[role="menuitem"]')].find(node => /^(剩余用量|Remaining usage|Usage|使用状況)$/i.test(node.textContent?.trim() ?? ''));
              if (summary) { expandedSummary = true; summary.click(); }
            }
          }
        }
        if (!active) return;
        if (!action) throw new Error('Usage action unavailable');
        action();
        lastUsagePath = 'protected-menu';
        setTooltip(button,t('点击打开使用量页面'));
      } catch {
        setTooltip(button,t('暂未找到额度入口，请从头像菜单打开可用重置'));
      } finally {
        transitionStyle?.remove(); transitionStyle = null;
        openingUsage = false; button.disabled = false; button.removeAttribute('aria-busy');
      }
    }
    function layout() {
      queued = false;
      if (!active || !rail?.isConnected || !frame?.isConnected || !metrics?.isConnected) return;
      const buttons = [...rail.querySelectorAll('button,a,[role="button"]')].filter(node => node.getClientRects().length && node.getBoundingClientRect().width > 0);
      const rect = frame.getBoundingClientRect();
      const zoom = rect.width / (frame.offsetWidth || rect.width) || 1;
      const right = Math.max(rail.getBoundingClientRect().left, ...buttons.map(node => node.getBoundingClientRect().right));
      if (doc.documentElement.getAttribute('data-cqb') !== 'single') doc.documentElement.setAttribute('data-cqb', 'single');
      metrics.style.left = `${Math.ceil((right - rect.left) / zoom + 8)}px`;
      metrics.dataset.overflow = metrics.scrollWidth > metrics.clientWidth + 1 ? 'true' : 'false';
      setStyle(frame, '--cqb-height', '40px');
      setStyle(frame, 'padding-bottom', '40px');
      setStyle(frame, '--app-shell-navigation-rail-width', '0px');
    }
    function scheduleLayout() {
      if (!queued && active) { queued = true; win.requestAnimationFrame(layout); }
    }
    function attach() {
      if (!active) return;
      const nextRail = doc.querySelector('nav[data-app-navigation-rail]');
      const nextFrame = nextRail?.closest('[data-app-shell-frame]');
      if (!nextRail || !nextFrame) {
        if (rail?.isConnected === false) { backdrop?.remove(); metrics?.remove(); rail = null; frame = null; }
        return;
      }
      if (rail === nextRail && metrics?.isConnected && backdrop?.isConnected) return;
      if (frame && frame !== nextFrame) for (const name of ['--cqb-height', 'padding-bottom', '--app-shell-navigation-rail-width']) restoreStyle(frame, name);
      backdrop?.remove(); metrics?.remove(); resizeObserver?.disconnect();
      rail = nextRail; frame = nextFrame;
      releaseRailClipping();
      // Keep the original measured width: Codex itself observes this rail's clientWidth.
      setStyle(rail, '--cqb-native-width', `${Math.max(40, rail.offsetWidth || 56)}px`);
      backdrop = doc.createElement('div'); backdrop.id = 'codex-bottom-bar-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
      metrics = createMetrics(); frame.append(backdrop, metrics);
      doc.documentElement.setAttribute('data-cqb', 'single');
      resizeObserver = new win.ResizeObserver(scheduleLayout);
      resizeObserver.observe(rail); resizeObserver.observe(metrics); resizeObserver.observe(frame);
      render(null); scan(); scheduleLayout();
    }
    function rootFiber() {
      const known = win.__codexRoot?._internalRoot?.current;
      if (known) return known;
      const key = rail && Object.keys(rail).find(key => key.startsWith('__reactFiber$'));
      let fiber = key ? rail[key] : null;
      let depth = 0;
      while (fiber?.return && depth++ < 200) fiber = fiber.return;
      return fiber?.stateNode?.current ?? fiber;
    }
    function scan() {
      if (!active || reading || !rail) return;
      function cachedUsage(client) {
        if (typeof client?.getQueryData !== 'function') return undefined;
        const account = client.getQueryData(['vscode', 'account-info']);
        if (!account?.accountId) return undefined;
        const raw = client.getQueryData(['rate-limit-status']);
        return raw?.account_id === account.accountId ? normalize(raw) : null;
      }
      // These two named cache entries are current independently of chat rendering.
      // Avoid a full React scan on every streamed token or unrelated page update.
      if (usageClient) {
        try { const snapshot = cachedUsage(usageClient); if (snapshot !== undefined) { render(snapshot); return; } } catch {}
        usageClient = null;
      }
      const root = rootFiber();
      if (!root) { render(null); return; }
      reading = true;
      const token = ++scanToken, pending = [root], visited = new WeakSet(), seenData = new WeakSet();
      const accounts = new Set(), candidates = [], queryClients = new Set(); let checked = 0;
      function consider(raw, updatedAt = 0) {
        if (!object(raw) || seenData.has(raw)) return;
        seenData.add(raw);
        const account = raw.account_id ?? raw.accountId;
        const snapshot = account ? normalize(raw) : null;
        if (snapshot) candidates.push({account, snapshot, updatedAt, score: (snapshot.fiveHour ? 2 : 0) + (snapshot.weekly ? 2 : 0) + (snapshot.resets !== null ? 1 : 0) + (snapshot.creditBalance !== null ? 1 : 0)});
      }
      function finish() {
        reading = false;
        if (!active || token !== scanToken) return;
        if (root !== rootFiber()) { render(null); return; }
        // The current desktop keeps usage in its existing query cache even with the menu closed.
        // Read only the named usage query; never fetch, enumerate messages, or inspect auth tokens.
        for (const client of queryClients) {
          try {
            for (const query of client.getQueryCache().getAll()) {
              if (query.queryKey?.[0] === 'rate-limit-status' && !query.queryKey.includes('image-generation'))
                consider(query.state?.data, query.state?.dataUpdatedAt ?? 0);
            }
          } catch { render(null); return; }
        }
        // Never combine values from separate signed-in accounts or an incomplete scan.
        const identities = new Set(candidates.map(item => item.account).filter(Boolean));
        if (pending.length || identities.size !== 1 || accounts.size > 1 || (accounts.size === 1 && !identities.has([...accounts][0]))) { render(null); return; }
        const chosen = candidates.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)[0];
        render(chosen?.snapshot ?? null);
      }
      function slice() {
        if (!active || token !== scanToken) { reading = false; return; }
        const start = win.performance.now();
        while (pending.length && checked < 16000 && win.performance.now() - start < 8) {
          const fiber = pending.pop();
          if (!object(fiber) || visited.has(fiber)) continue;
          visited.add(fiber); checked++;
          // Only inspect current props and the named usage fields; no message text or auth tokens.
          const props = fiber.memoizedProps;
          if (object(props)) {
            if (props.currentAccount?.id) accounts.add(props.currentAccount.id);
            if (props.authAccountId) accounts.add(props.authAccountId);
            if (!props.auth?.isLoading && props.auth?.accountId) accounts.add(props.auth.accountId);
            if (!props.accountInfoLoading && !props.accountInfoError && props.accountInfo?.accountId) accounts.add(props.accountInfo.accountId);
            if (props.accountInfoQuery?.isSuccess && props.accountInfoQuery.data?.accountId) accounts.add(props.accountInfoQuery.data.accountId);
            for (const value of [props.client, props.value]) if (object(value) && typeof value.getQueryCache === 'function') {
              queryClients.add(value);
              try {
                const snapshot = cachedUsage(value);
                if (snapshot !== undefined) { usageClient = value; reading = false; render(snapshot); return; }
              } catch {}
            }
            for (const raw of [props.usage, props.rateLimit, props.rateLimitStatus, props.usage?.data]) consider(raw);
          }
          if (fiber.sibling) pending.push(fiber.sibling);
          if (fiber.child) pending.push(fiber.child);
        }
        if (pending.length && checked < 16000) win.setTimeout(slice, 0); else finish();
      }
      slice();
    }
    const keyHandler = event => {
      if (!rail?.contains(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
      if (!event.target.closest('button,a,[role="button"]')) return;
      const items = [...rail.querySelectorAll('button,a,[role="button"]')].filter(node => !node.disabled && node.getClientRects().length);
      const index = items.findIndex(node => node === event.target || node.contains(event.target));
      if (index < 0) return;
      event.preventDefault(); event.stopPropagation();
      items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]?.focus();
    };
    win.__codexBottomBar = {
      version: VERSION,
      setTooltip,
      status() { return {version: VERSION, attached: !!rail?.isConnected, layout: doc.documentElement.getAttribute('data-cqb'), dataAvailable: lastSnapshot !== null, lastUsagePath,timeModes:{...timeModes},language:locale,timeZone}; },
      refresh: scan,
      quotaSample() {
        if (!lastSnapshot?.fiveHour || !usageClient?.getQueryData) return null;
        const account = usageClient.getQueryData(['vscode','account-info']);
        const raw = usageClient.getQueryData(['rate-limit-status']);
        if (!account?.accountId || raw?.account_id !== account.accountId) return null;
        const snapshot=normalize(raw),five=snapshot?.fiveHour;
        return five && five.remaining != null ? {accountId:account.accountId,resetsAt:five.resetsAt,remaining:five.remaining,availableResets:snapshot.resets,updatedAt:usageClient.getQueryState?.(['rate-limit-status'])?.dataUpdatedAt ?? 0} : null;
      },
      async refreshQuota() {
        if (this.quotaSample() && typeof usageClient?.refetchQueries === 'function')
          await usageClient.refetchQueries({queryKey:['rate-limit-status'],exact:true,type:'all'});
      },
      dispose() {
        win.__cqbFeatures?.dispose?.();
        hideTooltip();
        win.removeEventListener('cqb-languagechange',languageChanged);
        active = false; scanToken++; mutationObserver?.disconnect(); resizeObserver?.disconnect();
        win.clearInterval(scanTimer); win.clearInterval(refreshTimer);
        win.clearTimeout(minuteTimer); doc.removeEventListener('visibilitychange',refreshTimeDisplay); win.removeEventListener('focus',refreshTimeDisplay); win.removeEventListener('storage',storageChanged);
        doc.removeEventListener('pointerover',tooltipOver); doc.removeEventListener('pointerout',tooltipOut); doc.removeEventListener('focusin',tooltipFocus); doc.removeEventListener('focusout',tooltipFocusOut);
        doc.removeEventListener('pointerdown',tooltipPointerDown,true); doc.removeEventListener('keydown',tooltipKey,true); doc.removeEventListener('scroll',tooltipScroll,true); doc.removeEventListener('visibilitychange',tooltipVisibility); win.removeEventListener('blur',tooltipBlur); win.removeEventListener('resize',hideTooltip);
        doc.removeEventListener('keydown', keyHandler, true); win.removeEventListener('resize', scheduleLayout);
        backdrop?.remove(); metrics?.remove();
        transitionStyle?.remove();
        for (const [element, styles] of ownedStyles) for (const name of styles.keys()) restoreStyle(element, name);
        originalAttribute === null ? doc.documentElement.removeAttribute('data-cqb') : doc.documentElement.setAttribute('data-cqb', originalAttribute);
        doc.getElementById('codex-bottom-bar-style')?.remove();
        delete win.__codexBottomBar;
      },
    };
    mutationObserver = new win.MutationObserver(() => { if (!rail?.isConnected || !metrics?.isConnected || !backdrop?.isConnected) attach(); });
    mutationObserver.observe(doc.documentElement, {childList: true, subtree: true});
    doc.addEventListener('keydown', keyHandler, true); win.addEventListener('resize', scheduleLayout);
    doc.addEventListener('visibilitychange',refreshTimeDisplay); win.addEventListener('focus',refreshTimeDisplay); win.addEventListener('storage',storageChanged);
    doc.addEventListener('pointerover',tooltipOver); doc.addEventListener('pointerout',tooltipOut); doc.addEventListener('focusin',tooltipFocus); doc.addEventListener('focusout',tooltipFocusOut);
    doc.addEventListener('pointerdown',tooltipPointerDown,true); doc.addEventListener('keydown',tooltipKey,true); doc.addEventListener('scroll',tooltipScroll,true); doc.addEventListener('visibilitychange',tooltipVisibility); win.addEventListener('blur',tooltipBlur); win.addEventListener('resize',hideTooltip);
    win.addEventListener('cqb-languagechange',languageChanged);
    scanTimer = win.setInterval(scan, 5000); refreshTimer = win.setInterval(attach, 2000);
    attach(); scheduleMinute();
  }
  return {VERSION, normalize, resetDate, countdown, creditBalance, creditText, TIME_MODES_KEY, timestamp, install};
});
