const DGIS_KEY = '9951811e-e54b-4b36-b793-ebf47deb7d64';
const DEFAULT_CENTER = [76.945465, 43.25667];
const DEFAULT_ZOOM = 6;

const CITY_COORDS = {
  'Алматы': [76.8897, 43.2389],
  'Астана': [71.4491, 51.1694],
  'Шымкент': [69.5901, 42.3417],
  'Караганда': [73.085, 49.806],
  'Актобе': [57.167, 50.2839],
  'Актау': [51.1694, 43.6532],
  'Атырау': [51.9239, 47.0945],
  'Тараз': [71.3658, 42.9],
  'Павлодар': [76.9674, 52.2871],
  'Костанай': [63.6246, 53.2198],
  'Уральск': [51.3865, 51.2225],
  'Усть-Каменогорск': [82.6059, 49.9483],
  'Кызылорда': [65.5092, 44.8488],
  'Семей': [80.2275, 50.4111],
  'Петропавловск': [69.1628, 54.8728],
  'Туркестан': [68.2519, 43.2973],
  'Кокшетау': [69.385, 53.2833],
};

const CITY_ALIASES = {
  almaata: 'Алматы',
  almaty: 'Алматы',
  astana: 'Астана',
  nursultan: 'Астана',
  shymkent: 'Шымкент',
  karaganda: 'Караганда',
  aktobe: 'Актобе',
  aktau: 'Актау',
  atyrau: 'Атырау',
  taraz: 'Тараз',
  pavlodar: 'Павлодар',
  kostanay: 'Костанай',
  uralsk: 'Уральск',
  oral: 'Уральск',
  ustkamenogorsk: 'Усть-Каменогорск',
  oskemen: 'Усть-Каменогорск',
  qyzylorda: 'Кызылорда',
  kzylorda: 'Кызылорда',
  semey: 'Семей',
  petropavlovsk: 'Петропавловск',
  turkestan: 'Туркестан',
  kokshetau: 'Кокшетау',
};

let map = null;
let mapReady = false;
let loadsState = [];
let markers = [];
let selectedLoad = null;
let activeCard = null;
let activeMarker = null;
let routePolyline = null;
let routeStartMarker = null;
let routeFinishMarker = null;
let tripMarker = null;
let currentRouteGeometry = [];
let currentRouteSummary = null;
let tripWatchId = null;

const el = (id) => document.getElementById(id);

