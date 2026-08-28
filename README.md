# 公司交通車路線圖（Excel 管理 + 維護端自動定位）

目前包含 PDF 的 **上班車第 1–20 線**。

## 核心原則

平常維護者只需要修改：

```text
data/shuttle-data.xlsx
```

網站本身 **不會在員工瀏覽時做地址定位**。定位改成資料維護流程的一部分：

```text
Excel
  ↓ update-data.bat
缺少座標的站點自動定位
  ↓
成功座標寫回 Excel
  ↓
產生 shuttle-data.json
  ↓
網站直接讀座標顯示 Marker
```

因此使用者不會再看到「自動定位中 / 定位失敗」的站點徽章。

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
| 定位搜尋文字 | 自動定位實際送出的地址，例如「新竹市民族路34號」 |
| 緯度 / 經度 | 由更新程式自動寫回；已有座標就不會重複查詢 |
| 備註 | 自由備註 |
| 定位狀態 | 更新程式自動寫入「已定位」或失敗原因 |
| 最後定位時間 | 更新程式自動寫入最後一次嘗試時間 |

如果某站地址改了，請修改「定位搜尋文字」，並把該列的 **緯度 / 經度清空**，再執行 `update-data.bat`，程式就會重新定位。

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

1. 開啟 `data/shuttle-data.xlsx`
2. 修改 Routes / Stops / RouteStops
3. 儲存 Excel
4. 雙擊 `update-data.bat`
5. 程式只查詢 **緯度、經度為空白** 的啟用站點
6. 成功後座標直接寫回 Excel
7. 自動產生 `data/shuttle-data.json`
8. 確認完成後再 `git add / commit / push`

第一次執行若電腦沒有 `openpyxl`，`update-data.bat` 會嘗試用 pip 安裝。

### 更新畫面示意

```text
待定位：6 個站點
✓ S001 中華路三段9號：24.xxxxxx, 120.xxxxxx
✓ S002 民族路34號：24.xxxxxx, 120.xxxxxx
✗ S003 南大路81號：找不到結果

定位完成：成功 2、失敗 1、實際送出查詢 3
成功座標已寫回 Excel；下次不會重複查詢這些站點。
```

定位失敗不會阻止 JSON 產生。該站在網站上暫時沒有 Marker，但「導航」仍會把「定位搜尋文字」交給 Google Maps。

---

## 本機啟動網站

`start.bat` **只負責 Excel → JSON + 啟動 Web Server，不會重新定位**。

```text
start.bat
  ↓
http://localhost:8080
```

有修改地點資料時，先執行 `update-data.bat`；單純看網站時執行 `start.bat` 即可。

---

## 地址定位服務

目前 `scripts/geocode-stops.py` 預設使用 OpenStreetMap Foundation 的公開 Nominatim 服務。

官方使用政策：

https://operations.osmfoundation.org/policies/nominatim/

程式已遵守主要限制：

- 單執行緒
- 請求間隔至少約 1.1 秒（不超過 1 request/second）
- 使用可辨識的 User-Agent
- 成功結果寫回 Excel 作為快取，不重複查詢
- GitHub Actions **不執行 geocoding**

可用環境變數更換定位服務，不必改程式：

```text
SHUTTLE_GEOCODER_URL
```

也可提供聯絡資訊到 User-Agent：

```text
SHUTTLE_GEOCODER_CONTACT
```

> 注意：Nominatim 官方政策要求不要提交個人資料或其他機密資料。這份原始交通車 PDF 本身標示僅供內部使用；正式環境若公司政策不允許把站點搜尋文字送到公開服務，請把 `SHUTTLE_GEOCODER_URL` 改成公司允許的 geocoding 服務或內部 Nominatim。

---

## GitHub Pages

專案內含：

```text
.github/workflows/deploy-pages.yml
```

GitHub Actions 的流程是：

```text
已經包含座標的 shuttle-data.xlsx
        ↓
generate-data.py
        ↓
shuttle-data.json
        ↓
GitHub Pages
```

**Actions 不會自動對外查地址。** 所以建議 push 前先在本機執行 `update-data.bat`，讓新站點座標寫回 Excel。

第一次設定 Repository：

1. Settings
2. Pages
3. Source 選 **GitHub Actions**
4. Push 到 `main`

> 若 Repository / Pages 是公開的，路線與站點資料也可能對外公開。正式使用前請依公司政策設定部署位置與存取權限。

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
│   ├── geocode-stops.py       ← 缺座標時自動定位並寫回 Excel
│   └── generate-data.py       ← Excel → JSON
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── requirements.txt
├── update-data.bat
└── start.bat
```
