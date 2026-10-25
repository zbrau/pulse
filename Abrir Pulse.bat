@echo off
title Pulse Desktop
cd /d "%~dp0"
set USERDATA=%LOCALAPPDATA%\PulseMusic
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173 --window-size=1280,820 --user-data-dir="%USERDATA%"
exit
