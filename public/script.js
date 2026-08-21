// --------------------
// UI: Navbar shadow on scroll
// --------------------
const navbar = document.getElementById('navbar');

function handleNavbarShadow() {
  if (!navbar) return;
  if (window.scrollY > 8) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}
window.addEventListener('scroll', handleNavbarShadow);
document.addEventListener('DOMContentLoaded', handleNavbarShadow);

// --------------------
// UI: Mobile menu (burger)
// --------------------
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');

function openMenu() {
  if (!burger || !mobileMenu) return;
  burger.classList.add('open');
  mobileMenu.classList.add('active');
  burger.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  if (!burger || !mobileMenu) return;
  burger.classList.remove('open');
  mobileMenu.classList.remove('active');
  burger.setAttribute('aria-expanded', 'false');
}

if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const active = mobileMenu.classList.contains('active');
    active ? closeMenu() : openMenu();
  });

  mobileClose?.addEventListener('click', closeMenu);

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!mobileMenu.classList.contains('active')) return;
    const isInside = mobileMenu.contains(e.target) || burger.contains(e.target);
    if (!isInside) closeMenu();
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

// --------------------
// Stats: Count-up animation (real data from backend)
// --------------------
function formatCounterValue(value) {
  const numeric = Number(value || 0);
  return numeric >= 10000 ? numeric.toLocaleString('ru-RU') : String(numeric);
}

function animateCount(el, target, durationMs = 900) {
  const start = 0;
  const startTime = performance.now();

  function tick(now) {
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.floor(start + (target - start) * eased);

    el.textContent = formatCounterValue(value);

    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatCounterValue(target);
  }

  requestAnimationFrame(tick);
}

async function loadStatsCounters(counters) {
  try {
    const response = await fetch('/api/stats', { cache: 'no-store' });
    if (!response.ok) throw new Error('Stats request failed');

    const stats = await response.json();
    const values = {
      activeLoads: stats.loads?.active ?? stats.activeLoads ?? stats.totalLoads ?? 0,
      carriers: stats.users?.carriers ?? stats.carriers ?? 0,
      totalUsers: stats.users?.total ?? stats.totalUsers ?? 0
    };

    counters.forEach((counter) => {
      const key = counter.dataset.statKey;
      if (!key || values[key] === undefined) return;
      counter.dataset.count = String(Number(values[key]) || 0);
      counter.textContent = '0';
    });
  } catch (err) {
    counters.forEach((counter) => {
      counter.dataset.count = counter.dataset.count || '0';
    });
  }
}

async function setupCounters() {
  const counters = Array.from(document.querySelectorAll('[data-count]'));
  if (!counters.length) return;

  counters.forEach(c => c.dataset.animated = '0');
  await loadStatsCounters(counters);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const el = entry.target;
      if (el.dataset.animated === '1') return;

      el.dataset.animated = '1';
      const target = Number(el.dataset.count || 0);
      animateCount(el, target, 900);
      observer.unobserve(el);
    });
  }, { threshold: 0.35 });

  counters.forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', setupCounters);

// --------------------
// Auth: Update navbar based on /api/me
// --------------------
function normalizeUserRole(role) {
  const raw = String(role || '').trim().toLowerCase();

  if (
    raw === 'carrier' ||
    raw === 'driver' ||
    raw === 'transport' ||
    raw === 'transporter' ||
    raw.includes('перевоз') ||
    raw.includes('водител')
  ) {
    return 'carrier';
  }

  return 'client';
}

function isCarrierUser(user) {
  return normalizeUserRole(
    user?.role ||
    user?.userRole ||
    user?.user_type ||
    user?.userType ||
    user?.account_type ||
    user?.accountType ||
    user?.type
  ) === 'carrier';
}

async function updateNavbar() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return;

    const user = await response.json();

    const profileHref = isCarrierUser(user) ? '/carrier_profile.html' : '/profile.html';

    const desktop = document.getElementById('auth-container');
    const mobile = document.getElementById('auth-container-mobile');

    [desktop, mobile].forEach((container) => {
      if (!container) return;

      container.replaceChildren();

      const authUser = document.createElement('div');
      authUser.className = 'auth-user';

      const profileLink = document.createElement('a');
      profileLink.href = profileHref;
      profileLink.className = 'profile-link';
      profileLink.title = user?.name || 'Профиль';

      const avatar = document.createElement('span');
      avatar.className = 'profile-avatar profile-avatar-icon';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>';

      const logoutBtn = document.createElement('button');
      logoutBtn.type = 'button';
      logoutBtn.className = 'logout-btn';
      logoutBtn.textContent = 'Выйти';
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleLogout();
      });

      profileLink.appendChild(avatar);
      authUser.appendChild(profileLink);
      authUser.appendChild(logoutBtn);
      container.appendChild(authUser);
    });

  } catch (err) {
    // Not logged in or server unavailable — ignore quietly
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });

    // If Firebase connected, sign out too
    if (typeof firebase !== 'undefined' && firebase?.auth) {
      try { await firebase.auth().signOut(); } catch (_) {}
    }

    localStorage.removeItem('token');
    window.location.href = 'index.html';
  } catch (err) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
}

