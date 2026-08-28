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

## 座標優先定位（路口/模糊站點）

`Stops` 工作表新增：`緯度`、`經度`、`定位方式`、`需人工確認`、`定位備註`。

網站定位優先順序：
1. Excel 同一列同時有 `緯度` + `經度`：直接使用座標，不呼叫 Geocoder。
2. 沒有座標：使用 `定位搜尋文字` 交給 Google Maps Geocoder。
3. 仍找不到：站點清單保留，導航按鈕改用文字地址。

`需人工確認=TRUE` 的站點多半是路口、巷口或缺少完整門牌。建議在 Google Maps 找到實際候車側，右鍵複製座標後填回 `Stops` 的緯度、經度。只要兩欄都有數字，網站下一次產生 JSON 後就會直接使用該座標。


## 固定座標與定位優先順序

`Stops` 可填寫 `緯度`、`經度`、`座標來源`、`座標信心`。網站定位優先順序：

1. Excel 已有緯度/經度：直接使用固定座標。
2. 沒有固定座標：使用 `定位搜尋文字` 呼叫 Google Geocoder。
3. Google 無法定位：仍保留地址導航。

`座標信心=中` 且 `需人工確認=TRUE` 的位置通常只代表路口或附近公開地標，尚未確認實際交通車停靠側。
