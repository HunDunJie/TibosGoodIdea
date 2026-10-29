const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'}); let checks = 0;
  const check = (value,message) => { assert.ok(value,message); checks++; };
  try {
    const page = await browser.newPage({viewport:{width:1600,height:900}});
    await page.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await page.waitForFunction(() => window.__cqbFeatures?.status().connected);
    const buttons = page.locator('#codex-bottom-bar-features .cqb-feature-button');
    check((await buttons.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).join(',') === '定时发送,完成提醒,刷新提醒','Button order');
    check(await page.locator('.cqb-feature-status').count()===0 && (await buttons.allTextContents()).every(text=>text===''),'Icons have no visible labels or status text');
    check(await buttons.locator('svg[aria-hidden="true"]').count()===3,'Each accessible button has a vector icon');
    const offHints={send:'可开启，用于在额度刷新时自动发送所有聊天中的草稿，所有草稿发送后将关闭定时发送',completion:'可开启，用于在任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟',refresh:'可开启，用于额度刷新时播放音乐进行提醒，播放时长最多30分钟，退出Codex仍然有效'};
    for(const [feature,text] of Object.entries(offHints)) check((await page.locator(`[data-cqb-feature="${feature}"] button`).getAttribute('data-cqb-tooltip')).split('\n')[2]===text,'Exact off hint for '+feature);
    check(await buttons.evaluateAll(nodes=>nodes.every(n=>n.dataset.cqbTooltip.split('\n').length===3&&n.dataset.cqbTooltip.split('\n')[1]==='已关闭'&&!/[。]|\.(?:\s|$)/.test(n.dataset.cqbTooltip))),'Off hints have title, state and description on three lines without full stops');
    const inactive=await buttons.first().evaluate(n=>getComputedStyle(n).color);
    check(/^rgba\(.+, 0\.5\)$/.test(inactive),'Off icons use the same muted tertiary color as unselected navigation');
    check(await page.locator('#codex-bottom-bar-features').evaluate(n=>getComputedStyle(n).gap)==='8px','Icon spacing is 8px');
    async function clickAndKeep(button,enabled) {
      await button.hover();await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
      await page.evaluate(()=>{window.__tipBeforeClick=document.getElementById('codex-bottom-bar-tooltip');window.__tipRemoved=false;window.__tipObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes)if(n===window.__tipBeforeClick)window.__tipRemoved=true});window.__tipObserver.observe(document.body,{childList:true})});
      await button.click();await page.waitForFunction(({label,value})=>document.querySelector(`[aria-label="${label}"]`).getAttribute('aria-pressed')===String(value),{label:await button.getAttribute('aria-label'),value:enabled});
      check(await page.evaluate(()=>{window.__tipObserver.disconnect();return!window.__tipRemoved&&window.__tipBeforeClick.isConnected&&document.getElementById('codex-bottom-bar-tooltip')===window.__tipBeforeClick}),'Click updates the same tooltip without removing it');
      check((await page.locator('#codex-bottom-bar-tooltip').textContent()).split('\n')[1]===(enabled?'已开启':'已关闭'),'Visible tooltip state updates immediately');
    }
    await clickAndKeep(page.getByRole('button',{name:'定时发送',exact:true}),true); check(await page.getByRole('button',{name:'定时发送',exact:true}).getAttribute('aria-pressed') === 'true','One-shot send toggle');
    await clickAndKeep(page.getByRole('button',{name:'完成提醒',exact:true}),true); check(await page.locator('[data-cqb-feature="completion"] button').getAttribute('aria-pressed') === 'true','Completion toggle');
    check((await page.locator('[data-cqb-feature="completion"] button').getAttribute('data-cqb-tooltip')).split('\n')[2]==='任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟','Exact enabled completion hint');
    check(await page.evaluate(()=>{const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(window.__previewState.send.target);return document.querySelector('[data-cqb-feature="send"] button').dataset.cqbTooltip.split('\n')[2]===`将于${time}发送所有聊天中的草稿，全部发送后将关闭定时发送`;}),'Send hint displays its armed reset time');
    await clickAndKeep(page.getByRole('button',{name:'刷新提醒',exact:true}),true);
    await page.waitForFunction(() => window.__cqbFeatures.status().volume.phase === 'checked');
    check(await page.locator('#cqb-volume-dialog,#cqb-volume-notice').count() === 0,'Normal volume enables silently without a dialog');
    check(await page.getByRole('button',{name:'刷新提醒',exact:true}).getAttribute('aria-pressed') === 'true','Refresh reminder enables without confirmation');
    check(await page.evaluate(()=>{const alarm=window.__previewState.refresh.alarm;const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(alarm.due);return alarm.due-alarm.reset===60000&&document.querySelector('[data-cqb-feature="refresh"] button').dataset.cqbTooltip.split('\n')[2]===`将于${time}播放音乐提醒`;}),'Refresh hint uses the actual playback time, reset plus one minute');
    const send = page.getByRole('button',{name:'定时发送',exact:true});
    await page.evaluate(()=>{const host=window.__cqbPreviewHost;window.__slowToggleHost=host;window.__cqbPreviewHost=(method,payload)=>method==='toggle'?new Promise(resolve=>setTimeout(()=>resolve(host(method,payload)),200)):host(method,payload)});
    await clickAndKeep(send,false);
    await page.evaluate(()=>{window.__cqbPreviewHost=window.__slowToggleHost});
    await page.evaluate(() => { const host=window.__cqbPreviewHost; window.__savedPreviewHost=host; window.__cqbPreviewHost=(method,payload) => { if(method==='toggle'&&payload.feature==='send')throw new Error('测试：尚未取得重置时间'); return host(method,payload); }; });
    await send.click(); await page.waitForFunction(() => document.querySelector('[data-cqb-feature="send"] button').dataset.cqbTooltip.includes('未开启'));
    check(await page.locator('#cqb-feature-message,dialog').count() === 0,'Scheduled-send failure stays in the bottom bar without a popup');
    check((await send.getAttribute('data-cqb-tooltip')).includes('尚未取得重置时间'),'Scheduled-send error remains readable in its status tooltip');
    await page.evaluate(() => { window.__cqbPreviewHost=window.__savedPreviewHost; });
    await page.evaluate(() => { window.__previewState.ringing='completion'; window.__previewState.completion.phase='ringing'; });
    await page.waitForFunction(() => window.__cqbFeatures.status().state.ringing === 'completion');
    await page.mouse.move(770,270); await page.waitForFunction(() => window.__previewCalls.some(v => v.method === 'interaction'));
    check(await page.evaluate(() => window.__previewState.ringing === null && window.__previewState.completion.enabled),'Mouse motion without a click stops music and keeps the switch');
    const selected = await page.locator('[data-cqb-feature="completion"] button').evaluate(n=>{const s=getComputedStyle(n);return{bg:s.backgroundColor,border:s.borderColor}});
    const channels = selected.bg.match(/[\d.]+/g).map(Number);
    check(channels[0]===channels[1]&&channels[1]===channels[2]&&channels[3]<=.1&&selected.border==='rgba(0, 0, 0, 0)','Selected buttons use a subtle neutral background without a bright border');
    const gap = await page.evaluate(()=>document.querySelector('[data-cqb-slot="credits"] .cqb-label').getBoundingClientRect().left-document.querySelector('[data-cqb-feature="refresh"] button').getBoundingClientRect().right);
    check(Math.abs(gap-10)<1,'Feature controls sit 10px from the purchased-credit label');
    check(await page.locator('#codex-bottom-bar-metrics [title],#codex-bottom-bar-metrics[title]').count()===0,'Skin hints never duplicate the custom tooltip with a system title');
    const tips = ['[data-cqb-feature="send"] button','[data-cqb-feature="completion"] button','[data-cqb-feature="refresh"] button','[data-cqb-slot="credits"] .cqb-value','[data-cqb-slot="fiveHour"] .cqb-time','[data-cqb-slot="weekly"] .cqb-time','[data-cqb-slot="resets"]'];
    for (const selector of tips) {
      const target = page.locator(selector); await target.hover();
      const tip = page.locator('#codex-bottom-bar-tooltip'); await tip.waitFor({state:'visible'});
      const expected = await target.evaluate(n=>n.closest('[data-cqb-tooltip]').dataset.cqbTooltip);
      const box = await tip.boundingBox();
      const actual = await tip.textContent();
      check(actual===expected&&box.x>=7&&box.x+box.width<=1600-7&&box.y+box.height<860,'Unified tooltip is complete and stays above the bar for '+selector+' '+JSON.stringify({actual,expected,box}));
      await page.mouse.move(600,200); await tip.waitFor({state:'detached'});
    }
    for(const kind of ['fiveHour','weekly']) {
      for(const child of ['.cqb-label','.cqb-value']) {
        await page.locator(`[data-cqb-slot="${kind}"] ${child}`).hover(); await page.waitForTimeout(500);
        check(await page.locator('#codex-bottom-bar-tooltip').count()===0,'No inherited quota tooltip on '+kind+' '+child);
      }
      const date=page.locator(`[data-cqb-slot="${kind}"] .cqb-time`);
      check(await date.getAttribute('data-cqb-tooltip')==='点击切换为剩余时间','Date hint has no saved-selection suffix or trailing comma');
      await date.click();check(await date.getAttribute('data-cqb-tooltip')==='点击切换为日期时间（北京时间）','Countdown hint has no saved-selection suffix or trailing comma');await date.click();
    }
    check(await page.locator('[data-cqb-slot="resets"]').getAttribute('data-cqb-tooltip')==='点击打开使用量页面','Exact available-resets tooltip');
    await page.locator('[data-cqb-slot="fiveHour"] .cqb-time').focus(); await page.keyboard.press('Tab');
    await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    check(await page.locator('[data-cqb-slot="weekly"] .cqb-time').getAttribute('aria-describedby')==='codex-bottom-bar-tooltip','Keyboard focus receives the same accessible tooltip');
    await page.locator('.conversation').dispatchEvent('scroll');
    check(await page.locator('#codex-bottom-bar-tooltip').count()===1,'Chat scrolling does not dismiss a fixed bottom-bar hint');
    await page.keyboard.press('Escape');
    check(await page.locator('#codex-bottom-bar-tooltip').count()===0&&await page.locator('[data-cqb-slot="weekly"] .cqb-time').getAttribute('aria-describedby')===null,'Escape dismisses hints and cleans up their accessibility link');
    await page.evaluate(()=>{window.__demoUsage.credits.balance='123456789012.34';window.__codexBottomBar.refresh();});
    check(await page.locator('[data-cqb-slot="credits"] .cqb-value').textContent()==='123456789012.34','Large purchased-credit balances remain complete without commas');
    for (const width of [1600,1440,1284,1024,640,480]) {
      await page.setViewportSize({width,height:900}); await page.waitForTimeout(100);
      const m = await page.evaluate(() => {
        const metrics = document.querySelector('#codex-bottom-bar-metrics'), bar = document.querySelector('#codex-bottom-bar-backdrop');
        const lines = [...metrics.querySelectorAll('.cqb-label,.cqb-value,.cqb-time,.cqb-feature-status,.cqb-feature-button')].map(n => { const r=n.getBoundingClientRect(); return r.y+r.height/2; });
        return {height:bar.getBoundingClientRect().height,span:Math.max(...lines)-Math.min(...lines),overflow:document.documentElement.scrollWidth>innerWidth,composer:document.querySelector('.composer').getBoundingClientRect().bottom,bottom:bar.getBoundingClientRect().top};
      });
      check(m.height === 40 && m.span < 1,'All navigation, buttons and quota text keep a single 40px row at '+width);
      check(!m.overflow && m.composer <= m.bottom + 1,'No document overflow or composer overlap at '+width);
      check(await page.locator('#codex-bottom-bar-metrics').evaluate(n=>{const children=[...n.children].map(c=>c.getBoundingClientRect());return children.every((r,i)=>!i||r.left>=children[i-1].right-1)&&n.querySelector('[data-cqb-slot="credits"] .cqb-value').getBoundingClientRect().width>0}),'Large balances never overlap adjacent controls at '+width);
    }
    await page.evaluate(()=>{window.__demoUsage.credits.balance='1234.5';window.__codexBottomBar.refresh();});
    await page.setViewportSize({width:1600,height:900}); await page.waitForTimeout(100);
    await page.screenshot({path:path.join(root,'preview-wide.png')});
    await page.locator('[data-cqb-feature="refresh"] button').hover(); await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    await page.screenshot({path:path.join(root,'preview-tooltips.png'),clip:{x:0,y:720,width:1600,height:180}});
    await page.setViewportSize({width:640,height:720}); await page.waitForTimeout(100);
    await page.screenshot({path:path.join(root,'preview-narrow.png')});
    await page.setViewportSize({width:1600,height:900});await page.locator('[data-cqb-slot="resets"]').hover();await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    await page.locator('#codex-bottom-bar-metrics').dispatchEvent('scroll');
    check(await page.locator('#codex-bottom-bar-tooltip').count()===0,'Scrolling the information row dismisses its tooltip');
    await page.mouse.move(600,200);await page.locator('[data-cqb-slot="resets"]').hover();await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    await page.evaluate(() => window.__codexBottomBar.dispose()); check(await page.locator('#codex-bottom-bar-features,#codex-bottom-bar-tooltip').count() === 0,'Restore disposes feature controls, tooltip and listeners');
    const english = await browser.newPage({viewport:{width:1440,height:900}});
    await english.goto(pathToFileURL(path.join(root,'preview.html')).href+'?lang=en&tz=America/New_York');
    await english.waitForFunction(()=>window.__cqbFeatures?.status().connected);
    check(await english.locator('[data-cqb-feature="send"] button').getAttribute('aria-label')==='Send on reset','Icon names remain accessible in English');
    for(const feature of ['send','completion','refresh']) {
      const button=english.locator(`[data-cqb-feature="${feature}"] button`);
      check((await button.getAttribute('data-cqb-tooltip')).split('\n')[1]==='Off','English off tooltip for '+feature);
      await button.click();
      check((await button.getAttribute('data-cqb-tooltip')).split('\n')[1]==='On','English on tooltip for '+feature);
    }
    check(await english.locator('#codex-bottom-bar-metrics').evaluate(node=>!/[\u4e00-\u9fff]/.test(node.textContent+[...node.querySelectorAll('[data-cqb-tooltip]')].map(n=>n.dataset.cqbTooltip).join(''))),'New controls and hints do not leak Chinese into English mode');
    check(await english.evaluate(()=>window.__codexBottomBar.status().timeZone)==='America/New_York','Playback hint and date buttons use the configured timezone');
    console.log(JSON.stringify({checks,passed:true,realDraftsSent:false}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
