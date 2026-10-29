param([string]$TargetDir='', [switch]$NoShortcut)
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if(-not $TargetDir){$TargetDir=Join-Path $env:LOCALAPPDATA 'Programs\BottomBarCompanion'}
$target=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$source=[IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$marker=Join-Path $target 'install-info.json'
if($target -eq $source -and (Test-Path -LiteralPath $marker)){Write-Host (L '本工具已安装，请使用 Start.cmd 启动' 'Already installed. Use Start.cmd to launch.' 'インストール済みです Start.cmd で起動してください');exit 0}
if((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1)) {
  if(-not(Test-Path -LiteralPath $marker)){throw (L '目标文件夹不是本工具的安装目录，已停止' 'The target folder is not managed by this product. Installation stopped.' '対象フォルダーは本製品の管理対象ではありません インストールを中止しました')}
  $prior=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
  if($prior.productId -ne 'bottom-bar-companion'){throw 'Unexpected installation owner'}
}
$files=[string[]]([IO.File]::ReadAllText((Join-Path $source 'release-files.json'))|ConvertFrom-Json)
foreach($name in $files){
  if([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Unsafe package path'}
  $inputFile=Join-Path $source $name
  if(-not(Test-Path -LiteralPath $inputFile -PathType Leaf)){throw "Package file missing: $name"}
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach($name in $files){
  $destination=[IO.Path]::GetFullPath((Join-Path $target $name))
  if(-not $destination.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe destination'}
  for($parent=Split-Path -Parent $destination;$parent -and $parent.StartsWith($target,[StringComparison]::OrdinalIgnoreCase);$parent=Split-Path -Parent $parent){if((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing to install through a linked folder'}}
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force
}
$configPath=Join-Path $target 'config.local.json'
if(-not(Test-Path -LiteralPath $configPath)){Save-CqbJson $configPath ([ordered]@{language='auto';timeZone='auto';completionAudio='';refreshAudio=''})}
$product=[IO.File]::ReadAllText((Join-Path $target 'product.json'))|ConvertFrom-Json
Save-CqbJson $marker ([ordered]@{productId='bottom-bar-companion';version=$product.version;files=$files;installedAt=(Get-Date).ToUniversalTime().ToString('o')})
if(-not $NoShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $programs=Join-Path ([Environment]::GetFolderPath('Programs')) 'BottomBar Companion'
  New-Item -ItemType Directory -Path $programs -Force | Out-Null
  $links=@(@([Environment]::GetFolderPath('Desktop'),'BottomBar Companion','Start.cmd'),@($programs,'BottomBar Companion','Start.cmd'),@($programs,'Settings','Settings.cmd'),@($programs,'Stop sound','StopSound.cmd'),@($programs,'Uninstall','Uninstall.cmd'))
  foreach($entry in $links){$link=$shell.CreateShortcut((Join-Path $entry[0] ($entry[1]+'.lnk')));$link.TargetPath=Join-Path $target $entry[2];$link.WorkingDirectory=$target;$link.Description='Independent Codex add-on / 第三方 Codex 底栏助手';$link.Save()}
}
Write-Host (L "已安装到 $target，使用桌面的 BottomBar Companion 启动，设置入口为 Settings.cmd" "Installed to $target. Use the BottomBar Companion shortcut to start. Settings: Settings.cmd." "$target にインストールしました デスクトップの BottomBar Companion で起動し、Settings.cmd で設定できます")
Write-Host (L '首次使用前请自行结束任务并退出 Codex，安装程序没有关闭或启动 Codex' 'Before first use, finish tasks and exit Codex yourself. The installer did not close or launch Codex.' '初回起動前にタスクを完了して Codex を終了してください インストーラーは Codex を終了または起動しません')
