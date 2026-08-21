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
import { API_BASE_URL, PRIVACY_POLICY_URL, TERMS_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';
import { startPersistentLocationTracking } from '../lib/background-location';

type Role = 'client' | 'carrier';
type PersonType = 'individual' | 'self_employed' | 'ip' | 'too';

const PERSON_TYPE_OPTIONS: { value: PersonType; label: string }[] = [
  { value: 'individual', label: 'Физлицо' },
  { value: 'self_employed', label: 'Самозанятый' },
  { value: 'ip', label: 'ИП' },
  { value: 'too', label: 'ТОО' },
];

type PendingRegistration = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  person_type: PersonType;
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return digits ? `+${digits}` : '';
}

function getRequestError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Сервер не ответил. Попробуйте ещё раз.';
  }
  return 'Не удалось подключиться к серверу';
}

function openLegalUrl(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert('Ошибка', 'Не удалось открыть документ');
  });
}

export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [personType, setPersonType] = useState<PersonType>('individual');
  const [personTypeMenuOpen, setPersonTypeMenuOpen] = useState(false);
  const [role, setRole] = useState<Role>('client');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  const sendEmailCode = async (registration: PendingRegistration) => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/mobile/register/email-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registration.email, phone: registration.phone }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Не удалось отправить код на email');
    }
  };

  const handleRegister = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);

    if (!name.trim() || !normalizedEmail || !phone.trim() || !password) {
      Alert.alert('Ошибка', 'Заполните имя, email, телефон и пароль');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      Alert.alert('Ошибка', 'Введите корректный email');
      return;
    }
    if (normalizedPhone.replace(/\D/g, '').length < 10) {
      Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Ошибка', 'Пароль должен содержать не меньше 6 символов');
      return;
    }
    if (!agreed) {
      Alert.alert('Ошибка', 'Примите условия использования и политику конфиденциальности');
      return;
    }

    const registration: PendingRegistration = {
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: normalizedPhone,
      role,
      person_type: personType,
    };

    try {
      setLoading(true);
      await sendEmailCode(registration);
      setPendingRegistration(registration);
      setEmailCode('');
      setCodeVisible(true);
    } catch (error) {
      Alert.alert(
        'Ошибка регистрации',
        error instanceof Error && error.message ? error.message : getRequestError(error)
      );
    } finally {
      setLoading(false);
    }
  };

  const resendEmailCode = async () => {
    if (!pendingRegistration) return;

    try {
      setCodeLoading(true);
      await sendEmailCode(pendingRegistration);
      setEmailCode('');
      Alert.alert('Готово', `Новый код отправлен на ${pendingRegistration.email}`);
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error && error.message ? error.message : getRequestError(error)
      );
    } finally {
      setCodeLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!pendingRegistration) return;
    if (!/^\d{6}$/.test(emailCode.trim())) {
      Alert.alert('Ошибка', 'Введите шестизначный код из письма');
      return;
    }

    try {
      setCodeLoading(true);
      const registerResponse = await fetchWithTimeout(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingRegistration, emailCode: emailCode.trim() }),
      });
      const registerData = await registerResponse.json().catch(() => ({}));

      if (!registerResponse.ok) {
        Alert.alert('Ошибка регистрации', registerData?.error || 'Не удалось зарегистрироваться');
        return;
      }

      const loginResponse = await fetchWithTimeout(`${API_BASE_URL}/api/mobile/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingRegistration.email,
          password: pendingRegistration.password,
        }),
      });
      const loginData = await loginResponse.json().catch(() => ({}));

      if (!loginResponse.ok || !loginData?.token) {
        setCodeVisible(false);
        Alert.alert('Аккаунт создан', 'Теперь войдите с указанными email и паролем.');
        router.replace('/login');
        return;
      }

      await AsyncStorage.setItem('userToken', loginData.token);
      await AsyncStorage.setItem('userData', JSON.stringify(loginData.user));
      setCodeVisible(false);
      setPendingRegistration(null);
      void startPersistentLocationTracking().catch((error) => {
        console.log('Start location tracking after register error:', error);
      });
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Ошибка', getRequestError(error));
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback('/')} activeOpacity={0.8}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Регистрация</Text>
          <Text style={styles.subtitle}>Заполните те же данные, что и при регистрации на сайте RouteHub.</Text>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Text style={styles.label}>Имя или название компании</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Имя или название компании"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                autoCapitalize="words"
                textContentType="name"
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Не меньше 6 символов"
                placeholderTextColor={colors.mutedText}
                secureTextEntry
                style={styles.input}
                textContentType="newPassword"
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Телефон</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+7 (___) ___-__-__"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Тип пользователя</Text>
              <TouchableOpacity
                style={[styles.dropdownButton, personTypeMenuOpen && styles.dropdownButtonOpen]}
                activeOpacity={0.85}
                onPress={() => setPersonTypeMenuOpen((value) => !value)}
              >
                <Text style={styles.dropdownButtonText}>
                  {PERSON_TYPE_OPTIONS.find((option) => option.value === personType)?.label}
                </Text>
                <Text style={styles.dropdownChevron}>{personTypeMenuOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {personTypeMenuOpen ? (
                <View style={styles.dropdownMenu}>
                  {PERSON_TYPE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownOption,
                        option.value === personType && styles.dropdownOptionActive,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setPersonType(option.value);
                        setPersonTypeMenuOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          option.value === personType && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {option.value === personType ? <Text style={styles.dropdownCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Роль</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'client' && styles.roleButtonActive]}
                  activeOpacity={0.85}
                  onPress={() => setRole('client')}
                >
                  <Text style={[styles.roleButtonText, role === 'client' && styles.roleButtonTextActive]}>
                    Я грузовладелец
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'carrier' && styles.roleButtonActive]}
                  activeOpacity={0.85}
                  onPress={() => setRole('carrier')}
                >
                  <Text style={[styles.roleButtonText, role === 'carrier' && styles.roleButtonTextActive]}>
                    Я перевозчик
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.agreeRow}
              activeOpacity={0.8}
              onPress={() => setAgreed((value) => !value)}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.agreeText}>Я согласен(на) с условиями и политикой конфиденциальности</Text>
            </TouchableOpacity>

            <View style={styles.legalLinks}>
              <TouchableOpacity activeOpacity={0.75} onPress={() => openLegalUrl(TERMS_URL)}>
                <Text style={styles.legalLink}>Условия использования</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>•</Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}>
                <Text style={styles.legalLink}>Политика конфиденциальности</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.registerButton, loading && styles.disabledButton]}
              activeOpacity={0.85}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.registerButtonText}>
                {loading ? 'Отправляем код...' : 'Зарегистрироваться'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginButton} activeOpacity={0.85} onPress={() => router.push('/login')}>
              <Text style={styles.loginButtonText}>Уже есть аккаунт? Войти</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={codeVisible}
        animationType="fade"
        transparent
        onRequestClose={() => !codeLoading && setCodeVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Код подтверждения</Text>
            <Text style={styles.modalText}>
              Введите шестизначный код, отправленный на {pendingRegistration?.email || 'email'}.
            </Text>
            <TextInput
              value={emailCode}
              onChangeText={(value) => setEmailCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.mutedText}
              style={styles.codeInput}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.registerButton, codeLoading && styles.disabledButton]}
              activeOpacity={0.85}
              onPress={completeRegistration}
              disabled={codeLoading}
            >
              <Text style={styles.registerButtonText}>
                {codeLoading ? 'Проверяем...' : 'Завершить регистрацию'}
              </Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={resendEmailCode} disabled={codeLoading} activeOpacity={0.8}>
                <Text style={styles.modalActionText}>Отправить код ещё раз</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCodeVisible(false)} disabled={codeLoading} activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1 },
    container: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 36,
      backgroundColor: colors.background,
    },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 24 },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', marginBottom: 10 },
    subtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 28 },
    form: { gap: 14 },
    inputWrap: { marginBottom: 2 },
    label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: colors.text,
      fontSize: 15,
    },
    roleRow: { flexDirection: 'row', gap: 10 },
    dropdownButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    dropdownButtonOpen: { borderColor: colors.primary, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
    dropdownButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    dropdownChevron: { color: colors.primarySoft, fontSize: 12, fontWeight: '900' },
    dropdownMenu: {
      marginTop: 6,
      overflow: 'hidden',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceStrong,
    },
    dropdownOption: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dropdownOptionActive: { backgroundColor: colors.primary },
    dropdownOptionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    dropdownOptionTextActive: { color: '#FFFFFF' },
    dropdownCheck: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    roleButton: {
      flex: 1,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    roleButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    roleButtonText: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
    roleButtonTextActive: { color: '#FFFFFF' },
    agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    checkmark: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    agreeText: { flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
    legalLink: { color: colors.primarySoft, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
    legalSeparator: { color: colors.mutedText, fontSize: 12 },
    registerButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 17,
      alignItems: 'center',
      marginTop: 8,
    },
    disabledButton: { opacity: 0.6 },
    registerButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    loginButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    loginButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      paddingHorizontal: 22,
    },
    modalCard: {
      backgroundColor: colors.surfaceStrong,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
    },
    modalTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    modalText: { color: colors.mutedText, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
    codeInput: {
      marginTop: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 15,
      color: colors.text,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: 8,
      textAlign: 'center',
    },
    modalActions: { marginTop: 20, gap: 16, alignItems: 'center' },
    modalActionText: { color: colors.primarySoft, fontSize: 14, fontWeight: '800' },
    modalCancelText: { color: colors.mutedText, fontSize: 14, fontWeight: '700' },
  });
}
