// ==========================================
// 1. ДАННЫЕ И АВТОРИЗАЦИЯ
// ==========================================
let DB_CARGOS = [];

async function updateNavbar() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const user = await response.json();
            // Сохраняем в localStorage для использования в деталях
            localStorage.setItem('user', JSON.stringify(user));
            
            const userHtml = `
              <div class="user-info">
                <span class="user-name" style="color: #fff; font-weight:600; font-size: 14px;">${user.name}</span>
                <button onclick="logoutUser()" class="logout-btn">Выйти</button>
              </div>`;

            const desktopContainer = document.getElementById('auth-container-desktop');
            const mobileContainer = document.getElementById('auth-container-mobile');
            
            if (desktopContainer) desktopContainer.innerHTML = userHtml;
            if (mobileContainer) mobileContainer.innerHTML = userHtml;
        }
    } catch (err) {
        console.log('Пользователь не авторизован');
    }
}

async function logoutUser() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        localStorage.removeItem('user');
        window.location.reload();
    } catch (err) {
        console.error("Ошибка при выходе:", err);
    }
}

// ==========================================
// 2. ПОИСК И ФИЛЬТРАЦИЯ
// ==========================================

function populateSelects() {
    const from = document.getElementById('qFrom');
    const to = document.getElementById('qTo');
    const body = document.getElementById('qBody');
    if (!from || !to || !body) return;

    const addOptions = (select, arr) => {
        select.innerHTML = '<option value="">Любой</option>';
        arr.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            select.appendChild(opt);
        });
    };

    addOptions(from, CITIES);
    addOptions(to, CITIES);
    addOptions(body, BODIES);
}

function applyFiltersAndRender() {
    const qFrom = document.getElementById('qFrom').value;
    const qTo = document.getElementById('qTo').value;
    const qBody = document.getElementById('qBody').value;
    const qWmin = parseFloat(document.getElementById('qWmin').value) || 0;
    const qWmax = parseFloat(document.getElementById('qWmax').value) || 0;
    const qDate = document.getElementById('qDate').value;
    const sort = document.getElementById('sortSelect').value;

    // Проверяем, есть ли вообще данные. Если CARGOS не определен в data.js, берем пустой массив
    const staticCargos = typeof CARGOS !== 'undefined' ? CARGOS : [];
    const allCargos = [...DB_CARGOS, ...staticCargos];

    console.log("Всего грузов для фильтрации:", allCargos.length); // Проверка в консоли (F12)

    let results = allCargos.filter(c => {
        // Мягкая проверка: если поле пустое, не фильтруем по нему
        if (qFrom && c.from !== qFrom) return false;
        if (qTo && c.to !== qTo) return false;
        if (qBody && c.body !== qBody) return false;
        if (qWmin && parseFloat(c.weight) < qWmin) return false;
        if (qWmax > 0 && parseFloat(c.weight) > qWmax) return false;
        
        // С датой часто бывают проблемы из-за форматов, пока закомментируем для теста
        // if (qDate && c.date !== qDate) return false; 
        
        return true;
    });

    // Сортировка
    if (sort === 'date_desc') results.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sort === 'price_desc') results.sort((a, b) => b.price - a.price);

    const container = document.getElementById('results');
    if (container) {
        container.innerHTML = results.length 
            ? results.map(renderCard).join('') 
            : '<div class="no-results" style="color:white; padding:20px;">Ничего не найдено. Попробуйте сбросить фильтры.</div>';
        
        const countEl = document.getElementById('resultsCount');
        if (countEl) countEl.textContent = `(${results.length})`;
        
        attachCardListeners();
    }
}

function renderCard(item) {
    return `
    <div class="result-card">
      <div class="rc-top">
        <div class="route"><strong>${item.from}</strong> → <strong>${item.to}</strong></div>
        <div class="badge">${item.body}</div>
      </div>
      <div class="rc-meta">
        <div>Вес: <strong>${item.weight} т</strong></div>
        <div>Дата: <strong>${formatDateISO(item.date)}</strong></div>
        <div>Цена: <strong>${item.price} $</strong></div>
      </div>
      <div class="rc-actions">
        <button class="btn btn-primary" onclick="showDetails('${item.id}')" style="flex:1">Подробнее</button>
        <button class="btn btn-ghost btn-save" data-id="${item.id}">Сохранить</button>
      </div>
    </div>`;
}

async function fetchServerCargos() {
    try {
        const response = await fetch('/api/loads');
        if (response.ok) {
            const data = await response.json();
            DB_CARGOS = data.map(item => ({
                id: 'db-' + item.id,
                from: item.from_location,
                to: item.to_location,
                body: item.type,
                weight: item.weight,
                date: item.date,
                price: item.price,
                distance_km: item.distance_km || 0,
                contact: item.contact_info
            }));
        }
    } catch (err) {
        console.error("Сервер недоступен, работаем на статических данных");
    }
}

