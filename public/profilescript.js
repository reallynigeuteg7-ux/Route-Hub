// --- 1. CONFIG & INITIALIZATION ---
let CURRENT_USER_NAME = 'Пользователь';


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatProfileRating(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return n.toFixed(2).replace(/\.00$/, '.0');
}

function formatWalletAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSolAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.000000';
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 9 });
}

function getWalletBalance(wallet) {
  return Number(wallet?.balance ?? wallet?.availableBalance ?? 0);
}

function updateWalletUi(wallet) {
  const balance = getWalletBalance(wallet);
  const balanceText = formatWalletAmount(balance);
  const display = document.getElementById('user-balance-display');
  if (display) display.textContent = balanceText + ' \u20b8';
  const tabBalance = document.getElementById('user-balance');
  if (tabBalance) tabBalance.textContent = balanceText;

  const solText = 'Devnet SOL: ' + formatSolAmount(wallet?.devnetSolBalance || 0);
  let solDisplay = document.getElementById('devnet-sol-balance-display');
  if (!solDisplay && display?.parentElement) {
    solDisplay = document.createElement('div');
    solDisplay.id = 'devnet-sol-balance-display';
    solDisplay.style.cssText = 'margin-top:8px;color:#38bdf8;font-size:13px;font-weight:800;';
    display.parentElement.appendChild(solDisplay);
  }
  if (solDisplay) solDisplay.textContent = solText;

  const history = document.getElementById('balance-history');
  if (!history) return;

  const transactions = Array.isArray(wallet?.transactions) ? wallet.transactions : [];
  if (!transactions.length) {
    history.innerHTML = '<p class="empty-text">\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043b\u0430\u0442\u0435\u0436\u0435\u0439 \u043f\u0443\u0441\u0442\u0430</p>';
    return;
  }

  history.innerHTML = transactions.map((tx) => {
    const amount = Number(tx.amount || 0);
    const sign = amount > 0 ? '+' : '';
    const createdAt = tx.createdAt ? new Date(tx.createdAt).toLocaleString('ru-RU') : '';
    const title = tx.description || tx.type || '\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f';
    const amountClass = amount >= 0 ? 'wallet-amount-positive' : 'wallet-amount-negative';
    const isSol = String(tx.currency || '').toUpperCase() === 'SOL';
    const formattedAmount = isSol ? formatSolAmount(amount) + ' SOL' : formatWalletAmount(amount) + ' \u20b8';
    return '<div class="history-item">' +
      '<div><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(createdAt) + '</small></div>' +
      '<b class="' + amountClass + '">' + sign + formattedAmount + '</b>' +
    '</div>';
  }).join('');
}

async function refreshWallet() {
  const response = await fetch('/api/wallet', { credentials: 'include' });
  const wallet = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(wallet.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0431\u0430\u043b\u0430\u043d\u0441');
  updateWalletUi(wallet);
  renderTopupRequests(wallet.topupRequests || []);
  renderWithdrawRequests(wallet.withdrawRequests || []);
  loadTopupDetails().catch(() => null);
  return wallet;
}

async function loadTopupDetails() {
  const box = document.getElementById('topup-details');
  if (!box) return;
  const response = await fetch('/api/wallet/topup-details', { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  const details = data.details || {};
  const devnet = details.devnetSol || {};
  box.innerHTML = devnet.enabled
    ? '<div id="devnet-sol-box" style="margin-top:14px;padding:14px;border:1px solid rgba(56,189,248,.3);border-radius:14px;background:rgba(14,165,233,.08);display:grid;gap:9px;">' +
      '<strong style="color:#38bdf8;">Пополнение Devnet SOL</strong>' +
      '<small style="color:#8ea4c4;">Оплата проходит автоматически через Phantom.</small>' +
      '<input id="devnet-sol-amount" type="number" min="0.000001" step="0.000001" placeholder="Например, 0.1" style="padding:10px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:rgba(15,23,42,.6);color:inherit;">' +
      '<button id="devnet-sol-create" type="button" style="padding:10px;border:0;border-radius:10px;background:#0ea5e9;color:white;font-weight:800;cursor:pointer;">Оплатить через Phantom</button>' +
      '<p id="devnet-sol-message" style="margin:0;color:#bae6fd;font-size:12px;overflow-wrap:anywhere;"></p>' +
      '</div>'
    : '<p style="margin-top:10px;color:#8ea4c4;">Пополнение SOL пока не настроено.</p>';

  document.getElementById('devnet-sol-create')?.addEventListener('click', createDevnetSolTopup);
}

async function createDevnetSolTopup() {
  const amountInput = document.getElementById('devnet-sol-amount');
  const message = document.getElementById('devnet-sol-message');
  const button = document.getElementById('devnet-sol-create');
  const amount = Number(amountInput?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (message) message.textContent = 'Укажите сумму SOL';
    return;
  }
  try {
    if (button) button.disabled = true;
    if (message) message.textContent = 'Подключаем Phantom...';
    const provider = window.phantom?.solana || window.solana;
    if (!provider?.isPhantom) {
      throw new Error('Откройте сайт в браузере с установленным Phantom');
    }
    const connected = provider.isConnected ? provider : await provider.connect();
    const publicKey = connected.publicKey || provider.publicKey;
    if (!publicKey) throw new Error('Не удалось подключить кошелёк');
    if (!window.solanaWeb3) throw new Error('Не загрузился модуль Solana. Обновите страницу');
    const response = await fetch('/api/wallet/devnet-sol/topup', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось создать платёж');
    const topup = data.topup || {};
    const web3 = window.solanaWeb3;
    const connection = new web3.Connection('https://api.devnet.solana.com', 'confirmed');
    const sender = new web3.PublicKey(publicKey.toString());
    const recipient = new web3.PublicKey(topup.recipient);
    if (sender.equals(recipient)) {
      throw new Error('Выбран кошелёк RouteHub (Account 1). Переключите Phantom на Account 2 — с него отправляется тестовый платёж.');
    }
    const reference = new web3.PublicKey(topup.reference);
    const connectionBalance = await connection.getBalance(sender, 'confirmed');
    const lamports = Math.round(Number(topup.amount) * web3.LAMPORTS_PER_SOL);
    if (connectionBalance < lamports + 10000) {
      throw new Error('На выбранном кошельке нет Devnet SOL для отправки. Пополните Account 2 через faucet.solana.com.');
    }
    const transaction = new web3.Transaction();
    const transfer = web3.SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports
    });
    // Solana Pay reference is included as a readonly account so the webhook
    // can correlate this on-chain payment with this user's pending top-up.
    transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
    transaction.add(transfer);
    const latest = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latest.blockhash;
    transaction.feePayer = new web3.PublicKey(publicKey.toString());
    if (message) message.textContent = 'Подтвердите перевод в Phantom...';
    const result = await provider.signAndSendTransaction(transaction);
    const signature = result?.signature || result;
    if (!signature) throw new Error('Phantom не вернул подпись транзакции');
    if (message) message.textContent = 'Транзакция отправлена. Проверяем сеть...';
    let confirmResponse = await fetch('/api/wallet/devnet-sol/topup/' + encodeURIComponent(topup.id) + '/confirm', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature })
    });
    if (!confirmResponse.ok) {
      // Helius webhook may arrive a few seconds later; the payment is still
      // valid and will be credited automatically once confirmed.
      const confirmData = await confirmResponse.json().catch(() => ({}));
      if (confirmResponse.status !== 409) throw new Error(confirmData.error || 'Транзакция отправлена, но проверка ещё не завершилась');
    }
    if (message) message.innerHTML = 'Готово: транзакция отправлена и баланс обновится автоматически. <a href="https://explorer.solana.com/tx/' + encodeURIComponent(signature) + '?cluster=devnet" target="_blank" rel="noopener" style="color:#7dd3fc;font-weight:800;">Открыть в Explorer</a>';
    amountInput.value = '';
    setTimeout(() => refreshWallet().catch(() => null), 2500);
  } catch (error) {
    if (message) message.textContent = error?.message || 'Ошибка отправки платежа';
  } finally {
    if (button) button.disabled = false;
  }
}
function topupStatusLabel(status) {
  if (status === 'approved') return '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e';
  if (status === 'rejected') return '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e';
  return '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435';
}

