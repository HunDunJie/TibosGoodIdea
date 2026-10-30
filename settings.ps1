param([switch]$NoUi,[string]$TimeZone='',[string]$CompletionAudio='',[string]$RefreshAudio='',[string]$ConfigPath='',[string]$RenderTo='',[string]$StateDir='')
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if (-not $ConfigPath) { $ConfigPath = Get-CqbConfigPath }
$config = [ordered]@{language='auto';timeZone='auto';completionAudio='';refreshAudio=''}
if (Test-Path -LiteralPath $ConfigPath) {
  $oldConfig = [IO.File]::ReadAllText($ConfigPath) | ConvertFrom-Json
  foreach ($property in $oldConfig.PSObject.Properties) { $config[$property.Name] = $property.Value }
}
Set-CqbLanguage $StateDir
$config.language='auto'
function Save-Settings {
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
  if ($TimeZone) { $config.timeZone = $TimeZone }
  if ($CompletionAudio) { $config.completionAudio = $CompletionAudio }
  if ($RefreshAudio) { $config.refreshAudio = $RefreshAudio }
  Save-Settings
  Write-Output (L '设置已保存' 'Settings saved' '設定を保存しました')
  exit 0
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
if($RenderTo){Add-Type -TypeDefinition 'public class CqbOffscreenForm : System.Windows.Forms.Form { protected override bool ShowWithoutActivation { get { return true; } } }' -ReferencedAssemblies System.Windows.Forms,System.Drawing;$form=New-Object CqbOffscreenForm}else{$form=New-Object Windows.Forms.Form}
$form.Font=New-Object Drawing.Font('Segoe UI',9)
$form.Size = New-Object Drawing.Size(660,345)
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$localizedControls=New-Object Collections.ArrayList
function Set-CqbText($Control,[string]$Chinese,[string]$English,[string]$Japanese) {
  $Control.Tag=@($Chinese,$English,$Japanese);$Control.Text=L $Chinese $English $Japanese
  if(-not $localizedControls.Contains($Control)){[void]$localizedControls.Add($Control)}
}
Set-CqbText $form "Tibo’s Good Idea - 设置" "Tibo’s Good Idea - Settings" "Tibo’s Good Idea - 設定"
function Add-Label([string]$Chinese,[string]$English,[string]$Japanese,[int]$Y) {
  $label=New-Object Windows.Forms.Label
  Set-CqbText $label $Chinese $English $Japanese
  $label.Location=New-Object Drawing.Point(16,$Y);$label.Size=New-Object Drawing.Size(190,25);$form.Controls.Add($label)
}
$languageNote=New-Object Windows.Forms.Label
Set-CqbText $languageNote '界面语言自动跟随 Codex' 'Language follows Codex automatically' '表示言語は Codex に自動的に合わせます'
$languageNote.Location=New-Object Drawing.Point(16,22);$languageNote.Size=New-Object Drawing.Size(610,25);$form.Controls.Add($languageNote)
Add-Label '时区' 'Time zone' 'タイムゾーン' 62
$zoneBox=New-Object Windows.Forms.TextBox;$zoneBox.Location=New-Object Drawing.Point(210,58);$zoneBox.Width=410;$zoneBox.Text=$config.timeZone;$form.Controls.Add($zoneBox)
$audioBoxes=@{}
foreach($entry in @(@('completionAudio','完成提示音','Completion sound','完了通知音',108),@('refreshAudio','刷新提示音','Reset sound','更新通知音',154))) {
  $key=$entry[0];$y=[int]$entry[4];Add-Label $entry[1] $entry[2] $entry[3] $y
  $box=New-Object Windows.Forms.TextBox;$box.Location=New-Object Drawing.Point(210,($y-4));$box.Width=315;$box.Text=$config[$key];$form.Controls.Add($box);$audioBoxes[$key]=$box
  $browse=New-Object Windows.Forms.Button;$browse.Text='WAV...';$browse.Location=New-Object Drawing.Point(536,($y-5));$browse.Width=84;$browse.Tag=$box
  $browse.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='WAV (*.wav)|*.wav';if($dialog.ShowDialog() -eq 'OK'){$this.Tag.Text=$dialog.FileName};$dialog.Dispose()});$form.Controls.Add($browse)
}
$hint=New-Object Windows.Forms.Label
Set-CqbText $hint '提示音留空使用内置音效；时区填 auto、UTC 或 America/New_York 等 IANA 名称' 'Leave sounds empty for built-in tones. Time zone: auto, UTC, or an IANA name such as America/New_York.' '通知音が空欄の場合は内蔵音を使用します タイムゾーンには auto、UTC または America/New_York などの IANA 名を入力してください'
$hint.Location=New-Object Drawing.Point(16,200);$hint.Size=New-Object Drawing.Size(610,42);$form.Controls.Add($hint)
$save=New-Object Windows.Forms.Button
Set-CqbText $save '保存' 'Save' '保存'
$save.Location=New-Object Drawing.Point(500,252);$save.Size=New-Object Drawing.Size(120,32)
$save.Add_Click({
  try {
    $config.language='auto';$config.timeZone=$zoneBox.Text.Trim();if(-not $config.timeZone){$config.timeZone='auto'}
    foreach($key in $audioBoxes.Keys){$config[$key]=$audioBoxes[$key].Text.Trim()};Save-Settings
    Set-CqbText $hint '已保存，下次使用本工具启动时生效；运行中可双击“重新加载.cmd”应用' 'Saved. Start the add-on to use these settings, or use Reload.cmd if it is already running.' '保存しました 次回起動時に反映されます 起動中は Reload.cmd で反映できます'
  } catch { $hint.Text=$_.Exception.Message }
});$form.Controls.Add($save)
$lastSettingsLanguage=$script:CqbLanguage
$languageTimer=New-Object Windows.Forms.Timer;$languageTimer.Interval=1000
$languageTimer.Add_Tick({
  Set-CqbLanguage $StateDir
  if($script:CqbLanguage -ne $script:lastSettingsLanguage){
    foreach($control in $localizedControls){$control.Text=L $control.Tag[0] $control.Tag[1] $control.Tag[2]}
    $script:lastSettingsLanguage=$script:CqbLanguage
  }
});$languageTimer.Start()
if($RenderTo){$form.StartPosition='Manual';$form.Location=New-Object Drawing.Point(-30000,-30000);$form.ShowInTaskbar=$false;$form.Show();[Windows.Forms.Application]::DoEvents();$form.PerformLayout();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save([IO.Path]::GetFullPath($RenderTo),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose()}else{[void]$form.ShowDialog()};$languageTimer.Stop();$languageTimer.Dispose();$form.Dispose()
