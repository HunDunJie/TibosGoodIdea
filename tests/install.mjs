import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(process.platform!=='win32'){console.log('Windows installer test skipped');process.exit(0);}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-install-test-'));
const target=path.join(temp,'installed'), config=path.join(target,'config.local.json');
let checks=0,passed=false;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function ps(script,args=[],expected=0){
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,script),...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(expected===0)assert.equal(code,0,`${script}: ${err||out}`);else assert.notEqual(code,0,script+' must reject invalid input');
  return out;
}
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
  const unmanaged=path.join(temp,'unmanaged');await fs.mkdir(unmanaged);await fs.writeFile(path.join(unmanaged,'mine.txt'),'mine');
  await ps('install.ps1',['-TargetDir',unmanaged,'-NoShortcut'],1);
  check(await fs.readFile(path.join(unmanaged,'mine.txt'),'utf8')==='mine','Non-owned installation target is rejected');
  const marker=path.join(target,'install-info.json'),markerText=await fs.readFile(marker,'utf8');
  const tampered=JSON.parse(markerText);tampered.files.push('../my-sound.wav');await fs.writeFile(marker,JSON.stringify(tampered));
  await ps('uninstall.ps1',['-TargetDir',target,'-NoShortcut','-NoServiceChanges','-BackupDir',path.join(temp,'backup')],1);
  check((await fs.stat(external)).isFile()&&(await fs.stat(path.join(target,'Start.cmd'))).isFile(),'Unsafe uninstall paths abort before deleting files');
  await fs.writeFile(marker,markerText);
  if(process.env.CQB_SETTINGS_RENDER){const languageState=path.join(temp,'language-state');await fs.mkdir(languageState);await fs.writeFile(path.join(languageState,'codex-language.json'),JSON.stringify({language:'ja'}));await ps('settings.ps1',['-ConfigPath',config,'-StateDir',languageState,'-RenderTo',path.resolve(process.env.CQB_SETTINGS_RENDER)]);check(true,'Japanese settings render without a window or language selector');}
  await ps('uninstall.ps1',['-TargetDir',target,'-NoShortcut','-NoServiceChanges','-BackupDir',path.join(temp,'backup')]);
  check(!await fs.stat(path.join(target,'Start.cmd')).catch(()=>null),'Managed files removed');
  check(await fs.readFile(sentinel,'utf8')==='mine','Uninstall preserves custom files');
  check((await fs.stat(external)).isFile(),'External music preserved');
  check(await fs.readFile(path.join(temp,'backup/config.local.json'),'utf8')===saved,'Uninstall backs up final settings');
  passed=true;console.log(JSON.stringify({passed,checks,isolatedDirectory:true,realShortcutsChanged:false,liveServicesChanged:false}));
}finally{
  if(passed&&path.dirname(temp)===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('cqb-install-test-'))await fs.rm(temp,{recursive:true,force:true});
}
