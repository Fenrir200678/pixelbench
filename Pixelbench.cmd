@echo off
rem Starts Pixelbench and opens it in the default browser. Close this window or press Ctrl+C to stop it.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  rem fnm puts node on PATH from the shell profile only. Load its default version for this window.
  where fnm >nul 2>nul && for /f "tokens=*" %%i in ('fnm env --shell cmd') do call %%i
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run install.cmd first.
  pause
  exit /b 1
)
node scripts\launch.mjs %*
if errorlevel 1 pause
