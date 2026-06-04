import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrFallback } from '../lib/navigation';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';
import EditProfileScreen from './edit-profile';

export default function SettingsScreen() {  const { colors, isDark, setDarkTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/mobile/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setPushEnabled(data.push_notifications ?? true);
          setEmailEnabled(data.email_notifications ?? false);
        }
      } catch (err) {
        console.log('Fetch settings error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          push_notifications: pushEnabled,
          email_notifications: emailEnabled,
          dark_theme: isDark,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        Alert.alert('Сохранено', 'Настройки обновлены');
      } else {
        Alert.alert('Ошибка', data?.error || 'Не удалось сохранить настройки');
      }
    } catch (err) {
      console.log('Save settings error:', err);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setSaving(false);
    }
  };

  if (showEditProfile) {
    return <EditProfileScreen onBack={() => setShowEditProfile(false)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback('/(tabs)/profile')} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.pageTitle}>Настройки</Text>
          <Text style={styles.pageSubtitle}>Управляй уведомлениями, интерфейсом и параметрами аккаунта</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Уведомления</Text>

            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Push-уведомления</Text>
                <Text style={styles.settingText}>Получать уведомления о ставках, сообщениях и статусах грузов</Text>
              </View>
              <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Email-уведомления</Text>
                <Text style={styles.settingText}>Дублировать важные события на электронную почту</Text>
              </View>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch value={emailEnabled} onValueChange={setEmailEnabled} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Интерфейс</Text>
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Тёмная тема</Text>
                <Text style={styles.settingText}>Использовать тёмное оформление приложения</Text>
              </View>
              <Switch value={isDark} onValueChange={setDarkTheme} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Аккаунт</Text>

            <TouchableOpacity
              style={styles.linkCard}
              activeOpacity={0.85}
              onPress={() => setShowEditProfile(true)}
            >
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>Изменить профиль</Text>
                <Text style={styles.linkText}>Имя, контакты и данные компании</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkCard} activeOpacity={0.85} onPress={() => router.push('/security' as any)}>
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>Безопасность</Text>
                <Text style={styles.linkText}>Пароль, входы в аккаунт и защита профиля</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkCard} activeOpacity={0.85} onPress={() => router.push('/about' as any)}>
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>О приложении</Text>
                <Text style={styles.linkText}>Версия RouteHub и информация о платформе</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} activeOpacity={0.85} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Сохранить изменения</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type SettingsColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 28 },
    container: { paddingHorizontal: 18, paddingTop: 16 },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 16 },
    pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
    pageSubtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    section: { marginBottom: 18 },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    settingCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
    settingInfo: { flex: 1, paddingRight: 8 },
    settingTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
    settingText: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
    linkCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12 },
    linkInfo: { flex: 1, paddingRight: 8 },
    linkTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
    linkText: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
    saveButton: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
    disabledButton: { opacity: 0.7 },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
}




