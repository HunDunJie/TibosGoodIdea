param([string]$TargetDir='',[switch]$NoServiceChanges,[switch]$NoShortcut,[string]$BackupDir='',[string]$StateDir='',[string]$ShortcutRoot='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
if(-not $PSBoundParameters.ContainsKey('TargetDir')){
  $TargetDir=$PSScriptRoot
  if(-not(Test-Path -LiteralPath (Join-Path $TargetDir 'install-info.json') -PathType Leaf)){
    $TargetDir=Join-Path $env:LOCALAPPDATA 'Programs\TibosGoodIdea'
    if(-not(Test-Path -LiteralPath (Join-Path $TargetDir 'install-info.json') -PathType Leaf)){
      Write-Host (L '未找到本工具的安装记录，未删除任何文件；如安装在自定义位置，请从开始菜单的 Uninstall 入口卸载' 'No installed copy was found. No files were removed. For a custom install location, use Uninstall in the Start menu.' 'インストール記録が見つかりません ファイルは削除していません カスタム場所にインストールした場合はスタートメニューの Uninstall を使用してください')
      exit 0
    }
  }
}
$target=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$marker=Join-Path $target 'install-info.json'
if(-not(Test-Path -LiteralPath $marker)){throw 'Managed installation marker not found'}
$installation=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
if($installation.productId -ne 'bottom-bar-companion'){throw 'Unexpected installation owner'}
# A downloaded package must use the installed copy's own removal procedure.
# Explicit targets remain strict and never fall back to another installation.
if(-not $PSBoundParameters.ContainsKey('TargetDir') -and $target -ine [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')){
  $managedUninstaller=Join-Path $target 'uninstall.ps1'
  if(-not(Test-Path -LiteralPath $managedUninstaller -PathType Leaf)){throw (L '已找到安装记录，但卸载文件缺失，请重新安装后再卸载' 'The installed copy is missing its uninstaller. Reinstall it before uninstalling.' 'インストール記録はありますがアンインストーラーがありません 再インストールしてからアンインストールしてください')}
  $forward=@{TargetDir=$target}
  foreach($key in $PSBoundParameters.Keys){$forward[$key]=$PSBoundParameters[$key]}
  Write-Host (L "正在卸载已安装的副本：$target" "Uninstalling the installed copy: $target" "インストール済みのコピーをアンインストールします：$target")
  & $managedUninstaller @forward
  exit 0
}
$removeLock=Enter-CqbLifecycleLock $target 'install'
try {
if(Test-Path -LiteralPath (Join-Path $target 'update-cli.mjs')){
  & (Join-Path $target 'runtime\node.exe') (Join-Path $target 'update-cli.mjs') stop --root $target
  if($LASTEXITCODE -ne 0){throw 'Cannot stop the update check'}
}
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
  $ownsWorker=$worker -and $worker.workerRoot -and ([IO.Path]::GetFullPath($worker.workerRoot).TrimEnd('\') -eq $target -or [IO.Path]::GetFullPath($worker.workerRoot).StartsWith($target+'\versions\',[StringComparison]::OrdinalIgnoreCase))
  if($ownsWorker -and $worker.send.phase -eq 'running'){throw 'Drafts are being sent. Wait for this round before uninstalling.'}
  $statePath=Join-Path $StateDir 'controller.json'
  if(Test-Path -LiteralPath $statePath){$controller=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json;if($controller.packageRoot -and ([IO.Path]::GetFullPath($controller.packageRoot).TrimEnd('\') -eq $target -or [IO.Path]::GetFullPath($controller.packageRoot).StartsWith($target+'\versions\',[StringComparison]::OrdinalIgnoreCase))){
    $child=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $target 'restore.ps1')+'"'),'-StateDir',('"'+$StateDir+'"'),'-Port',([string]$controller.port)) -WindowStyle Hidden -Wait -PassThru
    if($child.ExitCode -ne 0){throw 'Could not restore the managed interface; uninstall stopped'}
  }}
  if($ownsWorker){
    try {$workerProcess=Get-Process -Id $worker.workerPid -ErrorAction Stop} catch {$workerProcess=$null}
    $reply=Invoke-CqbWorker $nodeExe $target $StateDir 'shutdown'
    if($reply.ExitCode -ne 0){throw 'Could not stop the managed reminder service; uninstall stopped'}
    if($workerProcess){try {if(-not $workerProcess.WaitForExit(15000)){throw 'The reminder service has not exited; uninstall stopped'}} finally {$workerProcess.Dispose()}}
  }
  $shutdownState=Join-Path $StateDir 'shutdown-state.json'
  if((-not $worker -or $ownsWorker) -and (Test-Path -LiteralPath $shutdownState) -and (Test-Path -LiteralPath (Join-Path $target 'shutdown-task.ps1'))){
    $plan=[IO.File]::ReadAllText($shutdownState)|ConvertFrom-Json
    if($plan.ownerRoot -and ([IO.Path]::GetFullPath($plan.ownerRoot).TrimEnd('\') -eq $target -or [IO.Path]::GetFullPath($plan.ownerRoot).StartsWith($target+'\versions\',[StringComparison]::OrdinalIgnoreCase))){
      $needsCleanup=$plan.plan -or $plan.cleanupPending
      $plan.enabled=$false;$plan.plan=$null;$plan.request=$null;$plan.phase='off'
      [IO.File]::WriteAllText($shutdownState,($plan|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
      if($needsCleanup){& (Join-Path $target 'shutdown-task.ps1') -Action cancel -StateDir $StateDir}
    }
  }
}
$configPath=Join-Path $target 'config.local.json'
if(Test-Path -LiteralPath $configPath){$backup=if($BackupDir){$BackupDir}else{Join-Path $env:LOCALAPPDATA ('TibosGoodIdeaBackup\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))};New-Item -ItemType Directory -Path $backup -Force|Out-Null;Copy-Item -LiteralPath $configPath -Destination (Join-Path $backup 'config.local.json')}
if(Test-Path -LiteralPath (Join-Path $target 'update-cli.mjs')){
  & (Join-Path $target 'runtime\node.exe') (Join-Path $target 'update-cli.mjs') clean --root $target
  if($LASTEXITCODE -ne 0){throw 'Cannot safely remove updated program files'}
}
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

} finally {$removeLock.ReleaseMutex();$removeLock.Dispose()}