function safeStr(value, fallback = '') {
  const text = value === null || value === undefined ? '' : String(value).trim();
  const label = String(currency || 'KZT').toUpperCase() === 'KZT' ? '₸' : String(currency).toUpperCase();
  return num.toLocaleString('ru-RU') + ' ' + label;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneyKZT(value, currency = 'KZT') {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 'Договорная';
  return `${num.toLocaleString('ru-RU')} ₸`;
}

function formatDistance(meters) {
  const value = Number(meters || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1000) return `${Math.round(value)} м`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} км`;
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  if (hours <= 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

function normalizeLocationName(value) {
  return safeStr(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCoords(location, fallback = CITY_COORDS['Алматы']) {
  const normalized = normalizeLocationName(location);
  if (!normalized) return fallback;

  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(normalizeLocationName(city))) return coords;
  }

  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (normalized.includes(alias)) return CITY_COORDS[city] || fallback;
  }

  return fallback;
}

function getLoadStartCoords(load) {
  const lat = Number(load?.lat);
  const lng = Number(load?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return [lng, lat];
  }
  return resolveCoords(load?.from_location, CITY_COORDS['Алматы']);
}

function getLoadFinishCoords(load) {
  return resolveCoords(load?.to_location, CITY_COORDS['Астана']);
}

function setMapMessage(message) {
  const target = el('map');
  if (!target) return;
  target.innerHTML = `<div class="map-state"><b>${escapeHtml(message)}</b><span>Проверьте интернет, ключ 2ГИС и обновите страницу.</span></div>`;
}

function waitForMapGL(timeoutMs = 7000) {
  if (window.mapgl?.Map) return Promise.resolve(true);

  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.mapgl?.Map) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

async function initMap() {
  const mapEl = el('map');
  if (!mapEl) return false;

  mapEl.innerHTML = '<div class="map-state"><b>Загружаем карту 2ГИС...</b><span>Секунду, поднимаем карту и маркеры грузов.</span></div>';

  const available = await waitForMapGL();
  if (!available) {
    mapReady = false;
    setMapMessage('2ГИС карта не загрузилась');
    return false;
  }

  try {
    mapEl.innerHTML = '';
    map = new mapgl.Map('map', {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      key: DGIS_KEY,
    });
    mapReady = true;
    return true;
  } catch (error) {
    console.error('2GIS init error:', error);
    mapReady = false;
    setMapMessage('Ошибка инициализации 2ГИС карты');
    return false;
  }
}

function moveMap(center, zoom = DEFAULT_ZOOM) {
  if (!mapReady || !map || !Array.isArray(center)) return;

  if (typeof map.setCenter === 'function') {
    map.setCenter(center);
  }
  if (typeof map.setZoom === 'function' && Number.isFinite(Number(zoom))) {
    map.setZoom(Number(zoom));
  }
}
function setStatus(text, type = 'idle') {
  const status = el('tripStatus');
  if (!status) return;
  status.textContent = text;
  status.className = `route-status route-status--${type}`;
}

function setRouteInfo(text) {
  const target = el('routeInfo');
  if (target) target.textContent = safeStr(text);
}

function setRouteMeta(text) {
  const target = el('routeMeta');
  if (target) target.textContent = safeStr(text);
}

function updateRouteButtons() {
  const hasSelection = Boolean(selectedLoad);
  const hasRoute = currentRouteGeometry.length >= 2;
  const isTripActive = tripWatchId !== null;

  if (el('btnBuildRoute')) el('btnBuildRoute').disabled = !hasSelection || !mapReady;
  if (el('btnStartTrip')) el('btnStartTrip').disabled = !hasRoute || isTripActive || !mapReady;
  if (el('btnStopTrip')) el('btnStopTrip').disabled = !isTripActive;
}

async function updateNavbarAuth() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return;
    const user = await res.json();
    if (!user) return;

    const profileHref = user?.role === 'carrier' ? '/carrier_profile.html' : '/profile.html';
    const html = `
      <div class="auth-user">
        <a href="${profileHref}" class="profile-link" title="${escapeHtml(user?.name || 'Профиль')}">
          <span class="profile-avatar profile-avatar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg></span><span class="sr-only">Профиль</span>
        </a>
        <button class="logout-btn" type="button" data-logout>Выйти</button>
      </div>
    `;

    const desktop = el('auth-container');
    const mobile = el('auth-container-mobile');
    if (desktop) desktop.innerHTML = html;
    if (mobile) mobile.innerHTML = html;

    document.querySelectorAll('[data-logout]').forEach((button) => {
      button.addEventListener('click', logoutUser);
    });
  } catch {}
}

async function logoutUser() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  window.location.reload();
}

function setupBurger() {
  const burger = el('burger');
  const menu = el('mobileMenu');
  const closeButton = el('mobileClose');
  if (!burger || !menu) return;

  const open = () => {
    menu.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  };

  const close = () => {
    menu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  };

  burger.addEventListener('click', () => {
    menu.classList.contains('is-open') ? close() : open();
  });
  closeButton?.addEventListener('click', close);

  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('is-open')) return;
    if (!menu.contains(event.target) && !burger.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

function clearMarkers() {
  markers.forEach(({ marker }) => {
    try { marker.destroy(); } catch {}
  });
  markers = [];
  activeMarker = null;
}

function clearRouteArtifacts() {
  stopTrip({ silent: true });
  [routePolyline, routeStartMarker, routeFinishMarker].forEach((item) => {
    if (!item) return;
    try { item.destroy(); } catch {}
  });
  routePolyline = null;
  routeStartMarker = null;
  routeFinishMarker = null;
  currentRouteGeometry = [];
  currentRouteSummary = null;
  updateRouteButtons();
}

function stopTrip({ silent = false } = {}) {
  if (tripWatchId !== null) {
    navigator.geolocation.clearWatch(tripWatchId);
    tripWatchId = null;
  }
  if (tripMarker) {
    try { tripMarker.destroy(); } catch {}
    tripMarker = null;
  }
  updateRouteButtons();
  if (!silent) {
    setStatus('Поездка остановлена', 'idle');
    if (currentRouteSummary) {
      setRouteInfo(`Маршрут готов: ${formatDistance(currentRouteSummary.distance_meters)} • ${formatDuration(currentRouteSummary.duration_seconds)}`);
    }
  }
}

function setActiveMarker(markerObj) {
  if (!markerObj || !mapReady) return;
  if (activeMarker?.html && activeMarker.html !== markerObj.html) {
    activeMarker.html.classList.remove('map-pin--active');
  }
  activeMarker = markerObj;
  markerObj.html?.classList.add('map-pin--active');
}

function passesFilters(load) {
  const typeFilter = safeStr(el('filterType')?.value);
  const minWeight = Number(el('filterWeight')?.value || 0);

  if (typeFilter && safeStr(load.type) !== typeFilter) return false;
  const weight = Number(load.weight || 0);
  if (Number.isFinite(minWeight) && minWeight > 0 && weight < minWeight) return false;
  return true;
}

function renderList(loads) {
  const list = el('loadsList');
  const empty = el('emptyState');
  const badge = el('countBadge');
  if (!list || !badge || !empty) return;

  list.innerHTML = '';
  const filtered = Array.isArray(loads) ? loads.filter(passesFilters) : [];
  badge.textContent = String(filtered.length);

  if (!filtered.length) {
    empty.style.display = 'block';
    list.appendChild(empty);
    return;
  }

  empty.style.display = 'none';
  filtered.forEach((load) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.loadId = String(load.id);
    card.innerHTML = `
      <div class="card__top">
        <div>
          <div class="card__route">${escapeHtml(load.from_location || 'Откуда')} → ${escapeHtml(load.to_location || 'Куда')}</div>
          <div class="card__type">${escapeHtml(load.type || 'Тип не указан')}</div>
        </div>
        <div class="card__price">${formatMoneyKZT(load.price, load.currency)}</div>
      </div>
      <div class="card__meta">
        <span class="pill2">Вес: ${escapeHtml(load.weight ?? '—')} т</span>
        <span class="pill2">${escapeHtml(load.contact_info || load.contact || 'Контакт')}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectLoad(load, card, { buildRoute: true, focusMap: true });
    });

    if (selectedLoad?.id === load.id) {
      card.classList.add('is-active');
      activeCard = card;
    }

    list.appendChild(card);
  });
}

