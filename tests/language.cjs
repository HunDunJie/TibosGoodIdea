const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});let checks=0;
  const check=(value,message)=>{assert.ok(value,message);checks++};
  try{
    const page=await browser.newPage({viewport:{width:1600,height:900},locale:'zh-CN'});
    await page.clock.setFixedTime(new Date('2026-10-29T10:27:00Z'));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../preview.html')).href+'?lang=zh-CN&tz=Asia/Tokyo');
    await page.waitForFunction(()=>window.__cqbFeatures?.status().connected);
    for(const key of ['send','completion','refresh'])await page.locator(`[data-cqb-feature="${key}"] button`).click();
    await page.locator('[data-cqb-slot="fiveHour"] .cqb-time').click();
    await page.locator('[data-cqb-slot="weekly"] .cqb-time').click();
    await page.evaluate(()=>{window.__originalSendButton=document.querySelector('[data-cqb-feature="send"] button');window.__beforeLanguageState=JSON.stringify(window.__previewState);window.__beforeTimeModes=JSON.stringify(window.__codexBottomBar.status().timeModes)});
    await page.mouse.move(600,200);
    for(let i=0;i<30;i++){
      await page.keyboard.press('Tab');
      if(await page.evaluate(()=>document.activeElement===window.__originalSendButton))break;
    }
    check(await page.evaluate(()=>document.activeElement===window.__originalSendButton),'Send button has keyboard focus');
    await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    await page.evaluate(()=>window.__originalTip=document.getElementById('codex-bottom-bar-tooltip'));
    for(const [lang,canonical,names,credits] of [['en-US','en',['Send on reset','Completion sound','Reset reminder'],'Credits '],['ja-JP','ja',['予約送信','完了通知','更新通知'],'クレジット '],['zh-Hans','zh-CN',['定时发送','完成提醒','刷新提醒'],'额度 ']]){
      await page.evaluate(value=>document.documentElement.lang=value,lang);
      await page.waitForFunction(value=>window.__codexBottomBar.status().language===value,canonical);
      await page.waitForFunction(value=>document.querySelector('[data-cqb-feature="send"] button').getAttribute('aria-label')===value,names[0]);
      const shutdownName=canonical==='en'?'Scheduled shutdown':canonical==='ja'?'シャットダウン予約':'定时关闭';
      check((await page.locator('.cqb-feature-button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).join(',')===[shutdownName,...names].join(','),'Translated button names: '+lang);
      check(await page.locator('[data-cqb-slot="credits"] .cqb-label').textContent()===credits,'Quota label: '+lang);
      check(await page.evaluate(()=>document.querySelector('[data-cqb-feature="send"] button')===window.__originalSendButton),'Same controls: '+lang);
      check(await page.evaluate(()=>document.getElementById('codex-bottom-bar-tooltip')===window.__originalTip),'Same open tooltip: '+lang);
      check((await page.locator('#codex-bottom-bar-tooltip').textContent()).startsWith(names[0]+'\n'),'Visible tooltip updates: '+lang);
      check(await page.evaluate(()=>JSON.stringify(window.__previewState)===window.__beforeLanguageState),'No feature state changed: '+lang);
      check(await page.evaluate(()=>JSON.stringify(window.__codexBottomBar.status().timeModes)===window.__beforeTimeModes),'Display choices preserved: '+lang);
      await page.waitForFunction(value=>window.__previewCalls.some(c=>c.method==='ui-language'&&c.payload.language===value),canonical);
      check(true,'Locale reported to worker: '+lang);
      const text=await page.locator('[data-cqb-slot="fiveHour"] .cqb-time').textContent();
      check(canonical==='ja'?/時間\d+分/.test(text):canonical==='en'?/h \d+m/.test(text):/小时\d+分/.test(text),'Minute countdown: '+lang);
    }
    check(await page.evaluate(()=>window.__previewCalls.filter(c=>c.method==='toggle').length===3),'Language changes never toggle features');
    check(await page.evaluate(()=>navigator.language)==='zh-CN','Codex English/Japanese worked despite Chinese browser locale');
    await page.evaluate(()=>document.documentElement.lang='ja');
    await page.waitForFunction(()=>window.__codexBottomBar.status().language==='ja');
    for(const width of [1600,1000,640]){
      await page.setViewportSize({width,height:900});
      check(await page.locator('#codex-bottom-bar-metrics').evaluate(n=>n.getBoundingClientRect().height===40),'Japanese remains one row: '+width);
    }
    if(process.env.CQB_JAPANESE_RENDER){
      await page.setViewportSize({width:1600,height:900});
      await page.locator('[data-cqb-feature="send"] button').hover();
      await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
      await page.screenshot({path:process.env.CQB_JAPANESE_RENDER,clip:{x:0,y:720,width:1600,height:180}});
    }
    console.log(JSON.stringify({passed:true,checks,liveLanguageChanges:true,retainsTooltip:true,preservesFeatureState:true,realDraftsSent:false}));
  }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
