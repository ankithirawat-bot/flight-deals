@echo off
cd /d "%~dp0"

schtasks /create /tn "FlightDealScanner" /tr "node D:\flight-deals\scanner.js" /sc hourly /mo 6 /st 08:00 /f

echo.
echo Scheduled task created! Scanner will run every 6 hours starting at 8:00 AM.
echo Check Task Scheduler to verify or modify.
pause
