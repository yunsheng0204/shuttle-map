(function () {
  const DEFAULT_CENTER = { lat: 25.035, lng: 121.52 };
  let googleMapsPromise = null;

  function loadGoogleMaps(apiKey) {
    if (window.google?.maps) return Promise.resolve(window.google.maps);
    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = new Promise((resolve, reject) => {
      const callbackName = '__shuttleGoogleMapsReady';
      window[callbackName] = () => {
        delete window[callbackName];
        resolve(window.google.maps);
      };

      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=zh-TW&region=TW&callback=${callbackName}`;
      script.onerror = () => {
        delete window[callbackName];
        reject(new Error('Google Maps JavaScript API 載入失敗'));
      };
      document.head.appendChild(script);
    });

    return googleMapsPromise;
  }

  class ShuttleMap {
    constructor(elementId, statusId) {
      this.element = document.getElementById(elementId);
      this.statusEl = document.getElementById(statusId);
      this.map = null;
      this.geocoder = null;
      this.markers = [];
      this.line = null;
      this.infoWindow = null;
      this.memoryCache = new Map();
      this.renderToken = 0;
    }

    async initialize(apiKey) {
      if (!apiKey) throw new Error('尚未設定 Google Maps API Key');
      await loadGoogleMaps(apiKey);
      this.map = new google.maps.Map(this.element, {
        center: DEFAULT_CENTER,
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });
      this.geocoder = new google.maps.Geocoder();
      this.infoWindow = new google.maps.InfoWindow();
    }

    isReady() {
      return Boolean(this.map && this.geocoder);
    }

    clear() {
      this.markers.forEach(marker => marker.setMap(null));
      this.markers = [];
      if (this.line) {
        this.line.setMap(null);
        this.line = null;
      }
      if (this.infoWindow) this.infoWindow.close();
    }

    setStatus(text) {
      this.statusEl.textContent = text;
    }

    async renderStops(items) {
      const token = ++this.renderToken;
      if (!this.isReady()) return { located: 0, total: items.length, failed: items.length };

      this.clear();
      this.setStatus(`正在使用 Google Maps 定位 ${items.length} 個站點…`);

      let failed = 0;
      let precomputed = 0;
      let geocoded = 0;
      for (const item of items) {
        if (token !== this.renderToken) return { cancelled: true };

        if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
          precomputed += 1;
          continue;
        }
        const query = item.stop?.geocodeQuery || item.stop?.displayName || '';
        if (!query) {
          failed += 1;
          continue;
        }

        try {
          const point = await this.geocodeAddress(query);
          if (point) {
            item.lat = point.lat;
            item.lng = point.lng;
            geocoded += 1;
          } else {
            failed += 1;
          }
        } catch (error) {
          console.warn('Google geocode failed:', item.locationId, query, error);
          failed += 1;
        }
      }

      if (token !== this.renderToken) return { cancelled: true };

      const points = [];
      items.forEach((item, index) => {
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
        const position = { lat: item.lat, lng: item.lng };
        const nav = googleMapsUrl(item);
        const marker = new google.maps.Marker({
          map: this.map,
          position,
          title: item.stop?.displayName || item.locationId,
          label: {
            text: String(index + 1),
            color: '#ffffff',
            fontWeight: '700'
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#187a58',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });

        marker.addListener('click', () => {
          this.infoWindow.setContent(`
            <div class="popup-title">${escapeHtml(item.stop?.displayName || item.locationId)}</div>
            <div class="popup-meta">
              ${escapeHtml(item.time || '')}<br>
              ${item.stop?.landmark ? escapeHtml(item.stop.landmark) : ''}
            </div>
            <a class="popup-link" href="${nav}" target="_blank" rel="noopener noreferrer">開啟導航 →</a>
          `);
          this.infoWindow.open({ map: this.map, anchor: marker });
        });

        this.markers.push(marker);
        points.push(position);
      });

      if (points.length > 1) {
        this.line = new google.maps.Polyline({
          map: this.map,
          path: points,
          geodesic: false,
          strokeColor: '#187a58',
          strokeOpacity: 0.72,
          strokeWeight: 4
        });
        const bounds = new google.maps.LatLngBounds();
        points.forEach(point => bounds.extend(point));
        this.map.fitBounds(bounds, 48);
      } else if (points.length === 1) {
        this.map.setCenter(points[0]);
        this.map.setZoom(15);
      } else {
        this.map.setCenter(DEFAULT_CENTER);
        this.map.setZoom(10);
      }

      return { located: points.length, total: items.length, failed, precomputed, geocoded };
    }

    async geocodeAddress(query) {
      if (this.memoryCache.has(query)) return this.memoryCache.get(query);

      const response = await this.geocoder.geocode({
        address: query,
        region: 'tw',
        componentRestrictions: { country: 'TW' }
      });

      const result = response.results?.[0];
      if (!result) {
        this.memoryCache.set(query, null);
        return null;
      }

      const location = result.geometry.location;
      const point = { lat: location.lat(), lng: location.lng() };
      // Session-only memory cache: nothing from Google is written to Excel/JSON/localStorage.
      this.memoryCache.set(query, point);
      return point;
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
  window.shuttleLoadGoogleMaps = loadGoogleMaps;
  window.shuttleGoogleMapsUrl = googleMapsUrl;
})();
