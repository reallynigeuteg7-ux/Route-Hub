import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../lib/api';
import { useAppTheme } from '../../lib/theme';

type FavoriteLoad = {
  id: number;
  from_location: string;
  to_location: string;
  weight: number | string;
  type: string;
  price: number | string;
  date: string;
  status?: string;
};

export default function FavoritesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
const [favoriteCargo, setFavoriteCargo] = useState<FavoriteLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchFavorites = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        setError('Пользователь не авторизован');
        setFavoriteCargo([]);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || 'Не удалось загрузить избранное');
        setFavoriteCargo([]);
        return;
      }

      setFavoriteCargo(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Fetch favorites error:', err);
      setError('Не удалось подключиться к серверу');
      setFavoriteCargo([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFavorites(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFavorites(false);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites(false);
  };

  const removeFromFavorites = async (loadId: number) => {
    try {
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites/${loadId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось убрать из избранного');
        return;
      }

      setFavoriteCargo((prev) => prev.filter((item) => item.id !== loadId));
    } catch (err) {
      console.log('Remove favorite error:', err);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  };

  const isEmpty = useMemo(() => favoriteCargo.length === 0, [favoriteCargo]);

  const formatPrice = (price: number | string) => {
    const numeric = Number(price || 0);
    if (Number.isNaN(numeric)) return `${price} ₸`;
    return `${numeric.toLocaleString('ru-RU')} ₸`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Загружаем избранное...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.container}>
          <Text style={styles.pageTitle}>Избранное</Text>
          <Text style={styles.pageSubtitle}>
            Сохраняй интересные грузы и возвращайся к ним позже
          </Text>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Ошибка загрузки</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                activeOpacity={0.85}
                onPress={() => fetchFavorites(true)}
              >
                <Text style={styles.retryButtonText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : isEmpty ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Пока ничего нет</Text>
              <Text style={styles.emptySubtitle}>
                Добавь грузы в избранное, и они появятся здесь.
              </Text>
            </View>
          ) : (
            <View style={styles.cards}>
              {favoriteCargo.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{item.type || 'Груз'}</Text>
                    <Text style={styles.price}>{formatPrice(item.price)}</Text>
                  </View>

                  <Text style={styles.route}>
                    {item.from_location} → {item.to_location}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Дата: {item.date || 'Не указана'}</Text>
                    <Text style={styles.metaText}>Вес: {item.weight ? `${item.weight} т` : '—'}</Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.detailsButton}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({
                          pathname: '/cargo-details',
                          params: { id: String(item.id) },
                        })
                      }
                    >
                      <Text style={styles.detailsButtonText}>Подробнее</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeButton}
                      activeOpacity={0.85}
                      onPress={() => removeFromFavorites(item.id)}
                    >
                      <Text style={styles.removeButtonText}>Убрать</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type TabThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: TabThemeColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  centerState: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerText: {
    marginTop: 14,
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  pageTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },
  pageSubtitle: {
    color: colors.mutedText,
    fontSize: 15,
    marginBottom: 20,
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginTop: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  cards: {
    gap: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  price: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  route: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  metaText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  detailsButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  removeButton: {
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  });
}



