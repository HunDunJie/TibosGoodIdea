@echo off
setlocal
set "TIBO_UNINSTALL_SCRIPT=%~dp0bootstrap.ps1"
cd /d "%TEMP%"
(
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TIBO_UNINSTALL_SCRIPT%" -Script uninstall.ps1 %*
  if errorlevel 1 (
    pause
    exit 1
  )
  exit 0
)
