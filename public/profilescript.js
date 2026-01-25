// --- 1. ИНИЦИАЛИЗАЦИЯ ПРОФИЛЯ (Загрузка данных пользователя) ---
async function initProfile() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) {
      window.location.href = "login.html";
      return;
    }
    const user = await response.json();

    // Отображение данных
    document.getElementById("user-name-display").textContent = user.name;
    document.getElementById("form-name").value = user.name;

    const addCargoBtn = document.getElementById("add-cargo-btn");
    if (addCargoBtn) {
      if (user.role === "client") {
        addCargoBtn.style.display = "block"; // Показываем грузовладельцу
      } else {
        addCargoBtn.style.display = "none"; // Скрываем от перевозчика
      }
    }

    const roleDisplay = document.getElementById("user-role-display");
    if (roleDisplay) {
      roleDisplay.textContent =
        user.role === "carrier" ? "🚛 Перевозчик" : "📦 Грузовладелец";
      // Можно добавить стиль, чтобы выделялось
      roleDisplay.style.color = "#00d5ff";
      roleDisplay.style.fontWeight = "700";
    }

    const emailInput = document.querySelector('input[type="email"]');
    if (emailInput) emailInput.value = user.email;

    if (user.phone) document.getElementById("form-phone").value = user.phone;
    if (user.company)
      document.getElementById("form-company").value = user.company;

    // Счетчик активных заявок
    const activeLoadsElement = document.getElementById("active-loads-count");
    if (activeLoadsElement) {
      activeLoadsElement.textContent =
        user.activeLoads !== undefined ? user.activeLoads : 0;
    }

    // Аватар (Первая буква имени)
    const avatar = document.querySelector(".avatar-big");
    if (avatar && user.name)
      avatar.textContent = user.name.charAt(0).toUpperCase();
  } catch (err) {
    console.error("Ошибка инициализации:", err);
  }
}

// --- 2. СОХРАНЕНИЕ ИЗМЕНЕНИЙ ---
async function saveProfileChanges() {
  const name = document.getElementById("form-name").value;
  const phone = document.getElementById("form-phone").value;
  const company = document.getElementById("form-company").value;

  try {
    const response = await fetch("/api/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, company })
    });

    if (response.ok) {
      alert("Данные успешно сохранены!");
      initProfile();
    } else {
      const errorData = await response.json();
      alert("Ошибка: " + (errorData.error || "Неизвестная ошибка"));
    }
  } catch (err) {
    console.error("Ошибка сети:", err);
  }
}

// --- 3. РАБОТА С ГРУЗАМИ (Мои грузы) ---
async function loadMyCargo() {
  const cargoContainer = document.getElementById("my-cargo-list");
  if (!cargoContainer) return;

  cargoContainer.innerHTML =
    '<p style="text-align: center; color: #666; padding: 20px;">Загрузка...</p>';

  try {
    const response = await fetch("/api/my-loads");
    const myCargo = await response.json();

    if (myCargo && myCargo.length > 0) {
      cargoContainer.innerHTML = myCargo
        .map(
          (cargo) => `
                <div class="cargo-item" style="border: 1px solid #eee; margin-bottom: 15px; padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; background: #fff;">
                    <div class="cargo-info">
                        <div style="font-weight: 700; color: #2b8cff; margin-bottom: 5px; font-size: 16px;">
                            ${cargo.from_location} → ${cargo.to_location}
                        </div>
                        <div style="font-size: 13px; color: #666;">
                            ${cargo.type || "Груз"} • ${
            cargo.weight || "?"
          } т. • ${cargo.volume || "?"} м³
                        </div>
                        <div style="font-size: 11px; color: #999; margin-top: 5px;">Дата: ${
                          cargo.date || "Не указана"
                        }</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="trackCargo(${
                          cargo.id
                        })" style="background: #e1f5fe; border: 1px solid #b3e5fc; color: #0288d1; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Отследить</button>
                        <button onclick="deleteCargo(${
                          cargo.id
                        })" style="background: #fff5f5; border: 1px solid #ffcccc; color: #ff4d4d; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">Удалить</button>
                    </div>
                </div>
            `
        )
        .join("");
    } else {
      cargoContainer.innerHTML =
        '<p style="text-align: center; color: #666; padding: 40px 0;">У вас пока нет активных грузов.</p>';
    }
  } catch (err) {
    cargoContainer.innerHTML = '<p style="color: red;">Ошибка загрузки</p>';
  }
}

