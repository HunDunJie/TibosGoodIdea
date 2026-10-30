(function () {
  'use strict';
  const t = globalThis.__cqbI18n?.t ?? (value=>value);
  const win = window, doc = document;
  let api = null, loading = null, unsubscribe = null, disposed = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  const storeLike = (value,scope) => value?.scope === scope && typeof value.get === 'function' && typeof value.watch === 'function';
  function findStore(element,scope) {
    const key = element && Object.keys(element).find(k => k.startsWith('__reactFiber$'));
    for (let fiber = key && element[key], depth = 0; fiber && depth++ < 80; fiber = fiber.return) {
      for (let hook = fiber.memoizedState, count = 0; hook && count++ < 200; hook = hook.next) {
        const current = hook.memoizedState?.current;
        if (storeLike(current,scope)) return current;
        if (storeLike(hook.memoizedState,scope)) return hook.memoizedState;
      }
      if (storeLike(fiber.memoizedProps?.value,scope)) return fiber.memoizedProps.value;
    }
    return null;
  }
  async function init() {
    if (api) return api;
    if (loading) return loading;
    loading = (async () => {
      const p = win.__codexBottomBarFeatureBindings;
      if (!p) throw new Error(t('当前客户端版本未适配任务事件与草稿接口'));
      const entry = [...doc.scripts].find(s => /\/index-[^/]+\.js(?:\?|$)/.test(s.src));
      if (!entry) throw new Error(t('找不到客户端模块入口'));
      const base = new URL('.',entry.src), [initial,shared] = await Promise.all([import(new URL(p.initial,base).href),import(new URL(p.shared,base).href)]);
      const result = {p,initial,shared,scope:shared[p.scope],support:{completion:false,send:false},reasons:{}};
      if (!result.scope) throw new Error(t('客户端功能接口不可用'));
      for (const feature of ['completion','send']) {
        if (p.capabilities?.[feature] === false) { result.reasons[feature]=t('客户端功能接口不可用'); continue; }
        try {
          const inits=feature==='completion' ? [p.initEvents] : p.initSend ?? [p.initComposer];
          for (const name of new Set(inits)) {
            if (typeof initial[name] !== 'function') throw new Error(t('客户端功能接口不可用'));
            initial[name]();
          }
          if (feature==='completion' && !initial[p.completionEvent]) throw new Error(t('客户端功能接口不可用'));
          if (feature==='send' && (!initial[p.composerScope] || typeof initial[p.readStorage] !== 'function' || !initial[p.navigation] || !initial[p.conversationBinding] || !initial[p.host] || p.navigationMode!=='native-method' && typeof initial[p.navigateLocal]!=='function')) throw new Error(t('客户端功能接口不可用'));
          result.support[feature]=true;
        } catch (error) { result.reasons[feature]=error.message; }
      }
      result.composerScope=initial[p.composerScope];
      api = result; return result;
    })().catch(error => { loading = null; throw error; });
    return loading;
  }
  function rootStore() {
    const avatar = doc.querySelector('nav[data-app-navigation-rail] button:is([aria-label*="个人资料"],[aria-label*="profile" i],[aria-label="账户"],[aria-label*="account" i],[aria-label*="プロフィール"],[aria-label*="アカウント"])');
    return api ? findStore(avatar,api.scope) : null;
  }
  function identity(store = rootStore()) {
    const client = store?.queryClient;
    const accountId = client?.getQueryData(['vscode','account-info'])?.accountId;
    const query = client?.getQueryState?.(['rate-limit-status']);
    const raw = client?.getQueryData(['rate-limit-status']);
    return accountId && raw?.account_id === accountId ? {accountId,raw,updatedAt:query?.dataUpdatedAt ?? 0,client} : null;
  }
  function currentComposer() {
    const elements = [...doc.querySelectorAll('[data-codex-composer-root],.ProseMirror[contenteditable="true"]')];
    for (const node of elements) { const store = findStore(node,api.composerScope); if (store) return {node,store}; }
    return null;
  }
  function unwrap(value) { return value && typeof value === 'object' && 'draft' in value ? value.draft : typeof value === 'string' || value && !('prompt' in value) ? {prompt:value} : value; }
  function nonempty(value) {
    const draft = unwrap(value); if (!draft) return false;
    if (typeof draft.prompt === 'string') return draft.prompt.trim().length > 0;
    return !!draft.prompt?.document?.content?.length;
  }
  function drafts(store,accountId) {
    const read = api.initial[api.p.readStorage];
    const saved = read('composer-prompt-drafts-v2',read('composer-prompt-drafts-v1',{}));
    const bindings = read('client-thread-bindings-v1',{});
    const records = new Map();
    for (const [key,value] of Object.entries(saved ?? {})) {
      if (!nonempty(value)) continue;
      let id = null, kind = 'local';
      if (key.startsWith('local:')) id = key.slice(6);
      else if (key.startsWith('cloud:')) { id = key.slice(6); kind = 'cloud'; }
      else if (key.startsWith('chatgpt:') && key !== 'chatgpt:new') { id = key.slice(8); kind = 'chatgpt'; }
      else id = bindings[key] ?? store.get(api.initial[api.p.conversationBinding],key);
      if (typeof id !== 'string' || !id || id.length > 300) continue;
      records.set(`${kind}:${id}`,{key,kind,id,stamp:JSON.stringify(value),storage:'codex'});
    }
    // Chat mode uses a separate account-qualified native draft record.
    const chat = read('chatgpt-conversation-prompt-drafts-v2',{});
    for (const [key,value] of Object.entries(chat ?? {})) {
      let parts; try { parts = JSON.parse(key); } catch { continue; }
      if (!Array.isArray(parts) || parts[1] !== accountId || typeof parts[2] !== 'string' || parts[2] === 'new-conversation' || !nonempty(value)) continue;
      const id = parts[2]; records.set(`chatgpt:${id}`,{key,kind:'chatgpt',id,stamp:JSON.stringify(value),storage:'chatgpt'});
    }
    return [...records.values()];
  }
  function handler(node) {
    const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
    const root = key ? node[key] : null, pending = root ? [root] : [], seen = new Set();
    let count = 0;
    while (pending.length && count++ < 4000) {
      const f = pending.pop(); if (!f || seen.has(f)) continue; seen.add(f);
      const p = f.memoizedProps;
      if (typeof p?.handleSubmit === 'function' && 'submitDisabled' in p && 'isResponseInProgress' in p)
        return p.submitDisabled || p.isSubmitButtonLoading ? null : p.handleSubmit;
      if (f.child) pending.push(f.child); if (f !== root && f.sibling) pending.push(f.sibling);
    }
    return null;
  }
  win.__cqbNativeFeatures?.dispose?.();
  win.__cqbNativeFeatures = {
    async connect(onCompletion) {
      await init(); const store = rootStore(); if (!store) throw new Error(t('尚未取得客户端状态'));
      unsubscribe?.(); let first = true, previous;
      unsubscribe = null;
      const capabilities={...api.support,reasons:{...api.reasons}};
      if (capabilities.completion) try { unsubscribe = store.watch(({get}) => {
        const event = get(api.initial[api.p.completionEvent]);
        if (first) { first = false; previous = event; return; }
        if (!event || event === previous || disposed) return;
        previous = event;
        onCompletion({hostId:event.hostId,conversationId:event.conversationId,turnId:event.turnId,status:event.status,hasPendingContinuation:!!event.hasPendingContinuation});
      }); } catch { capabilities.completion=false; capabilities.reasons.completion=t('客户端功能接口不可用'); }
      if (capabilities.send) try {
        const nav=store.get(api.initial[api.p.navigation]);
        if (typeof nav?.navigate!=='function' || api.p.navigationMode==='native-method' && typeof nav.navigateToLocalConversation!=='function') throw Error();
      } catch { capabilities.send=false; capabilities.reasons.send=t('客户端功能接口不可用'); }
      return capabilities;
    },
    identity,
    async refreshQuota() { const value = identity(); if (value) await value.client.refetchQueries({queryKey:['rate-limit-status'],exact:true,type:'all'}); },
    async sendRound({isCurrent = () => true} = {}) {
      await init(); const store = rootStore(), account = identity(store)?.accountId;
      if (!api.support.send) throw new Error(t('客户端功能接口不可用'));
      if (!account) throw new Error(t('当前账户和额度数据不一致'));
      const all = drafts(store,account), original = `${location.pathname}${location.search}${location.hash}`;
      const nav = store.get(api.initial[api.p.navigation]);
      const results = {sent:0,failed:0,skipped:0};
      try {
        for (const draft of all) {
          if (disposed || !isCurrent() || identity(store)?.accountId !== account) { results.skipped += all.length-results.sent-results.failed-results.skipped; break; }
          const fresh = drafts(store,account).find(d => d.kind === draft.kind && d.id === draft.id);
          if (!fresh || fresh.stamp !== draft.stamp) { results.skipped++; continue; }
          try {
            if (draft.kind === 'local') {
              const host=store.get(api.initial[api.p.host],draft.id);
              const navigated=api.p.navigationMode==='native-method'
                ? await nav.navigateToLocalConversation(draft.id,host==='local' ? undefined : host)
                : await api.initial[api.p.navigateLocal](store,draft.id,host);
              if(navigated===false)throw new Error(t('客户端功能接口不可用'));
            }
            else await nav.navigate(draft.kind === 'chatgpt' ? `/c/${encodeURIComponent(draft.id)}` : `/remote/${encodeURIComponent(draft.id)}`);
            let composer, submit;
            for (let i = 0; i < 100; i++) {
              if (disposed || !isCurrent()) break;
              composer = currentComposer();
              const value = composer?.store.value;
              const matches = draft.kind === 'local' ? value?.kind === 'local' && value.conversationId === draft.id
                : draft.kind === 'cloud' ? value?.kind === 'cloud' && value.taskId === draft.id
                : value?.kind === 'chatgpt' && value.conversationId === draft.id;
              if (matches && (submit = handler(composer.node))) break;
              composer = null; await wait(100);
            }
            const latest = drafts(store,account).find(d => d.kind === draft.kind && d.id === draft.id);
            if (!composer || !submit || latest?.stamp !== draft.stamp || identity(store)?.accountId !== account || !isCurrent()) { results.skipped++; continue; }
            // Native submission owns context, attachments, permissions, queues and draft rollback.
            // Never synthesize plain text requests or manually delete a draft.
            let accepted = false;
            await submit({focusComposerAfterSubmit:false,onAccepted:() => { accepted = true; },onSubmitted:() => { accepted = true; }});
            accepted ? results.sent++ : results.failed++;
          } catch { results.failed++; }
        }
      } finally {
        if (!disposed && isCurrent() && identity(store)?.accountId === account) await Promise.resolve(nav.navigate(original,{replace:true})).catch(() => {});
      }
      return results;
    },
    dispose() { disposed = true; unsubscribe?.(); unsubscribe = null; },
  };
})();
