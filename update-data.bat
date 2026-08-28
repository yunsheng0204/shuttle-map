@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON=python"
where py >nul 2>nul
if %errorlevel%==0 set "PYTHON=py -3"

echo.
echo Generating JSON from Excel...
%PYTHON% scripts\generate-data.py
if errorlevel 1 (
  echo.
  echo Excel data has errors. Please fix them and run again.
  pause
  exit /b 1
)

echo.
echo Done. data\shuttle-data.json was updated.
pause
