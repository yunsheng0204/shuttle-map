# 公司交通車路線圖（Excel 管理版）

目前包含 PDF 的 **上班車第 1–20 線**。

## 核心原則

平常維護者只需要修改：

```text
data/shuttle-data.xlsx
```

不要手動維護 `data/shuttle-data.json`。JSON 是網站使用的產物，會由：

```text
scripts/generate-data.py
```

自動從 Excel 產生。

---

## Excel 的 3 個工作表

### 1. Routes

一列代表一條路線。

| 欄位 | 用途 |
|---|---|
| 啟用 | FALSE 可暫停顯示，不必刪資料 |
| RouteID | 路線唯一 ID，例如 M001 |
| 類型 | 上班 / 下班 / 加班 |
| 路線編號 | 顯示用編號 |
| 路線名稱 | 例如新竹線 |
| 車型 | 可填大巴 / 中巴 / 小巴 |
| 生效日 | 例如 2026-06-23 |
| 行駛路線 | PDF 的道路路線描述 |
| 備註 | 自由備註 |

### 2. Stops

**所有地點統一在這裡維護。** 同一地點被多條路線使用時，只保留一個 StopID。

| 欄位 | 用途 |
|---|---|
| 啟用 | FALSE 可停用該地點 |
| StopID | 地點唯一 ID，例如 S001 |
| 顯示名稱 | 網頁顯示名稱 |
| 候車地標 | 例如玉山銀行、捷運出口 |
| PDF原文 | 保留 PDF 原始說明 |
| 定位搜尋文字 | 自動定位實際送出的地址 |
| 緯度 / 經度 | 選填；有填時網站直接使用，不再查地址 |
| 備註 | 自由備註 |

### 3. RouteStops

把路線和地點串起來。

| 欄位 | 用途 |
|---|---|
| 啟用 | FALSE 可暫停某一站 |
| RouteID | 對應 Routes |
| 順序 | 該路線第幾站 |
| StopID | 對應 Stops |
| 時間 | 例如 06:25 |
| 備註 | 自由備註 |

---

## 平常維護流程

### 方法 A：Windows 最簡單

1. 開啟 `data/shuttle-data.xlsx`
2. 修改 Routes / Stops / RouteStops
3. 儲存 Excel
4. 雙擊 `update-data.bat`
5. 程式會檢查資料並重新產生 `data/shuttle-data.json`

若 RouteID、StopID 填錯或順序重複，轉換程式會直接顯示錯誤，不會默默產生壞資料。

### 方法 B：直接啟動網站

雙擊：

```text
start.bat
```

它會先執行 Excel → JSON，再啟動：

```text
http://localhost:8080
```

---

## 定位邏輯

網站的優先順序是：

```text
Stops 內已填緯度/經度
        ↓ 沒填
瀏覽器已存在的定位快取
        ↓ 沒有
依「定位搜尋文字」呼叫 OpenStreetMap Nominatim
        ↓ 失敗
Google Maps 仍可用地址文字導航
```

因此平常只要把地址填在 Excel 的「定位搜尋文字」即可。

---

## GitHub Pages 自動部署

專案已包含：

```text
.github/workflows/deploy-pages.yml
```

每次 push 到 `main`：

```text
shuttle-data.xlsx
      ↓
GitHub Actions
      ↓
generate-data.py
      ↓
shuttle-data.json
      ↓
GitHub Pages
```

第一次設定 GitHub Repository 時：

1. Repository → **Settings**
2. **Pages**
3. Source 選擇 **GitHub Actions**
4. Push 到 `main`

之後只要更新 Excel 並 push，就會自動重新產生資料與部署網頁。

> 注意：原始 PDF 標示僅供內部使用。若 Repository 或 Pages 是公開的，交通車路線與站點資料也可能對外公開；正式使用前請依公司政策決定部署位置與存取權限。

---

## 專案結構

```text
shuttle-map-20/
├── index.html
├── css/
├── js/
├── data/
│   ├── shuttle-data.xlsx      ← 唯一人工維護資料
│   └── shuttle-data.json      ← 自動產生
├── scripts/
│   └── generate-data.py
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── update-data.bat
└── start.bat
```
