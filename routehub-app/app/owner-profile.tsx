import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../lib/api';

type ReviewItem = {
  id: number;
  rating: number;
  text?: string;
  createdAt: string;
  authorName: string;
  authorRole?: string;
  loadRoute?: string;
};

type ReviewsData = {
  averageRating: number;
  totalCount: number;
  reviews: ReviewItem[];
};

function StarRow({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating) ? 'star' : 'star-outline'}
          size={size}
          color={star <= Math.round(rating) ? '#F59E0B' : 'rgba(255,255,255,0.15)'}
        />
      ))}
    </View>
  );
}

function getProfileTypeLabel(value?: string | null) {
  switch (String(value || '').trim()) {
    case 'too':
    case 'company':
      return 'ТОО';
    case 'ip':
      return 'ИП';
    case 'self_employed':
    case 'individual':
      return 'Самозанятый';
    case 'legal':
      return 'Юр. лицо';
    default:
      return 'Не указано';
  }
}

function getRoleLabel(role?: string) {
  if (role === 'carrier') return 'Перевозчик';
  if (role === 'client') return 'Грузовладелец';
  return 'Пользователь';
}

function getReviewsLabel(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return 'отзывов';
  const last = count % 10;
  if (last === 1) return 'отзыв';
  if (last >= 2 && last <= 4) return 'отзыва';
  return 'отзывов';
}

export default function OwnerProfileScreen() {
  const {
    userId,
    userName,
    company,
    personType,
    address,
    phone,
    code,
    verified,
    rating,
    reviewsCount,
  } = useLocalSearchParams<{
    userId: string;
    userName: string;
    company: string;
    personType: string;
    address: string;
    phone: string;
    code: string;
    verified: string;
    rating: string;
    reviewsCount: string;
  }>();

  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchReviews = async (showLoader = true) => {
    try {
      if (!userId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoader) setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setError('Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/reviews/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result?.error || 'Не удалось загрузить отзывы');
        return;
      }

      setData(result);
    } catch (err) {
      console.log('Owner profile reviews error:', err);
      setError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchReviews(true);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void fetchReviews(false);
    }, [userId])
  );

  const displayName = company || userName || 'Владелец';
  const contactName = userName || displayName;
  const profileTypeLabel = getProfileTypeLabel(personType);
  const ownerAddress = address || 'Адрес не указан';
  const ownerPhone = phone || 'Не указан';
  const ownerCode = code || '—';
  const ownerRating = Number(data?.averageRating ?? rating ?? 0);
  const ownerReviewsCount = Number(data?.totalCount ?? reviewsCount ?? 0);
  const verifiedBadge = verified === '1';

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const infoRows: Array<{ label: string; value: string; tone?: 'success' | 'warning' }> = [
    { label: 'Компания / ФИО', value: displayName },
    { label: 'Контактное лицо', value: contactName },
    { label: 'Форма профиля', value: profileTypeLabel },
    { label: 'Адрес', value: ownerAddress },
    { label: 'Роль', value: 'Грузовладелец' },
    { label: 'Код пользователя', value: ownerCode },
    {
      label: 'Статус ЭЦП',
      value: verifiedBadge ? 'Верифицирован' : 'Не верифицирован',
      tone: verifiedBadge ? 'success' : 'warning',
    },
    { label: 'Телефон', value: ownerPhone },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchReviews(false);
            }}
            tintColor="#2F80ED"
          />
        }
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <View style={styles.ownerCard}>
            <View style={styles.ownerHeaderRow}>
              <View style={styles.ownerIconBox}>
                <Ionicons name="business" size={24} color="#94A3B8" />
              </View>
              <View style={styles.ownerMain}>
                <Text style={styles.ownerName}>{displayName}</Text>
                <Text style={styles.ownerType}>{profileTypeLabel}</Text>
                <Text style={styles.ownerSubText}>{ownerAddress}</Text>
                <Text style={styles.ownerSubText}>Грузовладелец</Text>

                <View style={styles.ownerStarsRow}>
                  <StarRow rating={ownerRating} size={18} />
                  <Text style={styles.ownerReviewsText}>
                    {ownerReviewsCount} {getReviewsLabel(ownerReviewsCount)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.metaCard}>
              {infoRows.map((row, index) => (
                <View
                  key={row.label}
                  style={[styles.metaRow, index === infoRows.length - 1 && styles.metaRowLast]}
                >
                  <Text style={styles.metaLabel}>{row.label}</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      row.tone === 'success' && styles.verifiedValue,
                      row.tone === 'warning' && styles.pendingValue,
                    ]}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Отзывы о владельце</Text>
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color="#2F80ED" />
                <Text style={styles.centerText}>Загружаем отзывы...</Text>
              </View>
            ) : error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Ошибка загрузки</Text>
                <Text style={styles.emptyText}>{error}</Text>
              </View>
            ) : !data || data.reviews.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Отзывов пока нет</Text>
                <Text style={styles.emptyText}>
                  После завершения перевозок здесь появится история сотрудничества.
                </Text>
              </View>
            ) : (
              <View style={styles.reviewsList}>
                {data.reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewAvatar}>
                        <Text style={styles.reviewAvatarText}>
                          {review.authorName?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View style={styles.reviewAuthorInfo}>
                        <Text style={styles.reviewAuthorName}>{review.authorName}</Text>
                        <Text style={styles.reviewAuthorRole}>{getRoleLabel(review.authorRole)}</Text>
                      </View>
                      <Text style={styles.reviewRatingText}>★ {review.rating}</Text>
                    </View>

                    {!!review.loadRoute && (
                      <View style={styles.reviewRouteTag}>
                        <Text style={styles.reviewRouteText}>{review.loadRoute}</Text>
                      </View>
                    )}

                    {!!review.text && <Text style={styles.reviewText}>{review.text}</Text>}
                    <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#081120' },
  scroll: { flex: 1, backgroundColor: '#081120' },
  scrollContent: { paddingBottom: 32 },
  container: { paddingHorizontal: 18, paddingTop: 16 },
  back: { color: '#38BDF8', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  ownerCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  ownerHeaderRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  ownerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerMain: { flex: 1 },
  ownerName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  ownerType: { color: '#38BDF8', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  ownerSubText: { color: '#94A3B8', fontSize: 14, marginBottom: 2 },
  ownerStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  ownerReviewsText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  metaCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  metaRowLast: {
    borderBottomWidth: 0,
  },
  metaLabel: { color: '#94A3B8', fontSize: 14, flex: 1 },
  metaValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1, textAlign: 'right' },
  verifiedValue: { color: '#22C55E' },
  pendingValue: { color: '#F59E0B' },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  centerState: { paddingVertical: 28, alignItems: 'center' },
  centerText: { marginTop: 12, color: '#CBD5E1', fontSize: 14, fontWeight: '600' },
  emptyState: { paddingVertical: 20 },
  emptyTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: '#94A3B8', fontSize: 14, lineHeight: 22 },
  reviewsList: { gap: 12 },
  reviewCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2F80ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  reviewAuthorInfo: { flex: 1 },
  reviewAuthorName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  reviewAuthorRole: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  reviewRatingText: { color: '#F59E0B', fontSize: 13, fontWeight: '900' },
  reviewRouteTag: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(47,128,237,0.12)',
  },
  reviewRouteText: { color: '#93C5FD', fontSize: 12, fontWeight: '700' },
  reviewText: { color: '#E2E8F0', fontSize: 14, lineHeight: 22, marginBottom: 10 },
  reviewDate: { color: '#64748B', fontSize: 12, fontWeight: '600' },
});
