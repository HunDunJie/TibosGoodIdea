param([switch]$ReadVolume, [string]$Language = 'zh-CN')
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAudio.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System
  if ($ReadVolume) {
    $volume = [CodexBottomBar.WindowsAudio]::ReadVolume()
    [Console]::Out.WriteLine((@{percent=$volume.Percent;muted=$volume.Muted} | ConvertTo-Json -Compress))
    exit 0
  }
  [CodexBottomBar.WindowsAudio]::SetLanguage($Language)
  [CodexBottomBar.WindowsAudio]::Start()
  [Console]::Out.WriteLine('{"event":"ready"}')
  while ($null -ne ($line = [Console]::ReadLine())) {
    $command = $null
    try {
      $command = $line | ConvertFrom-Json
      $result = $null
      switch ($command.method) {
        'check' { [CodexBottomBar.WindowsAudio]::CheckFile([string]$command.path) }
        'play' { [CodexBottomBar.WindowsAudio]::Play([string]$command.path,[string]$command.kind,[bool]$command.notify) }
        'status' { $result = @{playing=[CodexBottomBar.WindowsAudio]::PlayingKind;notificationsShown=[CodexBottomBar.WindowsAudio]::NotificationsShown;language=[CodexBottomBar.WindowsAudio]::Language} }
        'stop' { [CodexBottomBar.WindowsAudio]::Stop() }
        'codex' { [CodexBottomBar.WindowsAudio]::SetCodex([string]$command.path) }
        'sound-settings' { [CodexBottomBar.WindowsAudio]::SoundSettings() }
        'exit' { break }
        default { throw '未知播放器命令' }
      }
      [Console]::Out.WriteLine((@{id=$command.id;ok=$true;result=$result} | ConvertTo-Json -Compress))
      if ($command.method -eq 'exit') { break }
    } catch {
      [Console]::Out.WriteLine((@{id=$command.id;ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress))
    }
  }
} finally { if ('CodexBottomBar.WindowsAudio' -as [type]) { [CodexBottomBar.WindowsAudio]::Dispose() } }
