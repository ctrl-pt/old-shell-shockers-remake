@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd install
echo Open http://localhost:3000 in your browser.
call npm.cmd start
