@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" -Script control-reminders.ps1 -Action stop
if errorlevel 1 pause