async function handleClientAccess(e) {
  e.preventDefault();

  try {
    const response = await fetch('/api/me');

    if (!response.ok) {
      window.location.href = 'login.html';
      return;
    }

    const user = await response.json();

    if (isCarrierUser(user)) {
      showToast('Этот раздел доступен только грузовладельцам.', 'error');
    } else {
      window.location.href = 'page4/index.html';
    }

  } catch (err) {
    window.location.href = 'login.html';
  }
}


function showToast(message, type = 'error') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-client')?.addEventListener('click', handleClientAccess);
  document.getElementById('btn-client-cta')?.addEventListener('click', handleClientAccess);
});

document.addEventListener('DOMContentLoaded', updateNavbar);


const aiToggle = document.getElementById('aiToggle');
const aiClose = document.getElementById('aiClose');
const aiPanel = document.getElementById('aiPanel');
const aiForm = document.getElementById('aiForm');
const aiInput = document.getElementById('aiInput');
const aiMessages = document.getElementById('aiMessages');
const aiQuick = document.getElementById('aiQuick');

const aiHistory = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function aiScrollBottom() {
  if (!aiMessages) return;
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function addAiMessage(role, text) {
  if (!aiMessages) return;
  const div = document.createElement('div');
  div.className = `ai-msg ${role === 'user' ? 'ai-msg--user' : 'ai-msg--assistant'}`;
  div.textContent = text;
  aiMessages.appendChild(div);
  aiScrollBottom();
}

function addAiLoads(loads) {
  if (!aiMessages || !Array.isArray(loads) || !loads.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'ai-loads';

  loads.forEach((load) => {
    const card = document.createElement('div');
    card.className = 'ai-load-card';

    const priceValue = Number(load.price || 0);
    const priceCurrency = String(load.currency || 'KZT').toUpperCase();
    const priceLabel = priceCurrency === 'KZT' ? '₸' : priceCurrency;
    const formattedPrice = Number.isFinite(priceValue)
      ? priceValue.toLocaleString('ru-RU') + ' ' + priceLabel
      : 'Цена не указана';

    const statusText =
      load.status === 'open' ? 'Открыт' :
      load.status === 'assigned' ? 'Назначен' :
      load.status === 'completed' ? 'Завершён' :
      load.status || 'Не указан';

    const safeRouteFrom = escapeHtml(load.from_location || '—');
    const safeRouteTo = escapeHtml(load.to_location || '—');
    const safeType = escapeHtml(load.type || 'Груз не указан');
    const safeWeight = escapeHtml(load.weight || '—');
    const safeDate = escapeHtml(load.date || 'Не указана');
    const safeStatus = escapeHtml(statusText);
    const safeHref = encodeURI(load.url || `/page2/card.html?id=${load.id}`);

    card.innerHTML = `
      <div class="ai-load-top">
        <div class="ai-load-route">${safeRouteFrom} → ${safeRouteTo}</div>
        <div class="ai-load-price">${formattedPrice}</div>
      </div>

      <div class="ai-load-type">${safeType}</div>

      <div class="ai-load-tags">
        <span class="ai-load-tag">Вес: ${safeWeight} т</span>
        <span class="ai-load-tag">Дата: ${safeDate}</span>
        <span class="ai-load-tag ai-load-tag--status">${safeStatus}</span>
      </div>

      <div class="ai-load-actions">
        <a class="ai-load-link" href="${safeHref}">Открыть груз</a>
      </div>
    `;

    wrapper.appendChild(card);
  });

  aiMessages.appendChild(wrapper);
  aiScrollBottom();
}

async function sendAiMessage(message) {
  const text = String(message || '').trim();
  if (!text || !aiInput || !aiMessages) return;

  addAiMessage('user', text);
  aiHistory.push({ role: 'user', content: text });
  aiInput.value = '';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'ai-msg ai-msg--assistant';
  loadingEl.textContent = 'Думаю...';
  aiMessages.appendChild(loadingEl);
  aiScrollBottom();

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        history: aiHistory
      })
    });

    const data = await response.json();
    loadingEl.remove();

    if (!response.ok || data.error) {
      addAiMessage('assistant', data.error || 'Ошибка ответа ИИ');
      return;
    }

    addAiMessage('assistant', data.text || 'Пустой ответ');
    aiHistory.push({ role: 'assistant', content: data.text || '' });

    if (Array.isArray(data.loads) && data.loads.length) {
      addAiLoads(data.loads);
    }
  } catch (error) {
    loadingEl.remove();
    addAiMessage('assistant', 'Ошибка сети: ' + error.message);
  }
}

