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
import { useAppTheme } from '../lib/theme';

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

function getCountLabel(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return 'отзывов';
  const last = count % 10;
  if (last === 1) return 'отзыв';
  if (last >= 2 && last <= 4) return 'отзыва';
  return 'отзывов';
}

function getRoleLabel(role?: string) {
  if (role === 'carrier') return 'Перевозчик';
  if (role === 'client') return 'Грузовладелец';
  return 'Пользователь';
}

export default function UserReviewsScreen() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { userId, userName } = useLocalSearchParams<{ userId: string; userName: string }>();
  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchReviews = async (showLoader = true) => {
    try {
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
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error || 'Не удалось загрузить отзывы');
        return;
      }

      setData(result);
    } catch (err) {
      console.log('Fetch reviews error:', err);
      setError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userId) void fetchReviews(true);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) void fetchReviews(false);
    }, [userId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void fetchReviews(false);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const renderStars = (rating: number, size = 18) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons key={star} name={star <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color={star <= Math.round(rating) ? '#F59E0B' : colors.border} />
      ))}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Загружаем отзывы...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.pageTitle}>Мой рейтинг</Text>
          <Text style={styles.pageSubtitle}>Отзывы о сотрудничестве с {userName || 'пользователем'}</Text>

          {data && (
            <View style={styles.summaryCard}>
              <Text style={styles.bigRating}>{data.averageRating > 0 ? data.averageRating.toFixed(1) : '—'}</Text>
              {renderStars(data.averageRating, 24)}
              <Text style={styles.totalCount}>{data.totalCount} {getCountLabel(data.totalCount)}</Text>
            </View>
          )}

          {error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Ошибка загрузки</Text>
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} activeOpacity={0.85} onPress={() => fetchReviews(true)}>
                <Text style={styles.retryButtonText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : !data || data.reviews.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Отзывов пока нет</Text>
              <Text style={styles.stateText}>После завершения перевозок здесь появится история сотрудничества.</Text>
            </View>
          ) : (
            <View style={styles.reviewsList}>
              {data.reviews.map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>{review.authorName?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={styles.reviewAuthorInfo}>
                      <Text style={styles.reviewAuthorName}>{review.authorName}</Text>
                      <Text style={styles.reviewAuthorRole}>{getRoleLabel(review.authorRole)}</Text>
                    </View>
                    <Text style={styles.reviewRatingText}>★ {review.rating}</Text>
                  </View>

                  {renderStars(review.rating, 15)}
                  {!!review.loadRoute && <Text style={styles.reviewRouteText}>{review.loadRoute}</Text>}
                  {!!review.text && <Text style={styles.reviewText}>{review.text}</Text>}
                  <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                </View>
              ))}
            </View>
          )}
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
    scrollContent: { paddingBottom: 32 },
    container: { paddingHorizontal: 18, paddingTop: 16 },
    centerState: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
    centerText: { marginTop: 14, color: colors.mutedText, fontSize: 15, fontWeight: '600' },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 16 },
    pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
    pageSubtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    starsRow: { flexDirection: 'row', gap: 2 },
    summaryCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8, marginBottom: 18 },
    bigRating: { color: colors.text, fontSize: 42, fontWeight: '900', lineHeight: 48 },
    totalCount: { color: colors.mutedText, fontSize: 13, fontWeight: '700' },
    stateCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border },
    stateTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
    stateText: { color: colors.mutedText, fontSize: 15, lineHeight: 22 },
    retryButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    reviewsList: { gap: 12 },
    reviewCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: colors.border },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    reviewAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    reviewAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
    reviewAuthorInfo: { flex: 1 },
    reviewAuthorName: { color: colors.text, fontSize: 15, fontWeight: '900' },
    reviewAuthorRole: { color: colors.mutedText, fontSize: 12, fontWeight: '700', marginTop: 2 },
    reviewRatingText: { color: '#F59E0B', fontSize: 14, fontWeight: '900' },
    reviewRouteText: { color: colors.primarySoft, fontSize: 12, fontWeight: '800', marginTop: 10 },
    reviewText: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 10 },
    reviewDate: { color: colors.mutedText, fontSize: 12, fontWeight: '600', marginTop: 10 },
  });
}