(async function () {
  const el = {
    routeSelect: document.getElementById('routeSelect'),
    routeCount: document.getElementById('routeCount'),
    routeTitle: document.getElementById('routeTitle'),
    routeDescription: document.getElementById('routeDescription'),
    routeKicker: document.getElementById('routeKicker'),
    stopList: document.getElementById('stopList'),
    stopCount: document.getElementById('stopCount'),
    stopTemplate: document.getElementById('stopTemplate')
  };

  const shuttleMap = new ShuttleMap('map', 'mapStatus');
  const state = {
    data: null,
    routes: [],
    locations: {},
    selectedRouteId: null,
    mapReady: false
  };

  try {
    const data = await fetchJson('./data/shuttle-data.json');
    state.data = data;
    state.routes = data.routes || [];
    state.locations = data.locations || {};

    try {
      const apiKey = await loadGoogleMapsApiKey();
      await shuttleMap.initialize(apiKey);
      state.mapReady = true;
    } catch (mapError) {
      console.error(mapError);
      shuttleMap.setStatus(`${mapError.message}；站點清單與地址導航仍可使用。`);
    }

    renderRouteSelect(state.routes);
    if (state.routes.length) {
      el.routeSelect.value = state.routes[0].id;
      await selectRoute(state.routes[0].id);
    }
  } catch (error) {
    console.error(error);
    shuttleMap.setStatus('資料讀取失敗。請用 HTTP server 或 GitHub Pages 開啟本頁。');
    el.routeTitle.textContent = '無法讀取資料';
    el.routeDescription.textContent = '若直接雙擊 index.html，瀏覽器可能阻擋 JSON 載入。請執行 start.bat。';
  }

  el.routeSelect.addEventListener('change', () => {
    if (el.routeSelect.value) void selectRoute(el.routeSelect.value);
  });

  function renderRouteSelect(routes) {
    el.routeSelect.replaceChildren();
    el.routeCount.textContent = routes.length;

    if (!routes.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '目前沒有路線資料';
      el.routeSelect.appendChild(option);
      el.routeSelect.disabled = true;
      return;
    }

    routes
      .slice()
      .sort((a, b) => Number(a.number) - Number(b.number))
      .forEach(route => {
        const option = document.createElement('option');
        option.value = route.id;
        option.textContent = `第 ${String(route.number).padStart(2, '0')} 線｜${route.name}（${route.stops.length}站）`;
        el.routeSelect.appendChild(option);
      });
  }

  async function selectRoute(routeId) {
    state.selectedRouteId = routeId;
    el.routeSelect.value = routeId;

    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;

    const typeLabel = route.type === 'evening' ? '下班車' : route.type === 'overtime' ? '加班車' : '上班車';
    el.routeKicker.textContent = `${typeLabel} · 第 ${route.number} 線 · 生效日 ${route.effectiveDate}`;
    el.routeTitle.textContent = route.name;
    el.routeDescription.textContent = route.routeDescription;
    el.stopCount.textContent = `${route.stops.length} 個停靠點`;

    const items = route.stops.map(entry => ({
      ...entry,
      stop: state.locations[entry.locationId],
      lat: null,
      lng: null
    }));

    renderStopCards(items);

    if (!state.mapReady) return;
    const result = await shuttleMap.renderStops(items);
    if (result?.cancelled || state.selectedRouteId !== routeId) return;

    if (result.located === result.total) {
      shuttleMap.setStatus(`第 ${route.number} 線：${result.total} 個站點已由 Google Maps 自動定位。`);
    } else if (result.located > 0) {
      shuttleMap.setStatus(`第 ${route.number} 線：Google Maps 已定位 ${result.located}/${result.total} 個站點；其餘仍可用地址導航。`);
    } else {
      shuttleMap.setStatus(`第 ${route.number} 線：Google Maps 未找到站點座標；仍可使用地址導航。`);
    }
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

      const nav = node.querySelector('.navigate-link');
      nav.href = shuttleGoogleMapsUrl(item);
      nav.title = '使用地址文字開啟 Google Maps 導航';
      el.stopList.appendChild(node);
    });
  }

  async function loadGoogleMapsApiKey() {
    const candidates = [
      './config/google-maps-config.local.json',
      './config/google-maps-config.json'
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) continue;
        const config = await response.json();
        if (config.apiKey && !String(config.apiKey).includes('YOUR_')) return String(config.apiKey).trim();
      } catch (_error) {
        // Try the next configuration source.
      }
    }
    throw new Error('尚未設定 Google Maps API Key');
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }
})();
