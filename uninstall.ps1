param([string]$TargetDir=$PSScriptRoot,[switch]$NoServiceChanges,[switch]$NoShortcut,[string]$BackupDir='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$target=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$marker=Join-Path $target 'install-info.json'
if(-not(Test-Path -LiteralPath $marker)){throw 'Managed installation marker not found'}
$installation=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
if($installation.productId -ne 'bottom-bar-companion'){throw 'Unexpected installation owner'}
$owned=@($installation.files)+@('config.local.json','config.local.json.bak','config.local.json.pending','install-info.json')
foreach($name in $owned){
  if([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Unsafe uninstall path'}
  $resolved=[IO.Path]::GetFullPath((Join-Path $target $name))
  if(-not $resolved.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Uninstall target escaped the managed folder'}
  for($parent=Split-Path -Parent $resolved;$parent -and $parent.StartsWith($target,[StringComparison]::OrdinalIgnoreCase);$parent=Split-Path -Parent $parent){if((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing to follow a linked folder'}}
}
if(-not $NoServiceChanges){
  $nodeExe=Get-CqbNode;$stateDir=Join-Path $env:LOCALAPPDATA 'CodexBottomBar'
  $status=& $nodeExe (Join-Path $target 'worker-client.mjs') status --state-dir $stateDir 2>$null
  if($LASTEXITCODE -eq 0){$worker=$status|ConvertFrom-Json;if($worker.workerRoot -and [IO.Path]::GetFullPath($worker.workerRoot).TrimEnd('\') -eq $target){& $nodeExe (Join-Path $target 'worker-client.mjs') shutdown --state-dir $stateDir | Out-Null}}
  $statePath=Join-Path $stateDir 'controller.json'
  if(Test-Path -LiteralPath $statePath){$controller=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json;if($controller.packageRoot -and [IO.Path]::GetFullPath($controller.packageRoot).TrimEnd('\') -eq $target){$child=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $target 'restore.ps1')+'"')) -WindowStyle Hidden -Wait -PassThru;if($child.ExitCode -ne 0){throw 'Could not restore the managed interface; uninstall stopped'}}}
}
$configPath=Join-Path $target 'config.local.json'
if(Test-Path -LiteralPath $configPath){$backup=if($BackupDir){$BackupDir}else{Join-Path $env:LOCALAPPDATA ('BottomBarCompanionBackup\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))};New-Item -ItemType Directory -Path $backup -Force|Out-Null;Copy-Item -LiteralPath $configPath -Destination (Join-Path $backup 'config.local.json')}
foreach($name in $owned){$file=Join-Path $target $name;if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file -Force}}
$directories=@($owned|ForEach-Object{Split-Path -Parent (Join-Path $target $_)}|Sort-Object Length -Descending -Unique)
foreach($directory in $directories){if($directory -ne $target -and (Test-Path -LiteralPath $directory) -and -not(Get-ChildItem -LiteralPath $directory -Force|Select-Object -First 1)){Remove-Item -LiteralPath $directory -Force}}
if((Test-Path -LiteralPath $target) -and -not(Get-ChildItem -LiteralPath $target -Force|Select-Object -First 1)){Remove-Item -LiteralPath $target -Force}
if(-not $NoShortcut){
  $programs=Join-Path ([Environment]::GetFolderPath('Programs')) 'BottomBar Companion'
  foreach($item in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'BottomBar Companion.lnk'),(Join-Path $programs 'BottomBar Companion.lnk'),(Join-Path $programs 'Settings.lnk'),(Join-Path $programs 'Stop sound.lnk'),(Join-Path $programs 'Uninstall.lnk'))){if(Test-Path -LiteralPath $item -PathType Leaf){Remove-Item -LiteralPath $item}}
  if((Test-Path -LiteralPath $programs) -and -not(Get-ChildItem -LiteralPath $programs -Force|Select-Object -First 1)){Remove-Item -LiteralPath $programs}
}
Write-Host (L '本工具文件已卸载，未知或自行添加的文件会保留，设置备份在 LocalAppData\BottomBarCompanionBackup' 'Managed files removed. Your own files are preserved. Settings backup: LocalAppData\BottomBarCompanionBackup.' '管理対象のファイルを削除しました 追加されたファイルは保持します 設定は LocalAppData\BottomBarCompanionBackup にバックアップしました')
