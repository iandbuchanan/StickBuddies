@echo off
rem Starts StickBuddies. If they are already running, this does nothing.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
