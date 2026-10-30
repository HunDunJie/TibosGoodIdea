param([ValidateSet('exit')][string]$Action='exit',[string]$StateDir='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
if(-not $StateDir){$StateDir=Get-CqbStateDir}
$node=Get-CqbNode
$lock=Enter-CqbLifecycleLock $StateDir
try {
  # Invalidate shutdown first, stop injection before stopping its worker to
  # prevent the controller from immediately starting the service again.
  $before=Invoke-CqbWorker $node $PSScriptRoot $StateDir 'status'
  $workerId=0
  if($before.ExitCode -eq 0){$workerId=[int](($before.Output|ConvertFrom-Json).workerPid)}
  [void](Invoke-CqbWorker $node $PSScriptRoot $StateDir 'disable-shutdown')
  [void](Invoke-CqbWorker $node $PSScriptRoot $StateDir 'stop')
  Stop-CqbController $StateDir
  $reply=Invoke-CqbWorker $node $PSScriptRoot $StateDir 'shutdown'
  if($reply.ExitCode -ne 0){
    # An absent worker is fine; an unresponsive live one must not be reported as stopped.
    $status=Join-Path $StateDir 'reminder-worker.json'
    if(Test-Path -LiteralPath $status){$saved=[IO.File]::ReadAllText($status)|ConvertFrom-Json;if($saved.pid -and (Get-Process -Id $saved.pid -ErrorAction SilentlyContinue)){throw 'The reminder service did not confirm exit'}}
  }
  if($workerId -gt 0){
    $process=Get-Process -Id $workerId -ErrorAction SilentlyContinue
    if($process){try{if(-not $process.WaitForExit(20000)){throw 'The reminder service has not exited'}}finally{$process.Dispose()}}
  }
  Write-Host (L 'TiBo 已退出，可以删除整个文件夹' 'TiBo has exited. You can delete its folder.' 'TiBo を終了しました フォルダーを削除できます')
} finally {$lock.ReleaseMutex();$lock.Dispose()}
