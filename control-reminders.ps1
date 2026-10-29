param([ValidateSet('stop','disable-refresh','shutdown','status')][string]$Action = 'status', [string]$StateDir = '')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$ErrorActionPreference = 'Stop'
$nodeExe = Get-CqbNode
if (-not (Test-Path -LiteralPath $nodeExe)) { throw (L '找不到 Node.js。' 'Node.js was not found.' 'Node.js が見つかりません') }
$runtimeRoot = if ($StateDir) { $StateDir } else { Join-Path $env:LOCALAPPDATA 'CodexBottomBar' }
$result = & $nodeExe (Join-Path $PSScriptRoot 'worker-client.mjs') $Action --state-dir $runtimeRoot
if ($LASTEXITCODE -ne 0) { Write-Host (L '提醒服务未运行，当前没有后台响铃。' 'The reminder service is not running; no add-on sound is playing.' '通知サービスは起動していません 現在、通知音は再生されていません'); exit 0 }
switch ($Action) {
  'stop' { Write-Host (L '已停止本次响铃；提醒开关保持原状态。' 'Sound stopped. Reminder switches are unchanged.' '今回の通知音を停止しました 通知のオンとオフは変更されません') }
  'disable-refresh' { Write-Host (L '已关闭刷新提醒，取消已安排的响铃。' 'Reset reminders are off; the scheduled alarm is cancelled.' '更新通知をオフにして、設定済みの通知を解除しました') }
  'shutdown' { Write-Host (L '已关闭所有提醒并退出后台服务。' 'All reminders are off and the service has exited.' 'すべての通知をオフにしてサービスを終了しました') }
  'status' { $result | ConvertFrom-Json | ConvertTo-Json -Depth 6 | Write-Host }
}
