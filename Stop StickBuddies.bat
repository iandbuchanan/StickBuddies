@echo off
rem Closes StickBuddies. They save everything they learned first, so they never forget.
cd /d "%~dp0"
echo stop> stop.request
echo Saving their memories...
powershell -NoProfile -Command "$t=0; while ($t -lt 40 -and (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*StickBuddies*' })) { Start-Sleep -Milliseconds 100; $t++ }; Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*StickBuddies*' } | Stop-Process -Force"
del stop.request 2>nul
echo StickBuddies closed. Their memories are saved in memory.json
timeout /t 2 >nul
