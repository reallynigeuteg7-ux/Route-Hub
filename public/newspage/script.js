  async function updateNavbar() {
    try {
      const response = await fetch('/api/me'); // Путь к API обычно абсолютный
      
      if (response.ok) {
        const user = await response.json();
        
        const userHtml = `
          <div style="display: flex; align-items: center; gap: 15px;">
            <span style="color: var(--text-primary); font-weight: 600; font-size: 14px; letter-spacing: 0.5px;">
              ${user.name}
            </span>
            <button onclick="logoutUser()" class="logout-btn">
              Выйти
            </button>
          </div>
        `;

        // Обновляем оба контейнера, которые мы пометили ID
        const desktopAuth = document.getElementById('auth-container');
        const mobileAuth = document.getElementById('auth-container-mobile');
        
        if(desktopAuth) desktopAuth.innerHTML = userHtml;
        if(mobileAuth) mobileAuth.innerHTML = userHtml;
      }
    } catch (err) {
      console.log('Пользователь не авторизован');
    }
  }

  async function logoutUser() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
  }

  document.addEventListener('DOMContentLoaded', updateNavbar);

  const burger = document.getElementById('burger');
    const menu = document.getElementById('mobileMenu');
    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      menu.classList.toggle('active');
    });