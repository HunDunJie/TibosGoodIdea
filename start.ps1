param([switch]$Restart, [int]$Port = 9347, [string]$StateDir = '')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$runtimeRoot = if ($StateDir) { $StateDir } else { Join-Path $env:LOCALAPPDATA 'CodexBottomBar' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$nodeExe = Get-CqbNode
if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw (L '未找到 Codex 自带的 Node.js。' 'Node.js is missing. Extract the complete package again.' 'Node.js が見つかりません 完全なパッケージを再展開してください') }
$appPackage = Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
if (-not $appPackage) { throw (L '未找到当前用户安装的 Codex 商店版。' 'Codex from the Microsoft Store is not installed for this Windows user.' 'この Windows ユーザーの Microsoft Store 版 Codex が見つかりません') }
# Renderer interfaces are discovered per capability by the controller; no blanket version gate.
$appExe = Join-Path $appPackage.InstallLocation 'app\ChatGPT.exe'
if($env:TIBO_INSTALL_ROOT){
  $updateRoot=$env:TIBO_INSTALL_ROOT
  $updateArgs=@(('"'+(Join-Path $updateRoot 'update-cli.mjs')+'"'),'check','--root',('"'+$updateRoot+'"'),'--asar',('"'+(Join-Path $appPackage.InstallLocation 'app\resources\app.asar')+'"'))
  Start-Process -FilePath (Join-Path $updateRoot 'runtime\node.exe') -ArgumentList $updateArgs -WindowStyle Hidden|Out-Null
}
if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { throw (L 'Codex 可执行文件不存在。' 'The Codex executable was not found.' 'Codex の実行ファイルが見つかりません') }
$manifest = Get-AppxPackageManifest -Package $appPackage.PackageFullName
$application = @($manifest.Package.Applications.Application) | Where-Object {
  $_.Executable.Replace('/', '\') -eq 'app\ChatGPT.exe'
} | Select-Object -First 1
if (-not $application) { throw (L '未找到 Codex 注册的原生应用入口。' 'The registered Codex application entry point was not found.' 'Codex の登録済みアプリ起動情報が見つかりません') }
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
      throw (L "端口 $Port 未由本机 Codex 独占使用，已停止" "Port $Port is not owned exclusively by local Codex. Stopped." "ポート $Port がローカル Codex 専用ではないため中止しました")
    }
  }
  return $true
}
if (-not (Assert-LocalDebugOwner)) {
  $running = @(Get-CodexMain)
  if ($running.Count -and -not $Restart) { throw (L '请结束正在运行的任务后关闭 Codex，再双击“开启底栏.cmd”；或用 -Restart 明确重启。' 'Finish running tasks, close Codex yourself, then run Start.cmd. The add-on will not force-close Codex.' '実行中のタスクを完了し Codex を終了してから Start.cmd を実行してください') }
  if ($running.Count) {
    foreach ($item in $running) {
      $process = Get-Process -Id $item.ProcessId
      if (-not $process.CloseMainWindow()) { throw (L 'Codex 未接受正常关闭请求。请手动退出后重试；脚本不会强制结束进程。' 'Codex did not accept a normal close request. Close it yourself and retry. No process will be killed.' 'Codex が通常の終了要求に応答しません 手動で終了して再試行してください プロセスは強制終了しません') }
    }
    $deadline = (Get-Date).AddSeconds(30)
    do { Start-Sleep -Milliseconds 500; $running = @(Get-CodexMain) } while ($running.Count -and (Get-Date) -lt $deadline)
    if ($running.Count) { throw (L 'Codex 尚未完全退出，请手动退出后重试。' 'Codex has not fully exited. Close it yourself and retry.' 'Codex がまだ完全に終了していません 手動で終了して再試行してください') }
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
  if (-not $ready) { throw (L '原生 Codex 已激活，但未开放底栏所需的本机调试入口；尚未应用底栏。不会回退到直接运行 EXE。' 'Codex launched without the required local debugging endpoint. The add-on was not applied. Close Codex and retry Start.cmd.' 'Codex は起動しましたが必要なローカルデバッグ接続を利用できません ボトムバーは未適用です Codex を終了して Start.cmd を再実行してください') }
}
$mainProcesses = @(Get-CodexMain)
foreach ($mainProcess in $mainProcesses) {
  $actualIdentity = [CodexBottomBar.WindowsActivation]::GetIdentity([uint32]$mainProcess.ProcessId)
  if ($actualIdentity -ne $appUserModelId) { throw (L 'Codex 进程的 Windows 应用身份与原生入口不一致，已停止加载底栏。' 'The Codex process does not have the expected Windows app identity. Loading stopped.' 'Codex の Windows アプリ識別情報が一致しないため読み込みを中止しました') }
}
Start-CqbController $nodeExe $packageRoot $runtimeRoot $Port (Join-Path $appPackage.InstallLocation 'app\resources\app.asar')