if (aiToggle && aiClose && aiPanel) {
  aiToggle.addEventListener('click', (e) => {
    e.preventDefault();
    aiPanel.classList.toggle('active');
  });

  aiClose.addEventListener('click', (e) => {
    e.preventDefault();
    aiPanel.classList.remove('active');
  });
}

if (aiQuick) {
  aiQuick.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-quick-btn');
    if (!btn || !aiInput) return;

    const prompt = btn.dataset.aiPrompt || '';
    aiInput.value = prompt;
    aiInput.focus();
  });
}

if (aiForm && aiInput) {
  aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendAiMessage(aiInput.value);
  });
}



// --------------------
// Home dashboard: render real loads from backend
// --------------------
function formatDashboardMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Договорная';
  return `${numeric.toLocaleString('ru-RU')} ₸`;
}

function formatDashboardWeight(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Вес не указан';
  return `${numeric.toLocaleString('ru-RU')} т`;
}

function getLoadStatusLabel(status) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'assigned') return 'Назначен';
  if (raw === 'accepted') return 'Принят';
  if (raw === 'open' || !raw) return 'Открыт';
  return status;
}

function renderDashboardEmpty(message = 'Активных грузов пока нет') {
  const main = document.getElementById('dashboard-main-load');
  const list = document.getElementById('dashboard-load-list');
  const count = document.getElementById('dashboard-load-count');
  const note = document.getElementById('dashboard-load-note');

  if (main) {
    main.href = 'page2/index2.html';
    main.classList.add('route-card-loading');
    main.innerHTML = `
      <div class="route-head"><span>RouteHub</span><b>Поиск</b></div>
      <div class="route-line"><strong>Грузы</strong><i></i><strong>Казахстан</strong></div>
      <div class="route-meta"><span>${escapeHtml(message)}</span></div>
    `;
  }
  if (list) list.innerHTML = `<div class="mini-row"><b>${escapeHtml(message)}</b><span>0</span></div>`;
  if (count) count.textContent = '0';
  if (note) note.textContent = 'Откройте поиск, чтобы посмотреть доступные направления';
}

function renderHomeDashboardLoads(loads) {
  const main = document.getElementById('dashboard-main-load');
  const list = document.getElementById('dashboard-load-list');
  const count = document.getElementById('dashboard-load-count');
  const note = document.getElementById('dashboard-load-note');
  if (!main || !list) return;

  const activeLoads = Array.isArray(loads)
    ? loads.filter((load) => String(load?.status || 'open').toLowerCase() !== 'completed')
    : [];

  if (!activeLoads.length) {
    renderDashboardEmpty();
    return;
  }

  const [primary, ...rest] = activeLoads;
  const from = escapeHtml(primary.from_location || 'Откуда');
  const to = escapeHtml(primary.to_location || 'Куда');
  const type = escapeHtml(primary.type || primary.loading_type || 'Груз');
  const status = escapeHtml(getLoadStatusLabel(primary.status));

  main.href = `page2/card.html?id=${encodeURIComponent(primary.id)}`;
  main.classList.remove('route-card-loading');
  main.innerHTML = `
    <div class="route-head"><span>Груз #${escapeHtml(primary.id)}</span><b>${formatDashboardMoney(primary.price)}</b></div>
    <div class="route-line"><strong>${from}</strong><i></i><strong>${to}</strong></div>
    <div class="route-meta"><span>${formatDashboardWeight(primary.weight)}</span><span>${type}</span><span>${status}</span></div>
  `;

  const listLoads = rest.slice(0, 3);
  list.innerHTML = listLoads.length
    ? listLoads.map((load) => {
        const route = `${escapeHtml(load.from_location || 'Откуда')} - ${escapeHtml(load.to_location || 'Куда')}`;
        return `<a class="mini-row" href="page2/card.html?id=${encodeURIComponent(load.id)}"><b>${route}</b><span>${formatDashboardWeight(load.weight)}</span></a>`;
      }).join('')
    : '<div class="mini-row"><b>Другие грузы появятся здесь</b><span>soon</span></div>';

  if (count) count.textContent = String(activeLoads.length);
  if (note) note.textContent = `Показаны реальные заявки из базы RouteHub, обновлено сейчас`;
}

async function loadHomeDashboardLoads() {
  if (!document.getElementById('loads-dashboard')) return;
  try {
    const response = await fetch('/api/loads', { cache: 'no-store' });
    if (!response.ok) throw new Error('Loads request failed');
    const loads = await response.json();
    renderHomeDashboardLoads(loads);
  } catch (error) {
    console.error('Dashboard loads error:', error);
    renderDashboardEmpty('Не удалось загрузить грузы');
  }
}

document.addEventListener('DOMContentLoaded', loadHomeDashboardLoads);