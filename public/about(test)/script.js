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

  if (mobileClose) mobileClose.addEventListener('click', closeMenu);

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
// Toast
// --------------------
function showToast(message, type = 'error') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --------------------
// Auth: profile icon + logout (как на главной)
// --------------------
async function updateNavbar() {
  try {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (!response.ok) return; // не авторизован — оставляем кнопку

    const user = await response.json();

    // один HTML и для мобилки и для десктопа
    const profileHref = user?.role === 'carrier' ? '/carrier_profile.html' : '/profile.html';

    const userHtml = `
      <div class="auth-user">
        <a href="${profileHref}" class="profile-link" title="${(user?.name || 'Профиль').replace(/"/g, '&quot;')}">
          <span class="profile-avatar profile-avatar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg></span><span class="sr-only">Профиль</span>
        </a>
        <button type="button" class="logout-btn" data-logout>Выйти</button>
      </div>
    `;

    const desktop = document.getElementById('auth-container');
    const mobile = document.getElementById('auth-container-mobile');

    if (desktop) desktop.innerHTML = userHtml;
    if (mobile) mobile.innerHTML = userHtml;

    // bind logout
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await handleLogout();
      });
    });

  } catch (err) {
    // тихо игнорим
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    location.href = '../index.html';
  } catch (e) {
    showToast('Не удалось выйти. Попробуй ещё раз.', 'error');
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', updateNavbar);

