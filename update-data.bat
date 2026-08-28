@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON=python"
where py >nul 2>nul
if %errorlevel%==0 set "PYTHON=py -3"

%PYTHON% -c "import openpyxl" >nul 2>nul
if errorlevel 1 (
  echo Installing required Python package: openpyxl
  %PYTHON% -m pip install --user -r requirements.txt
  if errorlevel 1 (
    echo.
    echo Failed to install openpyxl.
    pause
    exit /b 1
  )
)

echo.
echo [1/2] Geocoding missing stops and writing coordinates back to Excel...
%PYTHON% scripts\geocode-stops.py
if errorlevel 1 (
  echo.
  echo Geocoding script failed. Please review the error above.
  pause
  exit /b 1
)

echo.
echo [2/2] Generating JSON from Excel...
%PYTHON% scripts\generate-data.py
if errorlevel 1 (
  echo.
  echo Excel data has errors. Please fix them and run again.
  pause
  exit /b 1
)

echo.
echo Done. Coordinates were cached in data\shuttle-data.xlsx and JSON was updated.
pause
