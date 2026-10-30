param([string]$TargetDir=$PSScriptRoot,[switch]$NoServiceChanges,[switch]$NoShortcut,[string]$BackupDir='',[string]$StateDir='',[string]$ShortcutRoot='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
$target=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$marker=Join-Path $target 'install-info.json'
if(-not(Test-Path -LiteralPath $marker)){throw 'Managed installation marker not found'}
$installation=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
if($installation.productId -ne 'bottom-bar-companion'){throw 'Unexpected installation owner'}
if(-not $ShortcutRoot -and $installation.shortcutRoot){$ShortcutRoot=$installation.shortcutRoot}
$owned=@($installation.files)+@('config.local.json','config.local.json.bak','config.local.json.pending','install-info.json')
foreach($name in $owned){
  if([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Unsafe uninstall path'}
  $resolved=[IO.Path]::GetFullPath((Join-Path $target $name))
  if(-not $resolved.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Uninstall target escaped the managed folder'}
  for($parent=Split-Path -Parent $resolved;$parent -and $parent.StartsWith($target,[StringComparison]::OrdinalIgnoreCase);$parent=Split-Path -Parent $parent){if((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing to follow a linked folder'}}
}
if(-not $NoServiceChanges){
  $nodeExe=Get-CqbNode
  if(-not $StateDir){$StateDir=Join-Path $env:LOCALAPPDATA 'CodexBottomBar'}
  $reply=Invoke-CqbWorker $nodeExe $target $StateDir
  $worker=if($reply.ExitCode -eq 0){$reply.Output|ConvertFrom-Json}else{$null}
  $ownsWorker=$worker -and $worker.workerRoot -and [IO.Path]::GetFullPath($worker.workerRoot).TrimEnd('\') -eq $target
  if($ownsWorker -and $worker.send.phase -eq 'running'){throw 'Drafts are being sent. Wait for this round before uninstalling.'}
  $statePath=Join-Path $StateDir 'controller.json'
  if(Test-Path -LiteralPath $statePath){$controller=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json;if($controller.packageRoot -and [IO.Path]::GetFullPath($controller.packageRoot).TrimEnd('\') -eq $target){
    $child=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $target 'restore.ps1')+'"'),'-StateDir',('"'+$StateDir+'"'),'-Port',([string]$controller.port)) -WindowStyle Hidden -Wait -PassThru
    if($child.ExitCode -ne 0){throw 'Could not restore the managed interface; uninstall stopped'}
  }}
  if($ownsWorker){
    try {$workerProcess=Get-Process -Id $worker.workerPid -ErrorAction Stop} catch {$workerProcess=$null}
    $reply=Invoke-CqbWorker $nodeExe $target $StateDir 'shutdown'
    if($reply.ExitCode -ne 0){throw 'Could not stop the managed reminder service; uninstall stopped'}
    if($workerProcess){try {if(-not $workerProcess.WaitForExit(15000)){throw 'The reminder service has not exited; uninstall stopped'}} finally {$workerProcess.Dispose()}}
  }
}
$configPath=Join-Path $target 'config.local.json'
if(Test-Path -LiteralPath $configPath){$backup=if($BackupDir){$BackupDir}else{Join-Path $env:LOCALAPPDATA ('TibosGoodIdeaBackup\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))};New-Item -ItemType Directory -Path $backup -Force|Out-Null;Copy-Item -LiteralPath $configPath -Destination (Join-Path $backup 'config.local.json')}
foreach($name in $owned){$file=Join-Path $target $name;if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file -Force}}
$directories=@($owned|ForEach-Object{
  $directory=Split-Path -Parent (Join-Path $target $_)
  while($directory -and $directory.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){
    $directory
    $directory=Split-Path -Parent $directory
  }
}|Select-Object -Unique|Sort-Object Length -Descending)
foreach($directory in $directories){if($directory -ne $target -and (Test-Path -LiteralPath $directory) -and -not(Get-ChildItem -LiteralPath $directory -Force|Select-Object -First 1)){Remove-Item -LiteralPath $directory -Force}}
if(-not $NoShortcut){
  $desktop=if($ShortcutRoot){Join-Path $ShortcutRoot 'Desktop'}else{[Environment]::GetFolderPath('Desktop')}
  $programs=Join-Path $(if($ShortcutRoot){Join-Path $ShortcutRoot 'Programs'}else{[Environment]::GetFolderPath('Programs')}) "Tibo’s Good Idea"
  $shell=New-Object -ComObject WScript.Shell
  foreach($item in @((Join-Path $desktop "Tibo’s Good Idea.lnk"),(Join-Path $programs "Tibo’s Good Idea.lnk"),(Join-Path $programs 'Settings.lnk'),(Join-Path $programs 'Stop sound.lnk'),(Join-Path $programs 'Uninstall.lnk'))){if(Test-Path -LiteralPath $item -PathType Leaf){$link=$shell.CreateShortcut($item);if($link.TargetPath -and [IO.Path]::GetFullPath($link.TargetPath).StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $item}}}
  if((Test-Path -LiteralPath $programs) -and -not(Get-ChildItem -LiteralPath $programs -Force|Select-Object -First 1)){Remove-Item -LiteralPath $programs}
}
# Release this process's working directory; CMD launchers release their parent too.
$outside=[IO.Path]::GetTempPath();Set-Location -LiteralPath $outside;[Environment]::CurrentDirectory=$outside
if((Test-Path -LiteralPath $target) -and -not(Get-ChildItem -LiteralPath $target -Force|Select-Object -First 1)){
  try {Remove-Item -LiteralPath $target -Force} catch {Write-Warning (L '文件和快捷方式已卸载；空目录仍被其他程序占用，关闭该程序后可删除' 'Files and owned shortcuts were removed. Another program is holding the empty folder open; it can be removed after that program exits.' 'ファイルと本製品のショートカットを削除しました 空のフォルダーは別のプログラムが使用中です そのプログラムの終了後に削除できます')}
}
Write-Host (L '本工具文件已卸载，未知或自行添加的文件会保留，设置备份在 LocalAppData\TibosGoodIdeaBackup' 'Managed files removed. Your own files are preserved. Settings backup: LocalAppData\TibosGoodIdeaBackup.' '管理対象のファイルを削除しました 追加されたファイルは保持します 設定は LocalAppData\TibosGoodIdeaBackup にバックアップしました')