function renderTopupRequests(requests) {
  const list = document.getElementById('topup-requests');
  if (!list) return;
  if (!Array.isArray(requests) || !requests.length) {
    list.innerHTML = '<p class="empty-text">\u0417\u0430\u044f\u0432\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</p>';
    return;
  }
  list.innerHTML = requests.map((item) => {
    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '';
    const cls = item.status === 'approved' ? 'wallet-amount-positive' : item.status === 'rejected' ? 'wallet-amount-negative' : '';
    return '<div class="history-item topup-request-item">' +
      '<div><strong>' + formatWalletAmount(item.amount) + ' \u20b8</strong><small>' + escapeHtml(createdAt) + '</small>' +
      (item.adminComment ? '<small>' + escapeHtml(item.adminComment) + '</small>' : '') + '</div>' +
      '<b class="' + cls + '">' + escapeHtml(topupStatusLabel(item.status)) + '</b>' +
    '</div>';
  }).join('');
}

function withdrawStatusLabel(status) {
  if (status === 'approved') return '\u0412\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e';
  if (status === 'rejected') return '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e';
  return '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435';
}

function renderWithdrawRequests(requests) {
  const list = document.getElementById('withdraw-requests');
  if (!list) return;
  if (!Array.isArray(requests) || !requests.length) { list.innerHTML = '<p class="empty-text">\u0417\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</p>'; return; }
  list.innerHTML = requests.map((item) => {
    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '';
    const cls = item.status === 'approved' ? 'wallet-amount-positive' : item.status === 'rejected' ? 'wallet-amount-negative' : '';
    const isSol = String(item.currency || '').toUpperCase() === 'SOL';
    const formattedAmount = isSol ? formatSolAmount(item.amount) + ' SOL' : formatWalletAmount(item.amount) + ' \u20b8';
    return '<div class="history-item topup-request-item"><div><strong>-' + formattedAmount + '</strong><small>' + escapeHtml(createdAt) + '</small>' + (item.adminComment ? '<small>' + escapeHtml(item.adminComment) + '</small>' : '') + '</div><b class="' + cls + '">' + escapeHtml(withdrawStatusLabel(item.status)) + '</b></div>';
  }).join('');
}
async function submitTopupRequest(event) {
  event.preventDefault();
  const amountInput = document.getElementById('topup-amount');
  const fileInput = document.getElementById('topup-receipt');
  const message = document.getElementById('topup-message');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const amount = Number(amountInput?.value || 0);
  const file = fileInput?.files?.[0];

  if (!Number.isFinite(amount) || amount <= 0) {
    if (message) message.textContent = '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f';
    return;
  }
  if (!file) {
    if (message) message.textContent = '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435';
    return;
  }

  try {
    if (button) button.disabled = true;
    if (message) message.textContent = '\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443...';
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch('/api/wallet/topup-request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, fileName: file.name, mimeType: file.type, receiptData: dataUrl })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443');
    amountInput.value = '';
    fileInput.value = '';
    if (message) message.textContent = '\u0417\u0430\u044f\u0432\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430. \u0410\u0434\u043c\u0438\u043d \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u0438 \u043f\u043e\u043f\u043e\u043b\u043d\u0438\u0442 \u0431\u0430\u043b\u0430\u043d\u0441.';
    updateWalletUi(data.wallet);
    renderTopupRequests(data.wallet?.topupRequests || []);
  } catch (err) {
    if (message) message.textContent = err.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 \u0437\u0430\u044f\u0432\u043a\u0438';
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitWithdrawRequest(event) {
  event.preventDefault();
  const amountInput = document.getElementById('withdraw-amount');
  const detailsInput = document.getElementById('withdraw-details');
  const message = document.getElementById('withdraw-message');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const amount = Number(amountInput?.value || 0);
  const payoutDetails = detailsInput?.value?.trim() || '';
  if (!Number.isFinite(amount) || amount <= 0) { if (message) message.textContent = '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u0432\u044b\u0432\u043e\u0434\u0430'; return; }
  if (payoutDetails.length < 8) { if (message) message.textContent = '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b \u0434\u043b\u044f \u0432\u044b\u0432\u043e\u0434\u0430'; return; }
  try {
    if (button) button.disabled = true;
    if (message) message.textContent = '\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u0437\u0430\u044f\u0432\u043a\u0443 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434...';
    const response = await fetch('/api/wallet/withdraw-request', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, payoutDetails }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443');
    amountInput.value = ''; detailsInput.value = '';
    if (message) message.textContent = '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430. \u0410\u0434\u043c\u0438\u043d \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0435\u0435 \u0432\u0440\u0443\u0447\u043d\u0443\u044e.';
    updateWalletUi(data.wallet); renderWithdrawRequests(data.wallet?.withdrawRequests || []);
  } catch (err) { if (message) message.textContent = err.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 \u0437\u0430\u044f\u0432\u043a\u0438'; }
  finally { if (button) button.disabled = false; }
}

async function submitDevnetSolWithdrawRequest(event) {
  event.preventDefault();
  const amountInput = document.getElementById('devnet-sol-withdraw-amount');
  const addressInput = document.getElementById('devnet-sol-withdraw-address');
  const message = document.getElementById('devnet-sol-withdraw-message');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const amount = Number(amountInput?.value || 0);
  const walletAddress = addressInput?.value?.trim() || '';
  if (!Number.isFinite(amount) || amount < 0.000001 || amount > 1000) {
    if (message) message.textContent = 'Укажите сумму от 0.000001 до 1000 SOL';
    return;
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    if (message) message.textContent = 'Проверьте Solana-адрес получателя';
    return;
  }
  try {
    if (button) button.disabled = true;
    if (message) message.textContent = 'Создаём заявку на вывод SOL...';
    const response = await fetch('/api/wallet/devnet-sol/withdraw-request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, walletAddress })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось создать заявку');
    amountInput.value = '';
    addressInput.value = '';
    if (message) message.textContent = 'SOL автоматически отправлен. Транзакция подтверждается в сети.';
    updateWalletUi(data.wallet);
    renderWithdrawRequests(data.wallet?.withdrawRequests || []);
  } catch (err) {
    if (message) message.textContent = err.message || 'Ошибка создания заявки';
  } finally {
    if (button) button.disabled = false;
  }
}

function getReviewActionMarkup({ loadId, revieweeId, revieweeName, route, reviewGiven }) {
  if (reviewGiven) {
    return `<span style="display:inline-flex;align-items:center;justify-content:center;background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.28);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:800;">\u041e\u0442\u0437\u044b\u0432 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d</span>`;
  }

  if (!loadId || !revieweeId) return '';

  return `<button onclick="openReviewModal({loadId:${Number(loadId)},revieweeId:${Number(revieweeId)},revieweeName:'${escapeHtml(String(revieweeName || ""))}',route:'${escapeHtml(String(route || ""))}'})" style="background:#2563eb;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800;">\u041e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432</button>`;
}

function ensureReviewModal() {
  let modal = document.getElementById('review-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'review-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.72);backdrop-filter:blur(10px);padding:18px;';
  modal.innerHTML = `
    <div style="width:min(440px,100%);background:#07111f;border:1px solid rgba(59,130,246,.35);border-radius:22px;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px;color:white;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="color:#38bdf8;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">\u041e\u0442\u0437\u044b\u0432 \u043f\u043e \u0441\u0434\u0435\u043b\u043a\u0435</div>
          <h3 id="review-modal-title" style="margin:6px 0 0;font-size:22px;line-height:1.15;">\u041e\u0446\u0435\u043d\u0438\u0442\u044c \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430</h3>
          <p id="review-modal-route" style="margin:8px 0 0;color:#94a3b8;font-size:13px;"></p>
        </div>
        <button type="button" onclick="closeReviewModal()" style="width:36px;height:36px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.8);color:white;cursor:pointer;font-size:18px;">&times;</button>
      </div>
      <div id="review-stars" style="display:flex;gap:8px;margin:12px 0 14px;"></div>
      <textarea id="review-text" maxlength="500" placeholder="\u041a\u043e\u0440\u043e\u0442\u043a\u043e \u043e \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u0435" style="width:100%;min-height:110px;resize:vertical;border-radius:16px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.88);color:white;padding:14px;font:inherit;box-sizing:border-box;outline:none;"></textarea>
      <div id="review-modal-error" style="min-height:18px;margin-top:10px;color:#fca5a5;font-size:13px;"></div>
      <button type="button" onclick="submitReview()" style="width:100%;margin-top:12px;border:0;border-radius:16px;background:#2f86f6;color:white;padding:14px 16px;font-weight:900;cursor:pointer;">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432</button>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

let activeReviewPayload = null;
let activeReviewRating = 5;

function renderReviewStars() {
  const box = document.getElementById('review-stars');
  if (!box) return;
  box.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" onclick="activeReviewRating=${n};renderReviewStars();" style="border:0;background:transparent;color:${n <= activeReviewRating ? "#f59e0b" : "#334155"};font-size:34px;line-height:1;cursor:pointer;padding:0 2px;">&#9733;</button>`).join('');
}

function openReviewModal(payload) {
  activeReviewPayload = payload;
  activeReviewRating = 5;
  const modal = ensureReviewModal();
  const title = document.getElementById('review-modal-title');
  const route = document.getElementById('review-modal-route');
  const text = document.getElementById('review-text');
  const error = document.getElementById('review-modal-error');
  if (title) title.textContent = '\u041e\u0446\u0435\u043d\u0438\u0442\u044c: ' + (payload.revieweeName || '\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a');
  if (route) route.textContent = payload.route || '';
  if (text) text.value = '';
  if (error) error.textContent = '';
  modal.style.display = 'flex';
  renderReviewStars();
}

function closeReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) modal.style.display = 'none';
}

