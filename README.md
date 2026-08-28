# 公司交通車路線圖（Excel 管理 + Google Maps 自動定位）

目前包含 PDF 的 **上班車第 1–60 線**。

## 目前架構

人工只維護：

```text
data/shuttle-data.xlsx
```

網站資料流程：

```text
Excel
  ↓ update-data.bat
shuttle-data.json
  ↓
使用者選路線
  ↓
Google Maps JavaScript API + Geocoding API
  ↓
依「定位搜尋文字」自動找站點並顯示 Marker
```

不再使用 OpenStreetMap Nominatim，所以不會再遇到先前公開 Nominatim 的 HTTP 429 問題。

> Google Geocoding 的結果不會寫回 Excel、JSON 或 localStorage；只在目前瀏覽器頁面記憶體內暫存，重新整理頁面後即消失。

---

## 先申請 Google Maps API Key

Google 官方設定文件：

https://developers.google.com/maps/documentation/javascript/get-api-key

https://developers.google.com/maps/documentation/javascript/geocoding

需要：

1. 建立 Google Cloud Project
2. 綁定 Billing Account
3. 啟用 **Maps JavaScript API**
4. 啟用 **Geocoding API**
5. 建立一把 Browser API Key

### 建議的 Key 限制

Application restrictions：

```text
Websites (HTTP referrers)
```

本機測試可加入：

```text
http://localhost:8080/*
http://127.0.0.1:8080/*
```

GitHub Pages 再加入：

```text
https://你的帳號.github.io/*
```

API restrictions 建議只允許：

```text
Maps JavaScript API
Geocoding API
```

不要把未限制的 API Key 公開到 GitHub。

---

## 本機第一次設定

雙擊：

```text
setup-google-maps-key.bat
```

貼上 Browser API Key。

程式會產生：

```text
config/google-maps-config.local.json
```

這個檔案已列入 `.gitignore`，不會被 Git 提交。

接著雙擊：

```text
start.bat
```

然後瀏覽：

```text
http://localhost:8080
```

---

## Excel 的 3 個工作表

### Routes

一列代表一條路線，管理 RouteID、類型、路線編號、名稱、生效日與行駛路線。

### Stops

所有地點統一在這裡管理。最重要欄位：

| 欄位 | 用途 |
|---|---|
| StopID | 地點唯一 ID，例如 S001 |
| 顯示名稱 | 網頁顯示的站名 |
| 候車地標 | 例如玉山銀行、捷運出口 |
| PDF原文 | 保留 PDF 原始描述 |
| 定位搜尋文字 | 實際交給 Google Maps 搜尋的地址 |
| 備註 | 維護用備註 |

例如：

```text
顯示名稱：民族路34號
定位搜尋文字：新竹市民族路34號
```

同一個地點被多條路線使用時，只需要維護一個 StopID。

### RouteStops

管理：

```text
RouteID + 順序 + StopID + 時間
```

用來表示某條路線依序停靠哪些站點。

---

## 平常維護流程

1. 開啟 `data/shuttle-data.xlsx`
2. 修改 Routes / Stops / RouteStops
3. 儲存 Excel
4. 雙擊 `update-data.bat`
5. 產生新版 `data/shuttle-data.json`
6. 執行 `start.bat` 測試
7. 確認後 git commit / push

地址更動時，只需要修改 Stops 的「定位搜尋文字」。

不需要手動管理經緯度。

---

## GitHub Pages

專案內含：

```text
.github/workflows/deploy-pages.yml
```

### GitHub Secret

到 Repository：

```text
Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

新增：

```text
Name: GOOGLE_MAPS_BROWSER_KEY
Value: 你的 Google Maps Browser API Key
```

Workflow 部署時會自動產生：

```text
config/google-maps-config.json
```

API Key 不會存在 Git Repository 的原始檔案中。

> 瀏覽器端的 Maps JavaScript API Key 最終仍可由使用者的瀏覽器看到，這是 Google Maps JavaScript API 的正常運作方式。因此務必使用 **HTTP referrer restrictions + API restrictions** 保護 Key。

### Pages 設定

```text
Settings
→ Pages
→ Source
→ GitHub Actions
```

Push 到 `main` 後會自動部署。

---

## Google Maps / Geocoding 注意事項

Google Geocoding API 使用需要遵循 Google Maps Platform 的政策：

https://developers.google.com/maps/documentation/geocoding/policies

因此此版本：

- 地圖改用 Google Maps，不再用 Leaflet / OpenStreetMap 顯示 Google geocoding 結果。
- Google geocoding 的座標不永久寫入 Excel / JSON。
- 同一頁面內重複切換路線時，只做 session memory cache，減少重複查詢。
- 重新整理後重新依地址定位。

Google Maps Platform 為計量計費服務，正式使用前請在 Google Cloud 設定 Billing、Quota 與 Budget alerts。

---

## 專案結構

```text
shuttle-map-20/
├── index.html
├── css/
├── js/
│   ├── app.js
│   └── map.js
├── config/
│   └── google-maps-config.example.json
├── data/
│   ├── shuttle-data.xlsx      ← 人工唯一維護資料
│   └── shuttle-data.json      ← 自動產生
├── scripts/
│   └── generate-data.py       ← Excel → JSON
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── setup-google-maps-key.bat
├── update-data.bat
└── start.bat
```
