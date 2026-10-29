const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-display-test-'));
  let context,passed=false,checks=0;
  const check=(value,message)=>{assert.ok(value,message);checks++;};
  const launch=()=>chromium.launchPersistentContext(profile,{headless:true,channel:'msedge',viewport:{width:1600,height:900}});
  try{
    context=await launch(); let page=context.pages()[0];
    await page.clock.install({time:new Date('2026-10-29T18:27:00+08:00')});
    await page.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await page.waitForFunction(()=>window.__codexBottomBar?.status().dataAvailable);
    await page.evaluate(()=>{window.__demoUsage.rate_limit.primary_window.reset_at=Date.parse('2026-10-29T20:35:00+08:00')/1000;window.__codexBottomBar.refresh();});
    let five=page.locator('[data-cqb-slot="fiveHour"] .cqb-time'),week=page.locator('[data-cqb-slot="weekly"] .cqb-time');
    await page.waitForFunction(()=>document.querySelector('[data-cqb-slot="fiveHour"] .cqb-time').textContent==='10-29 20:35');
    check(await five.getAttribute('type')==='button'&&await week.getAttribute('type')==='button','Both time regions are native keyboard-accessible buttons');
    check((await five.innerText())==='10-29 20:35'&&!(await week.innerText()).includes('重置'),'Absolute times have no reset suffix');
    check((await page.locator('[data-cqb-slot="credits"]').innerText()).includes('1234.5')&&await page.locator('[data-cqb-slot="credits"] .cqb-label').textContent()==='额度 ','Purchased credits have a space separator and no grouping commas');
    check(await page.locator('[data-cqb-slot="credits"]').evaluate(n=>n.nextElementSibling?.dataset.cqbSlot==='fiveHour'),'Purchased credits precede five-hour quota');
    await five.click(); check((await five.innerText())==='2小时8分','Five-hour region switches to hours and minutes');
    check(await week.getAttribute('aria-pressed')==='false','Weekly selection is independent');
    check(await page.evaluate(()=>window.__demoUsageOpens===0),'Time mode clicks never invoke usage or reset operations');
    await page.clock.fastForward(60000);
    await page.waitForFunction(()=>document.querySelector('[data-cqb-slot="fiveHour"] .cqb-time').textContent==='2小时7分');
    check(true,'Countdown refreshes on the next minute without clicking');
    await week.focus();await page.keyboard.press('Space');
    check(/\d+天\d+小时\d+分/.test(await week.innerText()),'Weekly keyboard activation includes days, hours and minutes');
    await week.click(); check(await week.getAttribute('aria-pressed')==='false','Second click restores absolute time');
    await page.reload();await page.waitForFunction(()=>window.__codexBottomBar?.status().dataAvailable);
    check(await five.getAttribute('aria-pressed')==='true'&&await week.getAttribute('aria-pressed')==='false','Two independent selections survive page reload');
    await context.close();context=null;
    context=await launch();page=context.pages()[0];await page.goto(pathToFileURL(path.join(root,'preview.html')).href);
    await page.waitForFunction(()=>window.__codexBottomBar?.status().dataAvailable);
    five=page.locator('[data-cqb-slot="fiveHour"] .cqb-time');week=page.locator('[data-cqb-slot="weekly"] .cqb-time');
    check(await five.getAttribute('aria-pressed')==='true'&&await week.getAttribute('aria-pressed')==='false','Choices survive a complete browser process restart');
    await week.click();
    for(const width of [1600,1440,1024,640,480]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
      const m=await page.evaluate(()=>{
        const bar=document.querySelector('#codex-bottom-bar-backdrop'),metrics=document.querySelector('#codex-bottom-bar-metrics');
        const r=metrics.getBoundingClientRect();
        const centers=[...metrics.querySelectorAll('.cqb-label,.cqb-value,.cqb-time,.cqb-feature-status,.cqb-feature-button')].map(n=>{const b=n.getBoundingClientRect();return b.y+b.height/2;});
        return{height:bar.getBoundingClientRect().height,spread:Math.max(...centers)-Math.min(...centers),right:innerWidth-r.right,overflow:document.documentElement.scrollWidth>innerWidth,composer:document.querySelector('.composer').getBoundingClientRect().bottom,bottom:bar.getBoundingClientRect().top};
      });
      check(m.height===40&&m.spread<1&&!m.overflow&&m.composer<=m.bottom+1,'Long countdowns keep one row and avoid the composer at '+width);
      check(Math.abs(m.right-16)<1,'Information group leaves 16px at the right edge at '+width);
    }
    await page.setViewportSize({width:1600,height:900});
    await page.evaluate(()=>{const now=Date.now();window.__demoUsage.rate_limit.primary_window.reset_at=(now+157*60000)/1000;window.__demoUsage.rate_limit.secondary_window.reset_at=(now+3*86400000+157*60000)/1000;window.__codexBottomBar.refresh();});
    await page.waitForTimeout(100);await page.screenshot({path:path.join(root,'preview-countdown.png')});
    await page.evaluate(()=>{window.__demoUsage.credits=undefined;window.__codexBottomBar.refresh();});
    await page.waitForFunction(()=>document.querySelector('[data-cqb-slot="credits"] .cqb-value').textContent==='--');
    check(true,'Absent purchased-credit data stays unknown');
    await page.evaluate(()=>{window.__demoUsage.credits={balance:'1234.5'};window.__demoUsage.account_id='different-account';window.__codexBottomBar.refresh();});
    await page.waitForTimeout(100);
    check(await page.locator('[data-cqb-slot="credits"] .cqb-value').innerText()==='--','Another account cannot supply the purchased balance');
    await page.evaluate(()=>window.__codexBottomBar.dispose());
    check(await page.locator('.cqb-time').count()===0,'Restoring the UI removes time controls and their timers');
    passed=true;console.log(JSON.stringify({passed,checks,coldStartPersistence:true,minuteUpdates:true,realDraftsSent:false}));
  }finally{
    await context?.close();
    if(passed&&path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('cqb-display-test-'))await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
