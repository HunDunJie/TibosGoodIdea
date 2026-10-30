param(
  [ValidateSet('start.ps1','settings.ps1','reload.ps1','restore.ps1','control-reminders.ps1','check.ps1','uninstall.ps1','update.ps1')][string]$Script='start.ps1',
  [switch]$Restart,[int]$Port=9347,[string]$StateDir='',
  [switch]$NoServiceChanges,[switch]$NoShortcut,[string]$BackupDir='',[string]$TargetDir='',[string]$ShortcutRoot='',
  [switch]$NoUi,[string]$TimeZone='',[string]$CompletionAudio='',[string]$RefreshAudio='',[string]$ConfigPath='',[string]$RenderTo='', [string]$Action='status',[string]$AsarPath=''
)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$forward=@{}
foreach($name in $PSBoundParameters.Keys){if($name -ne 'Script'){$forward[$name]=$PSBoundParameters[$name]}}
$managed=Test-Path -LiteralPath (Join-Path $root 'install-info.json') -PathType Leaf
if(-not $managed){& (Join-Path $root $Script) @forward;exit}
. (Join-Path $root 'launcher-common.ps1')
. (Join-Path $root 'lifecycle-common.ps1')
$lock=Enter-CqbLifecycleLock $root 'install'
$priorRoot=$env:TIBO_INSTALL_ROOT
try {
  $env:TIBO_INSTALL_ROOT=$root
  $node=Join-Path $root 'runtime\node.exe'
  if($Script -eq 'start.ps1'){
    $busy=$true;$asar=''
    try {
      $package=Get-AppxPackage -Name 'OpenAI.Codex'|Sort-Object Version -Descending|Select-Object -First 1
      if($package){
        $asar=Join-Path $package.InstallLocation 'app\resources\app.asar'
        $exe=Join-Path $package.InstallLocation 'app\ChatGPT.exe'
        $busy=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'"|Where-Object {-not $_.ExecutablePath -or $_.ExecutablePath -ieq $exe}).Count -gt 0
      }
      $runtime=if($StateDir){$StateDir}else{Join-Path $env:LOCALAPPDATA 'CodexBottomBar'}
      if(Get-CqbController $runtime){$busy=$true}
      $activate=@((Join-Path $root 'update-cli.mjs'),'activate','--root',$root,'--state-dir',$runtime)
      if($asar){$activate+=@('--asar',$asar)}
      if($busy){$activate+='--busy'}
      $oldPolicy=$ErrorActionPreference
      try {$ErrorActionPreference='Continue';& $node @activate 2>$null|Out-Null} finally {$ErrorActionPreference=$oldPolicy}
    } catch {Write-Warning 'Update deferred; starting the current version'}
  }
  # Removal always uses the fixed root so it can remove every owned version.
  $directory=$root
  if($Script -ne 'uninstall.ps1'){
    $selected=& $node (Join-Path $root 'update-cli.mjs') resolve --root $root
    if($LASTEXITCODE -ne 0 -or -not $selected){throw 'Cannot verify the active TiBo version'}
    $directory=[string]$selected
  } elseif(-not $forward.ContainsKey('TargetDir')) {$forward['TargetDir']=$root}
  & (Join-Path $directory $Script) @forward
} finally {$env:TIBO_INSTALL_ROOT=$priorRoot;$lock.ReleaseMutex();$lock.Dispose()}