// ==========================================
// 3. ДЕТАЛИ И ЧАТ
// ==========================================

async function showDetails(loadId) {
    const stored = localStorage.getItem('user');
    const currentUser = stored ? JSON.parse(stored) : { name: 'Adil', role: 'Грузовладелец' };
    
    document.getElementById('search-view').style.display = 'none';
    document.getElementById('details-view').style.display = 'block';
    window.scrollTo(0, 0);

    const allCargos = [...DB_CARGOS, ...CARGOS];
    const item = allCargos.find(c => c.id == loadId);

    if (item) {
        document.getElementById('details-content').innerHTML = `
        <div class="detail-card-main">
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
                <div>
                    <h1 style="margin:0; font-size:32px;">Груз ${item.from} — ${item.to}</h1>
                    <p style="color: #64748b;">Обновлено: ${formatDateISO(item.date)} • ID: ${item.id}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 28px; font-weight: 800; color: #2f8dd0;">${item.price} $</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1.6fr 1fr; gap: 40px;">
                <div>
                    <div class="info-block">
                        <h3>🚚 Информация о перевозке</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div><span style="color:#64748b;">Кузов:</span> <strong>${item.body}</strong></div>
                            <div><span style="color:#64748b;">Вес:</span> <strong>${item.weight} т</strong></div>
                            <div><span style="color:#64748b;">Дистанция:</span> <strong>${item.distance_km} км</strong></div>
                        </div>
                    </div>
                    <div id="detail-map" style="height:300px; background:#f1f5f9; border-radius:15px; margin-top:20px; display:flex; align-items:center; justify-content:center;">
                        Карта загружается...
                    </div>
                </div>

                <aside>
                    <div style="border: 1px solid #e2e8f0; border-radius: 15px; padding: 25px;">
                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                            <div style="width:55px; height:55px; background:#2f8dd0; border-radius:50%; color:white; display:flex; align-items:center; justify-content:center; font-weight:800;">${currentUser.name[0]}</div>
                            <div>
                                <div style="font-weight:800; font-size:18px;">${currentUser.name}</div>
                                <div style="color:#2f8dd0; font-size:13px;">${currentUser.role || 'Грузовладелец'}</div>
                            </div>
                        </div>
                        <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px;">
                            <div style="font-size:12px; color:#64748b;">КОНТАКТЫ:</div>
                            <div style="font-weight:700;">${item.contact}</div>
                        </div>
                        <button class="btn btn-primary" style="width:100%; margin-bottom:10px;">Предложить ставку</button>
                        <button onclick="openChat('${currentUser.name}', '${item.id}')" class="btn btn-ghost" style="width:100%;">Написать сообщение</button>
                    </div>
                </aside>
            </div>
        </div>`;
    }
}

// Функции чата (вынесены отдельно!)
function openChat(name, loadId) {
    document.getElementById('chat-modal').style.display = 'flex';
    document.getElementById('chat-with-name').innerText = name;
    document.getElementById('chat-load-id').innerText = loadId;
}

function closeChat() {
    document.getElementById('chat-modal').style.display = 'none';
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input.value.trim()) return;
    const msg = `<div class="msg-own">${input.value}</div>`;
    document.getElementById('chat-messages').insertAdjacentHTML('beforeend', msg);
    input.value = '';
}

// ==========================================
// 4. ИНИЦИАЛИЗАЦИЯ
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    updateNavbar();
    populateSelects();
    initBurgerMenu();
    await fetchServerCargos();
    applyFiltersAndRender();

    // Слушатели
    document.getElementById('searchForm').onsubmit = (e) => {
        e.preventDefault();
        applyFiltersAndRender();
    };
    
    document.getElementById('resetBtn').onclick = () => {
        document.getElementById('searchForm').reset();
        applyFiltersAndRender();
    };

    document.getElementById('sortSelect').onchange = applyFiltersAndRender;
    
    // Кнопка отправки в чате
    document.getElementById('send-msg-btn').onclick = sendMessage;
});

// Вспомогательные функции (остальные твои fetchServerCargos и т.д. остаются без изменений)
function formatDateISO(d) { return d ? new Date(d).toLocaleDateString('ru-RU') : ''; }
function backToSearch() { 
    document.getElementById('details-view').style.display = 'none';
    document.getElementById('search-view').style.display = 'block';
}
function attachCardListeners() { /* твои слушатели для сохранения */ }
function initBurgerMenu() { /* твой код бургера */ }