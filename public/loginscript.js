// 1. Инициализация Firebase (Compat version)
const firebaseConfig = {
  apiKey: "AIzaSyCC1h97K_Q_IW8S5rvoCVZbnSGDNDrEKqU",
  authDomain: "routehub-auth.firebaseapp.com",
  projectId: "routehub-auth",
  storageBucket: "routehub-auth.firebasestorage.app",
  messagingSenderId: "900321120973",
  appId: "1:900321120973:web:4fd1b7bc0e1699ed3b0f84"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
auth.languageCode = 'ru';

// Функция для безопасной инициализации капчи
function initRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'invisible',
            'callback': (response) => {
                console.log("Капча готова");
            }
        });
    }
}

// Запускаем при загрузке страницы
window.onload = initRecaptcha;
let confirmationResult;

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggle = document.getElementById('toggle-register');
const msg = document.getElementById('msg');

// Переключение форм
toggle.addEventListener('click', e => {
  e.preventDefault();
  if (loginForm.style.display === 'none') {
    loginForm.style.display = '';
    registerForm.style.display = 'none';
    document.getElementById('card-title').textContent = 'Вход в аккаунт';
    toggle.textContent = 'Нет аккаунта? Регистрация';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = '';
    document.getElementById('card-title').textContent = 'Регистрация';
    toggle.textContent = 'Уже есть аккаунт? Войти';
  }
  msg.textContent = '';
});

// --- ЛОГИКА РЕГИСТРАЦИИ (SMS -> СЕРВЕР) ---

// Элементы модалки
const otpModal = document.getElementById('otp-modal');
const otpInput = document.getElementById('otp-code');
const btnVerify = document.getElementById('btn-verify');
const btnCancel = document.getElementById('btn-cancel');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Отправка SMS...';
  
  initRecaptcha();
  
  const phoneNumber = document.getElementById('reg-phone').value;
  const cleanPhone = phoneNumber.replace(/\s+/g, ''); 
  const appVerifier = window.recaptchaVerifier;

  try {
    confirmationResult = await auth.signInWithPhoneNumber(cleanPhone, appVerifier);
    
    // ВМЕСТО prompt показываем модалку
    otpModal.style.display = 'flex';
    msg.textContent = 'Код отправлен!';
  } catch (error) {
    console.error("ОШИБКА:", error);
    msg.textContent = "Ошибка: " + error.message;
  }
});

// Кнопка "Подтвердить" в модалке
btnVerify.addEventListener('click', async () => {
  const code = otpInput.value;
  if (code.length < 6) return alert("Введите 6 цифр");

  try {
    await confirmationResult.confirm(code);
    otpModal.style.display = 'none'; // Скрываем окно
    completeRegistration(); // Завершаем регу в базе
  } catch (error) {
    alert("Неверный код!");
  }
});

// Кнопка "Отмена"
btnCancel.addEventListener('click', () => {
  otpModal.style.display = 'none';
  msg.textContent = 'Регистрация отменена';
});

async function completeRegistration() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value; 
  const phone = document.getElementById('reg-phone').value;

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role, phone }) 
  });

  const json = await res.json();
  if (res.ok) {
    window.location.href = '/profile.html';
  } else {
    msg.textContent = json.error || 'Ошибка сохранения в базу';
  }
}

// --- ЛОГИКА ВХОДА ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const json = await res.json();
  if (res.ok) {
    window.location.href =  'profile.html';
  } else {
    msg.textContent = json.error || 'Ошибка входа';
  }
});