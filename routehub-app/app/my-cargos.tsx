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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';

type MyLoadItem = {
  id: number;
  from_location: string;
  to_location: string;
  type?: string;
  price?: number | string;
  date?: string;
  status?: string;
  acceptedCarrierUserId?: number | string | null;
  acceptedCarrierName?: string | null;
  acceptedCarrierPhone?: string | null;
  reviewGiven?: boolean;
  clientCompleted?: boolean;
  carrierCompleted?: boolean;
  escrowStatus?: string;
  escrowAmount?: number | string;
  escrowCarrierAmount?: number | string;
  escrowCommissionAmount?: number | string;
};

export default function MyCargosScreen() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const [items, setItems] = useState<MyLoadItem[]>([]);
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

      const response = await fetch(`${API_BASE_URL}/api/mobile/my-loads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        setItems([]);
        setError(data?.error || 'Не удалось загрузить грузы');
        return;
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('my-cargos load error:', err);
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

  const formatPrice = (value?: number | string) => {
    const numeric = Number(value || 0);
    if (Number.isNaN(numeric)) return `${value || 0} ₸`;
    return `${numeric.toLocaleString('ru-RU')} ₸`;
  };

  const isFullyCompleted = (item: MyLoadItem) => item.status === 'completed' || (Boolean(item.clientCompleted) && Boolean(item.carrierCompleted));

  const getCompletionText = (item: MyLoadItem) => {
    const clientDone = Boolean(item.clientCompleted);
    const carrierDone = Boolean(item.carrierCompleted);

    if (isFullyCompleted(item)) return 'Сделка завершена';
    if (clientDone) return 'Ждём подтверждение перевозчика';
    if (carrierDone) return 'Перевозчик подтвердил';
    return '';
  };

  const getCompletionBadgeStyle = (item: MyLoadItem) => {
    const clientDone = Boolean(item.clientCompleted);
    const carrierDone = Boolean(item.carrierCompleted);

    if (isFullyCompleted(item)) return styles.completionDone;
    if (clientDone) return styles.completionWaiting;
    if (carrierDone) return styles.completionConfirmed;
    return null;
  };

  const getStatusText = (item: MyLoadItem) => {
    if (isFullyCompleted(item)) return 'Завершен';
    if (item.status === 'assigned') return 'Назначен';
    return item.status || 'open';
  };

  const getPaymentText = (item: MyLoadItem) => {
    if (item.escrowStatus === 'released') return `Оплата выплачена перевозчику: ${formatPrice(item.escrowCarrierAmount)}`;
    if (item.escrowStatus === 'held') return `Оплата заморожена: ${formatPrice(item.escrowAmount)}`;
    return '';
  };

  const openReviewForLoad = (item: MyLoadItem) => {
    if (!item.acceptedCarrierUserId) return;
    router.push({
      pathname: '/write-review',
      params: {
        revieweeId: String(item.acceptedCarrierUserId),
        revieweeName: item.acceptedCarrierName || 'Перевозчик',
        loadId: String(item.id),
        loadRoute: `${item.from_location} → ${item.to_location}`,
      },
    });
  };

  const canShowReview = (item: MyLoadItem) => isFullyCompleted(item) && Boolean(item.acceptedCarrierUserId) && !item.reviewGiven;
  const canShowComplete = (item: MyLoadItem) => item.status === 'assigned';
  const canUnassign = (item: MyLoadItem) => item.status === 'assigned' && Boolean(item.acceptedCarrierUserId);
  const canDelete = (item: MyLoadItem) => item.status !== 'completed';

  const runLoadAction = async (item: MyLoadItem, action: 'delete' | 'complete' | 'unassign') => {
    const actionKey = `${action}-${item.id}`;

    try {
      setActionLoading(actionKey);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const endpoint = action === 'delete'
        ? `${API_BASE_URL}/api/mobile/loads/${item.id}`
        : `${API_BASE_URL}/api/mobile/loads/${item.id}/${action}`;

      const response = await fetch(endpoint, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось выполнить действие');
        return;
      }

      await loadItems(false);

      if (action === 'complete') {
        const completed = data?.status === 'completed' || data?.completion?.isFullyCompleted;
        if (completed && item.acceptedCarrierUserId && !item.reviewGiven) {
          Alert.alert('Груз завершен', 'Теперь можно оставить рейтинг перевозчику.', [
            { text: 'Позже', style: 'cancel' },
            { text: 'Оставить рейтинг', onPress: () => openReviewForLoad(item) },
          ]);
        } else {
          Alert.alert('Готово', data?.message || 'Подтверждение завершения сохранено');
        }
      }
    } catch (err) {
      console.log('my-cargos action error:', err);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = (item: MyLoadItem) => {
    Alert.alert('Удалить груз?', `${item.from_location} → ${item.to_location}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void runLoadAction(item, 'delete') },
    ]);
  };

  const confirmComplete = (item: MyLoadItem) => {
    Alert.alert('Завершить груз?', 'Груз завершится полностью после подтверждения второй стороны.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Завершить', onPress: () => void runLoadAction(item, 'complete') },
    ]);
  };

  const confirmUnassign = (item: MyLoadItem) => {
    Alert.alert('Снять назначение?', 'Груз снова станет открытым, а принятая ставка будет отменена.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Снять', style: 'destructive', onPress: () => void runLoadAction(item, 'unassign') },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themed.safeArea]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={[styles.center, themed.safeArea]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, themed.mutedText]}>Загружаем мои грузы...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, themed.safeArea]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView style={[styles.scroll, themed.safeArea]} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <TouchableOpacity onPress={() => goBackOrFallback('/(tabs)/profile')} activeOpacity={0.85}>
          <Text style={[styles.back, themed.link]}>← Назад</Text>
        </TouchableOpacity>

        <Text style={[styles.title, themed.text]}>Мои грузы</Text>
        <Text style={[styles.subtitle, themed.mutedText]}>Твои опубликованные грузы и их текущий статус</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!error && items.length === 0 && (
          <View style={[styles.emptyCard, themed.card]}>
            <Text style={[styles.emptyTitle, themed.text]}>Грузов пока нет</Text>
            <Text style={[styles.emptyText, themed.mutedText]}>Создай первый груз, и он появится здесь.</Text>
          </View>
        )}

        {items.map((item) => (
          <View key={item.id} style={[styles.card, themed.card]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, themed.text]}>{item.type || 'Груз'}</Text>
              <Text style={[styles.price, themed.primaryText]}>{formatPrice(item.price)}</Text>
            </View>
            <Text style={[styles.route, themed.text]}>{item.from_location} → {item.to_location}</Text>
            <Text style={[styles.meta, themed.mutedText]}>Дата: {item.date || 'Не указана'}</Text>
            <Text style={[styles.meta, themed.mutedText]}>Статус: {getStatusText(item)}</Text>

            {!!getCompletionText(item) && <Text style={[styles.completionBadge, getCompletionBadgeStyle(item)]}>{getCompletionText(item)}</Text>}
            {!!getPaymentText(item) && <Text style={[styles.paymentBadge, item.escrowStatus === 'released' ? styles.paymentReleased : styles.paymentHeld]}>{getPaymentText(item)}</Text>}

            <View style={styles.actionsGrid}>
              <TouchableOpacity style={[styles.primaryButton, themed.primaryButton]} activeOpacity={0.85} onPress={() => router.push({ pathname: '/cargo-details', params: { id: String(item.id) } })}>
                <Text style={styles.primaryButtonText}>Подробнее</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, themed.primaryButton, styles.mapButton]}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/map', params: { loadId: String(item.id), title: item.type || 'Груз', from: item.from_location || '', to: item.to_location || '', price: String(item.price || ''), ownerMap: '1' } })}
              >
                <Text style={styles.primaryButtonText}>Карта</Text>
              </TouchableOpacity>

              {canShowComplete(item) && (
                <TouchableOpacity style={[styles.primaryButton, styles.completeButton, item.clientCompleted && styles.completeButtonDisabled]} activeOpacity={0.85} disabled={Boolean(item.clientCompleted) || actionLoading === `complete-${item.id}`} onPress={() => confirmComplete(item)}>
                  <Text style={styles.primaryButtonText}>{actionLoading === `complete-${item.id}` ? '...' : item.clientCompleted ? 'Подтверждено' : 'Подтвердить завершение'}</Text>
                </TouchableOpacity>
              )}

              {canShowReview(item) && (
                <TouchableOpacity style={[styles.primaryButton, styles.reviewButton]} activeOpacity={0.85} onPress={() => openReviewForLoad(item)}>
                  <Text style={styles.primaryButtonText}>Оставить рейтинг</Text>
                </TouchableOpacity>
              )}

              {isFullyCompleted(item) && item.reviewGiven && <Text style={styles.reviewDoneBadge}>Рейтинг оставлен</Text>}

              {canUnassign(item) && (
                <TouchableOpacity style={[styles.secondaryButton, styles.unassignButton]} activeOpacity={0.85} disabled={actionLoading === `unassign-${item.id}`} onPress={() => confirmUnassign(item)}>
                  <Text style={styles.secondaryButtonText}>{actionLoading === `unassign-${item.id}` ? '...' : 'Снять назначение'}</Text>
                </TouchableOpacity>
              )}

              {canDelete(item) && (
                <TouchableOpacity style={[styles.secondaryButton, styles.deleteButton]} activeOpacity={0.85} disabled={actionLoading === `delete-${item.id}`} onPress={() => confirmDelete(item)}>
                  <Text style={styles.deleteButtonText}>{actionLoading === `delete-${item.id}` ? '...' : 'Удалить'}</Text>
                </TouchableOpacity>
              )}
            </View>
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
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  primaryButton: { flexGrow: 1, minWidth: '46%', backgroundColor: '#2F80ED', borderRadius: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  mapButton: { backgroundColor: '#0891B2' },
  completeButton: { backgroundColor: '#F59E0B' },
  reviewButton: { backgroundColor: '#22C55E' },
  completeButtonDisabled: { opacity: 0.62 },
  completionBadge: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, color: '#FFFFFF', fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  completionWaiting: { backgroundColor: '#1D4ED8' },
  completionConfirmed: { backgroundColor: '#16A34A' },
  completionDone: { backgroundColor: '#64748B' },
  paymentBadge: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, color: '#FFFFFF', fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  paymentHeld: { backgroundColor: '#0EA5E9' },
  paymentReleased: { backgroundColor: '#16A34A' },
  reviewDoneBadge: { alignSelf: 'flex-start', marginTop: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, color: '#22C55E', backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)', fontSize: 13, fontWeight: '900', overflow: 'hidden' },
  secondaryButton: { flexGrow: 1, minWidth: '46%', borderRadius: 16, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderWidth: 1 },
  unassignButton: { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.10)' },
  deleteButton: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.10)' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  secondaryButtonText: { color: '#FBBF24', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  deleteButtonText: { color: '#FCA5A5', fontSize: 14, fontWeight: '900', textAlign: 'center' },
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