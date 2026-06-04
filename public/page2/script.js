let DB_CARGOS = [];
let IS_AUTHENTICATED = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function updateNavbar() {
  try {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (!response.ok) {
      IS_AUTHENTICATED = false;
      return;
    }

    const user = await response.json();
    IS_AUTHENTICATED = true;
    localStorage.setItem('user', JSON.stringify(user));
    const profileHref = user?.role === 'carrier' ? '/carrier_profile.html' : '/profile.html';

    [document.getElementById('auth-container-desktop'), document.getElementById('auth-container-mobile')]
      .forEach((container) => {
        if (!container) return;
        container.replaceChildren();

        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';

        const profileLink = document.createElement('a');
        profileLink.href = profileHref;
        profileLink.className = 'profile-link';
        profileLink.title = user?.name || 'Профиль';
        profileLink.innerHTML = '<span class="profile-avatar profile-avatar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg></span>';

        const logoutBtn = document.createElement('button');
        logoutBtn.type = 'button';
        logoutBtn.className = 'logout-btn';
        logoutBtn.textContent = 'Выйти';
        logoutBtn.addEventListener('click', logoutUser);

        userInfo.appendChild(profileLink);
        userInfo.appendChild(logoutBtn);
        container.appendChild(userInfo);
      });
  } catch {
    // Пользователь не авторизован.
  }
}

async function logoutUser() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('user');
    window.location.reload();
  } catch (err) {
    console.error('Ошибка при выходе:', err);
  }
}

function populateSelects() {
  const from = document.getElementById('qFrom');
  const to = document.getElementById('qTo');
  const body = document.getElementById('qBody');
  if (!from || !to || !body) return;

  const addOptions = (select, values) => {
    select.innerHTML = '<option value="">Любой</option>';
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  };
  const cities = typeof CITIES !== 'undefined' ? CITIES : [];
  const bodies = typeof BODIES !== 'undefined' ? BODIES : [];
  addOptions(from, cities);
  addOptions(to, cities);
  addOptions(body, bodies);
}

function normalizeCargo(item) {
  return {
    id: 'db-' + item.id,
    from: item.from_location || item.from || '',
    to: item.to_location || item.to || '',
    body: item.type || item.body || '',
    weight: item.weight || '',
    date: item.date || '',
    price: item.price || 0,
    contact: item.contact_info || item.contact || '',
  };
}

async function fetchServerCargos() {
  try {
    const response = await fetch('/api/loads', { credentials: 'include' });
    if (!response.ok) throw new Error('Loads request failed');
    const data = await response.json();
    DB_CARGOS = Array.isArray(data) ? data.map(normalizeCargo) : [];
  } catch (err) {
    console.error('Сервер недоступен, показываем локальные данные:', err);
    DB_CARGOS = [];
  }
}

function getAllCargos() {
  const staticCargos = typeof CARGOS !== 'undefined' && Array.isArray(CARGOS) ? CARGOS : [];
  return [...DB_CARGOS, ...staticCargos];
}

function applyFiltersAndRender() {
  const qFrom = document.getElementById('qFrom')?.value || '';
  const qTo = document.getElementById('qTo')?.value || '';
  const qBody = document.getElementById('qBody')?.value || '';
  const qWmin = parseFloat(document.getElementById('qWmin')?.value || '0') || 0;
  const qWmax = parseFloat(document.getElementById('qWmax')?.value || '0') || 0;
  const sort = document.getElementById('sortSelect')?.value || 'date_desc';

  let results = getAllCargos().filter((cargo) => {
    if (qFrom && cargo.from !== qFrom) return false;
    if (qTo && cargo.to !== qTo) return false;
    if (qBody && cargo.body !== qBody) return false;
    if (qWmin && parseFloat(cargo.weight) < qWmin) return false;
    if (qWmax > 0 && parseFloat(cargo.weight) > qWmax) return false;
    return true;
  });

  if (sort === 'date_desc') results.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sort === 'price_desc') results.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));

  const container = document.getElementById('results');
  if (!container) return;

  container.innerHTML = results.length
    ? results.map(renderCard).join('')
    : '<div class="no-results">Ничего не найдено. Попробуйте сбросить фильтры или выбрать другой маршрут.</div>';

  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = String(results.length);

  attachCardListeners();
}

function renderCard(item) {
  const cleanId = String(item.id).replace('db-', '');
  const safeFrom = escapeHtml(item.from || '—');
  const safeTo = escapeHtml(item.to || '—');
  const safeBody = escapeHtml(item.body || 'Кузов не указан');
  const safeWeight = escapeHtml(item.weight || '—');
  const safeDate = escapeHtml(formatDateISO(item.date));
  const numericPrice = Number(item.price || 0);
  const safePrice = Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice.toLocaleString('ru-RU') : '—';

  return `
    <article class="result-card">
      <div class="rc-top">
        <div class="route"><strong>${safeFrom}</strong> → <strong>${safeTo}</strong></div>
        <div class="badge">${safeBody}</div>
      </div>
      <div class="rc-meta">
        <div>Вес<strong>${safeWeight} т</strong></div>
        <div>Дата<strong>${safeDate}</strong></div>
        <div>Цена<strong>${safePrice} ₸</strong></div>
      </div>
      <div class="rc-actions">
        <a href="card.html?id=${encodeURIComponent(cleanId)}" class="btn-more">Подробнее</a>
        <button class="btn-save" data-id="${escapeHtml(item.id)}" type="button">Сохранить</button>
      </div>
    </article>`;
}

function formatDateISO(value) {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
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
  try { return JSON.parse(localStorage.getItem(getFavKey())) || []; } catch { return []; }
}

function writeFavorites(values) {
  localStorage.setItem(getFavKey(), JSON.stringify(values));
}

function showAuthRequiredPopup() {
  const modal = document.getElementById('authRequiredModal');
  if (!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-modal-lock');
}

function closeAuthRequiredPopup() {
  const modal = document.getElementById('authRequiredModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-modal-lock');
}

function initAuthRequiredModal() {
  document.querySelectorAll('[data-auth-modal-close]').forEach((button) => {
    button.addEventListener('click', closeAuthRequiredPopup);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAuthRequiredPopup();
  });
}

function attachCardListeners() {
  document.querySelectorAll('.btn-more').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (IS_AUTHENTICATED) return;
      event.preventDefault();
      showAuthRequiredPopup();
    });
  });

  document.querySelectorAll('.btn-save').forEach((button) => {
    const id = button.dataset.id;
    const favorites = readFavorites();
    if (favorites.includes(id)) button.textContent = 'Сохранено';

    button.addEventListener('click', () => {
      const current = readFavorites();
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeFavorites(next);
      button.textContent = next.includes(id) ? 'Сохранено' : 'Сохранить';
    });
  });
}

function backToSearch() {
  const details = document.getElementById('details-view');
  const search = document.getElementById('search-view');
  if (details) details.style.display = 'none';
  if (search) search.style.display = 'block';
}

function initBurgerMenu() {
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!burger || !mobileMenu) return;

  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileMenu.classList.toggle('active');
    document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      burger.classList.remove('open');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

window.backToSearch = backToSearch;

document.addEventListener('DOMContentLoaded', async () => {
  await updateNavbar();
  populateSelects();
  initBurgerMenu();
  initAuthRequiredModal();
  await fetchServerCargos();
  applyFiltersAndRender();

  const form = document.getElementById('searchForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      applyFiltersAndRender();
    });
  }

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      applyFiltersAndRender();
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', applyFiltersAndRender);
});