@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1"
if errorlevel 1 pause
