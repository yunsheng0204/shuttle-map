(async function () {
  const el = {
    tabs: Array.from(document.querySelectorAll('[data-route-type]')),
    routeSelect: document.getElementById('routeSelect'),
    routeSelectLabel: document.getElementById('routeSelectLabel'),
    routeSummary: document.getElementById('routeSummary'),
    routeCount: document.getElementById('routeCount'),
    routeTitle: document.getElementById('routeTitle'),
    routeDescription: document.getElementById('routeDescription'),
    routeNote: document.getElementById('routeNote'),
    routeKicker: document.getElementById('routeKicker'),
    stopList: document.getElementById('stopList'),
    stopCount: document.getElementById('stopCount'),
    stopTemplate: document.getElementById('stopTemplate')
  };

  const typeMeta = {
    morning: { label: '上班車', short: '上班', empty: '目前沒有上班路線資料' },
    evening: { label: '下班車', short: '下班', empty: '目前沒有下班路線資料' },
    overtime: { label: '加班車', short: '加班', empty: '目前沒有加班路線資料' }
  };

  const shuttleMap = new ShuttleMap('map', 'mapStatus');
  const state = {
    data: null,
    routes: [],
    locations: {},
    selectedType: 'morning',
    selectedRouteId: null,
    selectedByType: {},
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

    await selectType('morning');
  } catch (error) {
    console.error(error);
    shuttleMap.setStatus('資料讀取失敗。請用 HTTP server 或 GitHub Pages 開啟本頁。');
    el.routeTitle.textContent = '無法讀取資料';
    el.routeDescription.textContent = '若直接雙擊 index.html，瀏覽器可能阻擋 JSON 載入。請執行 start.bat。';
  }

  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.routeType;
      if (type) void selectType(type);
    });
  });

  el.routeSelect.addEventListener('change', () => {
    if (el.routeSelect.value) void selectRoute(el.routeSelect.value);
  });

  function routesForType(type) {
    return state.routes
      .filter(route => route.type === type)
      .slice()
      .sort((a, b) => Number(a.number) - Number(b.number));
  }

  async function selectType(type) {
    state.selectedType = type;
    const meta = typeMeta[type] || typeMeta.morning;
    const routes = routesForType(type);

    el.tabs.forEach(tab => {
      const active = tab.dataset.routeType === type;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    el.routeSelectLabel.textContent = `選擇${meta.short}路線`;
    el.routeSummary.innerHTML = `共 <strong id="routeCount">${routes.length}</strong> 條${meta.short}路線`;
    el.routeCount = document.getElementById('routeCount');
    renderRouteSelect(routes, meta);

    if (!routes.length) {
      state.selectedRouteId = null;
      el.routeTitle.textContent = meta.empty;
      el.routeDescription.textContent = '';
      el.routeNote.hidden = true;
      el.stopList.replaceChildren();
      el.stopCount.textContent = '';
      shuttleMap.clear();
      return;
    }

    const remembered = state.selectedByType[type];
    const initial = routes.find(route => route.id === remembered) || routes[0];
    el.routeSelect.value = initial.id;
    await selectRoute(initial.id);
  }

  function renderRouteSelect(routes, meta) {
    el.routeSelect.replaceChildren();
    el.routeSelect.disabled = routes.length === 0;

    if (!routes.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = meta.empty;
      el.routeSelect.appendChild(option);
      return;
    }

    routes.forEach(route => {
      const option = document.createElement('option');
      option.value = route.id;
      option.textContent = `第 ${String(route.number).padStart(2, '0')} 線｜${route.name}（${route.stops.length}站）`;
      el.routeSelect.appendChild(option);
    });
  }

  async function selectRoute(routeId) {
    state.selectedRouteId = routeId;
    state.selectedByType[state.selectedType] = routeId;
    el.routeSelect.value = routeId;

    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;

    const typeLabel = typeMeta[route.type]?.label || route.type;
    el.routeKicker.textContent = `${typeLabel} · 第 ${route.number} 線 · 生效日 ${route.effectiveDate}`;
    el.routeTitle.textContent = route.name;
    el.routeDescription.textContent = route.routeDescription;

    const routeNotes = String(route.notes || '').trim();
    el.routeNote.textContent = routeNotes;
    el.routeNote.hidden = !routeNotes;

    el.stopCount.textContent = `${route.stops.length} 個停靠點`;

    const items = route.stops.map(entry => {
      const stop = state.locations[entry.locationId];
      return {
        ...entry,
        stop,
        lat: typeof stop?.lat === 'number' ? stop.lat : null,
        lng: typeof stop?.lng === 'number' ? stop.lng : null
      };
    });

    renderStopCards(items);

    if (!state.mapReady) return;
    const result = await shuttleMap.renderStops(items);
    if (result?.cancelled || state.selectedRouteId !== routeId) return;

    const fixed = result.precomputed || 0;
    const googleLocated = result.geocoded || 0;
    if (result.located === result.total) {
      shuttleMap.setStatus(`第 ${route.number} 線：Excel 座標 ${fixed} 個、Google 定位 ${googleLocated} 個，共 ${result.total} 個站點。`);
    } else if (result.located > 0) {
      shuttleMap.setStatus(`第 ${route.number} 線：Excel 座標 ${fixed} 個、Google 定位 ${googleLocated} 個；已定位 ${result.located}/${result.total}，其餘仍可用地址導航。`);
    } else {
      shuttleMap.setStatus(`第 ${route.number} 線：尚無可用站點座標；仍可使用地址導航。`);
    }
  }

  function renderStopCards(items) {
    el.stopList.replaceChildren();
    items.forEach((item, index) => {
      const node = el.stopTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.stop-order').textContent = index + 1;
      node.querySelector('.stop-time').textContent = item.time || '';
      node.querySelector('.stop-name').textContent = item.stop?.displayName || item.locationId;
      node.querySelector('.stop-landmark').textContent = item.stop?.landmark || '';
      node.querySelector('.stop-source').textContent = `PDF：${item.stop?.sourceText || ''}`;

      const nav = node.querySelector('.navigate-link');
      nav.href = shuttleGoogleMapsUrl(item);
      nav.title = '使用定位搜尋文字開啟 Google Maps 導航';
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
