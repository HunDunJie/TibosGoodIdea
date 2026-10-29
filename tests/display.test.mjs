import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {normalize,creditBalance,creditText,resetDate,countdown}=createRequire(import.meta.url)('../bottom-bar.js');

test('purchased credit balance is separate from window percentages and reset inventory',()=>{
  const data=normalize({credits:{balance:'1234.56789'},rate_limit_reset_credits:{available_count:3},rate_limit:{primary_window:{limit_window_seconds:18000,used_percent:41}}});
  assert.equal(data.creditBalance,1234.56789); assert.equal(data.resets,3); assert.equal(data.fiveHour.remaining,59);
  assert.equal(creditText(data.creditBalance),'1234.57');
});
test('zero credits remain zero; absent and malformed balances remain unknown',()=>{
  assert.equal(normalize({credits:{balance:'0'}}).creditBalance,0); assert.equal(creditText(0),'0');
  for (const value of [null,undefined,'', ' ',true,false,-1,'-1','Infinity',Infinity,NaN,'invalid']) assert.equal(creditBalance(value),null);
  assert.equal(creditText(null),'--'); assert.equal(creditText(null,true),'不限');
  assert.equal(normalize({rate_limit_reset_credits:{available_count:9}}).creditBalance,null);
});
test('absolute reset times use Beijing time with no reset suffix',()=>{
  assert.equal(resetDate(Date.parse('2026-10-29T13:35:00Z')),'10-29 21:35');
  assert.equal(resetDate(null),'时间暂不可用');
});
test('five-hour countdown includes total hours and minutes; weekly includes days, hours and minutes',()=>{
  const now=Date.parse('2026-10-29T18:27:00+08:00');
  assert.equal(countdown(now+(2*60+37)*60000,'fiveHour',now),'2小时37分');
  assert.equal(countdown(now+(3*24*60+2*60+37)*60000,'weekly',now),'3天2小时37分');
  assert.equal(countdown(now+27*3600000,'fiveHour',now),'27小时0分');
});
test('each minute reduces countdown correctly across hour and day boundaries',()=>{
  const now=Date.parse('2026-10-29T18:27:00+08:00'),target=now+24*3600000;
  assert.equal(countdown(target,'weekly',now),'1天0小时0分');
  assert.equal(countdown(target,'weekly',now+60000),'0天23小时59分');
  assert.equal(countdown(target,'fiveHour',now+60000),'23小时59分');
});
test('sub-minute remainder is not shown as zero; elapsed cycles wait for authoritative new data',()=>{
  const now=Date.parse('2026-10-29T18:27:00+08:00');
  assert.equal(countdown(now+1,'fiveHour',now),'0小时1分');
  assert.equal(countdown(now,'fiveHour',now),'等待刷新');
  assert.equal(countdown(now-1,'weekly',now),'等待刷新');
  assert.equal(countdown(null,'weekly',now),'时间暂不可用');
});
