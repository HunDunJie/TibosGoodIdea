const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  let checks = 0, realVolumeRead = false;
  const check = (value,message) => { assert.ok(value,message); checks++; };
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await page.waitForFunction(() => window.__cqbFeatures?.status().connected);
    const refresh = page.getByRole('button',{name:'刷新提醒',exact:true}), completion = page.getByRole('button',{name:'完成提醒',exact:true}), notice = page.locator('#cqb-volume-notice');
    const queries = () => page.evaluate(() => window.__previewCalls.filter(c => c.method === 'volume-status').length);
    async function enable(volume) {
      if (await refresh.getAttribute('aria-pressed') === 'true') await refresh.click();
      await page.evaluate(value => { window.__previewVolume = value; },volume);
      await refresh.click();
      await page.waitForFunction(() => ['checked','unavailable'].includes(window.__cqbFeatures.status().volume.phase));
    }
    await page.waitForFunction(()=>window.__cqbFeatures.status().volume.phase==='checked');
    check(await queries() === 1 && (await notice.innerText()).includes('50%'),'Startup checks volume after the shell is fully displayed');
    for(const feature of ['completion','refresh'])check((await page.locator(`[data-cqb-feature="${feature}"]`).getAttribute('data-cqb-tooltip')).includes('50%'),'Both reminder tooltips show current volume: '+feature);
    await enable({percent:50,muted:false});
    check((await notice.innerText()).includes('50%') && await page.locator('dialog').count() === 0,'Normal volume appears as a nonmodal reminder');
    check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '刷新提醒'),'Checking volume does not move keyboard focus');
    await enable({percent:1,muted:false}); check(!(await notice.innerText()).includes('低于'),'Exactly 1% is not below the threshold');
    await enable({percent:0.99,muted:false});
    check((await notice.innerText()).includes('低于 1%'),'Below 1% warns');
    check(await notice.locator('button,input,a').count() === 0 && await notice.getAttribute('role') === 'status','Notice has no required controls or modal role');
    check(await notice.evaluate(n => getComputedStyle(n).pointerEvents === 'none'),'Notice does not intercept mouse input');
    check(await refresh.getAttribute('aria-pressed') === 'true','Low volume does not cancel enabling');
    check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '刷新提醒'),'Low-volume warning does not steal focus');
    const count = await queries();
    await notice.waitFor({state:'detached',timeout:8000});
    check(await queries() === count,'Background polling does not repeat the volume check');
    check(await refresh.getAttribute('aria-pressed') === 'true','Automatic dismissal keeps reminder enabled');
    await enable({percent:75,muted:true}); check((await notice.innerText()).includes('已静音'),'Mute warns even at high slider volume');
    await page.screenshot({path:path.join(root,'preview-volume-warning.png')});
    if(process.env.TIBO_VOLUME_QA_IMAGE)await page.screenshot({path:process.env.TIBO_VOLUME_QA_IMAGE});
    await refresh.click(); check(await notice.count() === 0,'Disabling removes the notice immediately');
    check(await queries() === count+1,'Disabling does not query volume');
    await enable({percent:0,muted:false}); check((await notice.innerText()).includes('低于 1%'),'Zero volume warns');
    await refresh.click();
    await page.evaluate(()=>{window.__previewVolume={percent:37,muted:false}});await completion.click();
    await page.waitForFunction(()=>window.__cqbFeatures.status().volume.context==='completion'&&window.__cqbFeatures.status().volume.phase==='checked');
    check((await notice.innerText()).includes('37%'),'Completion reminders also check and show volume');
    for(const feature of ['completion','refresh'])check((await page.locator(`[data-cqb-feature="${feature}"]`).getAttribute('data-cqb-tooltip')).includes('37%'),'Latest volume is shared by both reminder tooltips: '+feature);
    await completion.click();
    await page.evaluate(()=>{window.__previewVolume={percent:80,muted:true}});await completion.click();
    await page.waitForFunction(()=>window.__cqbFeatures.status().volume.muted===true);
    check((await notice.innerText()).includes('已静音'),'Completion reminders warn when audio is muted');await completion.click();
    const beforeReattach=await queries();await page.addScriptTag({path:path.join(root,'feature-ui.js')});
    await page.waitForFunction(()=>window.__cqbFeatures?.status().connected);await page.waitForTimeout(700);
    check(await queries()===beforeReattach,'Reattaching the toolbar does not repeat the startup volume notice');
    await page.evaluate(() => {
      const original = window.__cqbPreviewHost;
      window.__cqbPreviewHost = (method,payload) => method === 'volume-status' ? Promise.reject(new Error('device unavailable')) : original(method,payload);
    });
    await refresh.click(); await page.waitForFunction(() => window.__cqbFeatures.status().volume.phase === 'unavailable');
    check(await refresh.getAttribute('aria-pressed') === 'true' && await page.locator('#cqb-volume-notice,dialog').count() === 0 && (await refresh.getAttribute('data-cqb-tooltip')).includes('无法读取'),'Read failure neither disables nor invents a zero-volume warning');
    await refresh.click();
    await page.evaluate(() => {
      const original = window.__cqbPreviewHost;
      window.__cqbPreviewHost = (method,payload) => method === 'volume-status' ? new Promise(resolve => { window.__resolveVolume = resolve; }) : original(method,payload);
    });
    await refresh.click(); await page.waitForFunction(() => !!window.__resolveVolume);
    await refresh.click(); await page.evaluate(() => window.__resolveVolume({percent:0,muted:true}));
    check(await notice.count() === 0 && await refresh.getAttribute('aria-pressed') === 'false','Late volume response cannot warn after reminder was disabled');
    check(await page.evaluate(() => !window.__previewCalls.some(c => c.method === 'sound-settings')),'Enabling never opens sound settings');
    // Read the user's real Windows endpoint, without playing or changing anything.
    if (process.platform === 'win32') {
      const {readSystemVolume} = await import(pathToFileURL(path.join(root,'audio-client.mjs')).href);
      try {
        const actual = await readSystemVolume();
        check(actual.percent >= 0 && actual.percent <= 100 && typeof actual.muted === 'boolean','Real Windows volume data is valid'); realVolumeRead = true;
      } catch (error) { check(error.message === '暂时无法读取系统音量','Headless Windows runner may lack an audio endpoint'); }
    }
    await page.evaluate(() => window.__codexBottomBar.dispose());
    check(await page.locator('#cqb-volume-notice').count() === 0,'Restore removes volume UI');
    const startupPage=await browser.newPage();
    await startupPage.addInitScript(()=>Object.defineProperty(window,'__previewVolume',{get:()=>({percent:0.5,muted:true}),set(){}}));
    await startupPage.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await startupPage.waitForFunction(()=>window.__cqbFeatures.status().volume.phase==='checked');
    check(await startupPage.evaluate(()=>document.readyState==='complete'&&window.__cqbFeatures.status().volume.context==='startup'),'Startup check waits for the complete document');
    check((await startupPage.locator('#cqb-volume-notice').innerText()).includes('已静音')&&(await startupPage.locator('#cqb-volume-notice').innerText()).includes('0.5%'),'A new startup warns about muted audio and displays its level');
    for(const [language,expected] of [['en','muted'],['ja','ミュート']]){
      await startupPage.evaluate(value=>document.documentElement.lang=value,language);
      await startupPage.waitForFunction(value=>window.__codexBottomBar.status().language===value,language);
      check((await startupPage.locator('#cqb-volume-notice').innerText()).includes(expected)&&(await startupPage.locator('#cqb-volume-notice').innerText()).includes('0.5%'),'Volume notices translate without losing values: '+language);
    }
    await startupPage.close();
    const unavailablePage=await browser.newPage();await unavailablePage.addInitScript(()=>Object.defineProperty(window,'__previewVolume',{get:()=>null,set(){}}));
    await unavailablePage.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await unavailablePage.waitForFunction(()=>window.__cqbFeatures.status().volume.phase==='unavailable');
    check((await unavailablePage.locator('#cqb-volume-notice').innerText()).includes('无法读取'),'Startup read failures show an explicit notice instead of silently consuming the startup check');
    await unavailablePage.close();
    const hiddenPage=await browser.newPage();
    await hiddenPage.addInitScript(()=>{window.__testVisible=false;Object.defineProperty(document,'visibilityState',{get:()=>window.__testVisible?'visible':'hidden'});});
    await hiddenPage.goto(pathToFileURL(path.join(root,'preview.html')).href);await hiddenPage.waitForTimeout(2300);
    check(await hiddenPage.evaluate(()=>!window.__cqbStartupVolumeChecked&&window.__previewCalls.filter(c=>c.method==='volume-status').length===0),'A hidden startup does not consume the volume notice');
    await hiddenPage.evaluate(()=>{window.__testVisible=true});await hiddenPage.waitForFunction(()=>window.__cqbFeatures.status().volume.phase==='checked');
    check((await hiddenPage.locator('#cqb-volume-notice').innerText()).includes('50%'),'The startup notice appears when the window becomes visible');
    await hiddenPage.close();
    console.log(JSON.stringify({passed:true,checks,realVolumeRead,volumeChanged:false,audioPlayed:false}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
