import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

type SelectedRegistrationFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

type UserProfile = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  person_type?: string;
  address?: string;
  iin?: string;
  registration_certificate_file?: string;
};

type EditProfileScreenProps = {
  onBack?: () => void;
};

type PersonType = 'too' | 'ip' | 'self_employed';

export default function EditProfileScreen({ onBack }: EditProfileScreenProps = {}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const placeholderColor = colors.mutedText;
  const inputBackground = colors.surfaceStrong;
  const activeBackground = colors.primary + '22';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [iin, setIin] = useState('');
  const [address, setAddress] = useState('');
  const [registrationCertificateFile, setRegistrationCertificateFile] = useState('');
  const [selectedRegistrationFile, setSelectedRegistrationFile] = useState<SelectedRegistrationFile | null>(null);
  const [personType, setPersonType] = useState<PersonType>('self_employed');

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  };

  const normalizePersonType = (value?: string): PersonType => {
    if (value === 'company' || value === 'too') return 'too';
    if (value === 'ip') return 'ip';
    return 'self_employed';
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        goBack();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data: UserProfile | { error?: string } = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка', (data as { error?: string }).error || 'Не удалось загрузить профиль');
        return;
      }

      const user = data as UserProfile;
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setCompany(user.company || '');
      setIin(user.iin || '');
      setAddress(user.address || '');
      setRegistrationCertificateFile(user.registration_certificate_file || '');
      setPersonType(normalizePersonType(user.person_type));
    } catch (error) {
      console.log('Edit profile fetch error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePickRegistrationCertificate = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const maxSize = 10 * 1024 * 1024;

      if (asset.size && asset.size > maxSize) {
        Alert.alert('Ошибка', 'Файл должен быть до 10 MB');
        return;
      }

      setSelectedRegistrationFile({
        uri: asset.uri,
        name: asset.name || 'registration-certificate',
        mimeType: asset.mimeType,
        size: asset.size,
      });
      setRegistrationCertificateFile(asset.name || 'registration-certificate');
    } catch (error) {
      console.log('Registration certificate pick error:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    }
  };

  const uploadRegistrationCertificate = async (token: string) => {
    if (!selectedRegistrationFile) return null;

    const base64 = await FileSystem.readAsStringAsync(selectedRegistrationFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const response = await fetch(`${API_BASE_URL}/api/mobile/profile-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: 'registration_certificate',
        fileName: selectedRegistrationFile.name,
        mimeType: selectedRegistrationFile.mimeType || 'application/octet-stream',
        data: base64,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Не удалось загрузить свидетельство');
    }

    setSelectedRegistrationFile(null);
    setRegistrationCertificateFile(data?.fileName || selectedRegistrationFile.name);
    return data;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Имя не должно быть пустым');
      return;
    }

    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          company: company.trim(),
          person_type: personType,
          iin: iin.trim(),
          address: address.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось сохранить профиль');
        return;
      }

      await uploadRegistrationCertificate(token);

      if (data?.user) {
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
      }

      Alert.alert('Успешно', 'Профиль обновлён');
      goBack();
    } catch (error) {
      console.log('Edit profile save error:', error);
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось подключиться к серверу');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Загружаем профиль...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.pageTitle}>Изменить профиль</Text>
          <Text style={styles.pageSubtitle}>Обнови личные данные и информацию о компании</Text>

          <View style={styles.avatarCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{name?.trim()?.charAt(0)?.toUpperCase() || 'R'}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarTitle}>Профиль RouteHub</Text>
              <Text style={styles.avatarSubtitle}>Email пока только для просмотра</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Основная информация</Text>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Имя</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Введите имя или название" placeholderTextColor={placeholderColor} style={[styles.input, { backgroundColor: inputBackground }]} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Email</Text>
              <TextInput value={email} editable={false} placeholderTextColor={placeholderColor} style={[styles.input, styles.disabledInput, { backgroundColor: inputBackground }]} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Телефон</Text>
              <TextInput value={phone} onChangeText={setPhone} placeholder="Введите телефон" placeholderTextColor={placeholderColor} style={[styles.input, { backgroundColor: inputBackground }]} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Данные профиля</Text>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Имя / название ТОО, ИП или самозанятого</Text>
              <TextInput value={company} onChangeText={setCompany} placeholder="Введите имя или название" placeholderTextColor={placeholderColor} style={[styles.input, { backgroundColor: inputBackground }]} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>ИИН</Text>
              <TextInput value={iin} onChangeText={setIin} placeholder="Введите ИИН" placeholderTextColor={placeholderColor} style={[styles.input, { backgroundColor: inputBackground }]} keyboardType="number-pad" maxLength={12} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Адрес</Text>
              <TextInput value={address} onChangeText={setAddress} placeholder="Введите адрес" placeholderTextColor={placeholderColor} style={[styles.input, { backgroundColor: inputBackground }]} />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Св-тво о гос.регистрации</Text>
              <TouchableOpacity style={styles.documentCard} activeOpacity={0.85} onPress={handlePickRegistrationCertificate}>
                <View style={styles.documentIcon}><Text style={styles.documentIconText}>DOC</Text></View>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentTitle} numberOfLines={1}>{registrationCertificateFile || 'Файл не выбран'}</Text>
                  <Text style={styles.documentSubtitle}>JPG, PNG или PDF до 10 MB</Text>
                </View>
                <Text style={styles.documentAction}>Выбрать</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Тип профиля</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity style={[styles.roleCard, { backgroundColor: inputBackground }, personType === 'too' && { borderColor: colors.primary, backgroundColor: activeBackground }]} activeOpacity={0.85} onPress={() => setPersonType('too')}>
                  <Text style={styles.roleTitle}>ТОО</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.roleCard, { backgroundColor: inputBackground }, personType === 'ip' && { borderColor: colors.primary, backgroundColor: activeBackground }]} activeOpacity={0.85} onPress={() => setPersonType('ip')}>
                  <Text style={styles.roleTitle}>ИП</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.roleCard, { backgroundColor: inputBackground }, personType === 'self_employed' && { borderColor: colors.primary, backgroundColor: activeBackground }]} activeOpacity={0.85} onPress={() => setPersonType('self_employed')}>
                  <Text style={styles.roleTitle}>Самозанятый</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} activeOpacity={0.85} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Сохранить изменения</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} activeOpacity={0.85} onPress={goBack}>
            <Text style={styles.cancelButtonText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 28 },
    container: { paddingHorizontal: 18, paddingTop: 16 },
    centerState: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    centerText: { marginTop: 14, color: colors.mutedText, fontSize: 15, fontWeight: '600' },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 16 },
    pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
    pageSubtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    avatarCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
    avatar: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
    avatarInfo: { flex: 1 },
    avatarTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
    avatarSubtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 18 },
    formCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 14 },
    inputWrap: { marginBottom: 14 },
    label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, color: colors.text, fontSize: 15 },
    disabledInput: { color: colors.mutedText },
    documentCard: { minHeight: 86, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    documentIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
    documentIconText: { color: colors.primarySoft, fontSize: 12, fontWeight: '900' },
    documentInfo: { flex: 1, minWidth: 0 },
    documentTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
    documentSubtitle: { color: colors.mutedText, fontSize: 12, fontWeight: '600' },
    documentAction: { color: colors.primarySoft, fontSize: 13, fontWeight: '800' },
    roleRow: { flexDirection: 'row', gap: 8 },
    roleCard: { flex: 1, minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    roleTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
    saveButton: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 12 },
    disabledButton: { opacity: 0.7 },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    cancelButton: { borderRadius: 18, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  });
}
