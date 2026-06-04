import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';

export default function OfferDetailsScreen() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const params = useLocalSearchParams();
  const [loadingAction, setLoadingAction] = useState(false);

  const offerId = String(params.offerId || '');
  const loadId = String(params.loadId || '');
  const mode = String(params.mode || 'carrier');

  const title = String(params.title || 'Груз');
  const route = String(params.route || 'Маршрут не указан');
  const price = String(params.price || '—');
  const status = String(params.status || 'pending');
  const loadStatus = String(params.loadStatus || '');
  const clientCompleted = String(params.clientCompleted || '') === '1';
  const carrierCompleted = String(params.carrierCompleted || '') === '1';
  const carrierName = String(params.carrierName || '');
  const carrierPhone = String(params.carrierPhone || '');
  const pickupDate = String(params.pickupDate || '');
  const truckType = String(params.truckType || '');
  const comment = String(params.comment || '');

  const statusLabel = useMemo(() => {
    if (loadStatus === 'completed' || (clientCompleted && carrierCompleted)) return 'Завершено';

    switch (status) {
      case 'accepted':
        return 'Принята';
      case 'rejected':
        return 'Отклонена';
      default:
        return 'Ожидает ответа';
    }
  }, [carrierCompleted, clientCompleted, loadStatus, status]);

  const completionText = useMemo(() => {
    if (loadStatus === 'completed' || (clientCompleted && carrierCompleted)) return 'Сделка завершена';

    if (mode === 'owner') {
      if (clientCompleted) return 'Ждём подтверждение перевозчика';
      if (carrierCompleted) return 'Перевозчик подтвердил';
      return '';
    }

    if (carrierCompleted) return 'Ждём подтверждение заказчика';
    if (clientCompleted) return 'Заказчик подтвердил';
    return '';
  }, [carrierCompleted, clientCompleted, loadStatus, mode]);

  const actorCompleted = mode === 'owner' ? clientCompleted : carrierCompleted;
  const canShowComplete = status === 'accepted' && loadStatus === 'assigned';

  const acceptOffer = async () => {
    try {
      setLoadingAction(true);
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_BASE_URL}/api/mobile/offers/${offerId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось принять ставку');
        return;
      }

      Alert.alert('Успешно', 'Ставка принята');
      router.back();
    } catch (error) {
      console.log('acceptOffer error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoadingAction(false);
    }
  };

  const rejectOffer = async () => {
    try {
      setLoadingAction(true);
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_BASE_URL}/api/mobile/offers/${offerId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось отклонить ставку');
        return;
      }

      Alert.alert('Успешно', 'Ставка отклонена');
      router.back();
    } catch (error) {
      console.log('rejectOffer error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoadingAction(false);
    }
  };

  const completeLoad = async () => {
    try {
      setLoadingAction(true);
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_BASE_URL}/api/mobile/loads/${loadId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось подтвердить завершение');
        return;
      }

      Alert.alert('Готово', data?.message || 'Подтверждение завершения сохранено');
      router.back();
    } catch (error) {
      console.log('completeLoad error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoadingAction(false);
    }
  };

  const confirmComplete = () => {
    Alert.alert(
      'Подтвердить завершение?',
      'Заказ завершится полностью после подтверждения второй стороны.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Подтвердить', onPress: () => void completeLoad() },
      ]
    );
  };

  const editOffer = () => {
    Alert.alert('Скоро', 'Следующим шагом подключим редактирование ставки');
  };

  const openOfferChat = async () => {
    try {
      setLoadingAction(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ loadId: Number(loadId), offerId: Number(offerId) }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось открыть чат');
        return;
      }

      const [fromLocation = '', toLocation = ''] = route.split('→').map((part) => part.trim());

      router.push({
        pathname: '/chat-details',
        params: {
          chatId: String(data.id),
          chatName: carrierName || 'Перевозчик',
          fromLocation,
          toLocation,
          loadType: title,
          loadId,
        },
      });
    } catch (error) {
      console.log('openOfferChat error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, themed.safeArea]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        style={[styles.scroll, themed.safeArea]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback()} activeOpacity={0.85}>
        <Text style={[styles.back, themed.link]}>← Назад</Text>
      </TouchableOpacity>

          <Text style={[styles.pageTitle, themed.text]}>Ставка</Text>
          <Text style={[styles.pageSubtitle, themed.mutedText]}>
            Детали предложения и доступные действия
          </Text>

          <View style={[styles.card, themed.card]}>
            <Text style={[styles.cardTitle, themed.text]}>{title}</Text>
            <Text style={[styles.route, themed.text]}>{route}</Text>
            <Text style={[styles.price, themed.primaryText]}>{price}</Text>

            <View style={styles.metaBlock}>
              <Text style={[styles.metaLabel, themed.mutedText]}>Статус</Text>
              <Text style={[styles.metaValue, themed.text]}>{statusLabel}</Text>
            </View>

            {!!completionText && (
              <Text
                style={[
                  styles.completionBadge,
                  loadStatus === 'completed' || (clientCompleted && carrierCompleted)
                    ? styles.completionDone
                    : actorCompleted
                      ? styles.completionWaiting
                      : styles.completionConfirmed,
                ]}
              >
                {completionText}
              </Text>
            )}

            {!!pickupDate && (
              <View style={styles.metaBlock}>
                <Text style={[styles.metaLabel, themed.mutedText]}>Дата подачи / загрузки</Text>
                <Text style={[styles.metaValue, themed.text]}>{pickupDate}</Text>
              </View>
            )}

            {!!truckType && (
              <View style={styles.metaBlock}>
                <Text style={[styles.metaLabel, themed.mutedText]}>Транспорт</Text>
                <Text style={[styles.metaValue, themed.text]}>{truckType}</Text>
              </View>
            )}

            {mode === 'owner' && (
              <>
                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, themed.mutedText]}>Перевозчик</Text>
                  <Text style={[styles.metaValue, themed.text]}>{carrierName || 'Не указан'}</Text>
                </View>

                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, themed.mutedText]}>Телефон</Text>
                  <Text style={[styles.metaValue, themed.text]}>{carrierPhone || 'Не указан'}</Text>
                </View>
              </>
            )}

            {!!comment && (
              <View style={[styles.commentBox, themed.commentBox]}>
                <Text style={[styles.commentTitle, themed.text]}>Комментарий</Text>
                <Text style={[styles.commentText, themed.mutedText]}>{comment}</Text>
              </View>
            )}
          </View>

          {loadingAction ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.actions}>
              {mode === 'owner' && status === 'pending' && (
                <>
                  <TouchableOpacity
                    style={[styles.primaryButton, themed.primaryButton]}
                    activeOpacity={0.85}
                    onPress={acceptOffer}
                  >
                    <Text style={styles.primaryButtonText}>Принять</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    activeOpacity={0.85}
                    onPress={rejectOffer}
                  >
                    <Text style={styles.secondaryButtonText}>Отклонить</Text>
                  </TouchableOpacity>
                </>
              )}

              {mode !== 'owner' && status !== 'accepted' && (
                <TouchableOpacity
                  style={[styles.primaryButton, themed.primaryButton]}
                  activeOpacity={0.85}
                  onPress={editOffer}
                >
                  <Text style={styles.primaryButtonText}>Изменить</Text>
                </TouchableOpacity>
              )}

              {canShowComplete && (
                <TouchableOpacity
                  style={[styles.completeButton, actorCompleted && styles.completeButtonDisabled]}
                  activeOpacity={0.85}
                  disabled={actorCompleted}
                  onPress={confirmComplete}
                >
                  <Text style={styles.completeButtonText}>
                    {actorCompleted ? 'Подтверждено' : 'Подтвердить завершение'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.ghostButton, themed.ghostButton]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/cargo-details',
                    params: { id: loadId },
                  })
                }
              >
                <Text style={[styles.ghostButtonText, themed.text]}>Открыть груз</Text>
              </TouchableOpacity>

              {mode === 'owner' && (
                <TouchableOpacity
                  style={[styles.primaryButton, themed.primaryButton]}
                  activeOpacity={0.85}
                  onPress={openOfferChat}
                >
                  <Text style={styles.primaryButtonText}>Написать</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#081120' },
  scroll: { flex: 1, backgroundColor: '#081120' },
  scrollContent: { paddingBottom: 28 },
  container: { paddingHorizontal: 18, paddingTop: 16 },
  back: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },
  pageSubtitle: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  route: {
    color: '#D7E0EE',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  price: {
    color: '#2F80ED',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
  },
  metaBlock: {
    marginBottom: 12,
  },
  metaLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 4,
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  commentBox: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 12,
  },
  commentTitle: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  commentText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  loaderWrap: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#2F80ED',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  completeButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeButtonDisabled: {
    opacity: 0.62,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  completionBadge: {
    alignSelf: 'flex-start',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
  },
  completionWaiting: {
    backgroundColor: '#1D4ED8',
  },
  completionConfirmed: {
    backgroundColor: '#16A34A',
  },
  completionDone: {
    backgroundColor: '#64748B',
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: '#D7E0EE',
    fontSize: 15,
    fontWeight: '700',
  },
});

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createThemedStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background },
    card: { backgroundColor: colors.surface, borderColor: colors.border },
    commentBox: { backgroundColor: colors.surfaceStrong },
    text: { color: colors.text },
    mutedText: { color: colors.mutedText },
    link: { color: colors.primarySoft },
    primaryText: { color: colors.primary },
    primaryButton: { backgroundColor: colors.primary },
    ghostButton: { borderColor: colors.border },
  });
}


