import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
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
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';
import { publishCurrentCarrierLocationForActiveLoads, syncPersistentLocationTracking } from '../lib/background-location';

type OfferItem = {
  id: number;
  loadId: number;
  price?: number | string;
  currency?: string;
  status?: string;
  from_location?: string;
  to_location?: string;
  load_type?: string;
  pickupDate?: string;
  truckType?: string;
  comment?: string;
  carrierName?: string;
  carrierPhone?: string;
  load_status?: string;
  ownerId?: number | string;
  ownerName?: string;
  ownerCompany?: string;
  reviewGiven?: boolean;
  clientCompleted?: boolean;
  carrierCompleted?: boolean;
};

type OffersResponse = {
  mode?: 'carrier' | 'owner';
  title?: string;
  items?: OfferItem[];
  error?: string;
};

const getScreenTitle = (mode: 'carrier' | 'owner') =>
  mode === 'owner' ? 'Предложенные ставки' : 'Мои ставки';

const getStatusLabel = (item: OfferItem) => {
  if (item.load_status === 'completed') return 'Завершено';
  if (item.status === 'accepted') return 'Принято';
  if (item.status === 'rejected') return 'Отклонено';
  if (item.status === 'pending') return 'На рассмотрении';
  return item.status || 'На рассмотрении';
};