function addMarkers(loads) {
  clearMarkers();
  if (!mapReady || !map) return;

  const filtered = Array.isArray(loads) ? loads.filter(passesFilters) : [];
  filtered.forEach((load) => {
    const html = createPinHtml('load', load.from_location || 'Груз');
    html.addEventListener('click', () => {
      const linkedCard = Array.from(document.querySelectorAll('.card[data-load-id]')).find((card) => card.dataset.loadId === String(load.id));
      selectLoad(load, linkedCard || null, { buildRoute: true, focusMap: true });
    });

    const marker = new mapgl.HtmlMarker(map, {
      coordinates: getLoadStartCoords(load),
      html,
      anchor: [0.5, 1],
    });

    markers.push({ marker, load, html });
  });
}

function getRouteViewport(points) {
  const coordinates = Array.isArray(points) && points.length ? points : [DEFAULT_CENTER];
  const lons = coordinates.map((point) => Number(point[0]));
  const lats = coordinates.map((point) => Number(point[1]));
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const span = Math.max(maxLon - minLon, maxLat - minLat);

  let zoom = 11;
  if (span > 18) zoom = 4;
  else if (span > 10) zoom = 5;
  else if (span > 6) zoom = 6;
  else if (span > 3) zoom = 7;
  else if (span > 1.6) zoom = 8;
  else if (span > 0.8) zoom = 9;
  else if (span > 0.3) zoom = 10;
  return { center, zoom };
}

