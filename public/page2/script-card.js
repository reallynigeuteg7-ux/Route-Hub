const DGIS_KEY = '9951811e-e54b-4b36-b793-ebf47deb7d64';
const DEFAULT_CENTER = [76.945465, 43.25667];

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

function safeText(value, fallback = '') {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || fallback;
}

function normalizeLocationName(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCoords(location, fallback = DEFAULT_CENTER) {
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
  return resolveCoords(load?.from_location, DEFAULT_CENTER);
}

function initLoadMap(load) {
  const mapEl = document.getElementById('map');
  const captionEl = document.getElementById('map-caption');
  if (!mapEl) return;

  if (!window.mapgl) {
    mapEl.innerHTML = '<p class="map-placeholder">Не удалось загрузить 2ГИС карту</p>';
    return;
  }

  const from = safeText(load?.from_location, 'Место погрузки');
  const to = safeText(load?.to_location, 'Место выгрузки');
  const center = getLoadStartCoords(load);

  if (captionEl) {
    captionEl.textContent = `${from} → ${to}`;
  }

  mapEl.innerHTML = '';

  const map = new mapgl.Map('map', {
    center,
    zoom: 12,
    key: DGIS_KEY,
  });

  new mapgl.Marker(map, {
    coordinates: center,
    icon: 'https://docs.2gis.com/img/mapgl/marker.svg',
  });

  const finish = resolveCoords(load?.to_location, null);
  if (finish && (finish[0] !== center[0] || finish[1] !== center[1])) {
    new mapgl.Marker(map, {
      coordinates: finish,
      icon: 'https://docs.2gis.com/img/mapgl/marker-red.svg',
    });

    map.setCenter([
      (center[0] + finish[0]) / 2,
      (center[1] + finish[1]) / 2,
    ]);
    map.setZoom(6);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  const offerBtn = document.getElementById('btn-offer');
  function disableOfferButton(message) {
    if (!offerBtn) return;
    offerBtn.disabled = true;
    offerBtn.classList.add('disabled');
    offerBtn.textContent = message;
    offerBtn.onclick = null;
  }
  if (offerBtn && id) {
    offerBtn.onclick = () => {
      window.location.href = `offer.html?id=${encodeURIComponent(id)}`;
    };
  }

  const btnMsg = document.getElementById('btn-message');
  if (btnMsg) {
    btnMsg.onclick = () => {
      alert('Чат отключен. Отправьте ставку, заказчик увидит ее в системе.');
    };
  }

  if (!id) {
    document.body.innerHTML = "<div class='container'><h1>Груз не выбран</h1><a href='index2.html'>Вернуться назад</a></div>";
    return;
  }

  function getFavKey() {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      try {
        const user = JSON.parse(rawUser);
        return `favorites_${user.id || user.userId || user.email || user.name || 'anon'}`;
      } catch {}
    }
    return 'favorites_anon';
  }

  function readFavorites() {
    try { return JSON.parse(localStorage.getItem(getFavKey())) || []; }
    catch { return []; }
  }

  function writeFavorites(arr) {
    localStorage.setItem(getFavKey(), JSON.stringify(arr));
    window.dispatchEvent(new Event('favorites:changed'));
  }

  function isFav(loadId) {
    return readFavorites().includes(String(loadId));
  }

  function toggleFav(loadId) {
    const normalizedId = String(loadId);
    const favorites = readFavorites();
    const index = favorites.indexOf(normalizedId);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.unshift(normalizedId);
    writeFavorites(favorites);
    return favorites.includes(normalizedId);
  }

  function paintFavButton(btn, saved) {
    if (!btn) return;
    btn.innerHTML = saved
      ? '<i class="fas fa-star"></i> В избранном'
      : '<i class="far fa-star"></i> В избранное';
  }

  const favBtn = document.querySelector('.btn-favorite');
  if (favBtn) {
    paintFavButton(favBtn, isFav(id));
    favBtn.onclick = () => {
      const saved = toggleFav(id);
      paintFavButton(favBtn, saved);
    };
  }

  try {
    const response = await fetch(`/api/loads/${id}`, { credentials: 'include' });
    const data = await response.json();

    if (data && !data.error) {
      document.getElementById('load-id').innerText = data.id;
      document.getElementById('route-text').innerText = `${safeText(data.from_location, 'Откуда')} — ${safeText(data.to_location, 'Куда')}`;
      document.getElementById('load-price').innerText = data.price ? Number(data.price).toLocaleString('ru-RU') : 'Договорная';
      document.getElementById('load-date').innerText = data.date || 'Не указана';
      const userNameEl = document.getElementById('user-name');
      if (userNameEl) {
        userNameEl.innerText = data.client_name || '\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a';
      }

      const ownerProfile = document.querySelector('.user-profile');
      const ownerId = data.userId || data.client_id || data.ownerId;
      if (ownerProfile && ownerId) {
        ownerProfile.classList.add('user-profile--link');
        ownerProfile.setAttribute('role', 'link');
        ownerProfile.setAttribute('tabindex', '0');
        ownerProfile.title = '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0437\u0430\u043a\u0430\u0437\u0447\u0438\u043a\u0430';
        const openOwnerProfile = () => {
          const url = new URL('/user_profile.html', window.location.origin);
          url.searchParams.set('id', ownerId);
          if (data.client_iin) url.searchParams.set('iin', data.client_iin);
          window.location.href = url.toString();
        };
        ownerProfile.onclick = openOwnerProfile;
        ownerProfile.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openOwnerProfile();
          }
        };
      }

      const phoneEl = document.getElementById('load-phone');
      if (phoneEl) {
        phoneEl.innerText = data.contact_info || data.phone || 'Не указан';
      }

      document.getElementById('load-type').innerText = data.type || 'Не указан';
      document.getElementById('load-weight').innerText = `${data.weight || '0'} т`;
      document.getElementById('load-volume').innerText = `${data.volume || '—'} м³`;
      document.getElementById('load-loading-type').innerText = data.loading_type || 'Любая';

      const dims = `${data.length || '—'} × ${data.width || '—'} × ${data.height || '—'}`;
      document.getElementById('load-dims').innerText = dims;
      document.getElementById('load-description').innerText = data.description || 'Описание не указано.';

      const avatar = document.getElementById('user-avatar');
      if (avatar) avatar.innerText = data.client_name ? data.client_name.charAt(0).toUpperCase() : '?';

      if (offerBtn) {
        try {
          const meResponse = await fetch('/api/me', { credentials: 'include' });
          const me = await meResponse.json().catch(() => ({}));
          if (meResponse.ok && !me.error) {
            if (me.role !== 'carrier') {
              disableOfferButton('\u0421\u0442\u0430\u0432\u043a\u0438 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u043e\u0432');
            } else if (Number(me.id) === Number(data.userId)) {
              disableOfferButton('\u042d\u0442\u043e \u0432\u0430\u0448 \u0433\u0440\u0443\u0437');
            }
          }
        } catch {}
      }

      initLoadMap(data);
    } else {
      document.body.innerHTML = "<div class='container'><h1>Груз не найден</h1><a href='index2.html'>Назад</a></div>";
    }
  } catch (err) {
    console.error('Ошибка загрузки данных:', err);
    document.body.innerHTML = '<h1>Ошибка сервера. Попробуйте позже.</h1>';
  }
});