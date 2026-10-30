import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url));
export class WindowsShutdown {
  constructor(stateDir,{run=execute,awake=async()=>{}}={}){this.stateDir=stateDir;this.run=run;this.awake=awake;}
  async task(action,plan){
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(here,'shutdown-task.ps1'),'-Action',action,'-StateDir',this.stateDir];
    if(plan)args.push('-PlanId',plan.id,'-Due',String(plan.due));
    try{await this.run('powershell.exe',args,{windowsHide:true,timeout:15000,maxBuffer:8192});}
    catch{throw Error('无法访问 Windows 任务计划服务');}
  }
  async schedule(plan){await this.task('schedule',plan);await this.awake(true);}
  async cancel(){try{await this.task('cancel');}finally{await this.awake(false);}}
  async execute(){
    // Absolute system executable, no shell or user-supplied command; fail visibly on nonzero exit.
    await this.run(path.join(process.env.SystemRoot??'C:/Windows','System32','shutdown.exe'),['/s','/f','/t','0'],{windowsHide:true,timeout:10000,maxBuffer:8192});
  }
}