function focusRoute(points) {
  if (!mapReady || !map) return;
  const { center, zoom } = getRouteViewport(points);
  moveMap(center, zoom);
}

function createPinHtml(kind, label) {
  const wrapper = document.createElement('div');
  wrapper.className = `map-pin map-pin--${kind}`;
  wrapper.innerHTML = `<span class="map-pin__dot"></span><span>${escapeHtml(label)}</span>`;
  return wrapper;
}

function renderRoute(routePoints, load) {
  if (!mapReady || !map || !Array.isArray(routePoints) || routePoints.length < 2) return;
  clearRouteArtifacts();

  routePolyline = new mapgl.Polyline(map, {
    coordinates: routePoints,
    width: 6,
    color: '#2b8cff',
    opacity: 0.92,
  });

  routeStartMarker = new mapgl.HtmlMarker(map, {
    coordinates: routePoints[0],
    html: createPinHtml('start', load?.from_location || 'Старт'),
    anchor: [0.5, 1],
  });

  routeFinishMarker = new mapgl.HtmlMarker(map, {
    coordinates: routePoints[routePoints.length - 1],
    html: createPinHtml('finish', load?.to_location || 'Финиш'),
    anchor: [0.5, 1],
  });

  currentRouteGeometry = routePoints.slice();
  updateRouteButtons();
  focusRoute(routePoints);
}

function renderSelectedLoad(load) {
  const routeEmptyState = el('routeEmptyState');
  const routeDetails = el('routeDetails');
  const routeTitle = el('routeTitle');
  if (!routeEmptyState || !routeDetails || !routeTitle) return;

  if (!load) {
    routeEmptyState.hidden = false;
    routeDetails.hidden = true;
    routeTitle.textContent = 'Маршрут не выбран';
    setRouteMeta('');
    setRouteInfo('');
    setStatus('Ожидание', 'idle');
    updateRouteButtons();
    return;
  }

  routeEmptyState.hidden = true;
  routeDetails.hidden = false;
  routeTitle.textContent = `${safeStr(load.from_location, 'Откуда')} → ${safeStr(load.to_location, 'Куда')}`;
  setRouteMeta(`Тип: ${safeStr(load.type, '—')} • Вес: ${safeStr(load.weight ?? '—')} т • Цена: ${formatMoneyKZT(load.price, load.currency)}`);
  setRouteInfo(mapReady ? 'Груз выбран. Строим маршрут на карте.' : 'Груз выбран. Карта 2ГИС пока не загрузилась.');
  setStatus('Груз выбран', 'idle');
  updateRouteButtons();
}

