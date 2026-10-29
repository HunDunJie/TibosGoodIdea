param([string]$AsarPath='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$nodeExe=Get-CqbNode
if(-not $AsarPath){$package=Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1;if(-not $package){throw (L '未找到 Codex 商店版' 'Microsoft Store Codex was not found')};$AsarPath=Join-Path $package.InstallLocation 'app\resources\app.asar'}
& $nodeExe (Join-Path $PSScriptRoot 'diagnostics.mjs') --asar $AsarPath
exit $LASTEXITCODE
