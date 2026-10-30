import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(process.platform!=='win32'){console.log('Windows installer test skipped');process.exit(0);}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-install-test-'));
const target=path.join(temp,'installed'), config=path.join(target,'config.local.json');
let checks=0,passed=false;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function run(exe,args,{cwd=root,expected=0,verbatim=false}={}){
  const child=spawn(exe,args,{cwd,windowsHide:true,windowsVerbatimArguments:verbatim,stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
  const timer=setTimeout(()=>child.kill(),45000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  clearTimeout(timer);
  if(expected===0)assert.equal(code,0,`${path.basename(exe)}: ${(err||out).slice(-1800)}`);else assert.notEqual(code,0,'Invalid operation must fail');
  return out;
}
const ps=(script,args=[],expected=0)=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(root,script),...args],{expected});
async function snapshot(names,folder=target){return Object.fromEntries(await Promise.all(names.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(folder,name))).digest('hex')])));}
try{
  await ps('install.ps1',['-TargetDir',target,'-NoShortcut']);
  const names=JSON.parse(await fs.readFile(path.join(root,'release-files.json'),'utf8'));
  for(const name of names)check((await fs.stat(path.join(target,name))).isFile(),'Installed '+name);
  const initial=await fs.readFile(config);check(initial[0]!==0xef,'Settings JSON has no BOM');
  check(JSON.parse(initial).language==='auto','System language is the installation default');
  const external=path.join(temp,'my-sound.wav');await fs.copyFile(path.join(root,'sounds/completion.wav'),external);
  const initialConfig=JSON.parse(initial);initialConfig.ownProperty='preserve me';await fs.writeFile(config,JSON.stringify(initialConfig));
  await ps('settings.ps1',['-NoUi','-ConfigPath',config,'-TimeZone','UTC','-CompletionAudio',external]);
  const saved=await fs.readFile(config,'utf8'),settings=JSON.parse(saved);
  check(settings.language==='auto'&&settings.timeZone==='UTC'&&settings.completionAudio===external,'Automatic language, time zone and WAV settings save');
  check(settings.ownProperty==='preserve me','Unknown settings survive save');
  check(JSON.parse(await fs.readFile(config+'.bak','utf8')).language==='auto','Prior settings are backed up');
  await ps('settings.ps1',['-NoUi','-ConfigPath',config,'-TimeZone','Invalid/Somewhere'],1);
  check(await fs.readFile(config,'utf8')===saved,'Invalid settings do not overwrite valid settings');
  check(!await fs.stat(config+'.pending').catch(()=>null),'Failed candidate is cleaned');
  const sentinel=path.join(target,'my-notes.txt');await fs.writeFile(sentinel,'mine');
  await ps('install.ps1',['-TargetDir',target,'-NoShortcut']);
  check(await fs.readFile(config,'utf8')===saved,'Upgrade preserves buyer settings');
  check(await fs.readFile(sentinel,'utf8')==='mine','Upgrade preserves unknown files');
  // A live bundled runtime must be detected before the first installed script changes.
  await fs.writeFile(path.join(target,'Start.cmd'),'@echo rollback sentinel\r\n');
  const before=await snapshot([...names,'install-info.json','config.local.json']);
  const busy=spawn(path.join(target,'runtime/node.exe'),['-e','console.log("ready");setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{busy.stdout.once('data',resolve);busy.once('error',reject)});
    await ps('install.ps1',['-TargetDir',target,'-NoShortcut'],1);
    check(JSON.stringify(await snapshot(Object.keys(before)))===JSON.stringify(before),'Busy upgrade changes no installed bytes or marker');
  } finally {await new Promise(resolve=>{busy.once('exit',resolve);busy.kill()});}
  // Force a late copy error after the first file was overwritten, then inspect every byte.
  const failing=path.join(temp,'fail-copy.ps1');
  const quote=value=>`([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value,'utf8').toString('base64')}')))`;
  const failingScript=(folder,relative)=>'\ufeff'+`$global:TiboCopyFailed=$false\nfunction Copy-Item {\n[CmdletBinding()]param([string]$LiteralPath,[string]$Destination,[switch]$Force)\nif($Destination -eq ${quote(path.join(folder,relative))} -and -not $global:TiboCopyFailed){$global:TiboCopyFailed=$true;throw 'Injected late copy failure'}\nMicrosoft.PowerShell.Management\\Copy-Item @PSBoundParameters\n}\n& ${quote(path.join(root,'install.ps1'))} -TargetDir ${quote(folder)} -NoShortcut\n`;
  await fs.writeFile(failing,failingScript(target,'Settings.cmd'));
  await ps(failing,[],1);
  check(JSON.stringify(await snapshot(Object.keys(before)))===JSON.stringify(before),'Failed upgrade rolls back every installed byte and marker');
  await ps('install.ps1',['-TargetDir',target,'-NoShortcut']);
  check(await fs.readFile(config,'utf8')===saved,'Upgrade still succeeds after rollback');
  const freshFailure=path.join(temp,'fresh failure');
  await fs.writeFile(failing,failingScript(freshFailure,'sounds/completion.wav'));
  await ps(failing,[],1);
  check(!await fs.stat(freshFailure).catch(()=>null),'Failed first install removes only its newly created files and empty folders');
  const unmanaged=path.join(temp,'unmanaged');await fs.mkdir(unmanaged);await fs.writeFile(path.join(unmanaged,'mine.txt'),'mine');
  await ps('install.ps1',['-TargetDir',unmanaged,'-NoShortcut'],1);
  check(await fs.readFile(path.join(unmanaged,'mine.txt'),'utf8')==='mine','Non-owned installation target is rejected');
  const marker=path.join(target,'install-info.json'),markerText=await fs.readFile(marker,'utf8');
  const tampered=JSON.parse(markerText);tampered.files.push('../my-sound.wav');await fs.writeFile(marker,JSON.stringify(tampered));
  await ps('uninstall.ps1',['-TargetDir',target,'-NoShortcut','-NoServiceChanges','-BackupDir',path.join(temp,'backup')],1);
  check((await fs.stat(external)).isFile()&&(await fs.stat(path.join(target,'Start.cmd'))).isFile(),'Unsafe uninstall paths abort before deleting files');
  await fs.writeFile(marker,markerText);
  if(process.env.CQB_SETTINGS_RENDER){const languageState=path.join(temp,'language-state');await fs.mkdir(languageState);await fs.writeFile(path.join(languageState,'codex-language.json'),JSON.stringify({language:'ja'}));await ps('settings.ps1',['-ConfigPath',config,'-StateDir',languageState,'-RenderTo',path.resolve(process.env.CQB_SETTINGS_RENDER)]);check(true,'Japanese settings render without a window or language selector');}
  await ps('uninstall.ps1',['-TargetDir',target,'-NoShortcut','-StateDir',path.join(temp,'absent-worker'),'-BackupDir',path.join(temp,'backup')]);
  check(!await fs.stat(path.join(target,'Start.cmd')).catch(()=>null),'Managed files removed');
  check(await fs.readFile(sentinel,'utf8')==='mine','Uninstall preserves custom files');
  check((await fs.stat(external)).isFile(),'External music preserved');
  check(await fs.readFile(path.join(temp,'backup/config.local.json'),'utf8')===saved,'Uninstall backs up final settings');
  await ps('control-reminders.ps1',['-Action','stop','-StateDir',path.join(temp,'absent-worker')]);
  check(true,'Stopping an absent reminder service is a successful no-op');
  // Exercise the real shortcut branch inside a private shell directory, never the desktop.
  const shellRoot=path.join(temp,'shell'),first=path.join(temp,'first install'),second=path.join(temp,'second install');
  await ps('install.ps1',['-TargetDir',first,'-ShortcutRoot',shellRoot]);
  await ps('install.ps1',['-TargetDir',second,'-ShortcutRoot',shellRoot]);
  const desktopLink=path.join(shellRoot,'Desktop','Tibo’s Good Idea.lnk');
  const uninstallLink=path.join(shellRoot,'Programs','Tibo’s Good Idea','Uninstall.lnk');
  const readLink=path.join(temp,'read-link.ps1');
  await fs.writeFile(readLink,'\ufeff'+`$link=(New-Object -ComObject WScript.Shell).CreateShortcut(${quote(uninstallLink)});@{target=$link.TargetPath;cwd=$link.WorkingDirectory}|ConvertTo-Json -Compress\n`);
  const link=JSON.parse(await ps(readLink));
  check(link.target===path.join(second,'Uninstall.cmd')&&!link.cwd.toLowerCase().startsWith(second.toLowerCase()),'Uninstall shortcut starts outside the managed folder');
  await ps(path.join(first,'uninstall.ps1'),['-StateDir',path.join(temp,'absent-worker'),'-BackupDir',path.join(temp,'first-backup')]);
  check((await fs.stat(desktopLink)).isFile()&&(await fs.stat(uninstallLink)).isFile(),'Uninstalling the older copy preserves the newer copy shortcuts');
  check(!await fs.stat(first).catch(()=>null),'Unused install folder is completely removed');
  await run('cmd.exe',['/d','/s','/c',`""${path.join(second,'Uninstall.cmd')}" -StateDir "${path.join(temp,'absent-worker')}" -BackupDir "${path.join(temp,'second-backup')}""`],{cwd:second,verbatim:true});
  check(!await fs.stat(second).catch(()=>null),'CMD launched inside its own install folder removes the complete folder');
  check(!await fs.stat(desktopLink).catch(()=>null)&&!await fs.stat(uninstallLink).catch(()=>null),'Owned desktop and uninstall shortcuts are removed');
  const chinese=path.join(temp,'Chinese launcher install');
  await ps('install.ps1',['-TargetDir',chinese,'-NoShortcut']);
  await run('cmd.exe',['/d','/s','/c',`""${path.join(chinese,'卸载.cmd')}" -NoShortcut -StateDir "${path.join(temp,'absent-worker')}" -BackupDir "${path.join(temp,'chinese-backup')}""`],{cwd:chinese,verbatim:true});
  check(!await fs.stat(chinese).catch(()=>null),'Chinese uninstall launcher also exits cleanly after removing itself');
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const closedPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  // Reboot/crash leftovers must not require launching Codex just to uninstall.
  for(const [label,pid] of [['dead',999999999],['reused',process.pid]]){
    const folder=path.join(temp,'stale-'+label),stateDir=path.join(temp,'state-'+label),backup=path.join(temp,'backup-'+label);
    await ps('install.ps1',['-TargetDir',folder,'-NoShortcut']);
    const settings=await fs.readFile(path.join(folder,'config.local.json'),'utf8');
    await fs.mkdir(stateDir);await fs.writeFile(path.join(stateDir,'controller.json'),JSON.stringify({pid,packageRoot:folder,port:closedPort,installed:1,scripts:{fixture:'stale-script'}}));
    await ps(path.join(folder,'uninstall.ps1'),['-NoShortcut','-StateDir',stateDir,'-BackupDir',backup]);
    check(!await fs.stat(folder).catch(()=>null),'Closed Codex uninstalls with '+label+' cached PID');
    check(await fs.readFile(path.join(backup,'config.local.json'),'utf8')===settings,'Stale controller uninstall preserves settings backup');
    check(!await fs.stat(path.join(stateDir,'stop.flag')).catch(()=>null),'Stale PID never receives a cooperative stop request');
  }
  // An HTTP error from a live endpoint is not proof that the client is closed.
  const broken=path.join(temp,'broken-endpoint-install'),brokenState=path.join(temp,'broken-endpoint-state');
  await ps('install.ps1',['-TargetDir',broken,'-NoShortcut']);await fs.mkdir(brokenState);
  const badServer=http.createServer((req,res)=>{res.writeHead(503);res.end('unavailable')});
  await new Promise(resolve=>badServer.listen(0,'127.0.0.1',resolve));
  try {
    await fs.writeFile(path.join(brokenState,'controller.json'),JSON.stringify({pid:999999999,packageRoot:broken,port:badServer.address().port,scripts:{fixture:'stale'}}));
    const prior=await snapshot([...names,'config.local.json','install-info.json'],broken);
    await ps(path.join(broken,'uninstall.ps1'),['-NoShortcut','-StateDir',brokenState],1);
    check(JSON.stringify(await snapshot(Object.keys(prior),broken))===JSON.stringify(prior),'Live endpoint errors still abort before deleting installed files');
  } finally {await new Promise(resolve=>badServer.close(resolve));}
  await fs.writeFile(path.join(brokenState,'controller.json'),JSON.stringify({pid:999999999,packageRoot:broken,port:closedPort}));
  const lockerFile=path.join(temp,'hold-state.ps1');
  await fs.writeFile(lockerFile,'\ufeff'+`$handle=[IO.File]::Open(${quote(path.join(brokenState,'controller.json'))},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\ntry {Write-Output 'locked';Start-Sleep -Milliseconds 500} finally {$handle.Dispose()}\n`);
  const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',lockerFile],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const lockerExit=new Promise((resolve,reject)=>{locker.once('exit',resolve);locker.once('error',reject)});
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('State lock was not acquired')),5000);locker.stdout.once('data',()=>{clearTimeout(timer);resolve()});locker.once('error',e=>{clearTimeout(timer);reject(e)})});
    await run(path.join(broken,'runtime/node.exe'),[path.join(broken,'controller.mjs'),'--port',String(closedPort),'--state-dir',brokenState,'--restore-once']);
    check(JSON.parse(await fs.readFile(path.join(brokenState,'controller.json'),'utf8')).stopped===true,'State replacement survives a transient Windows read lock');
  } finally {assert.equal(await lockerExit,0,'The isolated read-lock holder exited');}
  await ps(path.join(broken,'uninstall.ps1'),['-NoShortcut','-StateDir',brokenState,'-BackupDir',path.join(temp,'broken-backup')]);
  check(!await fs.stat(broken).catch(()=>null),'Uninstall can retry after the unavailable endpoint is closed');
  passed=true;console.log(JSON.stringify({passed,checks,isolatedDirectory:true,realShortcutsChanged:false,liveServicesChanged:false,absentWorkerUninstall:true,selfDirectoryUninstall:true,upgradeBusyRejected:true,upgradeRollback:true,shortcutOwnership:true,staleControllerUninstall:true,reusedPidUninstall:true,liveEndpointErrorsPreserved:true}));
}finally{
  if(passed&&path.dirname(temp)===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('cqb-install-test-'))await fs.rm(temp,{recursive:true,force:true});
}
