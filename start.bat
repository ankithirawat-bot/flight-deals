@echo off
cd /d "%~dp0"
if not exist node_modules call npm install --silent
node scanner.js
pause