async function submitReview() {
  if (!activeReviewPayload) return;
  const error = document.getElementById('review-modal-error');
  const text = document.getElementById('review-text');
  if (error) error.textContent = '';

  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loadId: activeReviewPayload.loadId,
        revieweeId: activeReviewPayload.revieweeId,
        rating: activeReviewRating,
        text: text ? text.value.trim() : ''
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432');
    closeReviewModal();
    await initProfile();
    if (window.location.pathname.includes('carrier_profile.html')) loadMyOffers();
    else loadMyCargo();
  } catch (e) {
    if (error) error.textContent = e.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u0437\u044b\u0432\u0430';
    else alert(e.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u0437\u044b\u0432\u0430');
  }
}

function normalizeProfileUserRole(role) {
  const raw = String(role || '').trim().toLowerCase();

  if (
    raw === 'carrier' ||
    raw === 'driver' ||
    raw === 'transport' ||
    raw === 'transporter' ||
    raw.includes('перевоз') ||
    raw.includes('водител')
  ) {
    return 'carrier';
  }

  return 'client';
}

function isProfileCarrierUser(user) {
  return normalizeProfileUserRole(
    user?.role ||
    user?.userRole ||
    user?.user_type ||
    user?.userType ||
    user?.account_type ||
    user?.accountType ||
    user?.type
  ) === 'carrier';
}

function formatVerificationPersonType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'legal') return 'Юр. лицо';
  if (raw === 'too') return 'ТОО';
  if (raw === 'ip') return '\u0418\u041f';
  if (raw === 'self_employed') return 'Самозанятый';
  return 'Физ. лицо';
}

function getVerificationStatusMeta(user) {
  const verified = Boolean(user?.ecp_verified);
  return {
    verified,
    text: verified ? 'Верифицирован' : 'Ожидает проверки',
    chip: verified ? 'ЭЦП подтверждена' : 'Не верифицирован',
    note: verified
      ? 'Аккаунт подтвержден. В будущем здесь появятся детали сертификата ЭЦП.'
      : 'Подготовь данные профиля и документы. Подписание ЭЦП подключим следующим этапом.',
    className: verified ? 'verification-chip verification-chip--verified' : 'verification-chip verification-chip--pending',
    statusClass: verified ? 'status-verified' : 'status-pending'
  };
}

async function pingNCALayer() {
  return new Promise((resolve) => {
    let settled = false;
    let socket = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      } catch (e) {}
      resolve(result);
    };

    try {
      socket = new WebSocket('wss://127.0.0.1:13579');
      const timer = setTimeout(() => finish(false), 1800);
      socket.onopen = () => {
        clearTimeout(timer);
        finish(true);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      socket.onclose = () => {
        clearTimeout(timer);
        finish(settled ? true : false);
      };
    } catch (e) {
      finish(false);
    }
  });
}

function updateVerificationDocCard(kind, fileName) {
  const map = {
    passport: {
      textId: 'passportCardText',
      statusId: 'passportCardStatus',
      dotId: 'passportCardDot',
      label: 'Файл: '
    },
    sts: {
      textId: 'stsCardText',
      statusId: 'stsCardStatus',
      dotId: 'stsCardDot',
      label: 'Файл: '
    },
    generic: {
      textId: null,
      statusId: 'docsUploadMsg',
      dotId: null,
      label: 'Выбрано: '
    }
  };

  const config = map[kind];
  if (!config) return;

  if (config.textId) {
    const textNode = document.getElementById(config.textId);
    if (textNode) textNode.textContent = config.label + fileName;
  }

  if (config.statusId) {
    const statusNode = document.getElementById(config.statusId);
    if (statusNode) {
      statusNode.textContent = kind === 'generic'
        ? config.label + fileName
        : 'Загружено локально. Сохранение на сервер подключим следующим шагом.';
    }
  }

  if (config.dotId) {
    const dotNode = document.getElementById(config.dotId);
    if (dotNode) dotNode.className = 'doc-state-dot doc-state-dot--uploaded';
  }
}
// --- 2. CORE PROFILE LOGIC ---

