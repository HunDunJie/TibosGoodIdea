import {randomUUID} from 'node:crypto';
export function updateBusy(state,now=Date.now()) {
  if(state.send?.phase==='running')return 'sending';
  if(state.ringing)return 'ringing';
  if([state.alarm,state.nextAlarm,state.refresh?.alarm].some(a=>a && a.due<=now+120000))return 'alarm-near';
  return null;
}
export class UpdateLease {
  constructor({now=Date.now}={}){this.now=now;this.lease=null;}
  current(){if(this.lease?.expiresAt<=this.now())this.lease=null;return this.lease;}
  prepare(state){const busy=updateBusy(state,this.now());if(busy)throw Error('Update deferred: '+busy);if(this.current())throw Error('Update already preparing');return this.lease={token:randomUUID(),expiresAt:this.now()+30000};}
  confirm(token,state){if(!this.current()||token!==this.lease.token)throw Error('Update lease expired');const busy=updateBusy(state,this.now());if(busy){this.lease=null;throw Error('Update deferred: '+busy);}return true;}
  cancel(token){if(this.current()?.token===token)this.lease=null;}
}
