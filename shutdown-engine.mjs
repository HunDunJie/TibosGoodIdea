import {randomUUID} from 'node:crypto';
export const CHECK_MS=180000, COUNTDOWN_MS=300000;
const sending=s=>['armed','running'].includes(s?.phase);
export class ShutdownEngine {
  constructor({scheduler,save=async()=>{},now=Date.now,notice=async()=>{}}){
    this.scheduler=scheduler;this.save=save;this.now=now;this.notice=notice;
    this.state={enabled:false,phase:'off',plan:null,request:null,cleanupPending:false};this.lastTick=this.now();this.networkSince=null;this.cancelEpoch=0;
  }
  status(){return {...this.state};}
  async commit(){await this.save(this.state);}
  async revoke(){
    const needsCleanup=this.state.plan||this.state.cleanupPending;this.state.plan=null;this.state.request=null;await this.commit();
    if(needsCleanup){await this.scheduler.cancel();this.state.cleanupPending=false;await this.commit();}
  }
  async disable(){
    this.cancelEpoch++;
    this.state.enabled=false;this.state.phase='off';this.networkSince=null;
    try{await this.revoke();delete this.state.error;}catch{this.state.error='关机计划清理失败，旧计划已作废';}
    await this.commit();return this.status();
  }
  async toggle(enabled,send){
    if(typeof enabled!=='boolean')throw Error('无效开关状态');
    if(!enabled)return this.disable();
    await this.disable();await this.scheduler.cancel();
    this.state={enabled:true,phase:sending(send)?'paused':'waiting',plan:null,request:null,cleanupPending:false,nextCheck:this.now()};
    await this.commit();await this.tick(send);return this.status();
  }
  request(final=false){this.state.request={id:randomUUID(),issuedAt:this.now(),final,cancelEpoch:this.cancelEpoch};}
  async heartbeat(send){this.heartbeatAt=this.now();await this.tick(send);return this.status();}
  async tick(send){
    const now=this.now(),gap=now-this.lastTick;this.lastTick=now;
    if(!this.state.enabled)return;
    if(sending(send)){
      if(this.state.phase!=='paused'||this.state.plan||this.state.request){await this.revoke();this.state.phase='paused';this.networkSince=null;await this.commit();}return;
    }
    if(this.state.phase==='paused'){this.state.phase='waiting';this.state.nextCheck=now;}
    if(gap>30000||gap<0||!this.heartbeatAt||now-this.heartbeatAt>20000){
      if(this.state.plan||this.state.request)await this.revoke();
      this.state.phase='waiting';this.state.error='等待 Codex 连接后重新检查';this.state.nextCheck=now;this.networkSince=null;return;
    }
    if(this.state.request){
      if(now-this.state.request.issuedAt>30000){await this.revoke();this.state.phase='waiting';this.state.error='任务状态检查超时';this.state.nextCheck=now+CHECK_MS;this.networkSince=null;await this.commit();}return;
    }
    if(this.state.phase==='executing'||this.state.phase==='failed')return;
    if(this.state.plan&&now>=this.state.plan.due){this.request(true);await this.commit();}
    else if(now>=(this.state.nextCheck??0)){this.request();await this.commit();}
  }
  async report({id,snapshot,network},send){
    const request=this.state.request,now=this.now();
    if(!this.state.enabled||!request||request.id!==id)return this.status();
    if(sending(send)){await this.tick(send);return this.status();}
    // A cancel command may have arrived while this report was waiting in the queue.
    if(request.cancelEpoch!==this.cancelEpoch){await this.revoke();this.state.phase='waiting';this.state.nextCheck=now+CHECK_MS;await this.commit();return this.status();}
    if(now-request.issuedAt>30000||!this.heartbeatAt||now-this.heartbeatAt>20000)return this.status();
    this.state.request=null;this.state.nextCheck=now+CHECK_MS;
    const known=snapshot?.known===true&&typeof snapshot.busy==='boolean'&&typeof snapshot.localSafe==='boolean';
    let blocked=false;
    if(known&&snapshot.busy&&snapshot.localSafe&&network?.available===false){
      if(this.networkSince===null)this.networkSince=now;
      blocked=now-this.networkSince>=CHECK_MS;
    }else this.networkSince=null;
    const eligible=known&&(!snapshot.busy||blocked);
    if(!eligible){
      await this.revoke();this.state.phase='waiting';
      this.state.reason=known?'busy':'unknown';this.state.error=known?null:'无法确认所有聊天状态，暂不关机';
    }else if(request.final&&this.state.plan&&now>=this.state.plan.due){
      // The worker serializes cancellation, send toggles and this final decision.
      const epoch=this.cancelEpoch;this.state.phase='executing';await this.commit();
      if(epoch!==this.cancelEpoch){await this.revoke();this.state.phase='waiting';this.state.nextCheck=this.now()+CHECK_MS;await this.commit();return this.status();}
      try{await this.scheduler.execute();this.state.enabled=false;await this.revoke().catch(()=>{});}
      catch{this.state.enabled=false;await this.revoke().catch(()=>{});this.state.phase='failed';this.state.error='Windows 未能执行关机，请检查系统权限或其他关机计划';}
    }else if(!this.state.plan){
      this.state.plan={id:randomUUID(),due:now+COUNTDOWN_MS};this.state.cleanupPending=true;this.state.phase='countdown';this.state.reason=blocked?'network':'idle';this.state.error=null;
      await this.commit();
      try{await this.scheduler.schedule(this.state.plan);await this.notice(this.state.plan);}
      catch{this.state.enabled=false;await this.revoke().catch(()=>{});this.state.phase='failed';this.state.error='无法创建 Windows 关机计划，请检查任务计划服务';}
    }
    await this.commit();return this.status();
  }
  async fire(id,send){
    if(this.state.enabled&&this.state.plan?.id===id&&this.now()>=this.state.plan.due){await this.tick(send);}
    return this.status();
  }
}

export async function checkShutdownNetwork({cdp}={}){
  // Use the client's Chromium session and proxy settings, never Node's unrelated direct route.
  let frameId;try{frameId=(await cdp.call('Page.getFrameTree')).frameTree.frame.id;}catch{return {available:null};}
  if(typeof frameId!=='string'||!frameId)return {available:null};
  const results=await Promise.all(['https://cdn.openai.com/','https://persistent.oaistatic.com/'].map(async url=>{
    try{
      const {resource:r}=await cdp.call('Network.loadNetworkResource',{frameId,url,options:{disableCache:true,includeCredentials:false}});
      // Do not read response headers/body, cookies, account data or message contents.
      if(r?.stream)await cdp.call('IO.close',{handle:r.stream}).catch(()=>{});
      if(Number.isInteger(r?.httpStatusCode)&&r.httpStatusCode>=100)return r.httpStatusCode<500;
      if(r?.success===false&&Number.isFinite(r.netError)&&r.netError<0&&!['net::ERR_ABORTED','net::ERR_BLOCKED_BY_CLIENT','net::ERR_BLOCKED_BY_CSP'].includes(r.netErrorName))return false;
      return null;
    }catch{return null;}
  }));
  return {available:results.some(v=>v===true)?true:results.every(v=>v===false)?false:null};
}
