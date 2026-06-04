import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { API_BASE_URL } from '../../lib/api';
import { useAppTheme } from '../../lib/theme';

type LoadItem = {
  id: number;
  from_location: string;
  to_location: string;
  weight: number | string;
  type: string;
  price: number | string;
  date: string;
  status?: string;
  description?: string;
  contact_info?: string;
};

type StatusFilter = 'all' | 'open' | 'urgent' | 'cheap';

type FilterDraft = {
  status: StatusFilter;
  from: string;
  to: string;
  loadType: string;
  dateFrom: string;
  dateTo: string;
  priceFrom: string;
  priceTo: string;
  weightFrom: string;
  weightTo: string;
  onlyWithDescription: boolean;
};

const DEFAULT_FILTERS: FilterDraft = {
  status: 'all',
  from: '',
  to: '',
  loadType: '',
  dateFrom: '',
  dateTo: '',
  priceFrom: '',
  priceTo: '',
  weightFrom: '',
  weightTo: '',
  onlyWithDescription: false,
};

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

export default function MainScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [loads, setLoads] = useState<LoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(DEFAULT_FILTERS);

  const fetchLoads = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const { response, data } = await fetchJsonWithTimeout(`${API_BASE_URL}/api/mobile/loads`);

      if (!response.ok) {
        setError(data?.error || 'Не удалось загрузить грузы');
        setLoads([]);
        return;
      }

      setLoads(Array.isArray(data) ? data.filter((item) => String(item.status || 'open').toLowerCase() !== 'completed') : []);
    } catch (err) {
      console.log('Fetch loads error:', err);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      setError(
        isTimeout
          ? 'Сервер не ответил за 8 секунд. Проверьте backend и adb reverse.'
          : 'Не удалось подключиться к серверу'
      );
      setLoads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLoads(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLoads(false);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLoads(false);
  };

  const updateDraftFilter = <K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const filteredCargo = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedFrom = appliedFilters.from.trim().toLowerCase();
    const normalizedTo = appliedFilters.to.trim().toLowerCase();
    const normalizedLoadType = appliedFilters.loadType.trim().toLowerCase();
    const parsedPriceFrom = Number(appliedFilters.priceFrom);
    const parsedPriceTo = Number(appliedFilters.priceTo);
    const parsedWeightFrom = Number(appliedFilters.weightFrom);
    const parsedWeightTo = Number(appliedFilters.weightTo);
    const normalizedDateFrom = appliedFilters.dateFrom.trim();
    const normalizedDateTo = appliedFilters.dateTo.trim();

    const isUrgentDate = (value?: string) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return false;
      if (raw.includes('сегодня') || raw.includes('завтра')) return true;

      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const target = new Date(parsed);
      target.setHours(0, 0, 0, 0);

      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
      return diffDays >= 0 && diffDays <= 1;
    };

    let result = loads.filter((item) => {
      const route = `${item.from_location} ${item.to_location}`.toLowerCase();
      const cargoType = String(item.type || '').toLowerCase();
      const description = String(item.description || '').toLowerCase();
      const fromLocation = String(item.from_location || '').toLowerCase();
      const toLocation = String(item.to_location || '').toLowerCase();
      const numericWeight = Number(item.weight || 0);
      const numericPrice = Number(item.price || 0);
      const rawDate = String(item.date || '').trim();

      const matchesSearch =
        !normalizedSearch ||
        route.includes(normalizedSearch) ||
        cargoType.includes(normalizedSearch) ||
        description.includes(normalizedSearch);

      const matchesFrom = !normalizedFrom || fromLocation.includes(normalizedFrom);
      const matchesTo = !normalizedTo || toLocation.includes(normalizedTo);
      const matchesType = !normalizedLoadType || cargoType.includes(normalizedLoadType);
      const matchesPriceFrom =
        !appliedFilters.priceFrom.trim() ||
        (Number.isFinite(parsedPriceFrom) && numericPrice >= parsedPriceFrom);
      const matchesPriceTo =
        !appliedFilters.priceTo.trim() ||
        (Number.isFinite(parsedPriceTo) && numericPrice <= parsedPriceTo);
      const matchesWeightFrom =
        !appliedFilters.weightFrom.trim() ||
        (Number.isFinite(parsedWeightFrom) && numericWeight >= parsedWeightFrom);
      const matchesWeightTo =
        !appliedFilters.weightTo.trim() ||
        (Number.isFinite(parsedWeightTo) && numericWeight <= parsedWeightTo);
      const matchesDateFrom = !normalizedDateFrom || rawDate >= normalizedDateFrom;
      const matchesDateTo = !normalizedDateTo || rawDate <= normalizedDateTo;
      const matchesDescription = !appliedFilters.onlyWithDescription || Boolean(description.trim());

      return (
        matchesSearch &&
        matchesFrom &&
        matchesTo &&
        matchesType &&
        matchesPriceFrom &&
        matchesPriceTo &&
        matchesWeightFrom &&
        matchesWeightTo &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesDescription
      );
    });

    if (appliedFilters.status === 'cheap') {
      result = [...result].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    }

    if (appliedFilters.status === 'open') {
      result = result.filter((item) => String(item.status || 'open').toLowerCase() === 'open');
    }

    if (appliedFilters.status === 'urgent') {
      result = result.filter((item) => isUrgentDate(item.date));
    }

    return result;
  }, [loads, search, appliedFilters]);

  const formatPrice = (price: number | string) => {
    const numeric = Number(price || 0);
    if (Number.isNaN(numeric)) return `${price} ₸`;
    return `${numeric.toLocaleString('ru-RU')} ₸`;
  };

  const formatWeight = (weight: number | string) => {
    if (weight === null || weight === undefined || weight === '') return '-';
    return `${weight} т`;
  };

  const openFilter = () => {
    setDraftFilters(appliedFilters);
    setIsFilterOpen(true);
  };

  const resetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setIsFilterOpen(false);
  };

  const openRoute = (item: LoadItem) => {
    router.push({
      pathname: '/map',
      params: {
        loadId: String(item.id),
        title: item.type || 'Груз',
        from: item.from_location || '',
        to: item.to_location || '',
        price: String(item.price || ''),
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Загружаем грузы...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.brand}>RouteHub</Text>
                <Text style={styles.headerText}>Найди подходящий груз быстро</Text>
              </View>

              <TouchableOpacity
                style={styles.filterHeaderButton}
                onPress={openFilter}
                activeOpacity={0.85}
              >
                <Text style={styles.filterHeaderText}>Фильтр</Text>
                <View style={styles.filterHeaderIcon}>
                  <View style={styles.filterLine}>
                    <View style={[styles.filterDot, styles.filterDotTop]} />
                  </View>
                  <View style={styles.filterLine}>
                    <View style={[styles.filterDot, styles.filterDotMiddle]} />
                  </View>
                  <View style={styles.filterLine}>
                    <View style={[styles.filterDot, styles.filterDotBottom]} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Поиск груза или маршрута"
                placeholderTextColor={colors.mutedText}
                style={styles.searchInput}
              />
            </View>

            <View style={styles.filterBadges}>
              {!!appliedFilters.from && <Text style={styles.filterBadge}>Откуда: {appliedFilters.from}</Text>}
              {!!appliedFilters.to && <Text style={styles.filterBadge}>Куда: {appliedFilters.to}</Text>}
              {!!appliedFilters.loadType && <Text style={styles.filterBadge}>Тип: {appliedFilters.loadType}</Text>}
              {!!appliedFilters.weightTo && <Text style={styles.filterBadge}>До {appliedFilters.weightTo} т</Text>}
              {!!appliedFilters.priceTo && <Text style={styles.filterBadge}>До {appliedFilters.priceTo} ₸</Text>}
              {appliedFilters.status !== 'all' && <Text style={styles.filterBadge}>Режим: {appliedFilters.status}</Text>}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Доступные грузы</Text>
              <Text style={styles.sectionCount}>{filteredCargo.length}</Text>
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Ошибка загрузки</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  activeOpacity={0.85}
                  onPress={() => fetchLoads(true)}
                >
                  <Text style={styles.retryButtonText}>Повторить</Text>
                </TouchableOpacity>
              </View>
            ) : filteredCargo.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Грузов пока нет</Text>
                <Text style={styles.emptyText}>
                  Когда в базе появятся записи, они будут показаны здесь.
                </Text>
              </View>
            ) : (
              <View style={styles.cards}>
                {filteredCargo.map((item) => (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle}>{item.type || 'Груз'}</Text>
                      <Text style={styles.price}>{formatPrice(item.price)}</Text>
                    </View>

                    <Text style={styles.route}>
                      {item.from_location} в {item.to_location}
                    </Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>Дата: {item.date || 'Не указана'}</Text>
                      <Text style={styles.metaText}>Вес: {formatWeight(item.weight)}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>Транспорт: {item.type || '-'}</Text>
                      <Text style={styles.metaText}>Статус: {item.status || 'open'}</Text>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[styles.detailsButton, styles.routeButton]}
                        activeOpacity={0.85}
                        onPress={() => openRoute(item)}
                      >
                        <Text style={styles.detailsButtonText}>Маршрут</Text>
                      </TouchableOpacity>

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
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <Modal visible={isFilterOpen} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.filterModalSafe}>
            <View style={styles.filterModalHeader}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setIsFilterOpen(false)}>
                <Text style={styles.filterClose}>Закрыть</Text>
              </TouchableOpacity>
              <Text style={styles.filterModalTitle}>Фильтр</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={resetFilters}>
                <Text style={styles.filterReset}>Сбросить</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Статус</Text>
                <View style={styles.segmented}>
                  <TouchableOpacity
                    style={[styles.segment, draftFilters.status === 'all' && styles.segmentActive]}
                    onPress={() => updateDraftFilter('status', 'all')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, draftFilters.status === 'all' && styles.segmentTextActive]}>Все</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, draftFilters.status === 'open' && styles.segmentActive]}
                    onPress={() => updateDraftFilter('status', 'open')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, draftFilters.status === 'open' && styles.segmentTextActive]}>Открытые</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, draftFilters.status === 'urgent' && styles.segmentActive]}
                    onPress={() => updateDraftFilter('status', 'urgent')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, draftFilters.status === 'urgent' && styles.segmentTextActive]}>Срочные</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Маршрут</Text>
                <TextInput value={draftFilters.from} onChangeText={(v) => updateDraftFilter('from', v)} placeholder="Откуда" placeholderTextColor={colors.mutedText} style={styles.filterInput} />
                <TextInput value={draftFilters.to} onChangeText={(v) => updateDraftFilter('to', v)} placeholder="Куда" placeholderTextColor={colors.mutedText} style={styles.filterInput} />
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Тип груза</Text>
                <TextInput value={draftFilters.loadType} onChangeText={(v) => updateDraftFilter('loadType', v)} placeholder="Например: фура, тент, реф" placeholderTextColor={colors.mutedText} style={styles.filterInput} />
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Дата</Text>
                <View style={styles.rangeRow}>
                  <TextInput value={draftFilters.dateFrom} onChangeText={(v) => updateDraftFilter('dateFrom', v)} placeholder="от YYYY-MM-DD" placeholderTextColor={colors.mutedText} style={styles.rangeInput} />
                  <TextInput value={draftFilters.dateTo} onChangeText={(v) => updateDraftFilter('dateTo', v)} placeholder="до YYYY-MM-DD" placeholderTextColor={colors.mutedText} style={styles.rangeInput} />
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Цена, ₸</Text>
                <View style={styles.rangeRow}>
                  <TextInput value={draftFilters.priceFrom} onChangeText={(v) => updateDraftFilter('priceFrom', v)} placeholder="от" placeholderTextColor={colors.mutedText} style={styles.rangeInput} keyboardType="numeric" />
                  <TextInput value={draftFilters.priceTo} onChangeText={(v) => updateDraftFilter('priceTo', v)} placeholder="до" placeholderTextColor={colors.mutedText} style={styles.rangeInput} keyboardType="numeric" />
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Вес, т</Text>
                <View style={styles.rangeRow}>
                  <TextInput value={draftFilters.weightFrom} onChangeText={(v) => updateDraftFilter('weightFrom', v)} placeholder="от" placeholderTextColor={colors.mutedText} style={styles.rangeInput} keyboardType="numeric" />
                  <TextInput value={draftFilters.weightTo} onChangeText={(v) => updateDraftFilter('weightTo', v)} placeholder="до" placeholderTextColor={colors.mutedText} style={styles.rangeInput} keyboardType="numeric" />
                </View>
              </View>

              <TouchableOpacity
                style={styles.toggleRow}
                activeOpacity={0.85}
                onPress={() => updateDraftFilter('onlyWithDescription', !draftFilters.onlyWithDescription)}
              >
                <View>
                  <Text style={styles.toggleTitle}>Только с описанием</Text>
                  <Text style={styles.toggleSubtitle}>Скрыть пустые карточки без деталей</Text>
                </View>
                <View style={[styles.togglePill, draftFilters.onlyWithDescription && styles.togglePillActive]}>
                  <View style={[styles.toggleKnob, draftFilters.onlyWithDescription && styles.toggleKnobActive]} />
                </View>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.filterFooter}>
              <TouchableOpacity style={styles.applyButton} activeOpacity={0.9} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>Показать {filteredCargo.length} объявлений</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

type MainColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: MainColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4,
  },
  headerText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  filterHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 4,
  },
  filterHeaderText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '500',
  },
  filterHeaderIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
  },
  filterLine: {
    width: 2,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.primary,
    position: 'relative',
  },
  filterDot: {
    position: 'absolute',
    left: -3,
    width: 7,
    height: 7,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  filterDotTop: {
    top: 1,
  },
  filterDotMiddle: {
    top: 7,
  },
  filterDotBottom: {
    top: 12,
  },
  searchBox: {
    marginBottom: 14,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: colors.text,
    fontSize: 15,
  },
  filterBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  filterBadge: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterModalSafe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterClose: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  filterModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  filterReset: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  filterScroll: {
    flex: 1,
  },
  filterScrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  filterSection: {
    marginBottom: 18,
  },
  filterLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.text,
  },
  filterInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
    marginBottom: 10,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rangeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
  },
  toggleRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleSubtitle: {
    color: colors.mutedText,
    fontSize: 13,
  },
  togglePill: {
    width: 52,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.border,
    padding: 3,
  },
  togglePillActive: {
    backgroundColor: colors.primary,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  filterFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
  },
  applyButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.primarySoft,
    fontSize: 15,
    fontWeight: '800',
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
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
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
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  detailsButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  routeButton: {
    backgroundColor: '#0891B2',
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  });
}






