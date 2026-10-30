param([string]$TargetDir='', [switch]$NoShortcut,[string]$ShortcutRoot='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
. (Join-Path $PSScriptRoot 'lifecycle-common.ps1')
if(-not $TargetDir){$TargetDir=Join-Path $env:LOCALAPPDATA 'Programs\TibosGoodIdea'}
$target=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$source=[IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$marker=Join-Path $target 'install-info.json'
if($target -eq $source -and (Test-Path -LiteralPath $marker)){Write-Host (L '本工具已安装，请使用 Start.cmd 启动' 'Already installed. Use Start.cmd to launch.' 'インストール済みです Start.cmd で起動してください');exit 0}
if((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1)) {
  if(-not(Test-Path -LiteralPath $marker)){throw (L '目标文件夹不是本工具的安装目录，已停止' 'The target folder is not managed by this product. Installation stopped.' '対象フォルダーは本製品の管理対象ではありません インストールを中止しました')}
  $prior=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
  if($prior.productId -ne 'bottom-bar-companion'){throw 'Unexpected installation owner'}
  if(-not $ShortcutRoot -and $prior.shortcutRoot){$ShortcutRoot=$prior.shortcutRoot}
}
$files=[string[]]([IO.File]::ReadAllText((Join-Path $source 'release-files.json'))|ConvertFrom-Json)
foreach($name in $files){
  if([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Unsafe package path'}
  $inputFile=Join-Path $source $name
  if(-not(Test-Path -LiteralPath $inputFile -PathType Leaf)){throw "Package file missing: $name"}
}
$installLock=Enter-CqbLifecycleLock $target 'install'
$staging='';$keepStaging=$false
try {
  Assert-CqbInstallIdle $target
  $configPath=Join-Path $target 'config.local.json'
  $transactionFiles=@($files)+@('install-info.json')
  if(-not(Test-Path -LiteralPath $configPath)){$transactionFiles+=@('config.local.json')}
  # Reject existing locks and linked paths before changing any installed file.
  foreach($name in $transactionFiles){
    $destination=[IO.Path]::GetFullPath((Join-Path $target $name))
    if(-not $destination.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe destination'}
    for($parent=$destination;$parent -and ($parent -eq $target -or $parent.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase));$parent=Split-Path -Parent $parent){if((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing to install through a linked path'}}
    if(Test-Path -LiteralPath $destination){$handle=[IO.File]::Open($destination,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$handle.Dispose()}
  }
  $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
  $staging=Join-Path $tempRoot ('TibosGoodIdea-install-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging | Out-Null
  foreach($name in $transactionFiles){
    $old=Join-Path $target $name
    if(Test-Path -LiteralPath $old -PathType Leaf){$backup=Join-Path $staging ('backup\'+$name);New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force|Out-Null;Copy-Item -LiteralPath $old -Destination $backup}
  }
  foreach($name in $files){$candidate=Join-Path $staging ('new\'+$name);New-Item -ItemType Directory -Path (Split-Path -Parent $candidate) -Force|Out-Null;Copy-Item -LiteralPath (Join-Path $source $name) -Destination $candidate}
  $product=[IO.File]::ReadAllText((Join-Path $staging 'new\product.json'))|ConvertFrom-Json
  Save-CqbJson (Join-Path $staging 'new\install-info.json') ([ordered]@{productId='bottom-bar-companion';version=$product.version;files=$files;shortcutRoot=$ShortcutRoot;installedAt=(Get-Date).ToUniversalTime().ToString('o')})
  if($transactionFiles -contains 'config.local.json'){Save-CqbJson (Join-Path $staging 'new\config.local.json') ([ordered]@{language='auto';timeZone='auto';completionAudio='';refreshAudio=''})}
  Assert-CqbInstallIdle $target
  $changed=New-Object 'Collections.Generic.List[string]'
  $createdDirectories=New-Object 'Collections.Generic.List[string]'
  try {
    foreach($name in $transactionFiles){
      $destination=Join-Path $target $name
      for($parent=Split-Path -Parent $destination;$parent -and ($parent -eq $target -or $parent.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) -and -not(Test-Path -LiteralPath $parent);$parent=Split-Path -Parent $parent){$createdDirectories.Add($parent)}
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force|Out-Null
      $changed.Add($name)
      Copy-Item -LiteralPath (Join-Path $staging ('new\'+$name)) -Destination $destination -Force
    }
  } catch {
    $failure=$_;$rollbackErrors=@()
    for($i=$changed.Count-1;$i -ge 0;$i--){
      $name=$changed[$i];$destination=Join-Path $target $name;$backup=Join-Path $staging ('backup\'+$name)
      try {if(Test-Path -LiteralPath $backup -PathType Leaf){Copy-Item -LiteralPath $backup -Destination $destination -Force}elseif(Test-Path -LiteralPath $destination -PathType Leaf){Remove-Item -LiteralPath $destination -Force}} catch {$rollbackErrors+=$_}
    }
    foreach($directory in ($createdDirectories|Select-Object -Unique|Sort-Object Length -Descending)){
      try {if((Test-Path -LiteralPath $directory) -and -not(Get-ChildItem -LiteralPath $directory -Force|Select-Object -First 1)){Remove-Item -LiteralPath $directory -Force}} catch {$rollbackErrors+=$_}
    }
    if($rollbackErrors.Count){$keepStaging=$true;throw "Installation failed and some files could not be restored. Recovery copies: $staging. Original error: $failure"}
    throw $failure
  }
} finally {
  try {
    if($staging -and -not $keepStaging -and (Test-Path -LiteralPath $staging)){
      $resolvedStage=[IO.Path]::GetFullPath($staging)
      if((Split-Path -Parent $resolvedStage) -ne $tempRoot -or (Split-Path -Leaf $resolvedStage) -notmatch '^TibosGoodIdea-install-[0-9a-f]{32}$'){throw 'Unsafe staging cleanup path'}
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
  } finally {$installLock.ReleaseMutex();$installLock.Dispose()}
}
if(-not $NoShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $desktop=if($ShortcutRoot){Join-Path $ShortcutRoot 'Desktop'}else{[Environment]::GetFolderPath('Desktop')}
  $programs=Join-Path $(if($ShortcutRoot){Join-Path $ShortcutRoot 'Programs'}else{[Environment]::GetFolderPath('Programs')}) "Tibo’s Good Idea"
  New-Item -ItemType Directory -Path $desktop -Force | Out-Null
  New-Item -ItemType Directory -Path $programs -Force | Out-Null
  $links=@(@($desktop,"Tibo’s Good Idea",'Start.cmd'),@($programs,"Tibo’s Good Idea",'Start.cmd'),@($programs,'Settings','Settings.cmd'),@($programs,'Stop sound','StopSound.cmd'),@($programs,'Uninstall','Uninstall.cmd'))
  foreach($entry in $links){$link=$shell.CreateShortcut((Join-Path $entry[0] ($entry[1]+'.lnk')));$link.TargetPath=Join-Path $target $entry[2];$link.WorkingDirectory=if($entry[2] -eq 'Uninstall.cmd'){[IO.Path]::GetTempPath()}else{$target};$link.Description='Independent Codex add-on / 第三方 Codex 底栏助手';$link.Save()}
}
Write-Host (L "已安装到 $target，使用桌面的 Tibo’s Good Idea 启动，设置入口为 Settings.cmd" "Installed to $target. Use the Tibo’s Good Idea shortcut to start. Settings: Settings.cmd." "$target にインストールしました デスクトップの Tibo’s Good Idea で起動し、Settings.cmd で設定できます")
Write-Host (L '首次使用前请自行结束任务并退出 Codex，安装程序没有关闭或启动 Codex' 'Before first use, finish tasks and exit Codex yourself. The installer did not close or launch Codex.' '初回起動前にタスクを完了して Codex を終了してください インストーラーは Codex を終了または起動しません')