async function deleteCargo(id) {
  if (!confirm("Удалить этот груз?")) return;
  try {
    const response = await fetch(`/api/loads/${id}`, { method: "DELETE" });
    if (response.ok) {
      loadMyCargo();
      initProfile();
    }
  } catch (err) {
    alert("Ошибка при удалении");
  }
}

function trackCargo(id) {
  window.location.href = `/mape/map.html?trackId=${id}`;
}

// --- 4. ОСНОВНОЙ СЛУШАТЕЛЬ (DOMContentLoaded) ---
document.addEventListener("DOMContentLoaded", () => {
  initProfile(); // Загружаем данные юзера сразу

  // Кнопка сохранения профиля
  const saveBtn = document.querySelector(".btn-save");
  if (saveBtn) saveBtn.addEventListener("click", saveProfileChanges);

  // Кнопка добавления груза
 const addCargoBtnElement = document.querySelector('#add-cargo-btn'); // Используем наш новый ID
if (addCargoBtnElement) {
    addCargoBtnElement.onclick = () => { 
        window.location.href = 'page4/index.html'; 
    };
}

  // ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ТАБОВ
  const navLinks = document.querySelectorAll(".profile-nav a");
  const tabs = document.querySelectorAll(".profile-tab");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const linkText = link.textContent.trim();

      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      tabs.forEach((t) => t.classList.remove("active"));

      if (linkText === "Личные данные") {
        document.getElementById("tab-personal").classList.add("active");
      } else if (linkText === "Мои грузы") {
        document.getElementById("tab-cargo").classList.add("active");
        loadMyCargo();
      } else if (linkText === "Баланс") {
        document.getElementById("tab-balance").classList.add("active");
      } else if (linkText === "Сотрудники") {
        document.getElementById("tab-staff").classList.add("active");
      } else if (linkText === "Избранное") {
        document.getElementById("tab-favorites").classList.add("active");
        loadFavoritesData(); // Вызови, когда добавишь функцию для БД
      }
    });
  });

  // МОДАЛКА СОТРУДНИКОВ
  const addStaffBtn = document.querySelector("#tab-staff .btn-save");
  const staffModal = document.getElementById("modal-add-staff");
  const closeModalBtn = document.getElementById("close-modal");

  if (addStaffBtn && staffModal) {
    addStaffBtn.onclick = () => (staffModal.style.display = "flex");
  }
  if (closeModalBtn) {
    closeModalBtn.onclick = () => (staffModal.style.display = "none");
  }
  window.onclick = (e) => {
    if (e.target === staffModal) staffModal.style.display = "none";
  };
});

// Универсальная функция переключения
function switchTab(tabName) {
    const tabId = "tab-" + tabName;
    
    // 1. Скрываем все табы
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    // 2. Убираем активный класс у всех ссылок (и в боковом меню, и в выпадающем)
    document.querySelectorAll('.profile-nav a, .tab-link').forEach(l => l.classList.remove('active'));
    
    // 3. Показываем нужный таб
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        
        // Специальная логика для подгрузки данных
        if (tabName === 'cargo') loadMyCargo();
    }
}

// Универсальная функция переключения
function switchTab(tabName) {
    const tabId = "tab-" + tabName;
    
    // 1. Скрываем все табы
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    // 2. Убираем активный класс у всех ссылок (и в боковом меню, и в выпадающем)
    document.querySelectorAll('.profile-nav a, .tab-link').forEach(l => l.classList.remove('active'));
    
    // 3. Показываем нужный таб
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        
        // Специальная логика для подгрузки данных
        if (tabName === 'cargo') loadMyCargo();
    }
}

// В DOMContentLoaded добавь:
document.addEventListener("DOMContentLoaded", () => {
    // Слушатель для бокового меню (если ты его вернешь)
    document.querySelectorAll('.profile-nav a').forEach((link, index) => {
        const tabsOrder = ['personal', 'cargo', 'balance', 'staff', 'favorites', 'messages'];
        link.onclick = (e) => {
            e.preventDefault();
            switchTab(tabsOrder[index]);
        };
    });

    // Слушатель для выпадающего меню
    document.querySelectorAll('.tab-link').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            switchTab(link.getAttribute('data-tab'));
        };
    });
});