param(
  [ValidateSet('start.ps1','settings.ps1','reload.ps1','restore.ps1','control-reminders.ps1','check.ps1','uninstall.ps1','update.ps1','manage.ps1')][string]$Script='start.ps1',
  [string]$RootDir='',
  [switch]$Restart,[int]$Port=9347,[string]$StateDir='',
  [switch]$NoServiceChanges,[switch]$NoShortcut,[string]$BackupDir='',[string]$TargetDir='',[string]$ShortcutRoot='',
  [switch]$NoUi,[string]$TimeZone='',[string]$CompletionAudio='',[string]$RefreshAudio='',[string]$ConfigPath='',[string]$RenderTo='', [string]$Action='status',[string]$AsarPath=''
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
$root=if($RootDir){[IO.Path]::GetFullPath($RootDir)}else{$PSScriptRoot}
if($Script -ne 'start.ps1' -and -not(Test-Path -LiteralPath (Join-Path $root 'install-info.json'))){
  $legacy=@{}
  foreach($name in $PSBoundParameters.Keys){if($name -notin @('Script','RootDir')){$legacy[$name]=$PSBoundParameters[$name]}}
  & (Join-Path $PSScriptRoot $Script) @legacy
  exit
}
$forward=@{}
foreach($name in $PSBoundParameters.Keys){if($name -notin @('Script','RootDir')){$forward[$name]=$PSBoundParameters[$name]}}
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
$lock=$null
if($Script -eq 'start.ps1'){$lock=Enter-CqbLifecycleLock $root 'install'}
$priorRoot=$env:TIBO_INSTALL_ROOT;$priorReady=$env:TIBO_STARTUP_READY;$priorState=$env:TIBO_STATE_DIR;$priorPortable=$env:TIBO_PORTABLE_ROOT
try {
  $env:TIBO_INSTALL_ROOT=$root
  $node=Join-Path $PSScriptRoot 'runtime\node.exe'
  & $node (Join-Path $PSScriptRoot 'update-cli.mjs') initialize --root $root | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Cannot initialize TiBo. Extract the complete Windows ZIP into a writable folder.'}
  # Dispatch to verified current code before coordinating startup. Older root
  # launchers acquire new policies without overwriting their running files.
  $selected=& $node (Join-Path $PSScriptRoot 'update-cli.mjs') resolve --root $root
  if($LASTEXITCODE -ne 0 -or -not $selected){throw 'Cannot verify the active TiBo version'}
  if($Script -eq 'start.ps1' -and [IO.Path]::GetFullPath([string]$selected) -ne [IO.Path]::GetFullPath($PSScriptRoot)){
    & (Join-Path ([string]$selected) 'bootstrap.ps1') -RootDir $root -Script $Script @forward
    return
  }
  . (Join-Path $PSScriptRoot 'launcher-common.ps1')
  $runtime=if($StateDir){$StateDir}else{Get-CqbStateDir}
  $info=[IO.File]::ReadAllText((Join-Path $root 'install-info.json'))|ConvertFrom-Json
  $env:TIBO_STATE_DIR=$runtime
  if($info.mode -eq 'portable'){$env:TIBO_PORTABLE_ROOT=$root}else{$env:TIBO_PORTABLE_ROOT=$null}
  if($Script -eq 'start.ps1'){
    $package=Get-AppxPackage -Name 'OpenAI.Codex'|Sort-Object Version -Descending|Select-Object -First 1
    if(-not $package){throw (L '未找到当前用户安装的 Codex 商店版' 'Codex from the Microsoft Store is not installed for this Windows user.' 'Microsoft Store 版 Codex が見つかりません')}
    $asar=Join-Path $package.InstallLocation 'app\resources\app.asar'
    $exe=Join-Path $package.InstallLocation 'app\ChatGPT.exe'
    $busy=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'"|Where-Object {-not $_.ExecutablePath -or $_.ExecutablePath -ieq $exe}).Count -gt 0
    if($info.mode -eq 'portable'){
      $legacy=Join-Path $env:LOCALAPPDATA 'CodexBottomBar'
      $legacyController=Get-CqbController $legacy
      if($legacyController){
        if($busy){throw (L '请先完成任务并退出 Codex，再启动便携版 TiBo' 'Finish tasks and close Codex before switching to portable TiBo.' 'タスクを完了し Codex を終了してからポータブル版を起動してください')}
        $legacyRoot=Join-Path $env:LOCALAPPDATA 'Programs\TibosGoodIdea'
        $legacyMarker=[IO.File]::ReadAllText((Join-Path $legacyRoot 'install-info.json'))|ConvertFrom-Json
        if($legacyMarker.productId -ne 'bottom-bar-companion' -or -not ([IO.Path]::GetFullPath($legacyController.State.packageRoot)+'\').StartsWith($legacyRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Another TiBo controller is active; exit it from its tray menu first'}
        Stop-CqbController $legacy
      }
      $migration=@((Join-Path $PSScriptRoot 'update-cli.mjs'),'migrate','--root',$root,'--state-dir',$runtime)
      if($busy){$migration+='--busy'}
      & $node @migration | Out-Null
      if($LASTEXITCODE -ne 0){throw 'Could not hand off the old TiBo service. Original files have been retained.'}
    }
    if(-not $busy){Stop-CqbController $runtime}
    Write-Host (L '正在检查 Codex 适配和 TiBo 更新…' 'Checking Codex compatibility and TiBo updates…' 'Codex の互換性と TiBo の更新を確認しています…')
    $update=@((Join-Path $PSScriptRoot 'update-cli.mjs'),'startup','--root',$root,'--state-dir',$runtime,'--asar',$asar,'--codex-exe',$exe)
    if($busy){$update+='--busy'}
    $policy=$ErrorActionPreference
    try {$ErrorActionPreference='Continue';& $node @update 2>$null|Out-Null;$updateExit=$LASTEXITCODE} finally {$ErrorActionPreference=$policy}
    if($updateExit -ne 0){Write-Warning (L '更新检查未完成，将使用当前可用版本' 'Update check could not finish; using the current available version.' '更新確認を完了できません 現在利用可能なバージョンを使います')}
  }
  $directory=$root
  if($Script -ne 'uninstall.ps1'){
    $selected=& $node (Join-Path $PSScriptRoot 'update-cli.mjs') resolve --root $root
    if($LASTEXITCODE -ne 0 -or -not $selected){throw 'Cannot verify the active TiBo version'}
    $directory=[string]$selected
  } elseif(-not $forward.ContainsKey('TargetDir')) {$forward['TargetDir']=$root}
  $env:TIBO_STARTUP_READY='1'
  & (Join-Path $directory $Script) @forward
} finally {$env:TIBO_INSTALL_ROOT=$priorRoot;$env:TIBO_STARTUP_READY=$priorReady;$env:TIBO_STATE_DIR=$priorState;$env:TIBO_PORTABLE_ROOT=$priorPortable;if($lock){$lock.ReleaseMutex();$lock.Dispose()}}
