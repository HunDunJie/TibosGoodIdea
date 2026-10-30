const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(args){
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const timer=setTimeout(()=>child.kill(),35000);
  try {const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});assert.equal(code,0,output.slice(-1400));}
  finally {clearTimeout(timer);}
}
(async()=>{
  if(process.platform!=='win32'){console.log('Windows launcher argument test skipped');return;}
  const tempRoot=await fs.realpath(os.tmpdir());
  const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(tempRoot,'cqb-launcher-test-'));
  const packageRoot=path.join(temp,'安装目录 with spaces'),stateDir=path.join(temp,'状态目录 with spaces');
  const appAsar=path.join(temp,'Program Files','客户端','app','resources','app.asar');
  const driver=path.join(temp,'driver.ps1');
  await fs.mkdir(packageRoot,{recursive:true});await fs.mkdir(stateDir);
  await fs.mkdir(path.dirname(appAsar),{recursive:true});await fs.writeFile(appAsar,'isolated path fixture');
  await fs.writeFile(path.join(packageRoot,'package.json'),JSON.stringify({version:'argument-fixture'}));
  await fs.writeFile(path.join(packageRoot,'worker-client.mjs'),'console.log(JSON.stringify({send:{phase:"off"}}));');
  await fs.writeFile(path.join(packageRoot,'controller.mjs'),`import fs from 'node:fs';import path from 'node:path';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
const state=option('--state-dir'),asar=args.includes('--app-asar')?option('--app-asar'):null;
let bindings=null;
if(asar&&asar===process.env.CQB_TEST_INSTALLED_ASAR){
  const {readNativeBindings}=await import(${JSON.stringify(pathToFileURL(path.join(root,'native-bindings.mjs')).href)});
  const {readFeatureBindings}=await import(${JSON.stringify(pathToFileURL(path.join(root,'feature-bindings.mjs')).href)});
  bindings={usage:!!(await readNativeBindings(asar)),features:!!(await readFeatureBindings(asar))};
}
fs.writeFileSync(path.join(state,'controller.json'),JSON.stringify({pid:process.pid,packageRoot:${JSON.stringify(packageRoot)},port:Number(option('--port')),controllerVersion:'argument-fixture',args,asarExists:asar===null?null:fs.existsSync(asar),bindings}));
setInterval(()=>{if(fs.existsSync(path.join(state,'stop.flag'))){fs.rmSync(path.join(state,'stop.flag'));process.exit(0)}},50);
`);
  const psQuote=value=>"'"+value.replace(/'/g,"''")+"'";
  await fs.writeFile(driver,'\ufeff'+`param([switch]$Stop,[string]$Asar='')\r\n. ${psQuote(path.join(root,'launcher-common.ps1'))}\r\n. ${psQuote(path.join(root,'lifecycle-common.ps1'))}\r\nif($Stop){Stop-CqbController ${psQuote(stateDir)}}else{Start-CqbController ${psQuote(process.execPath)} ${psQuote(packageRoot)} ${psQuote(stateDir)} 49347 $Asar}\r\n`);
  let passed=false;
  try {
    for(const suppliedAsar of [appAsar,null,...(process.env.CQB_TEST_INSTALLED_ASAR?[process.env.CQB_TEST_INSTALLED_ASAR]:[])]){
      await run(['-File',driver,...(suppliedAsar?['-Asar',suppliedAsar]:[])]);
      try {
        const state=JSON.parse(await fs.readFile(path.join(stateDir,'controller.json'),'utf8'));
        assert.deepEqual(state.args,['--port','49347','--state-dir',stateDir,...(suppliedAsar?['--app-asar',suppliedAsar]:[])],'Real Windows child must receive each path exactly, without added spaces or quotes');
        assert.equal(state.asarExists,suppliedAsar?true:null,'The path reaching the child must name the existing archive');
        if(suppliedAsar&&suppliedAsar===process.env.CQB_TEST_INSTALLED_ASAR)assert.deepEqual(state.bindings,{usage:true,features:true});
      } finally {await run(['-File',driver,'-Stop']);}
    }
    passed=true;console.log(JSON.stringify({passed:true,realWindowsProcess:true,spaceAndUnicodePaths:true,archivePathExact:true,archiveVisibleToChild:true,noArchiveArgument:true,installedArchiveBindings:!!process.env.CQB_TEST_INSTALLED_ASAR,realCodexChanged:false,realWorkerStarted:false}));
  } finally {
    await run(['-File',driver,'-Stop']).catch(()=>{});
    if(passed&&path.dirname(temp)===tempRoot&&/^cqb-launcher-test-[A-Za-z0-9]+$/.test(path.basename(temp))){await sleep(100);await fs.rm(temp,{recursive:true,force:true});}
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
