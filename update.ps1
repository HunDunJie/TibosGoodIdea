param([string]$StateDir='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$root=if($env:TIBO_INSTALL_ROOT){$env:TIBO_INSTALL_ROOT}else{$PSScriptRoot}
if(-not(Test-Path -LiteralPath (Join-Path $root 'install-info.json'))){throw 'Install TiBo before using updates'}
$package=Get-AppxPackage -Name 'OpenAI.Codex'|Sort-Object Version -Descending|Select-Object -First 1
if(-not $package){throw 'Codex installation not found'}
$arguments=@(('"'+(Join-Path $root 'update-cli.mjs')+'"'),'check','--root',('"'+$root+'"'),'--asar',('"'+(Join-Path $package.InstallLocation 'app\resources\app.asar')+'"'),'--manual')
Start-Process -FilePath (Join-Path $root 'runtime\node.exe') -ArgumentList $arguments -WindowStyle Hidden|Out-Null
Write-Host (L '正在后台检查更新，适配的更新将在下次安全启动时应用；状态见安装目录 program-update-state.json' 'Checking in the background. Compatible updates apply at the next safe launch. Status: program-update-state.json in the install folder.' 'バックグラウンドで確認中です 対応する更新は次の安全な起動時に適用されます 状態はインストール先の program-update-state.json に保存されます')
