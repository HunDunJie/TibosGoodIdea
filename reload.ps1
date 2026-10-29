param([string]$StateDir='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$nodeExe=Get-CqbNode
if(-not $StateDir){$StateDir=Join-Path $env:LOCALAPPDATA 'CodexBottomBar'}
$status=& $nodeExe (Join-Path $PSScriptRoot 'worker-client.mjs') status --state-dir $StateDir 2>$null
if($LASTEXITCODE -eq 0 -and ($status|ConvertFrom-Json).send.phase -eq 'running'){throw (L '正在发送草稿，请等本轮结束后重新加载' 'Drafts are being sent. Wait for this round to finish before reloading.')}
$child=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'restore.ps1')+'"'),'-StateDir',('"'+$StateDir+'"')) -WindowStyle Hidden -Wait -PassThru
if($child.ExitCode -ne 0){throw (L '恢复界面失败，请检查 Codex 是否正在运行' 'Could not restore the interface. Check whether Codex is running.')}
& $nodeExe (Join-Path $PSScriptRoot 'worker-client.mjs') reload --state-dir $StateDir
if($LASTEXITCODE -ne 0){throw (L '提醒设置重新加载失败' 'Could not reload reminder settings.')}
& (Join-Path $PSScriptRoot 'start.ps1') -StateDir $StateDir
