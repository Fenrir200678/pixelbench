@echo off
rem Double-click to install or repair Pixelbench. Options are passed on, see: install.cmd --help
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "code=%errorlevel%"
echo.
pause
exit /b %code%
