param([switch]$Restart, [int]$Port = 9347, [string]$StateDir = '')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$runtimeRoot = if ($StateDir) { $StateDir } else { Join-Path $env:LOCALAPPDATA 'CodexBottomBar' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$nodeExe = Get-CqbNode
if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw (L '未找到 Codex 自带的 Node.js。' 'Node.js is missing. Extract the complete package again.') }
$appPackage = Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
if (-not $appPackage) { throw (L '未找到当前用户安装的 Codex 商店版。' 'Codex from the Microsoft Store is not installed for this Windows user.') }
$product = [IO.File]::ReadAllText((Join-Path $packageRoot 'product.json')) | ConvertFrom-Json
if ([string]$appPackage.Version -notin $product.supportedCodexVersions) { throw (L "当前 Codex 版本 $($appPackage.Version) 尚未适配，请勿用于本版本" "Codex $($appPackage.Version) is not supported. Supported: $($product.supportedCodexVersions -join ', ').") }
& $nodeExe (Join-Path $packageRoot 'diagnostics.mjs') --asar (Join-Path $appPackage.InstallLocation 'app\resources\app.asar') --quiet
if ($LASTEXITCODE -ne 0) { throw (L '客户端文件版本检查失败，请查看兼容性说明' 'Codex renderer verification failed. See COMPATIBILITY.md.') }
$appExe = Join-Path $appPackage.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { throw (L 'Codex 可执行文件不存在。' 'The Codex executable was not found.') }
$manifest = Get-AppxPackageManifest -Package $appPackage.PackageFullName
$application = @($manifest.Package.Applications.Application) | Where-Object {
  $_.Executable.Replace('/', '\') -eq 'app\ChatGPT.exe'
} | Select-Object -First 1
if (-not $application) { throw (L '未找到 Codex 注册的原生应用入口。' 'The registered Codex application entry point was not found.') }
$appUserModelId = '{0}!{1}' -f $appPackage.PackageFamilyName, $application.Id
if (-not ('CodexBottomBar.WindowsActivation' -as [type])) {
  Add-Type -Path (Join-Path $packageRoot 'WindowsActivation.cs')
}
function Get-CodexMain {
  @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
    $_.ExecutablePath -eq $appExe -and $_.CommandLine -notmatch '--type='
  })
}
function Assert-LocalDebugOwner {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if (-not $listeners.Count) { return $false }
  foreach ($listener in $listeners) {
    $owner = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
    if ($listener.LocalAddress -notin @('127.0.0.1','::1') -or $owner.Path -ne $appExe) {
      throw (L "端口 $Port 未由本机 Codex 独占使用，已停止" "Port $Port is not owned exclusively by local Codex. Stopped.")
    }
  }
  return $true
}
if (-not (Assert-LocalDebugOwner)) {
  $running = @(Get-CodexMain)
  if ($running.Count -and -not $Restart) { throw (L '请结束正在运行的任务后关闭 Codex，再双击“开启底栏.cmd”；或用 -Restart 明确重启。' 'Finish running tasks, close Codex yourself, then run Start.cmd. The add-on will not force-close Codex.') }
  if ($running.Count) {
    foreach ($item in $running) {
      $process = Get-Process -Id $item.ProcessId
      if (-not $process.CloseMainWindow()) { throw (L 'Codex 未接受正常关闭请求。请手动退出后重试；脚本不会强制结束进程。' 'Codex did not accept a normal close request. Close it yourself and retry. No process will be killed.') }
    }
    $deadline = (Get-Date).AddSeconds(30)
    do { Start-Sleep -Milliseconds 500; $running = @(Get-CodexMain) } while ($running.Count -and (Get-Date) -lt $deadline)
    if ($running.Count) { throw (L 'Codex 尚未完全退出，请手动退出后重试。' 'Codex has not fully exited. Close it yourself and retry.') }
  }
  # Activate the registered Store app, preserving shell/notification activation and foreground handling.
  # Only the background controller is hidden; the Codex application uses normal Windows activation.
  $activationProcessId = [CodexBottomBar.WindowsActivation]::Activate($appUserModelId,
    "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port")
  [ordered]@{ mode = 'windows-application-activation'; appUserModelId = $appUserModelId;
    activationProcessId = $activationProcessId; startedAt = (Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'launch.json') -Encoding utf8
  $deadline = (Get-Date).AddSeconds(45)
  do { Start-Sleep -Milliseconds 500; $ready = Assert-LocalDebugOwner } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw (L '原生 Codex 已激活，但未开放底栏所需的本机调试入口；尚未应用底栏。不会回退到直接运行 EXE。' 'Codex launched without the required local debugging endpoint. The add-on was not applied. Close Codex and retry Start.cmd.') }
}
$mainProcesses = @(Get-CodexMain)
foreach ($mainProcess in $mainProcesses) {
  $actualIdentity = [CodexBottomBar.WindowsActivation]::GetIdentity([uint32]$mainProcess.ProcessId)
  if ($actualIdentity -ne $appUserModelId) { throw (L 'Codex 进程的 Windows 应用身份与原生入口不一致，已停止加载底栏。' 'The Codex process does not have the expected Windows app identity. Loading stopped.') }
}
$statePath = Join-Path $runtimeRoot 'controller.json'
& $nodeExe (Join-Path $packageRoot 'worker-client.mjs') start-configured --state-dir $runtimeRoot | Out-Null
if($LASTEXITCODE -ne 0){throw (L '提醒服务无法应用当前设置，请稍后重试' 'The reminder service could not apply these settings. Try again shortly.')}
if (Test-Path -LiteralPath $statePath) {
  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.pid) {
      $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)"
      if ($existing.ExecutablePath -eq $nodeExe -and $existing.CommandLine -like '*controller.mjs*') {
        & $nodeExe (Join-Path $packageRoot 'worker-client.mjs') start --state-dir $runtimeRoot | Out-Null
        if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine((L '独立提醒服务未能启动。' 'The independent reminder service could not start.')); exit 1 }
        Write-Host (L '底栏控制器已在运行。' 'The add-on is already running. Use Reload.cmd to apply new settings.'); exit 0
      }
    }
  } catch { Write-Verbose (L '旧状态文件不可用，将重新启动控制器。' 'The previous controller state is unavailable. Starting a controller.') }
}
$controllerPath = Join-Path $packageRoot 'controller.mjs'
$asarPath = Join-Path $appPackage.InstallLocation 'app\resources\app.asar'
$arguments = @('"' + $controllerPath + '"','--port',"$Port",'--state-dir','"' + $runtimeRoot + '"','--app-asar','"' + $asarPath + '"')
Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $packageRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'controller.stdout.log') -RedirectStandardError (Join-Path $runtimeRoot 'controller.stderr.log')
Write-Host (L '已启动底栏控制器。首次读取用量可能需要数秒；未知字段显示 --。' 'The add-on is starting. Usage may take a few seconds to appear. Unknown values are shown as --.')
