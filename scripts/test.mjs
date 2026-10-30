// The same Windows validation entry point is used locally and by GitHub Actions.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode=process.argv[2]??'quick';
if(!['quick','full'].includes(mode))throw Error('Usage: node scripts/test.mjs quick|full [--force]');
if(process.platform!=='win32')throw Error('These integration checks require Windows; use node --test tests/*.test.mjs elsewhere');
const python=process.env.TIBO_PYTHON??'python';
const fingerprint=()=>JSON.parse(execFileSync(python,['-X','utf8','scripts/release.py','fingerprint'],{cwd:root,encoding:'utf8',windowsHide:true}));
const initial=fingerprint();
const directory=path.join(root,'work','validation',initial.version,mode);
await fs.mkdir(directory,{recursive:true});
const receiptPath=path.join(directory,'result.json');
const prior=await fs.readFile(receiptPath,'utf8').then(JSON.parse).catch(()=>null);
if(!process.argv.includes('--force')&&prior?.passed&&prior.sourceFingerprint===initial.sha256&&Date.now()-Date.parse(prior.completedAt)<86400000){
  console.log(JSON.stringify({reused:true,report:receiptPath,passed:true,sourceFingerprint:initial.sha256}));process.exit(0);
}
const env={...process.env};
if(!env.NODE_PATH){
  const candidate=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules');
  if(await fs.stat(path.join(candidate,'playwright')).catch(()=>null))env.NODE_PATH=candidate;
}
const plan=JSON.parse(await fs.readFile(path.join(root,'scripts/test-plan.json'),'utf8'));
const report={schema:1,version:initial.version,mode,sourceFingerprint:initial.sha256,startedAt:new Date().toISOString(),passed:false,steps:[]};
async function run(name,exe,args,timeout=180000){
  const logPath=path.join(directory,name.replace(/[^a-z0-9.-]/gi,'_')+'.log');
  const log=await fs.open(logPath,'w');const start=Date.now();
  let timedOut=false,child,error;
  try{
    child=spawn(exe,args,{cwd:root,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
    const timer=setTimeout(()=>{timedOut=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());},timeout);
    try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});}finally{clearTimeout(timer)}
  }catch(e){error=e.message}finally{await log.close()}
  const output=await fs.readFile(logPath,'utf8');
  const evidence=output.split(/\r?\n/).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean).at(-1);
  const result={name,exitCode:child?.exitCode??-1,timedOut,seconds:Math.round((Date.now()-start)/100)/10,log:path.relative(root,logPath),...(evidence?{evidence}:{}),...(error?{error}:{})};
  if(name==='unit'){const count=output.match(/(?:ℹ |# )tests (\d+)/);if(count)result.tests=Number(count[1])}
  report.steps.push(result);
  console.log(`${result.exitCode===0&&!timedOut?'PASS':'FAIL'} ${name} (${result.seconds}s)`);
  if(result.exitCode!==0||timedOut){console.error(output.slice(-5000));throw Error(error??`${name} failed; see ${result.log}`)}
}
const images=new Map();
for(const name of plan.generatedImages)images.set(name,await fs.readFile(path.join(root,name)).catch(e=>{if(e.code==='ENOENT')return null;throw e}));
try{
  await run('buyer-manifest',python,['-X','utf8','pack-buyer.py','--manifest-only']);
  for(const name of initial.files.filter(n=>/\.(?:js|cjs|mjs)$/.test(n)&&!n.startsWith('vendor/')))await run('syntax-'+name,process.execPath,['--check',name],30000);
  const psFiles=initial.files.filter(n=>n.endsWith('.ps1'));
  env.TIBO_PARSE_LIST=path.join(directory,'powershell-files.json');await fs.writeFile(env.TIBO_PARSE_LIST,JSON.stringify(psFiles));
  await run('powershell-parse','powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$count=0;foreach($f in (Get-Content -LiteralPath $env:TIBO_PARSE_LIST -Raw|ConvertFrom-Json)){$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) $f),[ref]$tokens,[ref]$errors);if($errors.Count){throw ($errors|Out-String)};$count++};@{passed=$true;files=$count}|ConvertTo-Json -Compress"]);
  await run('unit',process.execPath,['--test',...initial.files.filter(n=>/^tests\/.*\.test\.mjs$/.test(n))]);
  await run('release-workflow',python,['-X','utf8','tests/release_workflow_test.py']);
  for(const file of mode==='full'?plan.integration:plan.quickIntegration)await run(path.basename(file),process.execPath,[file],240000);
  report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1}finally{
  for(const [name,bytes]of images){if(bytes===null)await fs.unlink(path.join(root,name)).catch(e=>{if(e.code!=='ENOENT')throw e});else await fs.writeFile(path.join(root,name),bytes)}
  const final=fingerprint();
  if(final.sha256!==initial.sha256){report.passed=false;report.error='Source changed during validation; rerun after reviewing the change';process.exitCode=1}
  report.completedAt=new Date().toISOString();await fs.writeFile(receiptPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,mode,report:receiptPath,steps:report.steps.length,error:report.error}));
}
