#!/usr/bin/env python3
"""Convert the human-maintained Excel workbook into shuttle-data.json.

No third-party Python package is required. The script reads the XLSX file using
Python's standard library so it can run locally and in GitHub Actions without
installing dependencies.
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
XLSX_PATH = ROOT / "data" / "shuttle-data.xlsx"
JSON_PATH = ROOT / "data" / "shuttle-data.json"

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

TYPE_TO_CODE = {"上班": "morning", "下班": "evening", "加班": "overtime"}


def col_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref or "")
    if not letters:
        return 0
    value = 0
    for ch in letters.group(0):
        value = value * 26 + (ord(ch) - 64)
    return value - 1


def normalize_target(target: str) -> str:
    target = target.replace("\\", "/")
    while target.startswith("../"):
        target = target[3:]
    if target.startswith("/"):
        target = target[1:]
    if not target.startswith("xl/"):
        target = "xl/" + target
    return target


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(path))
    out = []
    for si in root.findall(f"{{{NS_MAIN}}}si"):
        texts = [node.text or "" for node in si.iter(f"{{{NS_MAIN}}}t")]
        out.append("".join(texts))
    return out


def workbook_sheet_paths(zf: zipfile.ZipFile) -> dict[str, str]:
    wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rels = {
        rel.attrib["Id"]: normalize_target(rel.attrib["Target"])
        for rel in rel_root.findall(f"{{{NS_PKG_REL}}}Relationship")
    }
    result = {}
    sheets_node = wb_root.find(f"{{{NS_MAIN}}}sheets")
    for sheet in list(sheets_node) if sheets_node is not None else []:
        name = sheet.attrib.get("name", "")
        rid = sheet.attrib.get(f"{{{NS_REL}}}id")
        if name and rid in rels:
            result[name] = rels[rid]
    return result


def cell_value(cell: ET.Element, shared: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{NS_MAIN}}}t"))
    v = cell.find(f"{{{NS_MAIN}}}v")
    if v is None or v.text is None:
        return None
    raw = v.text
    if cell_type == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return raw
    if cell_type == "b":
        return raw == "1"
    if cell_type in ("str", "e"):
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_sheet_rows(zf: zipfile.ZipFile, path: str, shared: list[str]) -> list[list]:
    root = ET.fromstring(zf.read(path))
    sheet_data = root.find(f"{{{NS_MAIN}}}sheetData")
    rows = []
    if sheet_data is None:
        return rows
    for row in sheet_data.findall(f"{{{NS_MAIN}}}row"):
        values = {}
        max_col = -1
        for cell in row.findall(f"{{{NS_MAIN}}}c"):
            idx = col_index(cell.attrib.get("r", ""))
            values[idx] = cell_value(cell, shared)
            max_col = max(max_col, idx)
        rows.append([values.get(i) for i in range(max_col + 1)] if max_col >= 0 else [])
    return rows


def sheet_as_dicts(zf: zipfile.ZipFile, name: str, paths: dict[str, str], shared: list[str]) -> list[dict]:
    if name not in paths:
        raise ValueError(f"Excel 缺少工作表：{name}")
    rows = read_sheet_rows(zf, paths[name], shared)
    if not rows:
        return []
    headers = [str(v or "").strip() for v in rows[0]]
    result = []
    for row in rows[1:]:
        if not any(v not in (None, "") for v in row):
            continue
        padded = row + [None] * (len(headers) - len(row))
        result.append({headers[i]: padded[i] for i in range(len(headers))})
    return result


def enabled(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return True
    return str(value).strip().lower() not in {"false", "0", "否", "n", "no"}


def text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def number_or_none(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_data() -> dict:
    if not XLSX_PATH.exists():
        raise FileNotFoundError(f"找不到 {XLSX_PATH}")

    with zipfile.ZipFile(XLSX_PATH) as zf:
        shared = read_shared_strings(zf)
        paths = workbook_sheet_paths(zf)
        route_rows = sheet_as_dicts(zf, "Routes", paths, shared)
        stop_rows = sheet_as_dicts(zf, "Stops", paths, shared)
        route_stop_rows = sheet_as_dicts(zf, "RouteStops", paths, shared)

    errors = []
    routes_by_id = {}
    route_order = []
    effective_dates = []

    for row_num, row in enumerate(route_rows, start=2):
        if not enabled(row.get("啟用")):
            continue
        rid = text(row.get("RouteID"))
        if not rid:
            errors.append(f"Routes 第 {row_num} 列：RouteID 不可空白")
            continue
        if rid in routes_by_id:
            errors.append(f"Routes 第 {row_num} 列：RouteID 重複 {rid}")
            continue
        route_type_cn = text(row.get("類型")) or "上班"
        route_type = TYPE_TO_CODE.get(route_type_cn)
        if not route_type:
            errors.append(f"Routes 第 {row_num} 列：未知類型 {route_type_cn}")
            route_type = route_type_cn
        try:
            route_number = int(float(row.get("路線編號")))
        except (TypeError, ValueError):
            errors.append(f"Routes 第 {row_num} 列：路線編號不是數字")
            route_number = 0
        effective_date = text(row.get("生效日"))
        if effective_date:
            effective_dates.append(effective_date)
        routes_by_id[rid] = {
            "id": rid,
            "number": route_number,
            "name": text(row.get("路線名稱")),
            "type": route_type,
            "vehicleType": text(row.get("車型")),
            "effectiveDate": effective_date,
            "routeDescription": text(row.get("行駛路線")),
            "notes": text(row.get("備註")),
            "stops": [],
        }
        route_order.append(rid)

    locations = {}
    for row_num, row in enumerate(stop_rows, start=2):
        if not enabled(row.get("啟用")):
            continue
        sid = text(row.get("StopID"))
        if not sid:
            errors.append(f"Stops 第 {row_num} 列：StopID 不可空白")
            continue
        if sid in locations:
            errors.append(f"Stops 第 {row_num} 列：StopID 重複 {sid}")
            continue
        lat = number_or_none(row.get("緯度"))
        lng = number_or_none(row.get("經度"))
        if (lat is None) != (lng is None):
            errors.append(f"Stops 第 {row_num} 列：{sid} 緯度與經度必須同時填寫或同時留白")
        if lat is not None and not (-90 <= lat <= 90):
            errors.append(f"Stops 第 {row_num} 列：{sid} 緯度超出範圍")
        if lng is not None and not (-180 <= lng <= 180):
            errors.append(f"Stops 第 {row_num} 列：{sid} 經度超出範圍")
        loc = {
            "id": sid,
            "displayName": text(row.get("顯示名稱")),
            "landmark": text(row.get("候車地標")),
            "sourceText": text(row.get("PDF原文")),
            "geocodeQuery": text(row.get("定位搜尋文字")),
            "notes": text(row.get("備註")),
        }
        if lat is not None and lng is not None:
            loc["lat"] = lat
            loc["lng"] = lng
        locations[sid] = loc

    grouped = defaultdict(list)
    seen_route_stop = set()
    for row_num, row in enumerate(route_stop_rows, start=2):
        if not enabled(row.get("啟用")):
            continue
        rid = text(row.get("RouteID"))
        sid = text(row.get("StopID"))
        if rid not in routes_by_id:
            errors.append(f"RouteStops 第 {row_num} 列：找不到 RouteID {rid}")
            continue
        if sid not in locations:
            errors.append(f"RouteStops 第 {row_num} 列：找不到 StopID {sid}")
            continue
        try:
            order = int(float(row.get("順序")))
        except (TypeError, ValueError):
            errors.append(f"RouteStops 第 {row_num} 列：順序不是數字")
            continue
        key = (rid, order)
        if key in seen_route_stop:
            errors.append(f"RouteStops 第 {row_num} 列：{rid} 的順序 {order} 重複")
        seen_route_stop.add(key)
        grouped[rid].append({
            "order": order,
            "locationId": sid,
            "time": text(row.get("時間")),
            "notes": text(row.get("備註")),
        })

    for rid, route in routes_by_id.items():
        entries = sorted(grouped.get(rid, []), key=lambda x: x["order"])
        route["stops"] = [
            {k: v for k, v in entry.items() if k != "order" and v not in ("", None)}
            for entry in entries
        ]
        if not route["stops"]:
            errors.append(f"Routes：{rid} 沒有任何啟用的停靠站")

    if errors:
        raise ValueError("\n".join(errors))

    effective = max(effective_dates) if effective_dates else ""
    return {
        "meta": {
            "title": "公司交通車路線圖",
            "effectiveDate": effective,
            "source": "shuttle-data.xlsx",
            "generatedBy": "scripts/generate-data.py",
            "geocoding": "precomputed-in-maintenance",
        },
        "locations": locations,
        "routes": [routes_by_id[rid] for rid in route_order],
    }


def main() -> int:
    try:
        data = build_data()
    except Exception as exc:
        print("資料產生失敗：", file=sys.stderr)
        print(exc, file=sys.stderr)
        return 1

    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stop_count = sum(len(r.get("stops", [])) for r in data["routes"])
    print(f"完成：{len(data['routes'])} 條路線、{len(data['locations'])} 個地點、{stop_count} 個路線停靠關係")
    print(f"輸出：{JSON_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
