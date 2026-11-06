@echo off
cd /d "%~dp0"
node scripts\stop-host.mjs
if errorlevel 1 pause
