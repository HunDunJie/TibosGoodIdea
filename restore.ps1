param([int]$Port = 9347, [string]$StateDir = '')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$ErrorActionPreference = 'Stop'
$runtimeRoot = if ($StateDir) { $StateDir } else { Join-Path $env:LOCALAPPDATA 'CodexBottomBar' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Set-Content -LiteralPath (Join-Path $runtimeRoot 'stop.flag') -Value 'restore' -Encoding utf8
Start-Sleep -Seconds 4
$statePath = Join-Path $runtimeRoot 'controller.json'
if (Test-Path -LiteralPath $statePath) {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($state.stopped) { Write-Host (L '已恢复原界面；独立提醒服务继续运行，可从托盘关闭。' 'The original layout is restored. Reminders still run; manage them from the tray.'); exit 0 }
}
$nodeExe = Get-CqbNode
& $nodeExe (Join-Path $PSScriptRoot 'controller.mjs') --port $Port --state-dir $runtimeRoot --restore-once
if ($LASTEXITCODE -ne 0) { throw (L '未能连接客户端恢复。完全退出 Codex，再从官方入口启动即可恢复。' 'Could not restore through the local connection. Fully exit Codex and open it from the official entry point.') }
Write-Host (L '已请求恢复原界面。完全退出 Codex，再从官方入口启动会关闭本次调试入口。' 'Original layout requested. Fully exiting Codex and opening it normally also closes this debugging endpoint.')
