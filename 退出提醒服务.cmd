@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0control-reminders.ps1" -Action shutdown
if errorlevel 1 pause