async function initProfile(prefetchedUser = null) {
  try {
    const user = prefetchedUser || await (async () => {
      const response = await fetch('/api/me', {
        credentials: 'include'
      });

      if (!response.ok) {
        window.location.href = 'login.html';
        return null;
      }

      return response.json();
    })();
    if (!user) return;

    CURRENT_USER_NAME = user?.name || 'Пользователь';

    const applyVerificationState = (currentUser) => {
      const meta = getVerificationStatusMeta(currentUser);
      const statusNode = document.getElementById('verification-status');
      const noteNode = document.getElementById('verification-status-note');
      const chipNode = document.getElementById('verification-chip');
      const ecpStatusText = document.getElementById('ecpStatusText');
      const codeNode = document.getElementById('ecpUserCode');
      const updatedAtNode = document.getElementById('verificationUpdatedAt');

      if (statusNode) {
        statusNode.textContent = meta.text;
        statusNode.className = meta.statusClass;
      }
      if (noteNode) noteNode.textContent = meta.note;
      if (chipNode) {
        chipNode.textContent = meta.chip;
        chipNode.className = meta.className;
      }
      if (ecpStatusText) ecpStatusText.textContent = meta.chip;
      if (codeNode) codeNode.textContent = currentUser.user_code || '000000';
      if (updatedAtNode) updatedAtNode.textContent = meta.verified ? 'Подтверждено' : 'Не выполнялось';
    };

    const companyInput = document.getElementById('companyInput');
    const personTypeSelect = document.getElementById('personTypeSelect');
    const phoneInput = document.getElementById('phoneInput');
    const saveBtn = document.getElementById('saveVerificationBtn');
    const saveMsg = document.getElementById('saveVerificationMsg');
    const ecpMsg = document.getElementById('ecpActionMsg');
    const checkNcaLayerBtn = document.getElementById('checkNcaLayerBtn');
    const startEcpVerifyBtn = document.getElementById('startEcpVerifyBtn');

    if (companyInput) companyInput.value = user.company || user.name || '';
    if (personTypeSelect) {
      const profileType = user.person_type === 'legal' ? 'too' : user.person_type === 'individual' ? 'self_employed' : (user.person_type || 'self_employed');
      personTypeSelect.value = profileType;
    }
    if (phoneInput) phoneInput.value = user.phone || '';
    if (user.registration_certificate_file) {
      const docsMsg = document.getElementById('docsUploadMsg');
      if (docsMsg) docsMsg.textContent = '\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d';
    }

    applyVerificationState(user);

    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.onclick = async () => {
        if (saveMsg) saveMsg.textContent = 'Сохраняем данные...';

        const payload = {};

        try {
          const response = await fetch('/api/update-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(payload)
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Ошибка сохранения');

          const updatedUser = { ...user };

          localStorage.setItem('user', JSON.stringify(updatedUser));
          applyVerificationState(updatedUser);
          if (saveMsg) saveMsg.textContent = 'Данные сохранены';
        } catch (e) {
          if (saveMsg) saveMsg.textContent = 'Ошибка: ' + e.message;
        }
      };
    }

    if (checkNcaLayerBtn && !checkNcaLayerBtn.dataset.bound) {
      checkNcaLayerBtn.dataset.bound = '1';
      checkNcaLayerBtn.onclick = async () => {
        if (ecpMsg) ecpMsg.textContent = 'Проверяем подключение к NCALayer...';
        const connected = await pingNCALayer();
        if (ecpMsg) {
          ecpMsg.textContent = connected
            ? 'NCALayer найден. Можно переходить к реальной подписи ЭЦП.'
            : 'NCALayer не отвечает. Установи и запусти его локально на ПК.';
        }
      };
    }

    if (startEcpVerifyBtn && !startEcpVerifyBtn.dataset.bound) {
      startEcpVerifyBtn.dataset.bound = '1';
      startEcpVerifyBtn.onclick = async () => {
        if (ecpMsg) ecpMsg.textContent = 'Готовим сценарий подписи...';
        const connected = await pingNCALayer();
        if (!connected) {
          if (ecpMsg) ecpMsg.textContent = 'Сначала запусти NCALayer. После этого подключим реальную подпись и серверную валидацию.';
          return;
        }

        if (ecpMsg) {
          ecpMsg.textContent = 'Основа готова: вкладка уже подготовлена под реальный запуск ЭЦП. Следующим шагом подключим подпись через NCALayer и endpoint verify-ecp.';
        }
      };
    }

    localStorage.setItem('user', JSON.stringify(user));
    loadFavorites();

    window.addEventListener('favorites:changed', loadFavorites);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('favorites_')) loadFavorites();
    });

    const displayName = user.name || user.full_name || user.phone || '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c';
    const activeLoads = user.activeLoads ?? user.active_loads ?? user.loads_count ?? 0;
    const wallet = user.wallet || { balance: user.balance ?? 0 };

    const elements = {
      'user-name-display': displayName,
      'user-name-header': displayName,
      'active-loads-count': activeLoads
    };

    for (let id in elements) {
      const el = document.getElementById(id);
      if (el) el.textContent = elements[id];
    }

    updateWalletUi(wallet);

    const ratingDisplay = document.getElementById('profile-rating-value');
    if (ratingDisplay) {
      ratingDisplay.innerHTML = '<i class="fa-solid fa-star"></i> ' + formatProfileRating(user.averageRating ?? user.average_rating ?? 0);
      const totalReviews = Number(user.totalReviews ?? user.total_reviews ?? 0);
      ratingDisplay.title = totalReviews > 0 ? totalReviews + ' reviews' : 'No reviews yet';
    }

    const roleDisplay = document.getElementById('user-role-display');
    if (roleDisplay) {
      roleDisplay.textContent = isProfileCarrierUser(user) ? '🚛 Перевозчик' : '📦 Грузовладелец';
    }

    const avatar = document.querySelector('.avatar-big');
    if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();
  } catch (err) {
    console.error('Ошибка инициализации:', err);
  }
}
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

// --- 3. CARGO MANAGEMENT ---

async function getAcceptedOfferByLoadId(loadId) {
    try {
        const response = await fetch(`/api/loads/${loadId}/offers`, {
            credentials: "include"
        });

        if (!response.ok) return null;

        const offers = await response.json();
        return offers.find(o => o.status === "accepted") || null;
    } catch (e) {
        console.error("Ошибка accepted offer:", e);
        return null;
    }
}


