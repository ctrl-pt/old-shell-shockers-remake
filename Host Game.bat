@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, then run this launcher again.
  pause
  exit /b 1
)
node -e "const p=require('./package.json');for(const n of ['ws','ssh2'])if(require(n+'/package.json').version!==p.dependencies[n])process.exit(1)" >nul 2>nul
if errorlevel 1 call npm.cmd ci --ignore-scripts
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\host-game.mjs
if errorlevel 1 pause
