const state = {
  loads: [],
  wallets: [],
  topups: [],
  withdraws: [],
  selectedLoadId: null,
  searchTimer: null,
  walletSearchTimer: null
};

const $ = (selector) => document.querySelector(selector);

function showToast(message, type = 'ok') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3400);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    showLogin();
    throw new Error(data.error || 'Нужен вход администратора');
  }

  if (!response.ok) {
    const wallet = data.wallet
      ? ` Баланс: ${formatMoney(walletValue(data.wallet.balance))}, нужно: ${formatMoney(walletValue(data.wallet.required))}.`
      : '';
    throw new Error((data.error || 'Ошибка запроса') + wallet);
  }

  return data;
}

function walletValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function showLogin() {
  $('#loginView').hidden = false;
  $('#appView').hidden = true;
  $('#detailsDrawer').classList.remove('open');
  $('#detailsDrawer').setAttribute('aria-hidden', 'true');
}

function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
}

function formatMoney(value, currency = '₸') {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return `0 ${currency}`;
  return `${numeric.toLocaleString('ru-RU')} ${currency}`;
}

function safe(value, fallback = 'Не указано') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status) {
  const map = {
    open: 'Открыт',
    assigned: 'Назначен',
    completed: 'Завершен',
    cancelled: 'Отменен',
    archived: 'Архив',
    pending: 'Ожидает',
    accepted: 'Принята',
    rejected: 'Отклонена',
    held: 'Заморожено',
    released: 'Выплачено',
    refunded: 'Возвращено'
  };
  return map[status] || safe(status, 'Открыт');
}

function statusClass(status) {
  return `status-pill status-${String(status || 'open')}`;
}

function roleLabel(role) {
  return role === 'carrier' ? 'Перевозчик' : 'Грузовладелец';
}

function personTypeLabel(value) {
  const map = {
    too: 'ТОО',
    ip: 'ИП',
    self_employed: 'Самозанятый',
    legal: 'ТОО',
    individual: 'Физ. лицо'
  };
  return map[value] || safe(value);
}

function currencyLabel(currency) {
  return currency === 'KZT' || !currency ? '₸' : currency;
}

