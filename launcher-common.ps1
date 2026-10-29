$ErrorActionPreference = 'Stop'
$env:BOTTOMBAR_UI_LANGUAGE = [Globalization.CultureInfo]::CurrentUICulture.Name
$script:CqbEnglish = -not $env:BOTTOMBAR_UI_LANGUAGE.StartsWith('zh')
try {
  $taskSettings = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'config.local.json')) | ConvertFrom-Json
  if ($taskSettings.language -eq 'en') { $script:CqbEnglish = $true }
  elseif ($taskSettings.language -eq 'zh-CN') { $script:CqbEnglish = $false }
} catch {}
function L([string]$Chinese,[string]$English) { if ($script:CqbEnglish) { $English } else { $Chinese } }
function Get-CqbNode {
  $candidates = @((Join-Path $PSScriptRoot 'runtime\node.exe'))
  $taskCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($taskCommand) { $candidates += $taskCommand.Source }
  $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $taskVersion = & $candidate -p 'process.versions.node' 2>$null
      if ($LASTEXITCODE -eq 0 -and [int]($taskVersion.Split('.')[0]) -ge 22) { return $candidate }
    }
  }
  throw (L '未找到 Node.js 22 或更新版本，请重新解压完整安装包' 'Node.js 22+ was not found. Extract the complete package again.')
}
function Save-CqbJson([string]$Path,$Value) {
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $json = $Value | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($Path,$json,(New-Object Text.UTF8Encoding($false)))
}
if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.local.json'))){Save-CqbJson (Join-Path $PSScriptRoot 'config.local.json') ([ordered]@{language='auto';timeZone='auto';completionAudio='';refreshAudio=''})}
