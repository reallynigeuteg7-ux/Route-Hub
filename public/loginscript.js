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
let emailCodeSentTo = '';

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
  const phone = normalizePhone(document.getElementById('reg-phone').value);
  const emailCode = emailCodeInput.value.trim();

  if (!name || !email || !phone || !password) {
    msg.textContent = '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0438\u043c\u044f, email, \u0442\u0435\u043b\u0435\u0444\u043e\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c';
    return;
  }

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    msg.textContent = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430';
    return;
  }

  try {
    registerButton.disabled = true;

    if (emailCodeSentTo !== email || !emailCode) {
      msg.textContent = '\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u043a\u043e\u0434 \u043d\u0430 email...';
      const codeRes = await fetch('/api/register/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });
      const codeJson = await codeRes.json().catch(() => ({}));

      if (!codeRes.ok) {
        msg.textContent = codeJson.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043a\u043e\u0434';
        return;
      }

      emailCodeSentTo = email;
      emailCodeInput.style.display = '';
      emailCodeInput.required = true;
      emailCodeInput.focus();
      registerButton.textContent = '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e';
      msg.textContent = '\u041a\u043e\u0434 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d \u043d\u0430 email. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0435\u0433\u043e \u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.';
      return;
    }

    msg.textContent = '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f...';
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, phone, emailCode }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const meRes = await fetch('/api/me', { credentials: 'include' });
      const me = await meRes.json();
      redirectByRole(me.role);
      return;
    }

    msg.textContent = json.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438';
  } catch (err) {
    console.error('Register error:', err);
    msg.textContent = '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u043c';
  } finally {
    registerButton.disabled = false;
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