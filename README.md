# 公司交通車路線圖

目前資料：

- 上班車：60 條
- 下班車：26 條
- Excel 為唯一人工維護來源：`data/shuttle-data.xlsx`
- `scripts/generate-data.py` 將 Excel 轉成 `data/shuttle-data.json`
- Google Maps JavaScript API 依 `Stops` 的「定位搜尋文字」定位站點

## 下班車定位原則

PDF 下班車表格的下排有些停靠點只有「某路口」、「過某路」、「某店家」等簡寫。Excel 中會保留 PDF 原文，另外在「定位搜尋文字」依同一列上排的行駛路線補入道路、行政區或交叉路口脈絡，以提高 Google Maps 定位成功率。

若屬推定或補全資料，會在 `Stops` 的「備註」欄留下說明，方便後續人工核對。

## 本機

1. 執行 `setup-google-maps-key.bat` 設定本機 Google Maps Browser API Key。
2. 執行 `start.bat`。
3. 開啟 `http://localhost:8080`。

## GitHub Pages

Repository secret 名稱：

`GOOGLE_MAPS_BROWSER_KEY`

Push 到 `main` 後，GitHub Actions 會自動把 Excel 轉成 JSON 並部署 Pages。

> 注意：交通車資料為內部資料。請依公司規範決定 Repository 與網站的存取範圍。
