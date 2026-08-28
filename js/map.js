(function () {
  class ShuttleMap {
    constructor(elementId, statusId) {
      this.map = L.map(elementId, { zoomControl: true }).setView([25.035, 121.52], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.map);
      this.layer = L.layerGroup().addTo(this.map);
      this.line = null;
      this.statusEl = document.getElementById(statusId);
    }

    clear() {
      this.layer.clearLayers();
      if (this.line) {
        this.map.removeLayer(this.line);
        this.line = null;
      }
    }

    setStatus(text) {
      this.statusEl.textContent = text;
    }

    markerIcon(index) {
      return L.divIcon({
        className: 'leaflet-div-icon',
        html: `<div class="bus-marker auto"><span>${index}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 28],
        popupAnchor: [0, -27]
      });
    }

    renderStops(items) {
      this.clear();
      const points = [];

      items.forEach((item, index) => {
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
        const nav = googleMapsUrl(item);
        const marker = L.marker([item.lat, item.lng], { icon: this.markerIcon(index + 1) });
        marker.bindPopup(`
          <div class="popup-title">${escapeHtml(item.stop?.displayName || item.locationId)}</div>
          <div class="popup-meta">
            ${escapeHtml(item.time)} · ${item.locationKind === 'excel' ? 'Excel 座標' : '自動定位'}<br>
            ${item.stop?.landmark ? escapeHtml(item.stop.landmark) : ''}
          </div>
          <a class="popup-link" href="${nav}" target="_blank" rel="noopener noreferrer">開啟導航 →</a>
        `);
        marker.addTo(this.layer);
        points.push([item.lat, item.lng]);
      });

      if (points.length > 1) {
        this.line = L.polyline(points, {
          color: '#187a58',
          weight: 4,
          opacity: 0.7,
          dashArray: '8 8'
        }).addTo(this.map);
        this.map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
      } else if (points.length === 1) {
        this.map.setView(points[0], 15);
      } else {
        this.map.setView([25.035, 121.52], 10);
      }
    }
  }

  function googleMapsUrl(item) {
    const hasCoords = Number.isFinite(item.lat) && Number.isFinite(item.lng);
    const destination = hasCoords
      ? `${item.lat},${item.lng}`
      : (item.stop?.geocodeQuery || item.stop?.displayName || '');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    })[ch]);
  }

  window.ShuttleMap = ShuttleMap;
  window.shuttleGoogleMapsUrl = googleMapsUrl;
})();
