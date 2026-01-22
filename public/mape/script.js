/* ========== 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ И КАРТА ========== */
const map = L.map('map').setView([48.0196, 66.9237], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const markersGroup = L.layerGroup().addTo(map);

const cityCoords = {
    "Алматы": { lat: 43.2389, lng: 76.8897 },
    "Астана": { lat: 51.1605, lng: 71.4704 },
    "Шымкент": { lat: 42.3249, lng: 69.5882 },
    "Караганда": { lat: 49.8019, lng: 73.1021 },
    "Актобе": { lat: 50.2839, lng: 57.1669 }
};

/* ========== 2. АВТОРИЗАЦИЯ И МЕНЮ ========== */
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        const user = await res.json();
        if (user.name) {
            const html = `<div class="user-info">
                <span class="user-name">${user.name}</span>
                <button onclick="logout()" class="logout-btn">Выйти</button>
            </div>`;
            document.getElementById('auth-container').innerHTML = html;
            document.getElementById('auth-container-mobile').innerHTML = html;
        }
    } catch (e) { console.log('Не авторизован'); }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
}

// Бургер
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
if(burger) {
    burger.onclick = () => {
        burger.classList.toggle('open');
        mobileMenu.classList.toggle('active');
    };
}

/* ========== 3.УМНЫЙ ПОИСК ГОРОДОВ (ВЕСЬ КАЗАХСТАН) ========== */
async function loadCargoOnMap() {
    const typeFilter = document.getElementById('filterType').value;
    const weightFilter = parseFloat(document.getElementById('filterWeight').value) || 0;
    const citySearch = document.getElementById('citySearch').value;

    // 1. ГЕОКОДИНГ: Ищем координаты любого города/села через API
    if (citySearch.length > 2) {
        try {
            // Добавляем "Казахстан" к запросу для точности
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(citySearch + ", Казахстан")}`);
            const geoData = await geoRes.json();

            if (geoData && geoData.length > 0) {
                const target = geoData[0];
                map.flyTo([target.lat, target.lng], 10); // Летим в любую точку КЗ
            }
        } catch (e) {
            console.error("Ошибка поиска координат:", e);
        }
    }

    // 2. ОТРИСОВКА ГРУЗОВ (стандартная логика)
    try {
        const response = await fetch('/api/loads');
        const loads = await response.json();
        markersGroup.clearLayers();

        loads.forEach(load => {
            if (typeFilter && load.type !== typeFilter) return;
            if (load.weight < weightFilter) return;

            // Если координат нет в БД, пробуем ставить по умолчанию
            const lat = load.lat || 48.0196;
            const lng = load.lng || 66.9237;

            const popupContent = `
                <div class="map-popup">
                    <h3 style="color:#2b8cff; margin:0 0 5px;">${load.from_location} → ${load.to_location}</h3>
                    <p><b>Вес:</b> ${load.weight} т</p>
                    <p style="color:#2ecc71; font-weight:700; font-size:16px;">${load.price.toLocaleString()} ₸</p>
                    <a href="tel:${load.contact_info}" class="call-btn">Позвонить</a>
                </div>
            `;

            L.marker([lat, lng]).addTo(markersGroup).bindPopup(popupContent);
        });
    } catch (error) { console.error('Ошибка загрузки:', error); }
}

/* ========== 4. ЗАПУСК ========== */
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadCargoOnMap();
    document.getElementById('applyMapFilters').onclick = loadCargoOnMap;
});