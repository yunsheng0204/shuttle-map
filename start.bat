@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\generate-data.py || exit /b 1
  start "" http://localhost:8080
  py -3 -m http.server 8080
) else (
  python scripts\generate-data.py || exit /b 1
  start "" http://localhost:8080
  python -m http.server 8080
)
