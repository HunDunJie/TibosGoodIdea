const {chromium} = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const moduleSource = `export const uct=window.fixture.scopes.root, MQn=window.fixture.scopes.composer;
export const ZCn='event', ZAn='navigation', b0n='binding', VJn='host', Sft='draft', Hft='prompt';
export function ICn(){if(window.fixture.mode==='broken-completion')throw Error('fixture event interface failed')}
export function fpt(){if(window.fixture.mode==='broken-send')throw Error('fixture draft interface failed')}
export function Ntr(key,fallback){return window.fixture.storage[key]??fallback}
export async function tjn(store,id,host){return window.fixture.navigate(id)}
export function HQn(value){return value.clientThreadId}
export function openUsage(store,modal,options){window.fixture.usageOpens++;window.fixture.usageOptions=options}
export function usageModal(){} export function recordReset(){} export function decodeConversation(value){return value}
export const turn='turn';
`;
(async () => {
  const nativeSource = await fs.readFile(path.join(root,'native-features.js'),'utf8');
  const server = http.createServer((req,res) => {
    if (req.url === '/adapter.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); return res.end(nativeSource); }
    if (req.url === '/initial.js' || req.url === '/shared.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); return res.end(moduleSource); }
    if (req.url === '/index-fixture.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); return res.end(''); }
    res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<div data-app-shell-frame><nav data-app-navigation-rail><button aria-label="账户"></button></nav><main><div data-codex-composer-root><div class="ProseMirror" contenteditable="true"></div></div></main></div><script type="module" src="/index-fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page = await browser.newPage();
    async function setup(mode = 'normal',profile = '账户') {
      await page.goto(`http://127.0.0.1:${server.address().port}/start`);
      await page.evaluate(({mode,profile}) => {
        const f = window.fixture = {scopes:{root:{},composer:{}},storage:{},account:'A',events:[],submits:[],visits:[],usageOpens:0,mode};
        f.storage['composer-prompt-drafts-v2'] = {'local:one':{prompt:'fixture one'},'alias-one':{prompt:'fixture one'},'local:two':{prompt:'fixture two'},'local:three':{prompt:'fixture three'},'local:empty':{prompt:'   '}};
        f.storage['client-thread-bindings-v1'] = {'alias-one':'one'};
        f.quota={rate_limit:{primary_window:{used_percent:25,limit_window_seconds:18000,reset_at:Date.now()/1000+18000}},rate_limit_reset_credits:{available_count:2}};
        const rootStore = {scope:f.scopes.root,set(){},get(atom,key) { if (atom === 'navigation') return f.navigation; if (atom === 'binding') return f.storage['client-thread-bindings-v1'][key] ?? null; if (atom === 'host') return 'local'; return f.lastEvent; },watch(callback) { f.watch = callback; callback({get:() => f.lastEvent}); return () => { f.watch = null; }; },queryClient:{getQueryData(key) { return key[0] === 'vscode' ? {accountId:f.account} : {...f.quota,account_id:f.account}; },getQueryState() { return {dataUpdatedAt:Date.now()}; },getQueryCache(){return {getAll:()=>[]}}}};
        window.__codexRoot={_internalRoot:{current:{memoizedProps:{client:rootStore.queryClient}}}};
        const avatar = document.querySelector('nav button'); avatar.setAttribute('aria-label',profile); avatar.__reactFiber$fixture = {memoizedState:{memoizedState:{current:rootStore}}};
        const composer = document.querySelector('[data-codex-composer-root]');
        const composerStore = {scope:f.scopes.composer,value:{kind:'local',conversationId:'start'},get(){},watch(){}};
        composer.__reactFiber$fixture = {memoizedState:{memoizedState:{current:composerStore}},child:{memoizedProps:{submitDisabled:false,isResponseInProgress:false,handleSubmit:async options => {
          const id = composerStore.value.conversationId; if (id === 'three') throw new Error('Fixture rejection');
          f.submits.push(id); options.onAccepted();
          for (const key of Object.keys(f.storage['composer-prompt-drafts-v2'])) if (key === 'local:'+id || f.storage['client-thread-bindings-v1'][key] === id) delete f.storage['composer-prompt-drafts-v2'][key];
          if (f.mode === 'account-switch') f.account = 'B';
        }}}};
        f.navigate = async id => { f.visits.push(id); composerStore.value = {kind:'local',conversationId:id}; if (mode === 'normal' && id === 'one') f.storage['composer-prompt-drafts-v2']['local:two'].prompt = 'edited during the round'; };
        f.navigation = {navigate:async route => { f.visits.push(route); },navigateToLocalConversation:async id=>f.navigate(id)};
        window.__codexBottomBarFeatureBindings = {initial:'initial.js',shared:'shared.js',scope:'uct',initEvents:'ICn',completionEvent:'ZCn',initComposer:'fpt',composerScope:'MQn',readStorage:'Ntr',navigation:'ZAn',navigateLocal:'tjn',conversationBinding:'b0n',host:'VJn'};
        const initial=key=>({module:'initial.js',export:key});
        window.__codexBottomBarBindings={profileModule:'initial.js',scope:{module:'shared.js',export:'uct'},openModal:initial('openUsage'),usageModal:initial('usageModal'),turn:initial('turn'),recordReset:initial('recordReset'),decodeConversation:initial('decodeConversation')};
      },{mode,profile});
      await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/adapter.js`});
      await page.evaluate(() => window.__cqbNativeFeatures.connect(event => window.fixture.events.push(event)));
    }
    for(const profile of ['账户','Profile','プロフィール']) {
      await setup('cancel',profile);
      assert.equal(await page.evaluate(()=>window.__cqbNativeFeatures.identity()?.accountId),'A','Account bridge connects in '+profile);
      const cancelled=await page.evaluate(()=>window.__cqbNativeFeatures.sendRound({isCurrent:()=>false}));
      assert.deepEqual(cancelled,{sent:0,failed:0,skipped:3});
      await page.addScriptTag({path:path.join(root,'bottom-bar.js')});
      await page.waitForFunction(()=>window.__codexBottomBar.quotaSample()?.availableResets===2);
      await page.locator('[data-cqb-slot="resets"]').click();
      await page.waitForFunction(()=>window.fixture.usageOpens===1);
      assert.equal(await page.evaluate(()=>window.__codexBottomBar.status().lastUsagePath),'direct','Usage opens directly in '+profile);
    }
    await setup();
    const counts = await page.evaluate(() => window.__cqbNativeFeatures.sendRound());
    assert.deepEqual(counts,{sent:1,failed:1,skipped:1});
    const result = await page.evaluate(() => ({submits:fixture.submits,edited:fixture.storage['composer-prompt-drafts-v2']['local:two'].prompt,failurePreserved:!!fixture.storage['composer-prompt-drafts-v2']['local:three'],lastVisit:fixture.visits.at(-1)}));
    assert.deepEqual(result.submits,['one']); assert.equal(result.failurePreserved,true); assert.equal(result.edited,'edited during the round'); assert.equal(result.lastVisit,'/start');
    await page.evaluate(() => { fixture.lastEvent={hostId:'other-host',conversationId:'other-chat',turnId:'next',status:'completed'}; fixture.watch({get:() => fixture.lastEvent}); });
    assert.equal(await page.evaluate(() => fixture.events.length),1,'completion events include another chat and host');
    await setup('account-switch'); const changed = await page.evaluate(() => window.__cqbNativeFeatures.sendRound());
    assert.deepEqual(changed,{sent:1,failed:0,skipped:2});
    await setup('cancel'); const cancelled = await page.evaluate(() => window.__cqbNativeFeatures.sendRound({isCurrent:() => false}));
    assert.deepEqual(cancelled,{sent:0,failed:0,skipped:3});
    assert.equal(await page.evaluate(() => fixture.submits.length),0);
    for(const mode of ['broken-completion','broken-send']){
      await setup(mode);
      const caps=await page.evaluate(()=>window.__cqbNativeFeatures.connect(()=>{}));
      assert.equal(caps.completion,mode!=='broken-completion');assert.equal(caps.send,mode!=='broken-send');
      if(mode==='broken-send')await assert.rejects(()=>page.evaluate(()=>window.__cqbNativeFeatures.sendRound()),/interface|接口/);
    }
    await setup();
    await page.evaluate(()=>{window.__codexBottomBarFeatureBindings.navigationMode='native-method';window.__codexBottomBarFeatureBindings.initSend=['fpt'];});
    const nativeMethod=await page.evaluate(()=>window.__cqbNativeFeatures.sendRound());
    assert.deepEqual(nativeMethod,{sent:1,failed:1,skipped:1},'Updated native navigation delegates safely');
    console.log(JSON.stringify({passed:true,threeNativeProfileLanguages:true,threeDirectUsageLanguages:true,nativeSubmissionDelegation:true,draftAliasDeduplication:true,emptyDraftSkipped:true,changedDraftPreserved:true,failedDraftPreserved:true,accountSwitchStopsRound:true,roundCancellation:true,allHostCompletionSubscription:true,realDraftsSent:false}));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
