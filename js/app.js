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
    selectedRouteId: null
  };

  try {
    state.data = await fetchJson('./data/shuttle-data.json');
    state.routes = state.data.routes || [];
    state.locations = state.data.locations || {};
    renderRouteList(state.routes);
    if (state.routes.length) selectRoute(state.routes[0].id);
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

  function selectRoute(routeId) {
    state.selectedRouteId = routeId;
    document.querySelectorAll('.route-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.routeId === routeId);
    });

    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;

    const typeLabel = route.type === 'evening' ? '下班車' : route.type === 'overtime' ? '加班車' : '上班車';
    el.routeKicker.textContent = `${typeLabel} · 第 ${route.number} 線 · 生效日 ${route.effectiveDate}`;
    el.routeTitle.textContent = route.name;
    el.routeDescription.textContent = route.routeDescription;
    el.stopCount.textContent = `${route.stops.length} 個停靠點`;

    const items = route.stops.map(entry => {
      const stop = state.locations[entry.locationId];
      const lat = Number(stop?.lat);
      const lng = Number(stop?.lng);
      return {
        ...entry,
        stop,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null
      };
    });

    renderStopCards(items);
    shuttleMap.renderStops(items);

    const located = items.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
    if (located === items.length) {
      shuttleMap.setStatus(`第 ${route.number} 線：${items.length} 個站點已載入地圖。`);
    } else if (located > 0) {
      shuttleMap.setStatus(`第 ${route.number} 線：目前顯示 ${located}/${items.length} 個地圖站點；其餘仍可用地址導航。`);
    } else {
      shuttleMap.setStatus(`第 ${route.number} 線：目前尚無地圖座標；各站仍可用地址導航。`);
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
      nav.title = Number.isFinite(item.lat) && Number.isFinite(item.lng)
        ? '使用站點座標導航'
        : '使用地址文字開啟 Google Maps';
      el.stopList.appendChild(node);
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }
})();
