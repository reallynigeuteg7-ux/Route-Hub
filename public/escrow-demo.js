(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const loadSelect = $('loadSelect');
  const refreshButton = $('refreshButton');
  const statePanel = $('statePanel');
  const tracker = $('tracker');
  let selectedLoadId = null;
  let refreshTimer = null;
  let requestSequence = 0;

  const loadStatusLabels = {
    open: 'Груз опубликован',
    assigned: 'Перевозка активна',
    completed: 'Сделка завершена',
    cancelled: 'Груз отменён'
  };

  const timelineDefinitions = [
    ['published', 'Груз опубликован', 'Заявка доступна перевозчикам'],
    ['offers', 'Получены ставки', 'Перевозчики предложили условия'],
    ['carrier', 'Перевозчик выбран', 'Ставка принята грузовладельцем'],
    ['escrow', 'Средства заморожены', 'Оплата удерживается на escrow-балансе'],
    ['transport', 'Перевозка выполняется', 'Груз передан выбранному перевозчику'],
    ['confirm', 'Завершение подтверждено', 'Обе стороны подтвердили доставку'],
    ['payout', 'Оплата разблокирована', 'Средства доступны перевозчику']
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function text(id, value) {
    const node = $(id);
    if (node) node.textContent = value ?? '—';
  }

  function normalizeCurrency(value) {
    return String(value || 'KZT').trim().toUpperCase();
  }

  function formatAmount(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    const code = normalizeCurrency(currency);
    if (code === 'SOL') {
      return amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 9 }) + ' SOL';
    }
    return amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₸';
  }

  function formatDate(value, includeTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ru-RU', includeTime
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function showState(title, subtitle, isError = false) {
    statePanel.hidden = false;
    tracker.hidden = true;
    statePanel.classList.toggle('is-error', isError);
    statePanel.innerHTML = `${isError ? '' : '<div class="spinner"></div>'}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle || '')}</span>`;
  }

  function getCurrency(load) {
    return normalizeCurrency(load.escrowCurrency || load.acceptedCurrency || load.currency);
  }

  function getDealState(load) {
    const escrowStatus = String(load.escrowStatus || '').toLowerCase();
    if (escrowStatus === 'refunded') return { label: 'Средства возвращены', tone: 'danger' };
    if (escrowStatus === 'released') return { label: 'Выплачено перевозчику', tone: 'success' };
    if (load.clientCompleted && load.carrierCompleted) return { label: 'Ожидается выплата', tone: 'warning' };
    if (load.clientCompleted || load.carrierCompleted) return { label: 'Ждём вторую сторону', tone: 'warning' };
    if (escrowStatus === 'held') return { label: 'Средства заморожены', tone: '' };
    if (load.acceptedOfferId) return { label: 'Перевозчик выбран', tone: '' };
    if (Number(load.offerCount || 0) > 0) return { label: 'Выбор ставки', tone: '' };
    return { label: loadStatusLabels[load.status] || 'Груз опубликован', tone: '' };
  }

  function getMilestones(load) {
    const status = String(load.status || 'open').toLowerCase();
    const escrowStatus = String(load.escrowStatus || '').toLowerCase();
    const onePartyCompleted = Boolean(load.clientCompleted || load.carrierCompleted);
    const bothCompleted = Boolean(load.clientCompleted && load.carrierCompleted);
    const values = [
      true,
      Number(load.offerCount || 0) > 0,
      Boolean(load.acceptedOfferId),
      Boolean(load.escrowId && ['held', 'released', 'refunded'].includes(escrowStatus)),
      status === 'completed' || onePartyCompleted,
      bothCompleted,
      escrowStatus === 'released'
    ];
    const firstPending = values.findIndex((done) => !done);
    const refunded = escrowStatus === 'refunded';
    return timelineDefinitions.map(([key, title, description], index) => ({
      key,
      title: key === 'confirm'
        ? `Завершение подтверждено · ${Number(Boolean(load.clientCompleted)) + Number(Boolean(load.carrierCompleted))}/2`
        : key === 'payout' && refunded ? 'Оплата возвращена' : title,
      description: key === 'confirm'
        ? `${load.clientCompleted ? 'Заказчик подтвердил' : 'Заказчик ожидает'} · ${load.carrierCompleted ? 'Перевозчик подтвердил' : 'Перевозчик ожидает'}`
        : key === 'payout' && refunded ? 'Escrow возвращён грузовладельцу' : description,
      done: values[index],
      current: !refunded && index === firstPending,
      danger: refunded && key === 'payout'
    }));
  }

  function renderTimeline(load) {
    const milestones = getMilestones(load);
    const completed = milestones.filter((item) => item.done).length;
    const percentage = Math.round((completed / milestones.length) * 100);
    text('progressText', `${percentage}%`);
    $('progressBar').style.width = `${percentage}%`;
    $('timeline').innerHTML = milestones.map((item, index) => `
      <div class="timeline-step${item.done ? ' is-done' : ''}${item.current ? ' is-current' : ''}${item.danger ? ' is-danger' : ''}">
        <span class="timeline-dot">${item.done ? '✓' : index + 1}</span>
        <div class="timeline-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></div>
        <span class="timeline-state">${item.done ? 'готово' : item.current ? 'сейчас' : item.danger ? 'возврат' : 'ожидается'}</span>
      </div>
    `).join('');
  }

  function buildEvents(load, transactions) {
    const currency = getCurrency(load);
    const events = [{ title: 'Груз опубликован', description: `${load.fromLocation || '—'} → ${load.toLocation || '—'}`, time: null, tone: '' }];
    if (Number(load.offerCount || 0) > 0) {
      events.push({ title: `Получено ставок: ${load.offerCount}`, description: `На рассмотрении: ${load.pendingOfferCount || 0}`, time: null, tone: '' });
    }
    if (load.acceptedOfferId) {
      events.push({ title: 'Перевозчик выбран', description: `${load.carrierName || 'Перевозчик'} · ${formatAmount(load.acceptedPrice, currency)}`, time: load.acceptedOfferCreatedAt, tone: 'success' });
    }
    if (load.escrowId) {
      const refunded = load.escrowStatus === 'refunded';
      events.push({ title: refunded ? 'Escrow возвращён' : load.escrowStatus === 'released' ? 'Escrow исполнен' : 'Средства заморожены', description: formatAmount(load.escrowAmount, currency), time: refunded ? load.escrowRefundedAt : load.escrowCreatedAt, tone: refunded ? 'danger' : 'warning' });
    }
    if (load.clientCompleted) events.push({ title: 'Заказчик подтвердил завершение', description: 'Подтверждение сохранено в RouteHub', time: load.clientCompletedAt, tone: 'success' });
    if (load.carrierCompleted) events.push({ title: 'Перевозчик подтвердил завершение', description: 'Подтверждение сохранено в RouteHub', time: load.carrierCompletedAt, tone: 'success' });
    if (load.escrowStatus === 'released') {
      events.push({ title: 'Оплата доступна перевозчику', description: formatAmount(load.escrowCarrierAmount, currency), time: load.escrowReleasedAt, tone: 'success' });
    }
    (transactions || []).forEach((transaction) => {
      const type = String(transaction.type || '').toLowerCase();
      events.push({
        title: transaction.description || 'Финансовая операция',
        description: `${Number(transaction.amount) > 0 ? '+' : ''}${formatAmount(transaction.amount, transaction.currency || currency)}`,
        time: transaction.createdAt,
        tone: type === 'refund' ? 'danger' : ['release', 'withdraw_completed'].includes(type) ? 'success' : type === 'hold' ? 'warning' : ''
      });
    });
    return events.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
  }

  function renderEvents(load, transactions) {
    const events = buildEvents(load, transactions);
    text('eventCount', `${events.length} ${events.length === 1 ? 'событие' : events.length < 5 ? 'события' : 'событий'}`);
    $('eventLog').innerHTML = events.length ? events.map((event) => `
      <div class="event ${escapeHtml(event.tone)}">
        <span class="event-dot"></span>
        <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.description || '')}</p>${event.time ? `<time>${escapeHtml(formatDate(event.time))}</time>` : ''}</div>
      </div>
    `).join('') : '<div class="event-empty">Событий пока нет</div>';
  }

  function renderLoad(load, transactions) {
    const currency = getCurrency(load);
    const dealState = getDealState(load);
    text('dealNumber', `СДЕЛКА #${load.id}`);
    text('fromLocation', load.fromLocation || 'Пункт отправления');
    text('toLocation', load.toLocation || 'Пункт назначения');
    text('statusBadge', dealState.label);
    $('statusBadge').className = `status-badge ${dealState.tone}`.trim();
    text('offerCount', String(load.offerCount || 0));
    text('offerHint', load.acceptedOfferId ? 'ставка выбрана' : load.offerCount ? `${load.pendingOfferCount || 0} на рассмотрении` : 'ожидаем предложения');
    text('pickupDate', load.pickupDate || load.date || '—');
    text('cargoType', load.type || 'Не указан');
    text('cargoWeight', Number(load.weight) ? `${Number(load.weight).toLocaleString('ru-RU')} т` : 'вес не указан');
    text('dealCurrency', currency);
    text('ownerName', load.ownerName || 'Грузовладелец');
    text('carrierName', load.carrierName || 'Не выбран');
    text('dealAmount', formatAmount(load.escrowAmount ?? load.acceptedPrice, currency));
    text('commissionAmount', formatAmount(load.escrowCommissionAmount, currency));
    text('carrierAmount', formatAmount(load.escrowCarrierAmount, currency));
    text('detailId', `RH-${String(load.id).padStart(6, '0')}`);
    text('loadingType', load.loadingType || 'Не указан');
    text('cargoVolume', Number(load.volume) ? `${Number(load.volume).toLocaleString('ru-RU')} м³` : 'Не указан');
    const dimensions = [load.length, load.width, load.height].map(Number);
    text('cargoDimensions', dimensions.some((value) => value > 0) ? dimensions.map((value) => value || '—').join(' × ') + ' м' : 'Не указаны');
    text('cargoDescription', load.description || 'Описание груза не добавлено');
    renderTimeline(load);
    renderEvents(load, transactions);
    statePanel.hidden = true;
    tracker.hidden = false;
    text('lastUpdated', `Обновлено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadDeal(id, { silent = false } = {}) {
    if (!id) return;
    const sequence = ++requestSequence;
    if (!silent) showState('Загружаем сделку…', `Получаем этапы груза #${id}`);
    try {
      const data = await fetchJson(`/api/escrow-demo/loads/${encodeURIComponent(id)}`);
      if (sequence !== requestSequence) return;
      renderLoad(data.load || {}, data.transactions || []);
    } catch (error) {
      if (sequence !== requestSequence) return;
      if (!silent) showState('Не удалось открыть сделку', error.message || 'Ошибка backend', true);
    }
  }

  function optionLabel(load) {
    const route = `${load.fromLocation || '—'} → ${load.toLocation || '—'}`;
    const state = getDealState(load).label;
    return `#${load.id} · ${route} · ${state}`;
  }

  async function loadList({ keepSelection = true } = {}) {
    refreshButton.disabled = true;
    try {
      const data = await fetchJson('/api/escrow-demo/loads');
      const loads = Array.isArray(data.loads) ? data.loads : [];
      text('loadCount', `${loads.length} ${loads.length === 1 ? 'груз' : loads.length < 5 ? 'груза' : 'грузов'} доступно`);
      if (!loads.length) {
        loadSelect.innerHTML = '<option value="">Грузов пока нет</option>';
        showState('Нет грузов для отслеживания', 'Создайте груз в RouteHub — он появится здесь автоматически');
        return;
      }
      const queryId = new URLSearchParams(window.location.search).get('id');
      const rememberedId = keepSelection ? selectedLoadId || localStorage.getItem('routehub-demo-load') : null;
      const preferredId = queryId || rememberedId;
      const chosen = loads.find((load) => String(load.id) === String(preferredId)) || loads[0];
      loadSelect.innerHTML = loads.map((load) => `<option value="${escapeHtml(load.id)}">${escapeHtml(optionLabel(load))}</option>`).join('');
      loadSelect.value = String(chosen.id);
      selectedLoadId = String(chosen.id);
      localStorage.setItem('routehub-demo-load', selectedLoadId);
      await loadDeal(selectedLoadId);
    } catch (error) {
      showState('Backend недоступен', error.message || 'Не удалось загрузить грузы', true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  loadSelect.addEventListener('change', () => {
    selectedLoadId = loadSelect.value;
    if (!selectedLoadId) return;
    localStorage.setItem('routehub-demo-load', selectedLoadId);
    const url = new URL(window.location.href);
    url.searchParams.set('id', selectedLoadId);
    history.replaceState(null, '', url);
    loadDeal(selectedLoadId);
  });

  refreshButton.addEventListener('click', () => loadList());
  refreshTimer = window.setInterval(() => {
    if (selectedLoadId && !document.hidden) loadDeal(selectedLoadId, { silent: true });
  }, 5000);
  window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer));
  loadList({ keepSelection: true });
})();