async function loadMyCargo() {
    const container = document.getElementById("my-cargo-list");
    if (!container) return;

    container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Синхронизация...</div>';

    try {
        const response = await fetch("/api/my-loads", {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Не удалось загрузить грузы");
        }

        const myCargo = await response.json();

        if (!Array.isArray(myCargo) || myCargo.length === 0) {
            container.innerHTML = `
                <div style="padding: 30px; text-align: center; color: var(--muted);">
                    У вас пока нет активных публикаций
                </div>
            `;
            return;
        }

        const rows = await Promise.all(myCargo.map(async (cargo) => {
            const safeFrom = escapeHtml(cargo.from_location || '—');
            const safeTo = escapeHtml(cargo.to_location || '—');
            const safeType = escapeHtml(cargo.type || 'Сборный');
            const safeWeight = escapeHtml(cargo.weight || '0');
            const safeDate = escapeHtml(cargo.date || '---');

            const acceptedOffer = await getAcceptedOfferByLoadId(cargo.id);
            const cargoRoute = String(cargo.from_location || '') + ' \u2192 ' + String(cargo.to_location || '');
            const cargoRevieweeId = cargo.acceptedCarrierUserId || acceptedOffer?.carrierUserId;
            const cargoRevieweeName = cargo.acceptedCarrierName || acceptedOffer?.carrierName || '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a';
            const cargoReviewAction = getReviewActionMarkup({
                loadId: cargo.id,
                revieweeId: cargoRevieweeId,
                revieweeName: cargoRevieweeName,
                route: cargoRoute,
                reviewGiven: cargo.reviewGiven
            });

           const cargoStatus =
    cargo.status === "completed"
        ? "Сделка завершена"
        : acceptedOffer
            ? "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0432\u044b\u0431\u0440\u0430\u043d"
            : "Открыт";

const cargoStatusColor =
    cargo.status === "completed"
        ? "#64748b"
        : acceptedOffer
            ? "#22c55e"
            : "#38bdf8";

const actionHtml =
    cargo.status === "completed"
        ? `
            <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
              <span style="display:inline-flex; align-items:center; justify-content:center; background:#64748b; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                  \u0421\u0434\u0435\u043b\u043a\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430
              </span>
              ${cargoReviewAction}
            </div>
          `
        : acceptedOffer
            ? `
                <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                    <button onclick="openOffers(${cargo.id})"
                        style="background: #22c55e; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">
                        Принято
                    </button>
                    ${cargo.status === "assigned" ? `
                        <button onclick="completeLoad(${cargo.id})"
                            ${cargo.clientCompleted ? 'disabled' : ''}
                            style="background: #f59e0b; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:${cargo.clientCompleted ? 'default' : 'pointer'}; opacity:${cargo.clientCompleted ? '0.6' : '1'}; font-size:12px; font-weight:700;">
                            ${cargo.clientCompleted ? 'Подтверждено' : 'Подтвердить завершение'}
                        </button>
                        ${getCompletionStatusMarkup({
                            clientCompleted: cargo.clientCompleted,
                            carrierCompleted: cargo.carrierCompleted,
                            viewer: "client"
                        })}
                    ` : ``}
                </div>
              `
            : `
                <button onclick="openOffers(${cargo.id})"
                    style="background: var(--neon-blue); color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                    Предложения
                </button>
              `;

            return `
                <tr>
                    <td>
                        <div style="font-weight: 700; color: var(--neon-blue); display: flex; align-items: center; gap: 8px;">
                            ${safeFrom} <i class="fa-solid fa-arrow-right" style="font-size: 10px; opacity: 0.5;"></i> ${safeTo}
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 13px;">${safeType}</div>
                        <div style="font-size: 11px; color: var(--muted);">${safeWeight} тонн</div>
                        <div style="margin-top:6px;">
                          <span style="
                            display:inline-flex;
                            align-items:center;
                            padding:4px 10px;
                            border-radius:999px;
                            font-size:11px;
                            font-weight:700;
                            color:white;
                            background:${cargoStatusColor};
                          ">
                            ${cargoStatus}
                          </span>
                        </div>
                    </td>
                    <td style="font-size: 13px; color: var(--muted);">${safeDate}</td>
                    <td style="text-align: right; padding-right: 20px; display:flex; justify-content:flex-end; gap:8px; align-items:flex-start;">
                        ${actionHtml}

                        <button onclick="trackCargo(${cargo.id})"
                            class="nav-icon" style="width: 35px; height: 35px;">
                            <i class="fa-solid fa-location-crosshairs"></i>
                        </button>

                        <button onclick="deleteCargo(${cargo.id})"
                            class="nav-icon" style="width: 35px; height: 35px; color: #ef4444;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        }));

        container.innerHTML = `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>МАРШРУТ</th>
                        <th>ГРУЗ</th>
                        <th>ДАТА</th>
                        <th style="text-align: right; padding-right: 30px;">\u0414\u0415\u0419\u0421\u0422\u0412\u0418\u042f</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join("")}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error("Ошибка загрузки грузов:", err);
        container.innerHTML = `
            <div style="padding: 30px; text-align: center; color: #ef4444;">
                Не удалось загрузить публикации
            </div>
        `;
    }
}

async function loadMyOffers() {
    const container = document.getElementById("my-cargo-list");
    if (!container) return;

    container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка ставок...</div>';

    try {
        const response = await fetch("/api/my-offers", {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Не удалось загрузить ставки");
        }

        const myOffers = await response.json();

        if (!Array.isArray(myOffers) || myOffers.length === 0) {
            container.innerHTML = `
                <div style="padding: 30px; text-align: center; color: var(--muted);">
                    У вас пока нет отправленных ставок
                </div>
            `;
            return;
        }

        const rows = myOffers.map(offer => {
            const safeFrom = escapeHtml(offer.from_location || '—');
            const safeTo = escapeHtml(offer.to_location || '—');
            const safeCurrency = escapeHtml(offer.currency || "KZT");
            const safeTruckType = escapeHtml(offer.truckType || 'Тип не указан');
            const safePickupDate = escapeHtml(offer.pickupDate || '---');
            const statusText =
                offer.status === "accepted" ? "Принято" :
                offer.status === "rejected" ? "Отклонено" :
                "Ожидает";

            const statusColor =
                offer.status === "accepted" ? "#22c55e" :
                offer.status === "rejected" ? "#ef4444" :
                "#38bdf8";
            const offerRoute = String(offer.from_location || '') + ' \u2192 ' + String(offer.to_location || '');
            const offerRevieweeName = offer.ownerName || offer.ownerCompany || '\u0413\u0440\u0443\u0437\u043e\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446';
            const offerReviewAction = getReviewActionMarkup({
                loadId: offer.loadId,
                revieweeId: offer.ownerId,
                revieweeName: offerRevieweeName,
                route: offerRoute,
                reviewGiven: offer.reviewGiven
            });

            const actionHtml = offer.status === "accepted"
    ? (
        offer.load_status === "completed"
            ? `
                <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                  <span style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      background: #64748b;
                      color: white;
                      padding:6px 12px;
                      border-radius:8px;
                      font-size:12px;
                      font-weight:700;
                  ">
                      \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e
                  </span>
                  ${offerReviewAction}
                </div>
              `
            : `
                <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                    <button onclick="openOffers(${offer.loadId})"
                        style="background: #22c55e; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">
                        Открыть
                    </button>
                    <button onclick="completeLoad(${offer.loadId})"
                        ${offer.carrierCompleted ? 'disabled' : ''}
                        style="background: #f59e0b; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:${offer.carrierCompleted ? 'default' : 'pointer'}; opacity:${offer.carrierCompleted ? '0.6' : '1'}; font-size:12px; font-weight:700;">
                        ${offer.carrierCompleted ? 'Подтверждено' : 'Подтвердить завершение'}
                    </button>
                    ${getCompletionStatusMarkup({
                        clientCompleted: offer.clientCompleted,
                        carrierCompleted: offer.carrierCompleted,
                        viewer: "carrier"
                    })}
                </div>
              `
      )
    : offer.status === "pending"
        ? `
            <button onclick="openOffers(${offer.loadId})"
                style="background: var(--neon-blue); color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                Открыть
            </button>
        `
        : `
            <button onclick="openOffers(${offer.loadId})"
                style="background: rgba(255,255,255,0.12); color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                Смотреть
            </button>
        `;

            return `
                <tr>
                    <td>
                        <div style="font-weight: 700; color: var(--neon-blue); display: flex; align-items: center; gap: 8px;">
                            ${safeFrom} <i class="fa-solid fa-arrow-right" style="font-size: 10px; opacity: 0.5;"></i> ${safeTo}
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 13px;">${offer.price ? Number(offer.price).toLocaleString("ru-RU") : "—"} ${safeCurrency}</div>
                        <div style="font-size: 11px; color: var(--muted);">${safeTruckType}</div>
                        <div style="margin-top:6px;">
                          <span style="
                            display:inline-flex;
                            align-items:center;
                            padding:4px 10px;
                            border-radius:999px;
                            font-size:11px;
                            font-weight:700;
                            color:white;
                            background:${statusColor};
                          ">
                            ${statusText}
                          </span>
                        </div>
                    </td>
                    <td style="font-size: 13px; color: var(--muted);">${safePickupDate}</td>
                    <td style="text-align: right; padding-right: 20px;">
                        ${actionHtml}
                    </td>
                </tr>
            `;
        });

        container.innerHTML = `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>МАРШРУТ</th>
                        <th>СТАВКА</th>
                        <th>ДАТА</th>
                        <th style="text-align: right; padding-right: 30px;">\u0414\u0415\u0419\u0421\u0422\u0412\u0418\u042f</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join("")}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error("Ошибка загрузки ставок:", err);
        container.innerHTML = `
            <div style="padding: 30px; text-align: center; color: #ef4444;">
                Не удалось загрузить ставки
            </div>
        `;
    }
}

async function deleteCargo(id) {
    if (!confirm("Удалить этот груз?")) return;
    try {
        const response = await fetch(`/api/loads/${id}`, { method: "DELETE" });
        if (response.ok) { loadMyCargo(); initProfile(); }
    } catch (err) { alert("Ошибка при удалении"); }
}

function trackCargo(id) {
    window.location.href = `/mape/map.html?trackId=${id}`;
}

function openOffers(loadId) {
  window.location.href = `offers.html?id=${loadId}`;
}

function getCompletionStatusMarkup({ clientCompleted, carrierCompleted, viewer }) {
    const clientDone = Boolean(clientCompleted);
    const carrierDone = Boolean(carrierCompleted);

    if (clientDone && carrierDone) {
        return `
            <span style="display:inline-flex; align-items:center; justify-content:center; background:#64748b; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                Сделка завершена
            </span>
        `;
    }

    if (viewer === "client") {
        if (clientDone) {
            return `
                <span style="display:inline-flex; align-items:center; justify-content:center; background:#1d4ed8; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                    Ждём подтверждение перевозчика
                </span>
            `;
        }

        if (carrierDone) {
            return `
                <span style="display:inline-flex; align-items:center; justify-content:center; background:#16a34a; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                    Перевозчик подтвердил
                </span>
            `;
        }
    }

    if (viewer === "carrier") {
        if (carrierDone) {
            return `
                <span style="display:inline-flex; align-items:center; justify-content:center; background:#1d4ed8; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                    Ждём подтверждение заказчика
                </span>
            `;
        }

        if (clientDone) {
            return `
                <span style="display:inline-flex; align-items:center; justify-content:center; background:#16a34a; color:white; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                    Заказчик подтвердил
                </span>
            `;
        }
    }

    return "";
}

async function completeLoad(loadId) {
    const ok = confirm("Подтвердить завершение груза со своей стороны?");
    if (!ok) return;

    try {
        const response = await fetch(`/api/loads/${loadId}/complete`, {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Не удалось завершить груз");

        if (data?.message) {
            alert(data.message);
        }

        const isCarrierPage = window.location.pathname.includes("carrier_profile.html");
        if (isCarrierPage) {
            loadMyOffers();
        } else {
            loadMyCargo();
        }
    } catch (err) {
        console.error("Ошибка завершения груза:", err);
        alert(err.message || "Не удалось завершить груз");
    }
}

// --- 4. PRIVATE PROFILE CHAT LOGIC ---
let embeddedSocket = null;
let embeddedActiveChat = null;
let embeddedCurrentUser = null;
let embeddedMessageIds = new Set();
let embeddedChatInitialized = false;

async function profileChatApi(path, options = {}) {
  let response;
  let data = {};

  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    data = await response.json().catch(() => ({}));
  } catch (err) {
    throw new Error('Network error: ' + path);
  }

  if (!response.ok) {
    const detail = data.error || data.message || response.statusText || 'Request error';
    throw new Error(detail + ' (' + response.status + ' ' + path + ')');
  }

  return data;
}

function formatEmbeddedChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getEmbeddedChatTitle(chat) {
  if (chat?.from_location && chat?.to_location) return `${chat.from_location} → ${chat.to_location}`;
  return chat?.name || 'Личный чат';
}

function getEmbeddedMessageId(message) {
  return `pm_${message?.id || `${message?.senderId}_${message?.createdAt}_${message?.text}`}`;
}

function normalizeEmbeddedMessagePayload(payload) {
  if (!payload) return null;
  const source = payload.message && typeof payload.message === 'object' ? payload.message : payload;
  const chatId = payload.chatId || source.chatId || source.chat_id;
  const text = typeof source.text === 'string' ? source.text : String(source.text || source.message || '');
  if (!text.trim()) return null;

  const rawDate = source.createdAt || source.created_at;
  const parsedDate = rawDate ? new Date(rawDate) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  return {
    ...source,
    chatId,
    senderId: source.senderId || source.sender_id,
    text,
    createdAt: safeDate.toISOString(),
    sender_name: source.sender_name || source.senderName || '',
  };
}

function renderEmbeddedMessage(message) {
  const box = document.getElementById('chat-messages');
  if (!box || !message) return;

  message = normalizeEmbeddedMessagePayload(message);
  if (!message) return;

  const messageId = getEmbeddedMessageId(message);
  if (embeddedMessageIds.has(messageId)) return;
  embeddedMessageIds.add(messageId);

  const isMe = embeddedCurrentUser && Number(message.senderId) === Number(embeddedCurrentUser.id);
  const name = message.sender_name || message.senderName || 'Пользователь';
  const initial = (name[0] || 'U').toUpperCase();
  const time = formatEmbeddedChatTime(message.createdAt);

  const node = document.createElement('div');
  node.className = `message ${isMe ? 'sent' : 'received'}`;
  node.innerHTML = `
    <span class="author">${escapeHtml(name)} ${time ? `<small>${escapeHtml(time)}</small>` : ''}</span>
    <div class="msg-wrapper">
      <div class="mini-avatar">${escapeHtml(initial)}</div>
      <div class="msg-content"><p>${escapeHtml(message.text || '')}</p></div>
    </div>
  `;
  box.appendChild(node);
  box.scrollTop = box.scrollHeight;
}

function renderEmbeddedMessages(messages) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  box.innerHTML = '';
  embeddedMessageIds = new Set();

  if (!Array.isArray(messages) || !messages.length) {
    box.innerHTML = '<div class="chat-empty">Сообщений пока нет. Напишите первым.</div>';
    return;
  }

  messages.forEach(renderEmbeddedMessage);
  box.scrollTop = box.scrollHeight;
}

function setEmbeddedActiveChatInList() {
  document.querySelectorAll('#pm-chat-list .chat-item').forEach((item) => {
    item.classList.toggle('active', String(item.dataset.chatId) === String(embeddedActiveChat?.id));
  });
}

function joinEmbeddedChatRoom() {
  if (!embeddedSocket || !embeddedActiveChat) return;
  embeddedSocket.emit('join_chat', String(embeddedActiveChat.id));
}

async function openEmbeddedPrivateChat(chat) {
  embeddedActiveChat = chat;
  setEmbeddedActiveChatInList();
  joinEmbeddedChatRoom();

  const title = document.getElementById('embedded-chat-title');
  const input = document.getElementById('chat-input');
  if (title) title.textContent = getEmbeddedChatTitle(chat);
  if (input) input.disabled = false;

  const data = await profileChatApi(`/api/chats/${encodeURIComponent(chat.id)}/messages`);
  renderEmbeddedMessages(data.messages || []);
}

function renderEmbeddedPrivateChats(chats) {
  const list = document.getElementById('pm-chat-list');
  if (!list) return;

  const privateChats = Array.isArray(chats)
    ? chats.filter((chat) => chat.type !== 'global' && String(chat.id) !== 'global')
    : [];

  if (!privateChats.length) {
    list.innerHTML = '<div class="chat-empty">Личных сообщений пока нет. Чат появится после принятия ставки.</div>';
    const box = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    if (box) box.innerHTML = '<div class="chat-empty">Здесь будут только личные сообщения по грузам.</div>';
    if (input) input.disabled = true;
    return;
  }

  list.innerHTML = '';
  privateChats.forEach((chat) => {
    const title = getEmbeddedChatTitle(chat);
    const subtitle = chat.last_message || chat.name || 'Личный чат по грузу';
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.dataset.chatId = String(chat.id);
    item.innerHTML = `
      <div class="avatar">${escapeHtml((title[0] || 'C').toUpperCase())}</div>
      <div class="chat-info">
        <span class="chat-name">${escapeHtml(title)}</span>
        <div class="chat-last">${escapeHtml(subtitle || '')}</div>
      </div>
    `;
    item.addEventListener('click', () => openEmbeddedPrivateChat(chat));
    list.appendChild(item);
  });

  const chatIdFromUrl = new URLSearchParams(window.location.search).get('chat');
  const initial = chatIdFromUrl
    ? privateChats.find((chat) => String(chat.id) === String(chatIdFromUrl))
    : privateChats[0];
  if (initial) openEmbeddedPrivateChat(initial).catch(console.error);
}

async function loadEmbeddedPrivateChats() {
  try {
    const chats = await profileChatApi('/api/chats');
    renderEmbeddedPrivateChats(chats);
  } catch (err) {
    console.error('profile chat list error:', err);
    const list = document.getElementById('pm-chat-list');
    const box = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const text = escapeHtml(err.message || 'Cannot load chats');
    if (list) list.innerHTML = '<div class="chat-empty">' + text + '</div>';
    if (box) box.innerHTML = '<div class="chat-empty">' + text + '</div>';
    if (input) input.disabled = true;
  }
}

async function sendEmbeddedPrivateMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text || !embeddedActiveChat) return;

  input.disabled = true;
  try {
    const message = await profileChatApi(`/api/chats/${encodeURIComponent(embeddedActiveChat.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    renderEmbeddedMessage(message);
    input.value = '';
    await loadEmbeddedPrivateChats();
    setEmbeddedActiveChatInList();
  } catch (err) {
    alert(err.message || 'Не удалось отправить сообщение');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function setupEmbeddedSocket() {
  if (embeddedSocket || typeof io !== 'function') return;
  embeddedSocket = io({ withCredentials: true });

  embeddedSocket.on('connect', () => {
    const status = document.getElementById('user-count');
    if (status) status.textContent = 'Личные сообщения';
    joinEmbeddedChatRoom();
  });

  embeddedSocket.on('disconnect', () => {
    const status = document.getElementById('user-count');
    if (status) status.textContent = 'Нет соединения';
  });

  embeddedSocket.on('new_message', (payload) => {
    if (!embeddedActiveChat) return;
    const message = normalizeEmbeddedMessagePayload(payload);
    if (!message) return;
    const incomingChatId = payload?.chatId || message.chatId || message.chat_id;
    if (String(incomingChatId) === String(embeddedActiveChat.id)) renderEmbeddedMessage(message);
    loadEmbeddedPrivateChats().catch(() => {});
  });
}

async function initEmbeddedChat() {
  try {
    embeddedCurrentUser = await profileChatApi('/api/me');
    CURRENT_USER_NAME = embeddedCurrentUser?.name || 'Пользователь';
  } catch (err) {
    console.error('profile chat auth error:', err);
    return;
  }

  setupEmbeddedSocket();
  const form = document.getElementById('chat-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', sendEmbeddedPrivateMessage);
  }

  if (!embeddedChatInitialized) {
    embeddedChatInitialized = true;
    await loadEmbeddedPrivateChats();
  } else {
    await loadEmbeddedPrivateChats();
  }
}
// --- 5. TABS & MODALS ---

function switchTab(tabName) {
    document.querySelectorAll('.profile-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.profile-nav a, .nav-icon').forEach(el => el.classList.remove('active'));

    const target = document.getElementById('tab-' + tabName);
    if (target) target.style.display = 'block';



    const btn = document.querySelector(`[onclick*="switchTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');

    // Специфическая загрузка
   if (tabName === 'balance') {
      refreshWallet().catch((err) => console.error('wallet refresh error:', err));
   }

   if (tabName === 'messages') {
  const slot = document.getElementById('chat-container-slot');
  if (slot) {
    const hasCurrentPrivateTemplate = slot.querySelector('#pm-chat-list');
    const chatSlotText = String(slot.textContent || '').toLowerCase();
    const hasOldGlobalTemplate = chatSlotText.includes('global') || chatSlotText.includes('\u0433\u043b\u043e\u0431\u0430\u043b') || slot.querySelector('[data-chat-id="global"]');
    if (!hasCurrentPrivateTemplate || hasOldGlobalTemplate) {
      slot.innerHTML = CHAT_TEMPLATE;
      embeddedActiveChat = null;
      embeddedChatInitialized = false;
      embeddedMessageIds = new Set();
    }
    initEmbeddedChat();
  }
}


}

// \u041f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u0431\u0430\u043b\u0430\u043d\u0441\u0430 \u0447\u0435\u0440\u0435\u0437 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e
function openDepositModal() {
    const form = document.getElementById('topup-form');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('File read error'));
        reader.readAsDataURL(file);
    });
}

async function handleFileUpload(input, docType) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    const normalizedType = docType === 'generic' ? 'registration_certificate' : docType;
    const uploadable = normalizedType === 'registration_certificate';

    updateVerificationDocCard(docType, file.name);

    if (!uploadable) return;

    const msg = document.getElementById('docsUploadMsg');
    if (msg) msg.textContent = '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440...';

    try {
        const dataUrl = await readFileAsDataUrl(file);
        const response = await fetch('/api/profile-document', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kind: 'registration_certificate',
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                data: dataUrl
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b');

        if (msg) msg.textContent = '\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d: ' + (data.fileName || file.name);
    } catch (err) {
        console.error('Profile document upload error:', err);
        if (msg) msg.textContent = '\u041e\u0448\u0438\u0431\u043a\u0430: ' + (err.message || '\u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c');
    } finally {
        input.value = '';
    }
}

// --- 6. DOM READY ---

let profileBootstrapStarted = false;

async function bootstrapProfilePage() {
    if (profileBootstrapStarted) return;
    profileBootstrapStarted = true;

    switchTab('personal');

    try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
            window.location.href = "login.html";
            return;
        }

        const me = await meRes.json();
        const isCarrierPage = window.location.pathname.includes("carrier_profile.html");

        if (isProfileCarrierUser(me) && !isCarrierPage) {
            window.location.href = "/carrier_profile.html";
            return;
        }

        if (!isProfileCarrierUser(me) && isCarrierPage) {
            window.location.href = "/profile.html";
            return;
        }

        console.log("Доступ разрешен");
await initProfile(me);

if (isCarrierPage) {
    const titleEl = document.getElementById("loads-section-title");
    if (titleEl) titleEl.textContent = "Мои ставки";

    const favSection = document.getElementById("favorites-section");
    if (favSection) favSection.style.display = "none";

    loadMyOffers();
} else {
    loadMyCargo();
}


    } catch (e) {
        console.error("Ошибка проверки сессии:", e);
        const nameHeader = document.getElementById("user-name-header");
        const nameDisplay = document.getElementById("user-name-display");
        const roleDisplay = document.getElementById("user-role-display");
        const cargoBox = document.getElementById("my-cargo-list");
        const favoritesBox = document.getElementById("favorites-list");

        if (nameHeader) nameHeader.textContent = "ошибка загрузки";
        if (nameDisplay) nameDisplay.textContent = "Ошибка";
        if (roleDisplay) roleDisplay.textContent = "Не удалось загрузить";
        if (cargoBox) {
            cargoBox.innerHTML = `<p style="padding:20px;color:#fca5a5;">Не удалось загрузить профиль. Проверь сервер и сессию.</p>`;
        }
        if (favoritesBox) {
            favoritesBox.innerHTML = `<p style="padding:20px;color:#fca5a5;">\u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435 \u043d\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e, \u043f\u043e\u043a\u0430 \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043b\u0441\u044f \u043f\u0440\u043e\u0444\u0438\u043b\u044c.</p>`;
        }
        return;
    }

    // --- Логика кнопок (оставляем снаружи) ---
    const addStaffBtn = document.querySelector("#tab-staff .btn-save");
    const staffModal = document.getElementById("modal-add-staff");
    const closeModal = document.getElementById("close-modal");

    if (addStaffBtn && staffModal) addStaffBtn.onclick = () => staffModal.style.display = "flex";
    if (closeModal) closeModal.onclick = () => staffModal.style.display = "none";

   const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.onclick = async (e) => {
          e.preventDefault();
          try {
              await fetch("/api/logout", { method: "POST", credentials: "include" });
              window.location.href = "login.html";
          } catch (err) {
              console.error("Ошибка при выходе:", err);
              window.location.href = "login.html";
          }
      };
}
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapProfilePage);
} else {
    bootstrapProfilePage();
}

function switchChatRoom(roomType) {
    // 1. Скрываем все окна чатов
    document.querySelectorAll('.chat-room').forEach(room => {
        room.style.display = 'none';
    });

    // 2. Снимаем активный класс со всех иконок
    document.querySelectorAll('.chat-nav-item').forEach(nav => {
        nav.style.color = '#475569';
    });

    // 3. Показываем нужное окно
    const selectedRoom = document.getElementById(`room-${roomType}`);
    if (selectedRoom) {
        selectedRoom.style.display = 'flex';
    }

    // 4. Подсвечиваем иконку
    const selectedNav = document.getElementById(`nav-${roomType}`);
    if (selectedNav) {
        selectedNav.style.color = '#6366f1';
    }
    
    console.log(`Переключено на режим: ${roomType}`);
}

function getFavKey() {
  // берём user из /api/me (он же сохраняется/может сохраняться в localStorage)
  const u = localStorage.getItem('user');
  if (u) {
    try {
      const user = JSON.parse(u);
      return `favorites_${user.id || user.userId || user.email || user.name || 'anon'}`;
    } catch {}
  }
  return 'favorites_anon';
}

function readFavorites() {
  try { return JSON.parse(localStorage.getItem(getFavKey())) || []; }
  catch { return []; }
}

async function loadFavorites() {
  const box = document.getElementById('favorites-list');
  if (!box) return;

  const favs = readFavorites();
  if (!favs.length) {
    box.innerHTML = `<p style="padding: 20px; color: var(--muted);">Пока пусто. Добавь груз в избранное — он появится здесь.</p>`;
    return;
  }

  box.innerHTML = `<p style="padding: 20px; color: var(--muted);">Загрузка избранного...</p>`;

  // грузим каждый id через API и рисуем список
  const items = [];
  for (const id of favs) {
    try {
      const r = await fetch(`/api/loads/${id}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok && d && !d.error) items.push(d);
    } catch {}
  }

  if (!items.length) {
    box.innerHTML = `<p style="padding: 20px; color: var(--muted);">Не удалось загрузить избранное (API недоступен или грузы удалены).</p>`;
    return;
  }

  box.innerHTML = `
    <div style="display:flex; flex-direction:column;">
      ${items.map(d => `
        <a href="page2/card.html?id=${encodeURIComponent(d.id)}" style="text-decoration:none; color:inherit;">
          <div style="padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; gap:16px;">
            <div>
              <div style="font-weight:800;">${escapeHtml(d.from_location)} → ${escapeHtml(d.to_location)}</div>
              <div style="font-size:12px; color: var(--muted); margin-top:4px;">
                ${escapeHtml(d.type || '—')} • ${escapeHtml(d.weight || '0')} т • ${escapeHtml(d.date || '—')}
              </div>
            </div>
            <div style="font-weight:800; color:#f59e0b; white-space:nowrap;">
              в…
            </div>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}



function bindTopupForm() {
  document.getElementById('topup-form')?.addEventListener('submit', submitTopupRequest);
  document.getElementById('withdraw-form')?.addEventListener('submit', submitWithdrawRequest);
  document.getElementById('devnet-sol-withdraw-form')?.addEventListener('submit', submitDevnetSolWithdrawRequest);
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bindTopupForm);
} else {
  bindTopupForm();
}

