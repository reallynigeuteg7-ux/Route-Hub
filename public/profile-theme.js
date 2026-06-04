(function () {
  const storageKey = 'routehubProfileTheme';
  const root = document.documentElement;
  const toggle = document.getElementById('profile-theme-toggle');
  const label = document.getElementById('profile-theme-label');

  function getTheme() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = safeTheme;
    localStorage.setItem(storageKey, safeTheme);

    if (toggle) {
      toggle.setAttribute('aria-pressed', safeTheme === 'light' ? 'true' : 'false');
      toggle.classList.toggle('is-light', safeTheme === 'light');
    }

    if (label) {
      label.textContent = safeTheme === 'light' ? 'Белая' : 'Тёмная';
    }
  }

  applyTheme(getTheme());

  if (toggle) {
    toggle.addEventListener('click', () => {
      applyTheme(getTheme() === 'light' ? 'dark' : 'light');
    });
  }
})();