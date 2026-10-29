param([switch]$NoUi,[string]$Language='',[string]$TimeZone='',[string]$CompletionAudio='',[string]$RefreshAudio='',[string]$ConfigPath='',[string]$RenderTo='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'config.local.json' }
$config = [ordered]@{language='auto';timeZone='auto';completionAudio='';refreshAudio=''}
if (Test-Path -LiteralPath $ConfigPath) {
  $oldConfig = [IO.File]::ReadAllText($ConfigPath) | ConvertFrom-Json
  foreach ($property in $oldConfig.PSObject.Properties) { $config[$property.Name] = $property.Value }
}
if($config.language -eq 'en'){$script:CqbEnglish=$true}elseif($config.language -eq 'zh-CN'){$script:CqbEnglish=$false}
function Save-Settings {
  if ($config.language -notin @('auto','zh-CN','en')) { throw 'Unsupported language' }
  $nodeExe = Get-CqbNode
  $candidate = $ConfigPath + '.pending'
  try {
    Save-CqbJson $candidate $config
    $validation = & $nodeExe (Join-Path $PSScriptRoot 'settings-check.mjs') $candidate
    if ($LASTEXITCODE -ne 0) { throw ($validation -join [Environment]::NewLine) }
    if (Test-Path -LiteralPath $ConfigPath) { Copy-Item -LiteralPath $ConfigPath -Destination ($ConfigPath+'.bak') -Force }
    Move-Item -LiteralPath $candidate -Destination $ConfigPath -Force
  } finally { if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate } }
}
if ($NoUi) {
  if ($Language) { $config.language = $Language }
  if ($TimeZone) { $config.timeZone = $TimeZone }
  if ($CompletionAudio) { $config.completionAudio = $CompletionAudio }
  if ($RefreshAudio) { $config.refreshAudio = $RefreshAudio }
  Save-Settings
  Write-Output 'Settings saved; running services were not changed.'
  exit 0
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
if($RenderTo){Add-Type -TypeDefinition 'public class CqbOffscreenForm : System.Windows.Forms.Form { protected override bool ShowWithoutActivation { get { return true; } } }' -ReferencedAssemblies System.Windows.Forms,System.Drawing;$form=New-Object CqbOffscreenForm}else{$form=New-Object Windows.Forms.Form}
$form.Font=New-Object Drawing.Font('Segoe UI',9)
$form.Text = L 'BottomBar Companion - 设置' 'BottomBar Companion - Settings'
$form.Size = New-Object Drawing.Size(660,345)
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
function Add-Label([string]$Text,[int]$Y) {
  $label = New-Object Windows.Forms.Label
  $label.Text=$Text;$label.Location=New-Object Drawing.Point(16,$Y);$label.Size=New-Object Drawing.Size(190,25);$form.Controls.Add($label)
}
Add-Label (L '语言' 'Language') 22
$languageBox=New-Object Windows.Forms.ComboBox
$languageBox.DropDownStyle='DropDownList';$languageBox.Location=New-Object Drawing.Point(210,18);$languageBox.Width=410
$languageBox.Items.AddRange(@((L '跟随系统' 'System language'),'中文','English'))
$languageBox.SelectedIndex=[array]::IndexOf(@('auto','zh-CN','en'),[string]$config.language);if($languageBox.SelectedIndex -lt 0){$languageBox.SelectedIndex=0};$form.Controls.Add($languageBox)
Add-Label (L '时区' 'Time zone') 62
$zoneBox=New-Object Windows.Forms.TextBox;$zoneBox.Location=New-Object Drawing.Point(210,58);$zoneBox.Width=410;$zoneBox.Text=$config.timeZone;$form.Controls.Add($zoneBox)
$audioBoxes=@{}
foreach($entry in @(@('completionAudio',(L '完成提示音' 'Completion sound'),108),@('refreshAudio',(L '刷新提示音' 'Reset sound'),154))) {
  $key=$entry[0];$y=[int]$entry[2];Add-Label $entry[1] $y
  $box=New-Object Windows.Forms.TextBox;$box.Location=New-Object Drawing.Point(210,($y-4));$box.Width=315;$box.Text=$config[$key];$form.Controls.Add($box);$audioBoxes[$key]=$box
  $browse=New-Object Windows.Forms.Button;$browse.Text='WAV...';$browse.Location=New-Object Drawing.Point(536,($y-5));$browse.Width=84;$browse.Tag=$box
  $browse.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='WAV sound (*.wav)|*.wav';if($dialog.ShowDialog() -eq 'OK'){$this.Tag.Text=$dialog.FileName};$dialog.Dispose()});$form.Controls.Add($browse)
}
$hint=New-Object Windows.Forms.Label;$hint.Text=(L '提示音留空使用内置音效；时区填 auto、UTC 或 America/New_York 等 IANA 名称' 'Leave sounds empty for built-in tones. Time zone: auto, UTC, or an IANA name such as America/New_York.');$hint.Location=New-Object Drawing.Point(16,200);$hint.Size=New-Object Drawing.Size(610,42);$form.Controls.Add($hint)
$save=New-Object Windows.Forms.Button;$save.Text=(L '保存' 'Save');$save.Location=New-Object Drawing.Point(500,252);$save.Size=New-Object Drawing.Size(120,32)
$save.Add_Click({
  try {
    $config.language=@('auto','zh-CN','en')[$languageBox.SelectedIndex];$config.timeZone=$zoneBox.Text.Trim();if(-not $config.timeZone){$config.timeZone='auto'}
    foreach($key in $audioBoxes.Keys){$config[$key]=$audioBoxes[$key].Text.Trim()};Save-Settings
    $hint.Text=(L '已保存，下次使用本工具启动时生效；运行中可双击“重新加载.cmd”应用' 'Saved. Start the add-on to use these settings, or use Reload.cmd if it is already running.')
  } catch { $hint.Text=$_.Exception.Message }
});$form.Controls.Add($save)
if($RenderTo){$form.StartPosition='Manual';$form.Location=New-Object Drawing.Point(-30000,-30000);$form.ShowInTaskbar=$false;$form.Show();[Windows.Forms.Application]::DoEvents();$form.PerformLayout();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save([IO.Path]::GetFullPath($RenderTo),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose()}else{[void]$form.ShowDialog()};$form.Dispose()