async function buildRouteForSelectedLoad() {
  if (!selectedLoad || !mapReady) return;

  try {
    setStatus('Строим маршрут', 'loading');
    setRouteInfo('Запрашиваем маршрут и подготавливаем карту...');

    const fromCoords = getLoadStartCoords(selectedLoad);
    const toCoords = getLoadFinishCoords(selectedLoad);
    const response = await fetch('/api/mobile/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        loadId: selectedLoad.id,
        from: { lon: fromCoords[0], lat: fromCoords[1] },
        to: { lon: toCoords[0], lat: toCoords[1] },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Routing API error ${response.status}`);
    if (!Array.isArray(data?.geometry) || data.geometry.length < 2) throw new Error('Маршрут вернулся без геометрии');

    renderRoute(data.geometry, selectedLoad);
    currentRouteSummary = data.summary || null;
    setStatus('Маршрут готов', 'ready');
    setRouteInfo(`Маршрут готов: ${formatDistance(data?.summary?.distance_meters)} • ${formatDuration(data?.summary?.duration_seconds)}`);
    updateRouteButtons();
  } catch (error) {
    clearRouteArtifacts();
    setStatus('Ошибка маршрута', 'error');
    setRouteInfo(`Не удалось построить маршрут: ${safeStr(error.message || error)}`);
  }
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function updateTripMarker(coords) {
  if (!mapReady || !map) return;
  if (tripMarker) {
    try { tripMarker.destroy(); } catch {}
  }
  tripMarker = new mapgl.HtmlMarker(map, {
    coordinates: coords,
    html: createPinHtml('trip', 'Вы сейчас здесь'),
    anchor: [0.5, 1],
  });
}

function startTrip() {
  if (!selectedLoad || currentRouteGeometry.length < 2 || !mapReady) return;

  if (!navigator.geolocation) {
    setStatus('Геолокация недоступна', 'error');
    setRouteInfo('Этот браузер не поддерживает геолокацию.');
    return;
  }

  stopTrip({ silent: true });
  setStatus('Запрашиваем геолокацию', 'loading');
  setRouteInfo('Разрешите доступ к местоположению, чтобы начать тест поездки.');
  updateRouteButtons();

  const destination = currentRouteGeometry[currentRouteGeometry.length - 1];
  tripWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const coords = [position.coords.longitude, position.coords.latitude];
      updateTripMarker(coords);
      moveMap(coords, 13);
      const remaining = haversineDistanceMeters(coords, destination);
      setStatus('Поездка активна', 'trip');
      setRouteInfo(`До точки назначения примерно ${formatDistance(remaining)}. Скорость: ${Math.max(0, Math.round((position.coords.speed || 0) * 3.6))} км/ч`);
      updateRouteButtons();
    },
    (error) => {
      stopTrip({ silent: true });
      setStatus('Нет геолокации', 'error');
      setRouteInfo(`Не удалось получить координаты: ${safeStr(error.message || 'неизвестная ошибка')}`);
      updateRouteButtons();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  updateRouteButtons();
}

function selectLoad(load, cardEl, options = {}) {
  selectedLoad = load;

  if (activeCard && activeCard !== cardEl) activeCard.classList.remove('is-active');
  if (cardEl) {
    cardEl.classList.add('is-active');
    activeCard = cardEl;
  }

  const markerObj = markers.find((item) => item.load.id === load.id);
  if (markerObj) setActiveMarker(markerObj);

  renderSelectedLoad(load);
  clearRouteArtifacts();

  if (options.focusMap && mapReady) {
    moveMap(getLoadStartCoords(load), 10);
  }
  if (options.buildRoute && mapReady) buildRouteForSelectedLoad();
}

async function flyToCity(query) {
  const city = safeStr(query);
  if (!city || !mapReady) return;
  const coords = resolveCoords(city, null);
  if (coords) moveMap(coords, 10);
}

async function loadLoads() {
  try {
    const response = await fetch('/api/loads', { credentials: 'include', cache: 'no-store' });
    const loads = await response.json();
    if (!Array.isArray(loads)) throw new Error('Сервер вернул не список грузов');

    loadsState = loads;
    renderList(loadsState);
    addMarkers(loadsState);
  } catch (error) {
    console.error('Load loads error:', error);
    loadsState = [];
    renderList([]);
    clearMarkers();
  }
}

function setupControls() {
  el('applyFilters')?.addEventListener('click', async () => {
    await flyToCity(el('citySearch')?.value || '');
    renderList(loadsState);
    addMarkers(loadsState);
  });

  el('btnRefresh')?.addEventListener('click', async () => {
    stopTrip({ silent: true });
    await loadLoads();
  });

  el('btnRecenter')?.addEventListener('click', () => {
    if (!mapReady) return;
    if (currentRouteGeometry.length >= 2) focusRoute(currentRouteGeometry);
    else moveMap(DEFAULT_CENTER, DEFAULT_ZOOM);
  });

  el('btnBuildRoute')?.addEventListener('click', buildRouteForSelectedLoad);
  el('btnStartTrip')?.addEventListener('click', startTrip);
  el('btnStopTrip')?.addEventListener('click', () => stopTrip());
}

document.addEventListener('DOMContentLoaded', async () => {
  setupBurger();
  updateNavbarAuth();
  renderSelectedLoad(null);
  setupControls();
  await initMap();
  await loadLoads();
  updateRouteButtons();
});