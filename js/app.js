(async function () {
  const el = {
    routeList: document.getElementById('routeList'),
    routeSearch: document.getElementById('routeSearch'),
    routeCount: document.getElementById('routeCount'),
    routeTitle: document.getElementById('routeTitle'),
    routeDescription: document.getElementById('routeDescription'),
    routeKicker: document.getElementById('routeKicker'),
    stopList: document.getElementById('stopList'),
    stopCount: document.getElementById('stopCount'),
    routeButtonTemplate: document.getElementById('routeButtonTemplate'),
    stopTemplate: document.getElementById('stopTemplate')
  };

  const shuttleMap = new ShuttleMap('map', 'mapStatus');
  const state = {
    data: null,
    routes: [],
    locations: {},
    selectedRouteId: null,
    selectionToken: 0,
    currentRoute: null,
    currentItems: [],
    geocodeCache: loadGeocodeCache()
  };

  try {
    state.data = await fetchJson('./data/shuttle-data.json');
    state.routes = state.data.routes || [];
    state.locations = state.data.locations || {};
    renderRouteList(state.routes);
    if (state.routes.length) await selectRoute(state.routes[0].id);
  } catch (error) {
    console.error(error);
    shuttleMap.setStatus('資料讀取失敗。請用 HTTP server 或 GitHub Pages 開啟本頁。');
    el.routeTitle.textContent = '無法讀取資料';
    el.routeDescription.textContent = '若直接雙擊 index.html，瀏覽器可能阻擋 JSON 載入。請執行 start.bat。';
  }

  el.routeSearch.addEventListener('input', () => {
    const q = el.routeSearch.value.trim().toLowerCase();
    const filtered = state.routes.filter(route => {
      if (route.name.toLowerCase().includes(q) || String(route.number).includes(q)) return true;
      return route.stops.some(entry => {
        const location = state.locations[entry.locationId];
        if (!location) return false;
        return [location.displayName, location.landmark, location.sourceText]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(q));
      });
    });
    renderRouteList(filtered);
  });

  function renderRouteList(routes) {
    el.routeList.replaceChildren();
    el.routeCount.textContent = routes.length;
    if (!routes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '沒有符合的路線或站點';
      el.routeList.appendChild(empty);
      return;
    }

    routes.forEach(route => {
      const node = el.routeButtonTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.routeId = route.id;
      node.querySelector('.route-number').textContent = String(route.number).padStart(2, '0');
      node.querySelector('.route-name').textContent = route.name;
      node.querySelector('.route-stop-count').textContent = `${route.stops.length} 站`;
      if (route.id === state.selectedRouteId) node.classList.add('active');
      node.addEventListener('click', () => selectRoute(route.id));
      el.routeList.appendChild(node);
    });
  }

  async function selectRoute(routeId) {
    const token = ++state.selectionToken;
    state.selectedRouteId = routeId;

    document.querySelectorAll('.route-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.routeId === routeId);
    });

    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;

    el.routeKicker.textContent = `上班車 · 第 ${route.number} 線 · 生效日 ${route.effectiveDate}`;
    el.routeTitle.textContent = route.name;
    el.routeDescription.textContent = route.routeDescription;
    el.stopCount.textContent = `${route.stops.length} 個停靠點`;

    const items = route.stops.map(entry => {
      const location = state.locations[entry.locationId];
      const excelLat = Number(location?.lat);
      const excelLng = Number(location?.lng);
      const hasExcelCoords = Number.isFinite(excelLat) && Number.isFinite(excelLng);
      const cached = hasExcelCoords ? null : getCachedLocation(entry.locationId);
      return {
        ...entry,
        stop: location,
        locationKind: hasExcelCoords ? 'excel' : (cached ? 'auto' : 'locating'),
        lat: hasExcelCoords ? excelLat : (cached?.lat ?? null),
        lng: hasExcelCoords ? excelLng : (cached?.lng ?? null)
      };
    });

    state.currentRoute = route;
    state.currentItems = items;
    renderStopCards(items);
    shuttleMap.renderStops(items);

    const unresolved = items.filter(item => !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
    if (!unresolved.length) {
      shuttleMap.setStatus(`第 ${route.number} 線：${items.length}/${items.length} 個站點已自動定位。`);
      return;
    }

    shuttleMap.setStatus(`第 ${route.number} 線：正在自動定位 ${unresolved.length} 個站點…`);
    await geocodeSequentially(unresolved, token, items, route);
  }

  async function geocodeSequentially(unresolved, token, allItems, route) {
    let success = allItems.length - unresolved.length;
    let failed = 0;

    for (let i = 0; i < unresolved.length; i++) {
      if (token !== state.selectionToken) return;
      const item = unresolved[i];
      item.locationKind = 'locating';
      renderStopCards(allItems);

      const result = await geocode(item.stop);
      if (token !== state.selectionToken) return;

      if (result) {
        item.lat = result.lat;
        item.lng = result.lng;
        item.locationKind = 'auto';
        saveCachedLocation(item.locationId, result);
        success++;
      } else {
        item.locationKind = 'failed';
        failed++;
      }

      renderStopCards(allItems);
      shuttleMap.renderStops(allItems);
      shuttleMap.setStatus(`第 ${route.number} 線：已自動定位 ${success}/${allItems.length}，失敗 ${failed}。`);

      // Nominatim 公開服務需控制請求頻率；每次查詢至少間隔約 1 秒。
      if (i < unresolved.length - 1) await sleep(1100);
    }
  }

  async function geocode(stop) {
    const queries = buildQueries(stop);

    for (const query of queries) {
      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          limit: '1',
          countrycodes: 'tw',
          'accept-language': 'zh-TW',
          q: query
        });

        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
        if (!response.ok) throw new Error(`Geocode HTTP ${response.status}`);

        const data = await response.json();
        if (data[0]) {
          return {
            lat: Number(data[0].lat),
            lng: Number(data[0].lon),
            query,
            displayName: data[0].display_name || ''
          };
        }
      } catch (error) {
        console.warn('Geocode failed:', stop.id, query, error);
        // 網路/服務錯誤時沒必要再用同一服務重試其他文字。
        if (error instanceof TypeError || /HTTP (403|429|5\d\d)/.test(String(error.message))) break;
      }
    }
    return null;
  }

  function buildQueries(stop) {
    const list = [
      stop.geocodeQuery,
      stop.displayName ? `${stop.displayName}, 台灣` : '',
      stop.landmark ? `${stop.landmark}, ${stop.displayName || ''}, 台灣` : ''
    ].map(value => String(value || '').trim()).filter(Boolean);
    return [...new Set(list)];
  }

  function renderStopCards(items) {
    el.stopList.replaceChildren();
    items.forEach((item, index) => {
      const node = el.stopTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.stop-order').textContent = index + 1;
      node.querySelector('.stop-time').textContent = item.time;
      node.querySelector('.stop-name').textContent = item.stop?.displayName || item.locationId;
      node.querySelector('.stop-landmark').textContent = item.stop?.landmark || '';
      node.querySelector('.stop-source').textContent = `PDF：${item.stop?.sourceText || ''}`;

      const status = node.querySelector('.stop-status');
      const badge = document.createElement('span');
      badge.className = `status-badge ${item.locationKind}`;
      if (item.locationKind === 'excel') badge.textContent = '● Excel 座標';
      else if (item.locationKind === 'auto') badge.textContent = '● 已自動定位';
      else if (item.locationKind === 'locating') badge.textContent = '… 自動定位中';
      else badge.textContent = '○ 自動定位失敗，改用地址導航';
      status.appendChild(badge);

      const nav = node.querySelector('.navigate-link');
      nav.href = shuttleGoogleMapsUrl(item);
      nav.title = ['auto', 'excel'].includes(item.locationKind) ? '使用座標導航' : '依 PDF 地址文字開啟 Google Maps';
      el.stopList.appendChild(node);
    });
  }

  function cacheKey() {
    const version = state.data?.meta?.effectiveDate || 'default';
    return `shuttle-geocode-cache:${version}`;
  }

  function loadGeocodeCache() {
    try {
      const prefix = 'shuttle-geocode-cache:';
      const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
      if (!keys.length) return {};
      return JSON.parse(localStorage.getItem(keys.sort().at(-1)) || '{}');
    } catch {
      return {};
    }
  }

  function getCachedLocation(locationId) {
    const value = state.geocodeCache[locationId];
    if (!value) return null;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { ...value, lat, lng } : null;
  }

  function saveCachedLocation(locationId, result) {
    state.geocodeCache[locationId] = result;
    try {
      localStorage.setItem(cacheKey(), JSON.stringify(state.geocodeCache));
    } catch (error) {
      console.warn('Unable to save geocode cache:', error);
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
