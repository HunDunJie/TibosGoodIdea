$ErrorActionPreference='Stop'
$runtime=Join-Path $PSScriptRoot 'runtime';New-Item -ItemType Directory -Path $runtime -Force|Out-Null
$candidate=Join-Path $runtime 'node.exe.download'
try {
  Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/v24.22.1/win-x64/node.exe' -OutFile $candidate
  if((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'Node.js checksum mismatch'}
  Move-Item -LiteralPath $candidate -Destination (Join-Path $runtime 'node.exe') -Force
  Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/nodejs/node/v24.22.1/LICENSE' -OutFile (Join-Path $runtime 'LICENSE-Node.txt')
  Write-Host 'Official Node.js 24.22.1 x64 downloaded and SHA-256 verified'
} finally { if(Test-Path -LiteralPath $candidate){Remove-Item -LiteralPath $candidate} }
