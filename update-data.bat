@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\generate-data.py
) else (
  python scripts\generate-data.py
)
if errorlevel 1 (
  echo.
  echo Excel 資料有錯誤，請依上方訊息修正後再執行。
  pause
  exit /b 1
)
echo.
echo shuttle-data.json 已更新完成。
pause
