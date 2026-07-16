import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../lib/api';
import { logoutAndGoHome } from '../../lib/logout';
import { useAppTheme } from '../../lib/theme';

type UserProfile = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  person_type?: string;
  activeLoads?: number;
  wallet?: {
    balance?: number;
    heldBalance?: number;
    availableBalance?: number;
    currency?: string;
  };
};

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchProfile = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setError('Пользователь не авторизован');
        setUser(null);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Не удалось загрузить профиль');
        setUser(null);
        return;
      }

      setUser(data);
      await AsyncStorage.setItem('userData', JSON.stringify(data));
    } catch (err) {
      console.log('Fetch profile error:', err);
      setError('Не удалось подключиться к серверу');
      setUser(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProfile(false);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile(false);
  };

  const handleLogout = async () => {
    try {
      await logoutAndGoHome();
    } catch (logoutError) {
      console.log('Logout error:', logoutError);
      Alert.alert('Ошибка', 'Не удалось выйти из аккаунта');
    }
  };

  const confirmLogout = () => {
    Alert.alert('Выход из аккаунта', 'Ты действительно хочешь выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: handleLogout },
    ]);
  };

  const getRoleLabel = (role?: string) => {
    if (role === 'carrier') return 'Перевозчик';
    return 'Грузовладелец';
  };

  const getAvatarLetter = () => {
    if (!user?.name) return 'R';
    return user.name.trim().charAt(0).toUpperCase();
  };

  const formatMoney = (value?: number) => {
    const numeric = Number(value || 0);
    return `${numeric.toLocaleString('ru-RU')} ₸`;
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

  if (error || !user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Ошибка</Text>
          <Text style={styles.errorText}>{error || 'Профиль не найден'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchProfile(true)} activeOpacity={0.85}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const roleLabel = getRoleLabel(user.role);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.container}>
          <Text style={styles.pageTitle}>Профиль</Text>
          <Text style={styles.pageSubtitle}>Управляй аккаунтом и настройками RouteHub</Text>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getAvatarLetter()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user.name || 'Пользователь RouteHub'}</Text>
              <Text style={styles.role}>{roleLabel}</Text>
              <Text style={styles.contact}>{user.email || 'Email не указан'}</Text>
              {!!user.phone && <Text style={styles.contactSecondary}>{user.phone}</Text>}
              {!!user.company && <Text style={styles.contactSecondary}>{user.company}</Text>}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{user.activeLoads ?? 0}</Text>
              <Text style={styles.statLabel}>{user.role === 'carrier' ? 'Активные ставки' : 'Активные грузы'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{roleLabel}</Text>
              <Text style={styles.statLabel}>Роль</Text>
            </View>
          </View>

          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <View>
                <Text style={styles.walletLabel}>Баланс</Text>
                <Text style={styles.walletValue}>{formatMoney(user.wallet?.availableBalance)}</Text>
              </View>
              <TouchableOpacity style={styles.walletButton} activeOpacity={0.85} onPress={() => router.push('/wallet-topup' as any)}>
                <Text style={styles.walletButtonText}>Пополнить баланс</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.walletStats}>
              <Text style={styles.walletMeta}>Заморожено: {formatMoney(user.wallet?.heldBalance)}</Text>
              <Text style={styles.walletMeta}>Валюта: {user.wallet?.currency || 'KZT'}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Управление</Text>

            {user.role !== 'carrier' && (
              <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={() => router.push('/my-cargos' as any)}>
                <View style={styles.menuInfo}>
                  <Text style={styles.menuTitle}>Мои грузы</Text>
                  <Text style={styles.menuSubtitle}>Просмотр размещённых грузов и активных заказов</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={() => router.push('/stavki' as any)}>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>{user.role === 'carrier' ? 'Мои ставки' : 'Предложенные ставки'}</Text>
                <Text style={styles.menuSubtitle}>
                  {user.role === 'carrier'
                    ? 'Список отправленных ставок и откликов'
                    : 'Ставки, которые перевозчики предложили на твои грузы'}
                </Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCard}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/user-reviews',
                  params: { userId: String(user.id), userName: user.name },
                })
              }
            >
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>Мои отзывы</Text>
                <Text style={styles.menuSubtitle}>Посмотреть отзывы и рейтинг моего профиля</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={() => router.push('/settings' as any)}>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>Настройки</Text>
                <Text style={styles.menuSubtitle}>Уведомления, безопасность и параметры аккаунта</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={() => router.push('/support' as any)}>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>Поддержка</Text>
                <Text style={styles.menuSubtitle}>Связь с командой RouteHub и помощь по сервису</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout} activeOpacity={0.85}>
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type TabThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: TabThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 28 },
    container: { paddingHorizontal: 18, paddingTop: 16 },
    centerState: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    centerText: { marginTop: 14, color: colors.mutedText, fontSize: 15, fontWeight: '600' },
    errorTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 8 },
    errorText: { color: '#FCA5A5', fontSize: 15, textAlign: 'center', marginBottom: 16 },
    retryButton: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center' },
    retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
    pageSubtitle: { color: colors.mutedText, fontSize: 15, marginBottom: 20 },
    profileCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    avatar: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
    profileInfo: { flex: 1 },
    name: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 4 },
    role: { color: colors.primarySoft, fontSize: 14, fontWeight: '700', marginBottom: 4 },
    contact: { color: colors.mutedText, fontSize: 14, marginBottom: 2 },
    contactSecondary: { color: colors.mutedText, fontSize: 13, marginBottom: 2 },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
    statValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 6, textAlign: 'center' },
    statLabel: { color: colors.mutedText, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    walletCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
    walletHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    walletLabel: { color: colors.mutedText, fontSize: 13, fontWeight: '700', marginBottom: 4 },
    walletValue: { color: colors.text, fontSize: 26, fontWeight: '900' },
    walletButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12 },
    walletButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    walletStats: { marginTop: 12, gap: 4 },
    walletMeta: { color: colors.mutedText, fontSize: 13, fontWeight: '700' },
    section: { marginBottom: 18 },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    menuCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 14 },
    menuInfo: { flex: 1, paddingRight: 8 },
    menuTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
    menuSubtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
    menuArrow: { color: colors.primary, fontSize: 28, fontWeight: '700' },
    logoutButton: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginBottom: 6 },
    logoutText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
}
