function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const qs = new URLSearchParams(location.search);
const loadId = qs.get('id');

const elLine = document.getElementById('loadLine');
const elMeta = document.getElementById('loadMeta');
const back = document.getElementById('backToCard');
const statusEl = document.getElementById('status');
const form = document.getElementById('offerForm');
const goChatBtn = document.getElementById('goChat');

let loadData = null;
let editingOfferId = null;

function lockOfferForm(message) {
  if (form) {
    Array.from(form.elements).forEach((element) => {
      element.disabled = true;
    });
  }
  setStatus('<div class="err">' + escapeHtml(message) + '</div>');
}

function setStatus(html) {
  if (statusEl) statusEl.innerHTML = html || '';
}

async function fetchMe() {
  const response = await fetch('/api/me', { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error('Сначала войдите в аккаунт');

  return {
    id: data?.id || null,
    name: data?.name || 'Пользователь',
    phone: data?.phone || '',
    role: data?.role || ''
  };
}

async function loadCargo() {
  if (!loadId) {
    if (elLine) elLine.textContent = 'Груз не выбран (нет ?id=)';
    return;
  }

  if (back) back.href = `card.html?id=${encodeURIComponent(loadId)}`;

  try {
    const response = await fetch(`/api/loads/${loadId}`, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || data?.error) throw new Error('load not found');

    loadData = data;

    if (elLine) elLine.textContent = `Груз #${data.id}: ${data.from_location} → ${data.to_location}`;
    try {
      const me = await fetchMe();
      if (me.role !== 'carrier') {
        lockOfferForm('\u0421\u0442\u0430\u0432\u043a\u0438 \u043c\u043e\u0433\u0443\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0438');
      } else if (Number(me.id) === Number(data.userId)) {
        lockOfferForm('\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443 \u043d\u0430 \u0441\u0432\u043e\u0439 \u0433\u0440\u0443\u0437');
      }
    } catch {}

    if (elMeta) {
      elMeta.innerHTML = `
        <div><b>Маршрут:</b> ${escapeHtml(data.from_location)} → ${escapeHtml(data.to_location)}</div>
        <div><b>Тип:</b> ${escapeHtml(data.type || '-')}</div>
        <div><b>Вес:</b> ${escapeHtml(data.weight || '0')} т</div>
        <div><b>Дата:</b> ${escapeHtml(data.date || '-')}</div>
        <div><b>Цена в объявлении:</b> ${data.price ? Number(data.price).toLocaleString('ru-RU') : 'Договорная'} ₸</div>
      `;
    }
  } catch {
    if (elLine) elLine.textContent = 'Не удалось загрузить груз';
    if (elMeta) elMeta.textContent = '-';
  }
}

async function submitOffer(payload) {
  const response = await fetch(editingOfferId ? `/api/offers/${editingOfferId}` : '/api/offers', {
    method: editingOfferId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 \u0441\u0442\u0430\u0432\u043a\u0438');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  if (!loadData?.id) {
    setStatus('<div class="err">Груз не загружен</div>');
    return;
  }

  const price = Number(document.getElementById('price').value || 0);
  const currency = document.getElementById('currency').value || 'KZT';
  const pickupDate = document.getElementById('pickupDate').value || '';
  const truckType = document.getElementById('truckType').value.trim();
  const comment = document.getElementById('comment').value.trim();

  if (!price || price <= 0) {
    setStatus('<div class="err">Укажи сумму</div>');
    return;
  }

  try {
    const me = await fetchMe();
    if (me.role !== 'carrier') {
      throw new Error('\u0421\u0442\u0430\u0432\u043a\u0438 \u043c\u043e\u0433\u0443\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0438');
    }
    if (Number(me.id) === Number(loadData.userId)) {
      throw new Error('\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443 \u043d\u0430 \u0441\u0432\u043e\u0439 \u0433\u0440\u0443\u0437');
    }

    await submitOffer({
      loadId: Number(loadData.id),
      price,
      currency,
      pickupDate,
      truckType,
      comment
    });

    setStatus(editingOfferId ? '<div class="ok">\u0421\u0442\u0430\u0432\u043a\u0430 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0430</div>' : '<div class="ok">\u0421\u0442\u0430\u0432\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430</div>');
    editingOfferId = null;
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.textContent = '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443';
    form.reset();
  } catch (err) {
    console.error(err);
    if (err.status === 409 && err.data?.duplicateOffer) {
      const offer = err.data.offer || {};
      setStatus(`
        <div class="err">${escapeHtml(err.message || '\u0412\u044b \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0441\u0442\u0430\u0432\u043a\u0443, \u0445\u043e\u0442\u0438\u0442\u0435 \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c?')}</div>
        <button type="button" id="editExistingOffer">\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c</button>
      `);
      document.getElementById('editExistingOffer')?.addEventListener('click', () => {
        editingOfferId = String(err.data.offerId || offer.id || '');
        document.getElementById('price').value = offer.price || price || '';
        document.getElementById('currency').value = offer.currency || currency || 'KZT';
        document.getElementById('pickupDate').value = offer.pickupDate || pickupDate || '';
        document.getElementById('truckType').value = offer.truckType || truckType || '';
        document.getElementById('comment').value = offer.comment || comment || '';
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.textContent = '\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443';
        setStatus('<div class="ok">\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443\u00bb</div>');
      });
      return;
    }
    setStatus(`<div class="err">${escapeHtml(err.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438')}</div>`);
  }
});

goChatBtn?.addEventListener('click', () => {
  alert('Чат отключен. Отправьте ставку, заказчик увидит ее в системе.');
});

loadCargo();