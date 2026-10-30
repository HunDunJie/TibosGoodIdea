const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const {FeatureEngine}=await import(pathToFileURL(path.join(root,'feature-engine.mjs')).href);
  const base=Date.parse('2026-10-30T00:00:00Z');let now=base,rounds=0,claims=0;
  const engine=new FeatureEngine({now:()=>now,audio:{check:async()=>{},stop:async()=>{},play:async()=>{throw Error('This test must never play audio')}}});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:900}});
    await page.clock.setFixedTime(new Date(now));
    let queue=Promise.resolve();
    await page.exposeFunction('__resetHost',(method,payload)=>{
      const result=queue.then(async()=>{
        if(method==='observe')return engine.observe(payload);
        if(method==='toggle')return engine.toggle(payload.feature,payload.enabled);
        if(method==='claim-send'){claims++;return engine.claimSend()}
        if(method==='finish-send')return engine.finishSend(payload.id,payload.result);
        return engine.status();
      });queue=result.catch(()=>{});return result;
    });
    await page.exposeFunction('__resetSend',()=>{rounds++;return {sent:2,failed:0,skipped:0}});
    await page.goto(pathToFileURL(path.join(root,'preview.html')).href+'?lang=zh-CN&tz=UTC');
    await page.waitForFunction(()=>window.__cqbFeatures?.status().connected);
    await page.evaluate(()=>{
      window.__resetObserved=0;window.__resetPolls=0;
      window.__cqbPreviewHost=async(method,payload)=>{const result=await window.__resetHost(method,payload);if(method==='observe')window.__resetObserved=payload.updatedAt;return result};
      window.__codexBottomBar.quotaSample=()=>window.__resetSample;
      window.__codexBottomBar.refreshQuota=async()=>{window.__resetPolls++};
      window.__cqbNativeFeatures.sendRound=()=>window.__resetSend();
    });
    async function publish(at,resetsAt,remaining,availableResets){
      now=at;await page.clock.setFixedTime(new Date(now));
      await page.evaluate(sample=>{window.__resetSample=sample},{accountId:'reset-test-only',resetsAt,remaining,availableResets,updatedAt:now});
      await page.waitForFunction(stamp=>window.__resetObserved===stamp,now);
    }
    const send=page.locator('[data-cqb-feature="send"] button');
    const oldTarget=base+120000,newTarget=base+600000,finalTarget=base+1200000;
    await publish(base,oldTarget,0,2);await send.click();
    await page.waitForFunction(time=>window.__cqbFeatures.status().state.send.target===time,oldTarget);
    const roundId=engine.state.send.id;
    await publish(base+60000,newTarget,100,1);
    await page.waitForFunction(time=>window.__cqbFeatures.status().state.send.target===time,newTarget);
    await send.hover();await page.locator('#codex-bottom-bar-tooltip').waitFor({state:'visible'});
    const tooltip=await page.locator('#codex-bottom-bar-tooltip').textContent();
    assert.ok(tooltip.includes('00:10')&&!tooltip.includes('00:02'),'The open tooltip uses the new reset time');
    assert.equal(engine.state.send.id,roundId);
    await publish(oldTarget+1,newTarget,90,1);assert.equal(rounds,0);assert.equal(claims,0,'No send request at the old time');
    await publish(base+240000,null,100,0);
    await page.waitForFunction(()=>window.__cqbFeatures.status().state.send.target===null && window.__resetPolls>0);
    assert.ok((await send.getAttribute('data-cqb-tooltip')).includes('暂未取得刷新时间'));
    assert.equal(rounds,0);assert.equal(claims,0,'Missing reset time must not become an immediate send');
    await publish(base+300000,finalTarget,90,0);
    await page.waitForFunction(time=>window.__cqbFeatures.status().state.send.target===time,finalTarget);
    await publish(finalTarget+1,finalTarget+18000000,100,0);
    await page.waitForFunction(()=>window.__cqbFeatures.status().state.send.phase==='done');
    assert.equal(rounds,1);assert.equal(claims,1);assert.equal(engine.state.send.sent,2);
    await publish(finalTarget+60000,finalTarget+19000000,100,0);
    assert.equal(rounds,1);assert.equal(engine.state.send.phase,'done');
    console.log(JSON.stringify({passed:true,liveTooltipUpdated:true,oldTimeDidNotSend:true,missingTimePolled:true,nullTimeDidNotSend:true,naturalResetSentOnce:true,completedRoundStayedOff:true,realDraftsSent:false,audioPlayed:false}));
  } finally {await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