function renderSummary(summary) {
  const items = [
    ['Всего грузов', summary.loads?.total || 0],
    ['Назначенные', summary.loads?.assigned || 0],
    ['Завершенные', summary.loads?.completed || 0],
    ['Ставки', summary.offers?.total || 0],
    ['Баланс', formatMoney(summary.wallets?.balance || 0)],
    ['В заморозке', formatMoney(summary.wallets?.heldBalance || 0)],
    ['Эскроу актив', summary.escrows?.held || 0],
    ['Пользователи', summary.users?.total || 0]
  ];

  $('#summaryGrid').innerHTML = items.map(([label, value]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join('');
}

function renderLoads() {
  const grid = $('#loadsGrid');
  if (!state.loads.length) {
    grid.innerHTML = '<div class="empty-state">Грузы не найдены.</div>';
    return;
  }

  grid.innerHTML = state.loads.map((load) => {
    const status = load.status || 'open';
    const carrierName = load.carrierName || load.acceptedCarrierName;
    const hasCarrier = Boolean(load.acceptedCarrierUserId || carrierName);
    const hasHeldEscrow = load.escrowStatus === 'held' && load.escrowId;

    return `
      <article class="load-card" data-id="${load.id}">
        <div class="load-card-head">
          <div>
            <h2 class="load-title">Груз #${load.id}</h2>
            <div class="route">${escapeHtml(safe(load.from_location))} → ${escapeHtml(safe(load.to_location))}</div>
          </div>
          <span class="${statusClass(status)}">${statusLabel(status)}</span>
        </div>

        <div class="route-row">
          <div>${escapeHtml(safe(load.type, 'Тип не указан'))}</div>
          <div class="price">${formatMoney(load.price)}</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><span>Дата</span><strong>${escapeHtml(safe(load.date))}</strong></div>
          <div class="meta-item"><span>Вес</span><strong>${escapeHtml(safe(load.weight, '0'))} т</strong></div>
          <div class="meta-item"><span>Ставки</span><strong>${load.offerCount || 0} / ожидают ${load.pendingOfferCount || 0}</strong></div>
          <div class="meta-item"><span>Эскроу</span><strong>${escapeHtml(safe(statusLabel(load.escrowStatus), 'Нет'))}${load.escrowAmount ? ` · ${formatMoney(load.escrowAmount)}` : ''}</strong></div>
        </div>

        <div class="person-row">
          <div class="person-card">
            <span>Владелец</span>
            <strong>${escapeHtml(safe(load.ownerName || load.ownerCompany))}</strong>
            <span>${escapeHtml(safe(load.ownerPhone || load.ownerEmail))}</span>
          </div>
          <div class="person-card">
            <span>Перевозчик</span>
            <strong>${escapeHtml(hasCarrier ? safe(carrierName) : 'Не назначен')}</strong>
            <span>${escapeHtml(hasCarrier ? safe(load.carrierPhone || load.acceptedCarrierPhone || load.carrierEmail) : 'Ставка еще не принята')}</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-blue" data-action="details">Подробнее</button>
          <button class="btn btn-amber" data-action="unassign" ${hasCarrier ? '' : 'disabled'}>Снять назначение</button>
          <button class="btn btn-amber" data-action="refund" ${hasHeldEscrow ? '' : 'disabled'}>Вернуть деньги</button>
          <button class="btn btn-green" data-action="complete">Завершить</button>
          <button class="btn btn-soft" data-action="reopen">Открыть</button>
          <button class="btn btn-red" data-action="delete">Удалить</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderWallets() {
  const grid = $('#walletsGrid');
  if (!state.wallets.length) {
    grid.innerHTML = '<div class="empty-state">Пользователи не найдены.</div>';
    return;
  }

  grid.innerHTML = state.wallets.map((wallet) => `
    <article class="wallet-card" data-user-id="${wallet.id}">
      <div class="wallet-head">
        <div>
          <h3>${escapeHtml(safe(wallet.name || wallet.company, 'Пользователь'))}</h3>
          <p>${escapeHtml(safe(wallet.email || wallet.phone))}</p>
        </div>
        <span class="status-pill">${escapeHtml(safe(wallet.user_code, '000000'))}</span>
      </div>

      <div class="wallet-balance-row">
        <div>
          <span>Доступно</span>
          <strong>${formatMoney(wallet.balance, currencyLabel(wallet.currency))}</strong>
        </div>
        <div>
          <span>Заморожено</span>
          <strong>${formatMoney(wallet.heldBalance, currencyLabel(wallet.currency))}</strong>
        </div>
      </div>

      <div class="wallet-meta">
        <span>${escapeHtml(roleLabel(wallet.role))}</span>
        <span>${escapeHtml(personTypeLabel(wallet.person_type))}</span>
        <span>Активных грузов: ${wallet.activeLoads || 0}</span>
      </div>

      <div class="wallet-inputs">
        <input class="wallet-amount" type="number" min="1" step="1" placeholder="Сумма">
        <input class="wallet-description" type="text" placeholder="Комментарий операции">
      </div>
      <div class="wallet-actions">
        <button class="btn btn-green" data-wallet-action="credit">Пополнить</button>
        <button class="btn btn-red" data-wallet-action="debit">Списать</button>
      </div>
    </article>
  `).join('');
}

function topupStatusLabel(status) {
  if (status === 'approved') return '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e';
  if (status === 'rejected') return '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e';
  return '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435';
}

function renderTopups() {
  const grid = $('#topupsGrid');
  if (!grid) return;
  if (!state.topups.length) {
    grid.innerHTML = '<div class="empty-state">\u041d\u043e\u0432\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u043d\u0435\u0442.</div>';
    return;
  }

  grid.innerHTML = state.topups.map((item) => {
    const userName = item.name || item.company || item.phone || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c';
    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '';
    const receiptUrl = item.receiptFile || '#';
    return '<article class="topup-card-admin" data-topup-id="' + item.id + '">' +
      '<div class="wallet-head"><div><h3>' + escapeHtml(userName) + '</h3><p>' + escapeHtml(item.email || item.phone || '') + '</p></div><span class="status-pill">' + escapeHtml(item.user_code || '000000') + '</span></div>' +
      '<div class="wallet-balance-row"><div><span>\u0421\u0443\u043c\u043c\u0430</span><strong>' + formatMoney(item.amount, currencyLabel(item.currency)) + '</strong></div><div><span>\u0421\u0442\u0430\u0442\u0443\u0441</span><strong>' + escapeHtml(topupStatusLabel(item.status)) + '</strong></div></div>' +
      '<div class="wallet-meta"><span>' + escapeHtml(roleLabel(item.role)) + '</span><span>' + escapeHtml(createdAt) + '</span></div>' +
      '<div class="receipt-row"><a class="btn btn-soft" href="' + escapeHtml(receiptUrl) + '" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e</a><input class="topup-comment" type="text" placeholder="\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430"></div>' +
      '<div class="wallet-actions"><button class="btn btn-green" data-topup-action="approve">\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c</button><button class="btn btn-red" data-topup-action="reject">\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c</button></div>' +
    '</article>';
  }).join('');
}

async function runTopupAction(card, action) {
  const id = card.dataset.topupId;
  const comment = card.querySelector('.topup-comment')?.value?.trim() || '';
  const label = action === 'approve' ? '\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435' : '\u043e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443';
  if (!window.confirm('\u0422\u043e\u0447\u043d\u043e ' + label + '?')) return;
  await api('/api/admin/topup-requests/' + id + '/' + action, {
    method: 'POST',
    body: JSON.stringify({ comment })
  });
  showToast(action === 'approve' ? '\u0411\u0430\u043b\u0430\u043d\u0441 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d' : '\u0417\u0430\u044f\u0432\u043a\u0430 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0430');
  await loadDashboard();
}
function withdrawAdminStatusLabel(status) { if (status === 'approved') return '\u0412\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e'; if (status === 'rejected') return '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e'; return '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435'; }
function renderWithdraws() {
  const grid = $('#withdrawsGrid'); if (!grid) return;
  if (!state.withdraws.length) { grid.innerHTML = '<div class="empty-state">\u041d\u043e\u0432\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 \u043d\u0435\u0442.</div>'; return; }
  grid.innerHTML = state.withdraws.map((item) => { const userName = item.name || item.company || item.phone || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c'; const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : ''; return '<article class="topup-card-admin" data-withdraw-id="' + item.id + '"><div class="wallet-head"><div><h3>' + escapeHtml(userName) + '</h3><p>' + escapeHtml(item.email || item.phone || '') + '</p></div><span class="status-pill">' + escapeHtml(item.user_code || '000000') + '</span></div><div class="wallet-balance-row"><div><span>\u0421\u0443\u043c\u043c\u0430</span><strong>' + formatMoney(item.amount, currencyLabel(item.currency)) + '</strong></div><div><span>\u0421\u0442\u0430\u0442\u0443\u0441</span><strong>' + escapeHtml(withdrawAdminStatusLabel(item.status)) + '</strong></div></div><div class="withdraw-details"><span>\u0420\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b</span><strong>' + escapeHtml(item.payoutDetails || '') + '</strong></div><div class="wallet-meta"><span>' + escapeHtml(roleLabel(item.role)) + '</span><span>' + escapeHtml(createdAt) + '</span></div><div class="receipt-row"><input class="withdraw-comment" type="text" placeholder="\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u0430\u0434\u043c\u0438\u043d\u0430"></div><div class="wallet-actions"><button class="btn btn-green" data-withdraw-action="approve">\u0412\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e</button><button class="btn btn-red" data-withdraw-action="reject">\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c</button></div></article>'; }).join('');
}
async function runWithdrawAction(card, action) { const id = card.dataset.withdrawId; const comment = card.querySelector('.withdraw-comment')?.value?.trim() || ''; const label = action === 'approve' ? '\u043f\u043e\u043c\u0435\u0442\u0438\u0442\u044c \u0432\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043d\u044b\u043c' : '\u043e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c \u0438 \u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0434\u0435\u043d\u044c\u0433\u0438'; if (!window.confirm('\u0422\u043e\u0447\u043d\u043e ' + label + '?')) return; await api('/api/admin/withdraw-requests/' + id + '/' + action, { method: 'POST', body: JSON.stringify({ comment }) }); showToast(action === 'approve' ? '\u0417\u0430\u044f\u0432\u043a\u0430 \u0437\u0430\u043a\u0440\u044b\u0442\u0430' : '\u0414\u0435\u043d\u044c\u0433\u0438 \u0432\u0435\u0440\u043d\u0443\u0442\u044b'); await loadDashboard(); }
async function loadDashboard() {
  const [summary, loads, wallets, topups, withdraws] = await Promise.all([
    api('/api/admin/summary'),
    api(`/api/admin/loads?status=${encodeURIComponent($('#statusFilter').value)}&search=${encodeURIComponent($('#searchInput').value)}`),
    api(`/api/admin/wallets?search=${encodeURIComponent($('#walletSearchInput')?.value || '')}`),
    api('/api/admin/topup-requests?status=pending'),
    api('/api/admin/withdraw-requests?status=pending')
  ]);
  state.loads = loads;
  state.wallets = wallets;
  state.topups = topups;
  state.withdraws = withdraws;
  renderSummary(summary);
  renderLoads();
  renderWallets();
  renderTopups();
  renderWithdraws();
}

async function openDetails(loadId) {
  state.selectedLoadId = loadId;
  const { load, offers } = await api(`/api/admin/loads/${loadId}`);
  $('#drawerTitle').textContent = `Груз #${load.id}`;
  $('#drawerContent').innerHTML = renderDetailContent(load, offers);
  $('#detailsDrawer').classList.add('open');
  $('#detailsDrawer').setAttribute('aria-hidden', 'false');
}

function renderDetailContent(load, offers) {
  const hasHeldEscrow = load.escrowStatus === 'held' && load.escrowId;

  return `
    <section class="detail-section">
      <h3>Маршрут и груз</h3>
      <div class="detail-grid">
        ${detailRow('Маршрут', `${safe(load.from_location)} → ${safe(load.to_location)}`)}
        ${detailRow('Цена груза', formatMoney(load.price))}
        ${detailRow('Тип', safe(load.type))}
        ${detailRow('Вес', `${safe(load.weight, 0)} т`)}
        ${detailRow('Дата', safe(load.date))}
        ${detailRow('Статус', statusLabel(load.status || 'open'))}
        ${detailRow('Готовность владельца', load.clientCompleted ? 'Подтвердил' : 'Ждет')}
        ${detailRow('Готовность перевозчика', load.carrierCompleted ? 'Подтвердил' : 'Ждет')}
      </div>
    </section>

    <section class="detail-section">
      <h3>Финансы по грузу</h3>
      <div class="detail-grid">
        ${detailRow('Эскроу', load.escrowId ? `#${load.escrowId}` : 'Нет')}
        ${detailRow('Статус оплаты', load.escrowStatus ? statusLabel(load.escrowStatus) : 'Нет заморозки')}
        ${detailRow('Заморожено у владельца', load.escrowAmount ? formatMoney(load.escrowAmount) : '0 ₸')}
        ${detailRow('К выплате перевозчику', load.escrowCarrierAmount ? formatMoney(load.escrowCarrierAmount) : '0 ₸')}
        ${detailRow('Комиссия RouteHub', load.escrowCommissionAmount ? formatMoney(load.escrowCommissionAmount) : '0 ₸')}
      </div>
      <div class="drawer-actions finance-actions">
        <button class="btn btn-amber" data-load-detail-action="refund" ${hasHeldEscrow ? '' : 'disabled'}>Вернуть замороженные деньги</button>
        <button class="btn btn-green" data-load-detail-action="complete">Завершить и выплатить</button>
      </div>
    </section>

    <section class="detail-section">
      <h3>Владелец и перевозчик</h3>
      <div class="detail-grid">
        ${detailRow('Владелец', safe(load.ownerName || load.ownerCompany))}
        ${detailRow('Код владельца', safe(load.ownerCode))}
        ${detailRow('Телефон владельца', safe(load.ownerPhone))}
        ${detailRow('Email владельца', safe(load.ownerEmail))}
        ${detailRow('Перевозчик', safe(load.carrierName || load.acceptedCarrierName, 'Не назначен'))}
        ${detailRow('Телефон перевозчика', safe(load.carrierPhone || load.acceptedCarrierPhone))}
      </div>
    </section>

    <section class="detail-section">
      <h3>Ручное редактирование</h3>
      <form id="editLoadForm" class="edit-grid">
        ${editInput('from_location', 'Откуда', load.from_location)}
        ${editInput('to_location', 'Куда', load.to_location)}
        ${editInput('type', 'Тип груза', load.type)}
        ${editInput('weight', 'Вес', load.weight, 'number')}
        ${editInput('price', 'Цена', load.price, 'number')}
        ${editInput('date', 'Дата', load.date)}
        <label class="edit-field">
          Статус
          <select name="status">
            ${['open', 'assigned', 'completed', 'cancelled', 'archived'].map((status) => `<option value="${status}" ${status === (load.status || 'open') ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
          </select>
        </label>
        <label class="edit-field full">
          Описание
          <textarea name="description">${escapeHtml(load.description || '')}</textarea>
        </label>
        <div class="drawer-actions full">
          <button class="btn-primary" type="submit">Сохранить изменения</button>
        </div>
      </form>
    </section>

    <section class="detail-section">
      <h3>Предложенные ставки</h3>
      <div class="offers-list">
        ${offers.length ? offers.map(renderOffer).join('') : '<div class="empty-state">Ставок пока нет.</div>'}
      </div>
    </section>
  `;
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function editInput(name, label, value, type = 'text') {
  return `
    <label class="edit-field">
      ${escapeHtml(label)}
      <input name="${name}" type="${type}" value="${escapeHtml(value || '')}">
    </label>
  `;
}

function renderOffer(offer) {
  return `
    <article class="offer-card" data-offer-id="${offer.id}">
      <div class="offer-head">
        <div>
          <div class="offer-price">${formatMoney(offer.price, currencyLabel(offer.currency))}</div>
          <strong>${escapeHtml(safe(offer.carrierUserName || offer.carrierName))}</strong>
        </div>
        <span class="${statusClass(offer.status)}">${statusLabel(offer.status)}</span>
      </div>
      <div class="detail-grid">
        ${detailRow('Телефон', safe(offer.carrierUserPhone || offer.carrierPhone))}
        ${detailRow('Email', safe(offer.carrierEmail))}
        ${detailRow('Дата подачи', safe(offer.pickupDate))}
        ${detailRow('Транспорт', safe(offer.truckType))}
      </div>
      ${offer.comment ? `<div class="detail-row"><span>Комментарий</span><strong>${escapeHtml(offer.comment)}</strong></div>` : ''}
      <div class="offer-actions">
        <button class="btn btn-green" data-offer-action="accept">Принять</button>
        <button class="btn btn-soft" data-offer-action="pending">В ожидание</button>
        <button class="btn btn-amber" data-offer-action="reject">Отклонить</button>
        <button class="btn btn-red" data-offer-action="delete">Удалить</button>
      </div>
    </article>
  `;
}

async function runLoadAction(loadId, action) {
  if (action === 'details') return openDetails(loadId);

  const messages = {
    delete: 'Удалить груз полностью? Ставки и чаты по нему тоже будут удалены. Замороженные деньги вернутся владельцу.',
    complete: 'Завершить груз вручную? Если есть удержанная оплата, она будет выплачена перевозчику.',
    unassign: 'Снять назначение перевозчика? Удержанная оплата вернется владельцу, груз снова станет открытым.',
    refund: 'Вернуть замороженные деньги владельцу и снять назначение перевозчика?',
    reopen: 'Вернуть груз в открытый статус?'
  };

  if (!window.confirm(messages[action] || 'Выполнить действие?')) return;

  if (action === 'delete') {
    await api(`/api/admin/loads/${loadId}`, { method: 'DELETE' });
  } else {
    await api(`/api/admin/loads/${loadId}/${action}`, { method: 'POST' });
  }

  showToast('Готово');
  await loadDashboard();
  if (state.selectedLoadId === loadId && action !== 'delete') await openDetails(loadId);
  if (action === 'delete') $('#detailsDrawer').classList.remove('open');
}

async function runOfferAction(offerId, action) {
  const confirmText = {
    accept: 'Принять эту ставку и назначить перевозчика? Деньги владельца будут заморожены.',
    pending: 'Вернуть ставку в ожидание? Если она была принята, заморозка вернется владельцу.',
    reject: 'Отклонить ставку? Если она была принята, заморозка вернется владельцу.',
    delete: 'Удалить ставку? Если она была принята, заморозка вернется владельцу.'
  }[action];
  if (!window.confirm(confirmText)) return;

  if (action === 'accept') {
    await api(`/api/admin/offers/${offerId}/accept`, { method: 'POST' });
  } else if (action === 'delete') {
    await api(`/api/admin/offers/${offerId}`, { method: 'DELETE' });
  } else {
    await api(`/api/admin/offers/${offerId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: action === 'reject' ? 'rejected' : 'pending' })
    });
  }

  showToast('Ставка обновлена');
  await loadDashboard();
  if (state.selectedLoadId) await openDetails(state.selectedLoadId);
}

async function runWalletAction(card, direction) {
  const userId = card.dataset.userId;
  const amount = Number(card.querySelector('.wallet-amount')?.value || 0);
  const description = card.querySelector('.wallet-description')?.value?.trim() || 'Ручная операция администратора';
  const label = direction === 'credit' ? 'пополнить' : 'списать';

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Укажи сумму больше 0', 'error');
    return;
  }

  if (!window.confirm(`Подтвердить: ${label} ${formatMoney(amount)}?`)) return;

  await api(`/api/admin/wallets/${userId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ direction, amount, description })
  });

  showToast(direction === 'credit' ? 'Счет пополнен' : 'Деньги списаны');
  await loadDashboard();
}

async function saveLoadEdit(event) {
  event.preventDefault();
  if (!state.selectedLoadId) return;

  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  ['weight', 'price'].forEach((key) => {
    if (payload[key] !== '') payload[key] = Number(payload[key]);
  });

  await api(`/api/admin/loads/${state.selectedLoadId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

  showToast('Груз сохранен');
  await loadDashboard();
  await openDetails(state.selectedLoadId);
}

function bindEvents() {
  $('#adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#loginMessage').textContent = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#adminPassword').value })
      });
      showApp();
      await loadDashboard();
    } catch (err) {
      $('#loginMessage').textContent = err.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => null);
    showLogin();
  });

  $('#refreshBtn').addEventListener('click', () => loadDashboard().catch((err) => showToast(err.message, 'error')));
  $('#refreshWalletsBtn').addEventListener('click', () => loadDashboard().catch((err) => showToast(err.message, 'error')));
  $('#refreshTopupsBtn')?.addEventListener('click', () => loadDashboard().catch((err) => showToast(err.message, 'error')));
  $('#refreshWithdrawsBtn')?.addEventListener('click', () => loadDashboard().catch((err) => showToast(err.message, 'error')));
  $('#statusFilter').addEventListener('change', () => loadDashboard().catch((err) => showToast(err.message, 'error')));
  $('#searchInput').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadDashboard().catch((err) => showToast(err.message, 'error')), 280);
  });
  $('#walletSearchInput').addEventListener('input', () => {
    clearTimeout(state.walletSearchTimer);
    state.walletSearchTimer = setTimeout(() => loadDashboard().catch((err) => showToast(err.message, 'error')), 280);
  });

  $('#loadsGrid').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.load-card');
    try {
      await runLoadAction(card.dataset.id, button.dataset.action);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#topupsGrid')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-topup-action]');
    if (!button) return;
    const card = button.closest('.topup-card-admin');
    try {
      await runTopupAction(card, button.dataset.topupAction);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#withdrawsGrid')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-withdraw-action]');
    if (!button) return;
    const card = button.closest('.topup-card-admin');
    try { await runWithdrawAction(card, button.dataset.withdrawAction); } catch (err) { showToast(err.message, 'error'); }
  });

  $('#walletsGrid').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-wallet-action]');
    if (!button) return;
    const card = button.closest('.wallet-card');
    try {
      await runWalletAction(card, button.dataset.walletAction);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#drawerContent').addEventListener('submit', (event) => {
    if (event.target.id === 'editLoadForm') {
      saveLoadEdit(event).catch((err) => showToast(err.message, 'error'));
    }
  });

  $('#drawerContent').addEventListener('click', async (event) => {
    const offerButton = event.target.closest('button[data-offer-action]');
    if (offerButton) {
      const card = offerButton.closest('.offer-card');
      try {
        await runOfferAction(card.dataset.offerId, offerButton.dataset.offerAction);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    const loadButton = event.target.closest('button[data-load-detail-action]');
    if (!loadButton || !state.selectedLoadId) return;
    try {
      await runLoadAction(state.selectedLoadId, loadButton.dataset.loadDetailAction);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#closeDrawerBtn').addEventListener('click', () => {
    $('#detailsDrawer').classList.remove('open');
    $('#detailsDrawer').setAttribute('aria-hidden', 'true');
  });
}

async function init() {
  bindEvents();
  const session = await api('/api/admin/session').catch(() => ({ isAdmin: false }));
  $('#passwordWarning').hidden = !session.usingDefaultPassword;
  if (session.isAdmin) {
    showApp();
    await loadDashboard();
  } else {
    showLogin();
  }
}

init().catch((err) => {
  showLogin();
  $('#loginMessage').textContent = err.message;
});