// --------------------
// Mobile menu
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

  document.addEventListener('click', (e) => {
    if (!mobileMenu.classList.contains('active')) return;
    const isInside = mobileMenu.contains(e.target) || burger.contains(e.target);
    if (!isInside) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

// --------------------
// Auth: avatar icon + logout
// --------------------
async function updateNavbar() {
  try {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (!response.ok) return;

    const user = await response.json();

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

    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', logoutUser);
    });

  } catch (e) {
    // не авторизован — оставляем кнопку
  }
}

async function logoutUser() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {}
  location.reload();
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

