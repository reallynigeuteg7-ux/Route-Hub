import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';
import { startPersistentLocationTracking } from '../lib/background-location';

type PendingRegistration = {
  name: string;
  email: string;
  password: string;
  phone: string;
  company: string;
  role: 'client' | 'carrier';
  person_type: 'too' | 'ip' | 'self_employed';
};

const firebaseConfig = {
  apiKey: 'AIzaSyCC1h97K_Q_IW8S5rvoCVZbnSGDNDrEKqU',
  authDomain: 'routehub-auth.firebaseapp.com',
  projectId: 'routehub-auth',
  storageBucket: 'routehub-auth.firebasestorage.app',
  messagingSenderId: '900321120973',
  appId: '1:900321120973:web:4fd1b7bc0e1699ed3b0f84',
};

function normalizePhoneForFirebase(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '+7' + digits.slice(1);
  if (digits.length === 11 && digits.startsWith('7')) return '+' + digits;
  return digits ? '+' + digits : '';
}

function buildPhoneVerificationHtml(phone: string) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #101826; color: #f8fafc; padding: 18px; }
    h1 { font-size: 21px; margin: 0 0 8px; font-weight: 900; }
    p { color: #94a3b8; font-size: 14px; line-height: 20px; margin: 0 0 14px; }
    .phone { color: #38bdf8; font-weight: 900; margin-bottom: 14px; }
    #recaptcha-container { min-height: 1px; }
    input { width: 100%; height: 54px; border: 1px solid #243244; border-radius: 16px; padding: 0 14px; font-size: 22px; font-weight: 900; text-align: center; letter-spacing: 4px; color: #f8fafc; background: #172132; outline: none; margin: 12px 0; }
    button { width: 100%; border: 0; border-radius: 16px; padding: 15px 16px; font-size: 15px; font-weight: 900; color: #ffffff; background: #2f80ed; margin-top: 10px; }
    button.secondary { color: #f8fafc; background: #172132; border: 1px solid #243244; }
    button:disabled { opacity: 0.6; }
    .msg { min-height: 20px; color: #94a3b8; font-size: 13px; margin-top: 10px; line-height: 18px; }
    .error { color: #fb7185; }
    .ok { color: #22c55e; }
  </style>
</head>
<body>
  <h1>\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430</h1>
  <p>Firebase \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442 SMS-\u043a\u043e\u0434 \u043d\u0430 \u043d\u043e\u043c\u0435\u0440:</p>
  <div class="phone">${phone}</div>
  <div id="recaptcha-container"></div>
  <button id="sendBtn" type="button">\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c SMS</button>
  <input id="codeInput" inputmode="numeric" maxlength="6" placeholder="\u041a\u043e\u0434" />
  <button id="verifyBtn" type="button">\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c</button>
  <div id="msg" class="msg"></div>

  <script>
    const firebaseConfig = ${JSON.stringify(firebaseConfig)};
    const phone = ${JSON.stringify(phone)};
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    auth.languageCode = 'ru';
    let confirmationResult = null;
    let recaptchaVerifier = null;
    const msg = document.getElementById('msg');
    const sendBtn = document.getElementById('sendBtn');
    const verifyBtn = document.getElementById('verifyBtn');
    const codeInput = document.getElementById('codeInput');
    function post(payload) { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); }
    function setMsg(text, kind) { msg.textContent = text || ''; msg.className = 'msg ' + (kind || ''); }
    function getRecaptcha() {
      if (!recaptchaVerifier) {
        recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
      }
      return recaptchaVerifier;
    }
    sendBtn.addEventListener('click', async () => {
      try {
        sendBtn.disabled = true;
        setMsg('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c SMS...', '');
        confirmationResult = await auth.signInWithPhoneNumber(phone, getRecaptcha());
        setMsg('\u041a\u043e\u0434 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 6 \u0446\u0438\u0444\u0440.', 'ok');
        post({ type: 'sms_sent' });
        codeInput.focus();
      } catch (error) {
        console.error(error);
        sendBtn.disabled = false;
        setMsg(error.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c SMS', 'error');
        post({ type: 'error', message: error.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c SMS' });
        try { recaptchaVerifier && recaptchaVerifier.clear(); } catch (e) {}
        recaptchaVerifier = null;
      }
    });
    verifyBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim();
      if (!confirmationResult) { setMsg('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 SMS.', 'error'); return; }
      if (code.length < 6) { setMsg('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 6 \u0446\u0438\u0444\u0440.', 'error'); return; }
      try {
        verifyBtn.disabled = true;
        setMsg('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u043a\u043e\u0434...', '');
        const result = await confirmationResult.confirm(code);
        const idToken = await result.user.getIdToken();
        post({ type: 'verified', phone, idToken });
      } catch (error) {
        console.error(error);
        verifyBtn.disabled = false;
        setMsg('\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043a\u043e\u0434 \u0438\u043b\u0438 \u0441\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0438\u0441\u0442\u0435\u043a.', 'error');
      }
    });
  </script>
</body>
</html>`;

}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function openLegalUrl(path: '/terms.html' | '/privacy.html') {
  void Linking.openURL(API_BASE_URL + path).catch(() => {
    Alert.alert('Ошибка', 'Не удалось открыть документ');
  });
}
export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedRole, setSelectedRole] = useState<'shipper' | 'carrier' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [personType, setPersonType] = useState<'too' | 'ip' | 'self_employed'>('self_employed');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  const phoneVerificationHtml = useMemo(
    () => buildPhoneVerificationHtml(pendingRegistration?.phone || '+77000000000'),
    [pendingRegistration?.phone]
  );

  const completeRegistration = async (pendingRegistration: PendingRegistration, firebaseIdToken: string) => {
    try {
      setLoading(true);

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/mobile/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingRegistration, firebaseIdToken }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка регистрации', data?.error || 'Не удалось зарегистрироваться');
        return;
      }

      setVerificationVisible(false);
      setPendingRegistration(null);

      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));
      void startPersistentLocationTracking().catch((error) => {
        console.log('Start location tracking after register error:', error);
      });
      router.replace('/(tabs)');
    } catch (error) {
      console.log('Register error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Заполни имя, email, телефон и пароль');
      return;
    }

    const normalizedPhone = normalizePhoneForFirebase(phone);
    if (normalizedPhone.replace(/\D/g, '').length < 10) {
      Alert.alert('Ошибка', 'Введи корректный номер телефона');
      return;
    }

    if (!selectedRole) {
      Alert.alert('Ошибка', 'Выбери роль');
      return;
    }

    if (password !== repeatPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    const nextRegistration: PendingRegistration = {
      name: name.trim(),
      email: email.trim(),
      password,
      phone: normalizedPhone,
      company: company.trim(),
      role: selectedRole === 'shipper' ? 'client' : 'carrier',
      person_type: personType,
    };

    try {
      setLoading(true);
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/mobile/register/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nextRegistration.email, phone: nextRegistration.phone }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setLoading(false);
        Alert.alert('Ошибка регистрации', data?.error || 'Проверь email и телефон');
        return;
      }
    } catch (error) {
      console.log('Register check error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
      setLoading(false);
      return;
    }
    setPendingRegistration(nextRegistration);
    setVerificationVisible(true);
    setLoading(false);
  };

  const handleVerificationMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type === 'verified' && payload.idToken && pendingRegistration) {
        void completeRegistration(pendingRegistration, payload.idToken);
      }
      if (payload?.type === 'error' && payload.message) {
        console.log('Firebase phone error:', payload.message);
      }
    } catch (error) {
      console.log('Phone verification message error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback('/')} activeOpacity={0.8}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Создать аккаунт</Text>
          <Text style={styles.subtitle}>
            {`Зарегистрируйся в RouteHub, чтобы размещать грузы, отправлять ставки и управлять перевозками.`}
          </Text>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Text style={styles.label}>Имя</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Ваше имя" placeholderTextColor={colors.mutedText} style={styles.input} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Телефон</Text>
              <TextInput value={phone} onChangeText={setPhone} placeholder="+7 777 123 45 67" placeholderTextColor={colors.mutedText} style={styles.input} keyboardType="phone-pad" />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Email</Text>
              <TextInput value={email} onChangeText={setEmail} placeholder="Введите email" placeholderTextColor={colors.mutedText} style={styles.input} keyboardType="email-address" autoCapitalize="none" />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>{`Имя / название ТОО, ИП или самозанятого`}</Text>
              <TextInput value={company} onChangeText={setCompany} placeholder={"Введите имя или название"} placeholderTextColor={colors.mutedText} style={styles.input} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Тип профиля</Text>
              <View style={styles.profileTypeRow}>
                <TouchableOpacity style={[styles.profileTypeCard, styles.profileTypeShort, personType === 'too' && styles.roleCardActive]} activeOpacity={0.85} onPress={() => setPersonType('too')}>
                  <Text style={styles.profileTypeText}>ТОО</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.profileTypeCard, styles.profileTypeLong, personType === 'self_employed' && styles.roleCardActive]} activeOpacity={0.85} onPress={() => setPersonType('self_employed')}>
                  <Text style={styles.profileTypeText}>Самозанятый</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.profileTypeCard, styles.profileTypeShort, personType === 'ip' && styles.roleCardActive]} activeOpacity={0.85} onPress={() => setPersonType('ip')}>
                  <Text style={styles.profileTypeText}>ИП</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput value={password} onChangeText={setPassword} placeholder="Придумайте пароль" placeholderTextColor={colors.mutedText} secureTextEntry style={styles.input} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Повторите пароль</Text>
              <TextInput value={repeatPassword} onChangeText={setRepeatPassword} placeholder="Повторите пароль" placeholderTextColor={colors.mutedText} secureTextEntry style={styles.input} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Выберите роль</Text>
              <TouchableOpacity style={[styles.roleCard, selectedRole === 'shipper' && styles.roleCardActive]} activeOpacity={0.85} onPress={() => setSelectedRole('shipper')}>
                <Text style={styles.roleTitle}>Грузовладелец</Text>
                <Text style={styles.roleText}>Размещает грузы и выбирает перевозчиков</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleCard, selectedRole === 'carrier' && styles.roleCardActive]} activeOpacity={0.85} onPress={() => setSelectedRole('carrier')}>
                <Text style={styles.roleTitle}>Перевозчик</Text>
                <Text style={styles.roleText}>Ищет грузы, отправляет ставки и берет заказы</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.legalBox}>
              <Text style={styles.legalText}>Регистрируясь, вы принимаете </Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => openLegalUrl('/terms.html')}>
                <Text style={styles.legalLink}>условия использования</Text>
              </TouchableOpacity>
              <Text style={styles.legalText}> и </Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => openLegalUrl('/privacy.html')}>
                <Text style={styles.legalLink}>политику конфиденциальности</Text>
              </TouchableOpacity>
              <Text style={styles.legalText}>.</Text>
            </View>
            <TouchableOpacity style={[styles.registerButton, loading && styles.disabledButton]} activeOpacity={0.85} onPress={handleRegister} disabled={loading}>
              <Text style={styles.registerButtonText}>{loading ? 'Регистрация...' : 'Подтвердить телефон'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginButton} activeOpacity={0.85} onPress={() => router.push('/login')}>
              <Text style={styles.loginButtonText}>У меня уже есть аккаунт</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={verificationVisible} animationType="slide" transparent onRequestClose={() => setVerificationVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{'\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430'}</Text>
              <TouchableOpacity onPress={() => setVerificationVisible(false)} activeOpacity={0.8}>
                <Text style={styles.modalClose}>{'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}</Text>
              </TouchableOpacity>
            </View>
            <WebView
              originWhitelist={['*']}
              source={{ html: phoneVerificationHtml, baseUrl: 'https://routehub-auth.firebaseapp.com' }}
              javaScriptEnabled
              domStorageEnabled
              onMessage={handleVerificationMessage}
              style={styles.webView}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 30,
      backgroundColor: colors.background,
    },
    back: {
      color: colors.primarySoft,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 24,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: '900',
      marginBottom: 10,
    },
    subtitle: {
      color: colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 30,
    },
    form: {
      gap: 14,
    },
    inputWrap: {
      marginBottom: 2,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: colors.text,
      fontSize: 15,
    },
    profileTypeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    profileTypeCard: {
      minHeight: 52,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileTypeShort: {
      flex: 0.78,
    },
    profileTypeLong: {
      flex: 1.44,
    },
    profileTypeText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
    },
    roleCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 20,
      marginBottom: 10,
    },
    roleCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    roleTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
    },
    roleText: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
    },
    legalBox: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      paddingHorizontal: 4,
    },
    legalText: {
      color: colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    legalLink: {
      color: colors.primarySoft,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '900',
      textDecorationLine: 'underline',
    },    registerButton: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingVertical: 17,
      alignItems: 'center',
      marginTop: 14,
    },
    disabledButton: {
      opacity: 0.65,
    },
    registerButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    loginButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginTop: 2,
    },
    loginButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 22,
    },
    modalCard: {
      height: '78%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '900',
    },
    modalHeader: {
      minHeight: 58,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalClose: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    webView: {
      flex: 1,
      backgroundColor: colors.surface,
    },
  });
}

