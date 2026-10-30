# Native stderr is a terminating error in Windows PowerShell 5.1 with Stop.
# Capture the exit status without changing the caller's error policy.
function Invoke-CqbWorker([string]$NodeExe,[string]$PackageRoot,[string]$StateDir,[string]$Action='status') {
  $priorErrorAction=$ErrorActionPreference
  try {
    $ErrorActionPreference='Continue'
    $output=& $NodeExe (Join-Path $PackageRoot 'worker-client.mjs') $Action --state-dir $StateDir 2>$null
    $code=$LASTEXITCODE
  } finally { $ErrorActionPreference=$priorErrorAction }
  [pscustomobject]@{ExitCode=$code;Output=$output}
}
function Enter-CqbLifecycleLock([string]$Directory,[string]$Kind='controller') {
  $sha=[Security.Cryptography.SHA256]::Create()
  try {$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Kind+':'+[IO.Path]::GetFullPath($Directory).TrimEnd('\').ToLowerInvariant())))).Replace('-','')} finally {$sha.Dispose()}
  $mutex=New-Object Threading.Mutex($false,('Local\TibosGoodIdea-'+$hash))
  try {
    try {$acquired=$mutex.WaitOne(30000)} catch [Threading.AbandonedMutexException] {$acquired=$true}
    if(-not $acquired){throw 'Another product operation is still running. Try again shortly.'}
    return $mutex
  } catch {$mutex.Dispose();throw}
}
function Get-CqbController([string]$StateDir) {
  $statePath=Join-Path $StateDir 'controller.json'
  if(-not(Test-Path -LiteralPath $statePath -PathType Leaf)){return $null}
  try {$state=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json} catch {return $null}
  $controllerId=0
  if(-not [int]::TryParse([string]$state.pid,[ref]$controllerId) -or $controllerId -le 0){return $null}
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$controllerId" -ErrorAction Stop
  if(-not $process){return $null}
  # PIDs are reused after exit/reboot. A cached PID is never proof of ownership.
  if(-not $state.packageRoot){return $null}
  try {$scriptPath=Join-Path ([IO.Path]::GetFullPath($state.packageRoot)) 'controller.mjs'} catch {return $null}
  $scriptPattern='(?:^|\s)"?'+[regex]::Escape($scriptPath)+'"?(?:\s|$)'
  $statePattern='(?:^|\s)--state-dir\s+"?'+[regex]::Escape([IO.Path]::GetFullPath($StateDir).TrimEnd('\'))+'"?(?:\s|$)'
  if([IO.Path]::GetFileName($process.ExecutablePath) -ine 'node.exe' -or $process.CommandLine -notmatch $scriptPattern -or $process.CommandLine -notmatch $statePattern){
    return $null
  }
  [pscustomobject]@{State=$state;Process=$process}
}
function Stop-CqbController([string]$StateDir) {
  $controller=Get-CqbController $StateDir
  if(-not $controller){return}
  try {$process=Get-Process -Id $controller.Process.ProcessId -ErrorAction Stop} catch {return}
  [IO.File]::WriteAllText((Join-Path $StateDir 'stop.flag'),'restore')
  try {if(-not $process.WaitForExit(20000)){throw 'The previous controller has not exited. No second controller was started.'}} finally {$process.Dispose()}
}
function Assert-CqbInstallIdle([string]$TargetDir) {
  $prefix=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\')+'\'
  $running=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)})
  if($running.Count){throw (L '本工具仍在运行，请先恢复原界面并退出提醒服务，再重新安装；安装文件尚未修改' 'The add-on is still running. Restore the original layout and exit reminders before installing again. No installed files were changed.' '本ツールが動作中です レイアウトを復元し通知サービスを終了してから再インストールしてください インストール済みファイルは変更していません')}
}

function Start-CqbController([string]$NodeExe,[string]$PackageRoot,[string]$StateDir,[int]$Port=9347,[string]$AppAsar='') {
  New-Item -ItemType Directory -Path $StateDir -Force|Out-Null
  $launchLock=Enter-CqbLifecycleLock $StateDir
  try {
    $existing=Get-CqbController $StateDir
    $packageVersion=([IO.File]::ReadAllText((Join-Path $PackageRoot 'package.json'))|ConvertFrom-Json).version
    $reuse=$existing -and [IO.Path]::GetFullPath($existing.State.packageRoot).TrimEnd('\') -eq [IO.Path]::GetFullPath($PackageRoot).TrimEnd('\') -and [int]$existing.State.port -eq $Port -and $existing.State.controllerVersion -eq $packageVersion
    if($existing -and -not $reuse){
      $reply=Invoke-CqbWorker $NodeExe $PackageRoot $StateDir
      if($reply.ExitCode -eq 0 -and ($reply.Output|ConvertFrom-Json).send.phase -eq 'running'){throw (L '正在发送草稿，请等本轮结束后切换安装目录' 'Drafts are being sent. Wait for this round before switching installations.' '下書きを送信中です 今回の送信が完了してから切り替えてください')}
      Stop-CqbController $StateDir
    }
    $reply=Invoke-CqbWorker $NodeExe $PackageRoot $StateDir 'start-configured'
    if($reply.ExitCode -ne 0){throw (L '提醒服务无法应用当前设置，请稍后重试' 'The reminder service could not apply these settings. Try again shortly.' '通知サービスに設定を反映できません 少し待って再試行してください')}
    if($reuse){Write-Host (L '底栏控制器已在运行。' 'The add-on is already running. Use Reload.cmd to apply new settings.' 'ボトムバーはすでに動作中です 新しい設定は Reload.cmd で反映してください');return}
    $controllerPath=Join-Path $PackageRoot 'controller.mjs'
    $arguments=@(('"'+$controllerPath+'"'),'--port',([string]$Port),'--state-dir',('"'+$StateDir+'"'))
    if($AppAsar){$arguments+=@('--app-asar',('"'+$AppAsar+'"'))}
    $child=Start-Process -FilePath $NodeExe -ArgumentList $arguments -WorkingDirectory $PackageRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'controller.stdout.log') -RedirectStandardError (Join-Path $StateDir 'controller.stderr.log') -PassThru
    $deadline=(Get-Date).AddSeconds(20);$ready=$false
    do {
      if($child.HasExited){throw 'The controller exited before startup completed. See controller.stderr.log.'}
      try {$state=[IO.File]::ReadAllText((Join-Path $StateDir 'controller.json'))|ConvertFrom-Json;$ready=$state.pid -eq $child.Id} catch {}
      if(-not $ready){Start-Sleep -Milliseconds 100}
    } while(-not $ready -and (Get-Date) -lt $deadline)
    if(-not $ready){throw 'The controller did not confirm startup. No additional controller will be started.'}
    Write-Host (L '已启动底栏控制器。首次读取用量可能需要数秒；未知字段显示 --。' 'The add-on is starting. Usage may take a few seconds to appear. Unknown values are shown as --.' 'ボトムバーを起動しました 使用量の取得に数秒かかることがあります 不明な値は -- と表示します')
  } finally {$launchLock.ReleaseMutex();$launchLock.Dispose()}
}
