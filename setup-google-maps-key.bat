@echo off
setlocal
cd /d "%~dp0"

if not exist config mkdir config

echo.
echo Google Maps API Key Setup
echo -------------------------
echo.
set /p GOOGLE_KEY=Paste your Google Maps API Key: 

if "%GOOGLE_KEY%"=="" (
    echo No API Key entered.
    pause
    exit /b 1
)

>config\google-maps-config.local.json echo {"apiKey":"%GOOGLE_KEY%"}

echo.
echo API Key configuration created.
echo File: config\google-maps-config.local.json
echo.
pause