param([ValidateSet('schedule','cancel')][string]$Action,[Parameter(Mandatory=$true)][string]$StateDir,[string]$PlanId,[long]$Due)
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$canonical=[IO.Path]::GetFullPath($StateDir).TrimEnd('\').ToLowerInvariant()
$sha=[Security.Cryptography.SHA256]::Create()
try{$suffix=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid+'|'+$canonical)))).Replace('-','').Substring(0,24)}finally{$sha.Dispose()}
$name='TiBo-Shutdown-'+$suffix
$marker='TibosGoodIdea scheduled shutdown '+$suffix
$service=New-Object -ComObject Schedule.Service
$service.Connect();$folder=$service.GetFolder('\')
$existing=$null
try{$existing=$folder.GetTask($name)}catch{if($_.Exception.HResult -ne -2147024894){throw}}
if($existing -and $existing.Definition.RegistrationInfo.Description -ne $marker){throw 'Refusing to change a foreign Windows task'}
if($Action -eq 'cancel'){if($existing){$folder.DeleteTask($name,0)};exit 0}
if($PlanId -notmatch '^[a-f0-9-]{36}$' -or $Due -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Invalid shutdown plan'}
$definition=$service.NewTask(0)
$definition.RegistrationInfo.Description=$marker
$definition.Principal.UserId=$sid;$definition.Principal.LogonType=3;$definition.Principal.RunLevel=0
$definition.Settings.Enabled=$true
$definition.Settings.StartWhenAvailable=$false
$definition.Settings.DisallowStartIfOnBatteries=$false
$definition.Settings.StopIfGoingOnBatteries=$false
$definition.Settings.ExecutionTimeLimit='PT1M'
$trigger=$definition.Triggers.Create(1)
$trigger.StartBoundary=[DateTimeOffset]::FromUnixTimeMilliseconds($Due).LocalDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss")
$actionItem=$definition.Actions.Create(0)
$actionItem.Path=Join-Path $PSScriptRoot 'runtime/node.exe'
$actionItem.WorkingDirectory=$PSScriptRoot
$guardState=[IO.Path]::GetFullPath($StateDir).TrimEnd('\')
$actionItem.Arguments='"'+(Join-Path $PSScriptRoot 'shutdown-guard.mjs')+'" --state-dir "'+$guardState+'" --id '+$PlanId
$null=$folder.RegisterTaskDefinition($name,$definition,6,$sid,$null,3)
$installed=$folder.GetTask($name)
if($installed.Definition.Actions.Item(1).Arguments -ne $actionItem.Arguments){throw 'Windows task verification failed'}
