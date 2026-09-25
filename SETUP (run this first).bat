@echo off
rem Run this ONCE before starting StickBuddies. It downloads the parts StickBuddies needs (Electron).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo You need Node.js first!
  echo Get the "LTS" version from https://nodejs.org , install it, then run this file again.
  echo.
  pause
  exit /b
)
echo Downloading what StickBuddies needs... (this can take a few minutes)
call npm install
node node_modules\electron\install.js
echo.
echo All set! Now double-click "Start StickBuddies.bat".
pause
