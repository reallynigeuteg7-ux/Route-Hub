function normalizeUserRole(role) {
  const raw = String(role || '').trim().toLowerCase();

  if (
    raw === 'carrier' ||
    raw === 'driver' ||
    raw === 'transport' ||
    raw === 'transporter' ||
    raw.includes('\u043f\u0435\u0440\u0435\u0432\u043e\u0437') ||
    raw.includes('\u0432\u043e\u0434\u0438\u0442\u0435\u043b')
  ) {
    return 'carrier';
  }

  return 'client';
}

function redirectByRole(role) {
  if (normalizeUserRole(role) === 'carrier') {
    window.location.href = '/carrier_profile.html';
    return;
  }

  window.location.href = '/profile.html';
}

function normalizePhone(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '+7' + digits.slice(1);
  if (digits.length === 11 && digits.startsWith('7')) return '+' + digits;
  return digits ? '+' + digits : '';
}

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggle = document.getElementById('toggle-register');
const msg = document.getElementById('msg');
const emailCodeInput = document.getElementById('reg-email-code');
const registerButton = document.getElementById('reg-submit');
const emailCodeModal = document.getElementById('email-code-modal');
const emailCodeForm = document.getElementById('email-code-form');
const codeEmail = document.getElementById('code-email');
const codeMsg = document.getElementById('code-msg');
const codeConfirmButton = document.getElementById('code-confirm');
const codeResendButton = document.getElementById('code-resend');
const codeModalClose = document.getElementById('code-modal-close');
const codeModalBackdrop = document.getElementById('code-modal-backdrop');
let emailCodeSentTo = '';
let pendingRegistration = null;
let resendTimer = null;

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function setCodeMessage(text, success = false) {
  codeMsg.textContent = text;
  codeMsg.classList.toggle('is-success', success);
}

function openEmailCodeModal(email, clearCode = true) {
  codeEmail.textContent = email;
  emailCodeModal.hidden = false;
  document.body.classList.add('modal-open');
  if (clearCode) emailCodeInput.value = '';
  setCodeMessage('');
  window.setTimeout(() => emailCodeInput.focus(), 50);
}

function closeEmailCodeModal() {
  emailCodeModal.hidden = true;
  document.body.classList.remove('modal-open');
  registerButton.focus();
}

function startResendCooldown(seconds = 30) {
  if (resendTimer) window.clearInterval(resendTimer);
  let remaining = seconds;
  codeResendButton.disabled = true;
  codeResendButton.textContent = `Отправить повторно через ${remaining} сек.`;

  resendTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(resendTimer);
      resendTimer = null;
      codeResendButton.disabled = false;
      codeResendButton.textContent = 'Отправить код повторно';
      return;
    }
    codeResendButton.textContent = `Отправить повторно через ${remaining} сек.`;
  }, 1000);
}

async function sendRegistrationCode(registration, isResend = false) {
  const targetButton = isResend ? codeResendButton : registerButton;
  let sent = false;
  targetButton.disabled = true;
  if (isResend) setCodeMessage('Отправляем новый код...');
  else msg.textContent = 'Отправляем код на email...';

  try {
    const codeRes = await fetchWithTimeout('/api/register/email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registration.email, phone: registration.phone }),
    });
    const codeJson = await codeRes.json().catch(() => ({}));

    if (!codeRes.ok) {
      const errorText = codeJson.error || 'Не удалось отправить код';
      if (isResend) setCodeMessage(errorText);
      else msg.textContent = errorText;
      return false;
    }

    emailCodeSentTo = registration.email;
    pendingRegistration = registration;
    sent = true;
    if (!isResend) openEmailCodeModal(registration.email);
    else setCodeMessage('Новый код отправлен', true);
    msg.textContent = '';
    startResendCooldown();
    return true;
  } catch (err) {
    const errorText = err?.name === 'AbortError'
      ? 'Сервер не ответил. Попробуйте ещё раз.'
      : 'Ошибка соединения с сервером';
    if (isResend) setCodeMessage(errorText);
    else msg.textContent = errorText;
    return false;
  } finally {
    if (!isResend || !sent) {
      targetButton.disabled = false;
      if (isResend && !sent) targetButton.textContent = 'Отправить код повторно';
    }
  }
}

codeModalClose.addEventListener('click', closeEmailCodeModal);
codeModalBackdrop.addEventListener('click', closeEmailCodeModal);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !emailCodeModal.hidden) closeEmailCodeModal();
});

emailCodeInput.addEventListener('input', () => {
  emailCodeInput.value = emailCodeInput.value.replace(/\D/g, '').slice(0, 6);
  setCodeMessage('');
});

codeResendButton.addEventListener('click', async () => {
  if (!pendingRegistration) return;
  await sendRegistrationCode(pendingRegistration, true);
});

toggle.addEventListener('click', (e) => {
  e.preventDefault();
  if (loginForm.style.display === 'none') {
    loginForm.style.display = '';
    registerForm.style.display = 'none';
    document.getElementById('card-title').textContent = '\u0412\u0445\u043e\u0434 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442';
    toggle.textContent = '\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430? \u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = '';
    document.getElementById('card-title').textContent = '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f';
    toggle.textContent = '\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442? \u0412\u043e\u0439\u0442\u0438';
  }
  msg.textContent = '';
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const person_type = document.getElementById('reg-person-type').value;
  const phone = normalizePhone(document.getElementById('reg-phone').value);

  if (!name || !email || !phone || !password) {
    msg.textContent = '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0438\u043c\u044f, email, \u0442\u0435\u043b\u0435\u0444\u043e\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c';
    return;
  }

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    msg.textContent = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430';
    return;
  }

  pendingRegistration = { name, email, password, role, phone, person_type };

  if (emailCodeSentTo === email) {
    openEmailCodeModal(email, false);
    return;
  }

  await sendRegistrationCode(pendingRegistration);
});

emailCodeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailCode = emailCodeInput.value.trim();

  if (!pendingRegistration) {
    closeEmailCodeModal();
    msg.textContent = 'Заполните форму регистрации ещё раз';
    return;
  }

  if (!/^\d{6}$/.test(emailCode)) {
    setCodeMessage('Введите все 6 цифр кода');
    emailCodeInput.focus();
    return;
  }

  codeConfirmButton.disabled = true;
  setCodeMessage('Проверяем код...');

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...pendingRegistration, emailCode }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setCodeMessage(json.error || 'Неверный или просроченный код');
      emailCodeInput.select();
      return;
    }

    setCodeMessage('Email подтверждён. Открываем профиль...', true);
    const meRes = await fetch('/api/me', { credentials: 'include' });
    if (!meRes.ok) throw new Error('Сессия регистрации не сохранилась');
    const me = await meRes.json();
    redirectByRole(me.role);
  } catch (err) {
    console.error('Register confirm error:', err);
    setCodeMessage('Ошибка соединения с сервером');
  } finally {
    codeConfirmButton.disabled = false;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '\u0412\u0445\u043e\u0434...';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const meRes = await fetch('/api/me', { credentials: 'include' });
      const me = await meRes.json();
      redirectByRole(me.role);
    } else {
      msg.textContent = json.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0445\u043e\u0434\u0430';
    }
  } catch (err) {
    console.error('Login error:', err);
    msg.textContent = '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u043c';
  }
});
