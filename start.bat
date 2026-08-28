@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON=python"
where py >nul 2>nul
if %errorlevel%==0 set "PYTHON=py -3"

%PYTHON% scripts\generate-data.py || exit /b 1
start "" http://localhost:8080
%PYTHON% -m http.server 8080
