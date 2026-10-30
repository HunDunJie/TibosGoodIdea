const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const {FeatureEngine}=await import(pathToFileURL(path.join(root,'feature-engine.mjs')).href);
  const base=Date.parse('2026-10-30T00:00:00Z');let now=base,checks=0,played=0,sends=0;
  const check=(value,message)=>{assert.ok(value,message);checks++};
  const engine=new FeatureEngine({now:()=>now,audio:{check:async()=>{},stop:async()=>{},play:async()=>{played++}}});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:900}});
    await page.clock.setFixedTime(new Date(now));
    let queue=Promise.resolve();
    await page.exposeFunction('__proHost',(method,payload)=>{
      const result=queue.then(async()=>{
        if(method==='observe')return engine.observe(payload);
        if(method==='toggle')return engine.toggle(payload.feature,payload.enabled);
        if(method==='claim-send')return engine.claimSend();
        if(method==='finish-send')return engine.finishSend(payload.id,payload.result);
        if(method==='volume-status')return {percent:50,muted:false};
        return engine.status();
      });queue=result.catch(()=>{});return result;
    });
    await page.exposeFunction('__proSend',()=>{sends++;return {sent:1}});
    await page.goto(pathToFileURL(path.join(root,'preview.html')).href+'?lang=zh-CN&tz=UTC');
    await page.waitForFunction(()=>window.__cqbFeatures?.status().connected);
    await page.evaluate(()=>{
      window.__proObserved=0;window.__proRaw=null;window.__proStamp=0;
      window.__cqbPreviewHost=async(method,payload)=>{const result=await window.__proHost(method,payload);if(method==='observe')window.__proObserved=payload.updatedAt;return result};
      window.__cqbNativeFeatures.sendRound=()=>window.__proSend();
      window.__codexRoot._internalRoot.current.memoizedProps.client={
        getQueryCache:()=>({getAll:()=>[]}),
        getQueryData:keys=>keys[0]==='vscode'?{accountId:'preview-account'}:window.__proRaw,
        getQueryState:()=>({dataUpdatedAt:window.__proStamp}),
      };
    });
    const usage=(primary_window,plan_type='pro')=>({account_id:'preview-account',plan_type,
      rate_limit:{primary_window,secondary_window:{limit_window_seconds:604800,used_percent:42,reset_at:(base+86400000)/1000}},
      credits:{balance:'1234.5'},rate_limit_reset_credits:{available_count:2}});
    const finite=usage({limit_window_seconds:18000,used_percent:100,reset_at:(base+120000)/1000},'plus');
    async function publish(raw){
      now+=1;await page.clock.setFixedTime(new Date(now));
      await page.evaluate(({raw,stamp})=>{window.__proRaw=raw;window.__proStamp=stamp;window.__codexBottomBar.refresh()},{raw,stamp:now});
      if(raw?.rate_limit && raw.account_id==='preview-account')await page.waitForFunction(stamp=>window.__proObserved===stamp,now);
    }
    await publish(finite);
    const five=page.locator('[data-cqb-slot="fiveHour"]'),week=page.locator('[data-cqb-slot="weekly"]');
    const send=page.locator('[data-cqb-feature="send"] button'),refresh=page.locator('[data-cqb-feature="refresh"] button'),completion=page.locator('[data-cqb-feature="completion"] button');
    await week.locator('.cqb-time').click();
    for(const button of [send,refresh,completion]){
      await button.click();await page.waitForFunction(feature=>document.querySelector(`[data-cqb-feature="${feature}"] button`).getAttribute('aria-pressed')==='true',await button.evaluate(n=>n.parentElement.dataset.cqbFeature));
    }
    check(engine.state.send.phase==='armed'&&engine.state.alarm&&engine.state.completionEnabled,'Finite account schedules normally');
    now=base+180001;await publish(usage(null));
    await page.waitForFunction(()=>document.querySelector('[data-cqb-feature="send"] button').disabled);
    check(!await five.isVisible(),'Confirmed no-five-hour limit hides the five-hour slot');
    check(await week.isVisible()&&await week.locator('.cqb-value').textContent()==='58%','Weekly quota remains available');
    check(await week.locator('.cqb-time').getAttribute('aria-pressed')==='true','Weekly display preference is retained');
    check(await page.locator('[data-cqb-slot="credits"] .cqb-value').textContent()==='1234.5','Purchased credits remain separate');
    check(await page.locator('[data-cqb-slot="resets"] .cqb-value').textContent()==='2 次','Reset inventory remains visible');
    check(engine.state.alarm===null&&!engine.state.refreshEnabled&&engine.state.send.phase==='cancelled','Old schedules are cancelled in the real engine');
    check(played===0&&sends===0,'No expired reminder or draft round runs during the plan change');
    check(!await completion.isDisabled()&&await completion.getAttribute('aria-pressed')==='true','Completion reminders remain enabled');
    check(await page.evaluate(()=>{const s=window.__codexBottomBar.quotaSample();return s.fiveHourLimit==='none'&&s.resetsAt===null&&s.remaining===null}),'Native query cache reports explicit applicability without inventing usage');
    for(const [language,status] of [['zh-CN','不适用'],['en','Not applicable'],['ja','対象外']]){
      await page.evaluate(value=>document.documentElement.lang=value,language);
      await page.waitForFunction(value=>window.__codexBottomBar.status().language===value,language);
      for(const button of [send,refresh]){
        check(await button.isDisabled(),'Quota-cycle controls are disabled: '+language);
        check((await button.getAttribute('data-cqb-tooltip')).split('\n')[1]===status,'Localized applicability: '+language);
      }
      await send.locator('..').hover();
      await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
      check((await page.locator('#codex-bottom-bar-tooltip').textContent()).includes(status),'Disabled control still explains its reason on hover: '+language);
      if(language==='en')check(!/[\u4e00-\u9fff]/.test(await send.getAttribute('data-cqb-tooltip')),'English tooltip contains no Chinese fallback');
    }
    for(const width of [1600,1024,480]){
      await page.setViewportSize({width,height:900});
      check(await page.locator('#codex-bottom-bar-metrics').evaluate(n=>n.getBoundingClientRect().height<=40),'Pro layout stays on one row: '+width);
    }
    if(process.argv[2]){
      await page.setViewportSize({width:1600,height:900});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.mouse.move(600,400);
      await send.locator('..').hover();await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
      await page.screenshot({path:path.resolve(process.argv[2]),clip:{x:0,y:720,width:1600,height:180}});
    }
    await page.setViewportSize({width:1600,height:900});
    await publish({...usage(null),account_id:'different-account'});
    check(await five.isVisible()&&await page.evaluate(()=>window.__codexBottomBar.quotaSample()===null),'Other-account data is unknown, not unlimited');
    await publish({account_id:'preview-account',plan_type:'pro',rate_limit:null});
    await page.waitForFunction(()=>!document.querySelector('[data-cqb-feature="send"] button').disabled);
    check(await five.isVisible()&&await five.locator('.cqb-value').textContent()==='--','Missing usage restores an unknown five-hour display');
    await publish({...finite,rate_limit:{...finite.rate_limit,primary_window:{...finite.rate_limit.primary_window,reset_at:(base+600000)/1000}}});
    await page.waitForFunction(()=>!document.querySelector('[data-cqb-feature="refresh"] button').disabled);
    await send.click();await page.waitForFunction(()=>window.__cqbFeatures.status().state.send.phase==='armed');
    await refresh.click();await page.waitForFunction(()=>window.__cqbFeatures.status().state.refresh.enabled);
    check(engine.state.send.phase==='armed'&&engine.state.alarm.reset===base+600000,'A finite limit restores manual scheduling');
    check(played===0&&sends===0,'Fixtures never play actual audio or send real drafts');
    await page.evaluate(()=>{window.__previousBar=window.__codexBottomBar;window.__previousBar.version='0.8.0-rc.4'});
    await page.addScriptTag({path:path.join(root,'bottom-bar.js')});
    await page.addScriptTag({path:path.join(root,'feature-ui.js')});
    await page.waitForFunction(()=>window.__cqbFeatures?.status().connected);
    check(await page.evaluate(()=>window.__codexBottomBar!==window.__previousBar&&window.__codexBottomBar.status().fiveHourLimit==='limited'),'Reload replaces the legacy renderer instead of retaining the old decoder');
    await publish(usage(null));
    await page.waitForFunction(()=>document.querySelector('[data-cqb-feature="send"] button').disabled);
    check(!await five.isVisible()&&engine.state.alarm===null,'No-five-hour handling still works after a renderer reload');
    console.log(JSON.stringify({passed:true,checks,realDraftsSent:false,audioPlayed:false}));
  } finally {await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