export default function StavkiScreen() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const [mode, setMode] = useState<'carrier' | 'owner'>('carrier');
  const [title, setTitle] = useState('Мои ставки');
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadItems = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setItems([]);
        setError('Пользователь не авторизован');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/offers-screen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: OffersResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        setItems([]);
        setError(data.error || 'Не удалось загрузить ставки');
        return;
      }

      const nextMode = data.mode || 'carrier';
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setMode(nextMode);
      setTitle(getScreenTitle(nextMode));
      setItems(nextItems);

      if (nextMode === 'carrier' && nextItems.some((item) => item.status === 'accepted' && item.load_status !== 'completed' && !item.carrierCompleted)) {
        void publishCurrentCarrierLocationForActiveLoads().catch((error) => {
          console.log('Publish current carrier location error:', error);
        });
        void syncPersistentLocationTracking().catch((error) => {
          console.log('Sync carrier location tracking error:', error);
        });
      }
    } catch (err) {
      console.log('stavki load error:', err);
      setItems([]);
      setError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadItems(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems(false);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems(false);
  };

  const formatPrice = (value?: number | string, currency = 'KZT') => {
    const numeric = Number(value || 0);
    const label = currency === 'KZT' ? '₸' : currency;
    if (Number.isNaN(numeric)) return `${value || 0} ${label}`;
    return `${numeric.toLocaleString('ru-RU')} ${label}`;
  };

  const getCompletionText = (item: OfferItem) => {
    const clientDone = Boolean(item.clientCompleted);
    const carrierDone = Boolean(item.carrierCompleted);

    if (item.load_status === 'completed' || (clientDone && carrierDone)) return 'Сделка завершена';
    if (carrierDone) return 'Ждём подтверждение заказчика';
    if (clientDone) return 'Заказчик подтвердил';
    return '';
  };

  const getCompletionBadgeStyle = (item: OfferItem) => {
    const clientDone = Boolean(item.clientCompleted);
    const carrierDone = Boolean(item.carrierCompleted);

    if (item.load_status === 'completed' || (clientDone && carrierDone)) return styles.completionDone;
    if (carrierDone) return styles.completionWaiting;
    if (clientDone) return styles.completionConfirmed;
    return null;
  };

  const isFullyCompleted = (item: OfferItem) => item.load_status === 'completed' || (Boolean(item.clientCompleted) && Boolean(item.carrierCompleted));

  const openReviewForOffer = (item: OfferItem) => {
    if (!item.ownerId) return;

    router.push({
      pathname: '/write-review',
      params: {
        revieweeId: String(item.ownerId),
        revieweeName: item.ownerCompany || item.ownerName || 'Грузовладелец',
        loadId: String(item.loadId),
        loadRoute: `${item.from_location || '—'} → ${item.to_location || '—'}`,
      },
    });
  };

  const canShowReview = (item: OfferItem) => mode === 'carrier' && isFullyCompleted(item) && Boolean(item.ownerId) && !item.reviewGiven;
  const canShowCarrierComplete = (item: OfferItem) =>
    mode === 'carrier' && item.status === 'accepted' && item.load_status === 'assigned';

  const completeLoad = async (item: OfferItem) => {
    const key = `complete-${item.loadId}`;

    try {
      setActionLoading(key);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/loads/${item.loadId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось подтвердить завершение');
        return;
      }

      await loadItems(false);
      const completed = data?.status === 'completed' || data?.completion?.isFullyCompleted;
      if (completed && item.ownerId && !item.reviewGiven) {
        Alert.alert('Груз завершен', 'Теперь можно оставить рейтинг грузовладельцу.', [
          { text: 'Позже', style: 'cancel' },
          { text: 'Оставить рейтинг', onPress: () => openReviewForOffer(item) },
        ]);
      } else {
        Alert.alert('Готово', data?.message || 'Подтверждение завершения сохранено');
      }
    } catch (err) {
      console.log('stavki complete load error:', err);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmComplete = (item: OfferItem) => {
    Alert.alert(
      'Подтвердить завершение?',
      'Заказ завершится полностью после подтверждения второй стороны.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Подтвердить', onPress: () => void completeLoad(item) },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themed.safeArea]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={[styles.center, themed.safeArea]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, themed.mutedText]}>Загружаем ставки...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, themed.safeArea]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        style={[styles.scroll, themed.safeArea]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <TouchableOpacity onPress={() => goBackOrFallback('/(tabs)/profile')} activeOpacity={0.85}>
          <Text style={[styles.back, themed.link]}>← Назад</Text>
        </TouchableOpacity>

        <Text style={[styles.title, themed.text]}>{title}</Text>
        <Text style={[styles.subtitle, themed.mutedText]}>
          {mode === 'carrier'
            ? 'Следи за отправленными ставками и их статусом'
            : 'Просматривай предложения перевозчиков по твоим грузам'}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!error && items.length === 0 && (
          <View style={[styles.emptyCard, themed.card]}>
            <Text style={[styles.emptyTitle, themed.text]}>Ставок пока нет</Text>
            <Text style={[styles.emptyText, themed.mutedText]}>Когда появятся ставки, они будут показаны здесь.</Text>
          </View>
        )}

        {items.map((item) => (
          <View key={item.id} style={[styles.card, themed.card]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, themed.text]}>{item.load_type || 'Груз'}</Text>
              <Text style={[styles.price, themed.primaryText]}>{formatPrice(item.price, item.currency)}</Text>
            </View>
            <Text style={[styles.route, themed.text]}>{item.from_location || '—'} → {item.to_location || '—'}</Text>
            <Text style={[styles.meta, themed.mutedText]}>Дата: {item.pickupDate || 'Не указана'}</Text>
            <Text style={[styles.meta, themed.mutedText]}>Статус: {getStatusLabel(item)}</Text>
            {!!getCompletionText(item) && (
              <Text style={[styles.completionBadge, getCompletionBadgeStyle(item)]}>
                {getCompletionText(item)}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, themed.primaryButton]}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/offer-details',
                  params: {
                    offerId: String(item.id),
                    loadId: String(item.loadId),
                    mode,
                    title: item.load_type || 'Груз',
                    route: `${item.from_location || '—'} → ${item.to_location || '—'}`,
                    price: formatPrice(item.price, item.currency),
                    status: item.status || 'pending',
                    loadStatus: item.load_status || '',
                    clientCompleted: item.clientCompleted ? '1' : '',
                    carrierCompleted: item.carrierCompleted ? '1' : '',
                    carrierName: item.carrierName || '',
                    carrierPhone: item.carrierPhone || '',
                    ownerId: item.ownerId ? String(item.ownerId) : '',
                    ownerName: item.ownerCompany || item.ownerName || '',
                    reviewGiven: item.reviewGiven ? '1' : '',
                    pickupDate: item.pickupDate || '',
                    truckType: item.truckType || '',
                    comment: item.comment || '',
                  },
                })
              }
            >
              <Text style={styles.primaryButtonText}>Подробнее</Text>
            </TouchableOpacity>


            {canShowReview(item) && (
              <TouchableOpacity
                style={styles.reviewButton}
                activeOpacity={0.85}
                onPress={() => openReviewForOffer(item)}
              >
                <Text style={styles.reviewButtonText}>Оставить рейтинг</Text>
              </TouchableOpacity>
            )}

            {isFullyCompleted(item) && item.reviewGiven && (
              <Text style={styles.reviewDoneBadge}>Рейтинг оставлен</Text>
            )}

            {canShowCarrierComplete(item) && (
              <TouchableOpacity
                style={[
                  styles.completeButton,
                  item.carrierCompleted && styles.completeButtonDisabled,
                ]}
                activeOpacity={0.85}
                disabled={Boolean(item.carrierCompleted) || actionLoading === `complete-${item.loadId}`}
                onPress={() => confirmComplete(item)}
              >
                <Text style={styles.completeButtonText}>
                  {actionLoading === `complete-${item.loadId}`
                    ? '...'
                    : item.carrierCompleted
                      ? 'Подтверждено'
                      : 'Подтвердить завершение'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#081120' },
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#081120' },
  centerText: { color: '#CBD5E1', marginTop: 12, fontWeight: '700' },
  back: { color: '#38BDF8', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#94A3B8', fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 18 },
  error: { color: '#FCA5A5', backgroundColor: 'rgba(239,68,68,0.1)', padding: 14, borderRadius: 16 },
  emptyCard: { padding: 22, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)' },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: '#94A3B8', fontSize: 15, lineHeight: 22 },
  card: { padding: 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', flex: 1 },
  price: { color: '#2F80ED', fontSize: 17, fontWeight: '900' },
  route: { color: '#E2E8F0', fontSize: 18, fontWeight: '800', marginTop: 10 },
  meta: { color: '#94A3B8', fontSize: 14, marginTop: 8 },
  primaryButton: { backgroundColor: '#2F80ED', borderRadius: 16, alignItems: 'center', paddingVertical: 14, marginTop: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  completeButton: { backgroundColor: '#F59E0B', borderRadius: 16, alignItems: 'center', paddingVertical: 14, marginTop: 10 },
  reviewButton: { backgroundColor: '#22C55E', borderRadius: 16, alignItems: 'center', paddingVertical: 14, marginTop: 10 },
  reviewButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  reviewDoneBadge: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, color: '#22C55E', backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)', fontSize: 13, fontWeight: '900', overflow: 'hidden' },
  completeButtonDisabled: { opacity: 0.62 },
  completeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  completionBadge: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, color: '#FFFFFF', fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  completionWaiting: { backgroundColor: '#1D4ED8' },
  completionConfirmed: { backgroundColor: '#16A34A' },
  completionDone: { backgroundColor: '#64748B' },
});



type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createThemedStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    text: { color: colors.text },
    mutedText: { color: colors.mutedText },
    link: { color: colors.primarySoft },
    primaryText: { color: colors.primary },
    primaryButton: { backgroundColor: colors.primary },
  });
}


