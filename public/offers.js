const qs = new URLSearchParams(location.search);
const loadId = qs.get("id");

const offersList = document.getElementById("offersList");
const subtitle = document.getElementById("subtitle");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setEmpty(html) {
  offersList.innerHTML = html;
}

function formatMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("ru-RU");
}

async function acceptOffer(offerId) {
  if (!offerId || !loadId) return;

  const ok = confirm("Принять ставку и заморозить сумму с вашего баланса на escrow-счете? Остальные отклики будут отклонены.");
  if (!ok) return;

  try {
    const response = await fetch(`/api/offers/${offerId}/accept`, {
      method: "POST",
      credentials: "include"
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось принять ставку");

    if (data.wallet) {
      localStorage.setItem("routehub_wallet", JSON.stringify(data.wallet));
    }
    alert("Ставка принята. Деньги заморожены на escrow-счете.");
    await loadOffers();
  } catch (err) {
    console.error(err);
    alert(err.message || "Не удалось принять предложение");
  }
}

async function updateOffer(offerId, currentOffer) {
  const priceInput = prompt("Новая сумма", currentOffer.price ?? "");
  if (priceInput === null) return;

  const pickupDate = prompt("Дата подачи машины", currentOffer.pickupDate || "");
  if (pickupDate === null) return;

  const truckType = prompt("Тип машины", currentOffer.truckType || "");
  if (truckType === null) return;

  const comment = prompt("Комментарий", currentOffer.comment || "");
  if (comment === null) return;

  const currency = currentOffer.currency || "KZT";
  const price = Number(priceInput || 0);

  if (!price || price <= 0) {
    alert("Укажи корректную сумму");
    return;
  }

  try {
    const response = await fetch(`/api/offers/${offerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        price,
        currency,
        pickupDate,
        truckType,
        comment
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось изменить ставку");

    await loadOffers();
  } catch (err) {
    console.error(err);
    alert(err.message || "Не удалось изменить ставку");
  }
}

async function deleteOffer(offerId) {
  const ok = confirm("Отменить это предложение?");
  if (!ok) return;

  try {
    const response = await fetch(`/api/offers/${offerId}`, {
      method: "DELETE",
      credentials: "include"
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось отменить ставку");

    await loadOffers();
  } catch (err) {
    console.error(err);
    alert(err.message || "Не удалось отменить ставку");
  }
}

async function getCurrentUser() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Ошибка получения пользователя:", e);
    return null;
  }
}

async function loadOffers() {
  if (!loadId) {
    subtitle.textContent = "Нет параметра ?id=";
    setEmpty(`<div class="offer-card">Груз не выбран</div>`);
    return;
  }

  subtitle.textContent = `Груз #${loadId}`;

  try {
    const response = await fetch(`/api/loads/${loadId}/offers`, {
      credentials: "include"
    });

    const items = await response.json().catch(() => []);
    if (!response.ok) throw new Error(items.error || "Не удалось загрузить ставки");

    if (!Array.isArray(items) || !items.length) {
      setEmpty(`
        <div class="offer-card">
          <h3>Ставок пока нет</h3>
          <p>По этому грузу ещё никто не отправил предложение.</p>
        </div>
      `);
      return;
    }

    const acceptedOffer = items.find(o => o.status === "accepted");
    const renderItems = acceptedOffer ? [acceptedOffer] : items;

    const currentUser = await getCurrentUser();
    const isCarrier = currentUser?.role === "carrier";

    const unassignBtn = acceptedOffer
  ? `<button class="btn-outline js-unassign-load">Отменить принятие</button>`
  : "";


    offersList.innerHTML = renderItems.map(o => {
      const name = escapeHtml(o.carrierName || "Перевозчик");
      const phone = escapeHtml(o.carrierPhone || "Телефон не указан");
      const price = o.price ? `${formatMoney(o.price)} ${escapeHtml(o.currency || "KZT")}` : "—";
      const comment = escapeHtml(o.comment || "Без комментария");
      const pickupDate = escapeHtml(o.pickupDate || "—");
      const truckType = escapeHtml(o.truckType || "—");
      const status = o.status || "pending";

      const statusBadge = status === "accepted"
        ? `<span class="status status-accepted">Принято</span>`
        : status === "rejected"
          ? `<span class="status status-rejected">Отклонено</span>`
          : `<span class="status status-pending">Ожидает</span>`;

      const acceptBtn = (!acceptedOffer && !isCarrier)
  ? `<button class="btn-accept js-accept-offer" data-offerid="${o.id}">Принять</button>`
  : "";

      const editBtn = (status === "pending" || status === "accepted")
  ? `<button class="btn-outline js-edit-offer" data-offerid="${o.id}">Изменить</button>`
  : "";

      const deleteBtn = status === "pending"
  ? `<button class="btn-outline js-delete-offer" data-offerid="${o.id}">Отменить</button>`
  : "";

      return `
  <div class="offer-card">
    <div class="offer-layout">
      <div class="offer-main">
        <div class="offer-top">
          <div class="price">${price}</div>
          ${statusBadge}
        </div>

        <div class="offer-meta">
          <div class="offer-line">
            <span class="offer-label">Перевозчик:</span>
            <b>${name}</b>
          </div>

          <div class="offer-line">
            <span class="offer-label">Телефон:</span>
            <b>${phone}</b>
          </div>

          <div class="offer-line">
            <span class="offer-label">Дата подачи:</span>
            <b>${pickupDate}</b>
          </div>

          <div class="offer-line">
            <span class="offer-label">Тип машины:</span>
            <b>${truckType}</b>
          </div>

          <div class="offer-line offer-line-comment">
            <span class="offer-label">Комментарий:</span>
            <b>${comment}</b>
          </div>
        </div>
      </div>

      <div class="offer-actions">
        ${acceptBtn}
        ${editBtn}
        ${deleteBtn}
        ${unassignBtn}
      </div>
    </div>
  </div>
`;
    }).join("");

    const mapById = new Map(items.map(o => [String(o.id), o]));

    offersList.querySelectorAll(".js-accept-offer").forEach(btn => {
      btn.addEventListener("click", () => {
        const offerId = btn.dataset.offerid || "";
        if (!offerId) return;
        acceptOffer(offerId);
      });
    });

    offersList.querySelectorAll(".js-edit-offer").forEach(btn => {
      btn.addEventListener("click", () => {
        const offerId = btn.dataset.offerid || "";
        const offer = mapById.get(String(offerId));
        if (!offer) return;
        updateOffer(offerId, offer);
      });
    });

    offersList.querySelectorAll(".js-delete-offer").forEach(btn => {
      btn.addEventListener("click", () => {
        const offerId = btn.dataset.offerid || "";
        if (!offerId) return;
        deleteOffer(offerId);
      });
    });

    offersList.querySelectorAll(".js-unassign-load").forEach(btn => {
  btn.addEventListener("click", async () => {
    const ok = confirm("Отменить принятие этой ставки?");
    if (!ok) return;

    try {
      const response = await fetch(`/api/loads/${loadId}/unassign`, {
        method: "POST",
        credentials: "include"
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось отменить принятие");

      await loadOffers();
    } catch (err) {
      console.error(err);
      alert(err.message || "Не удалось отменить принятие");
    }
  });
});

  } catch (err) {
    console.error(err);
    setEmpty(`
      <div class="offer-card">
        <h3>Ошибка</h3>
        <p>${escapeHtml(err.message || "Не удалось загрузить ставки.")}</p>
      </div>
    `);
  }
}

loadOffers();
