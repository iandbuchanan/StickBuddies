@echo off
rem Runs every program the StickBuddies have written and shows what each one prints.
cd /d "%~dp0their code"
if errorlevel 1 (
  echo The buddies haven't written any code yet. Check back later!
  pause
  exit /b
)
echo ============================================
echo   PROGRAMS WRITTEN BY THE STICKBUDDIES
echo ============================================
for /d %%B in (*) do (
  for %%F in ("%%B\*.js") do (
    echo.
    echo ---- %%B wrote %%~nxF ----
    node "%%F"
  )
)
echo.
echo ============================================
pause
