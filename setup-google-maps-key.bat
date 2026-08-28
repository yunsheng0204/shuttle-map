@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist config mkdir config

echo.
echo Google Maps API Key 設定
echo ------------------------
echo 這個 Key 會在瀏覽器端使用，因此請在 Google Cloud 將它限制為：
echo   1. Application restriction: Websites ^(HTTP referrers^)
echo   2. API restrictions: Maps JavaScript API + Geocoding API
echo.
set /p GOOGLE_KEY=請貼上 Google Maps Browser API Key: 
if "%GOOGLE_KEY%"=="" (
  echo.
  echo 未輸入 API Key，取消。
  pause
  exit /b 1
)

> config\google-maps-config.local.json echo {"apiKey":"%GOOGLE_KEY%"}

echo.
echo 已寫入 config\google-maps-config.local.json
 echo 此檔案已加入 .gitignore，不會被 Git 提交。
echo.
echo 接著執行 start.bat 即可測試。
pause
