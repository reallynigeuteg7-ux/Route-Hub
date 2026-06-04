import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { API_BASE_URL } from '../lib/api';
import { publishCurrentCarrierLocationForActiveLoads, syncPersistentLocationTracking } from '../lib/background-location';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';

type ActiveCargo = {
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
  load_status?: string;
  ownerName?: string;
  ownerCompany?: string;
  carrierCompleted?: boolean;
};

type OffersResponse = {
  mode?: 'carrier' | 'owner';
  items?: ActiveCargo[];
  error?: string;
};

const T = {
  back: '\u2190 \u041d\u0430\u0437\u0430\u0434',
  title: '\u041c\u043e\u0438 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0433\u0440\u0443\u0437\u044b',
  subtitle: '\u041f\u0440\u0438\u043d\u044f\u0442\u044b\u0435 \u0440\u0435\u0439\u0441\u044b, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u0432 \u0440\u0430\u0431\u043e\u0442\u0435',
  loading: '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0433\u0440\u0443\u0437\u044b...',
  unauthorized: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d',
  loadFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0433\u0440\u0443\u0437\u044b',
  serverFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443',
  emptyTitle: '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0433\u0440\u0443\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442',
  emptyText: '\u041a\u043e\u0433\u0434\u0430 \u0437\u0430\u043a\u0430\u0437\u0447\u0438\u043a \u043f\u0440\u0438\u043c\u0435\u0442 \u0442\u0432\u043e\u044e \u0441\u0442\u0430\u0432\u043a\u0443, \u0433\u0440\u0443\u0437 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0437\u0434\u0435\u0441\u044c.',
  cargo: '\u0413\u0440\u0443\u0437',
  date: '\u0414\u0430\u0442\u0430',
  notSet: '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430',
  owner: '\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a',
  status: '\u0421\u0442\u0430\u0442\u0443\u0441',
  accepted: '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435',
  map: '\u041a\u0430\u0440\u0442\u0430',
  go: '\u0412 \u043f\u0443\u0442\u044c',
  details: '\u0414\u0435\u0442\u0430\u043b\u0438',
  tenge: '\u20b8',
  dash: '\u2014',
  arrow: '\u2192',
};

export default function ActiveCargosScreen() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const [items, setItems] = useState<ActiveCargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadItems = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setItems([]);
        setError(T.unauthorized);
        return;
      }

      const response = await fetch(API_BASE_URL + '/api/mobile/offers-screen', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data: OffersResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        setItems([]);
        setError(data.error || T.loadFailed);
        return;
      }

      const activeItems = Array.isArray(data.items)
        ? data.items.filter((item) => {
            const status = String(item.status || '').toLowerCase();
            const loadStatus = String(item.load_status || '').toLowerCase();
            return data.mode === 'carrier' && status === 'accepted' && loadStatus === 'assigned' && !item.carrierCompleted;
          })
        : [];

      setItems(activeItems);

      if (activeItems.length) {
        void publishCurrentCarrierLocationForActiveLoads().catch((err) => {
          console.log('Active cargos publish location error:', err);
        });
        void syncPersistentLocationTracking().catch((err) => {
          console.log('Active cargos sync location error:', err);
        });
      }
    } catch (err) {
      console.log('active-cargos load error:', err);
      setItems([]);
      setError(T.serverFailed);
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
    const label = currency === 'KZT' ? T.tenge : currency;
    if (Number.isNaN(numeric)) return String(value || 0) + ' ' + label;
    return numeric.toLocaleString('ru-RU') + ' ' + label;
  };

  const openMap = (item: ActiveCargo, autoStartTrip = false) => {
    router.push({
      pathname: '/map',
      params: {
        loadId: String(item.loadId),
        title: item.load_type || T.cargo,
        from: item.from_location || '',
        to: item.to_location || '',
        price: String(item.price || ''),
        trackCarrier: '1',
        autoStartTrip: autoStartTrip ? '1' : '',
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themed.safeArea]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={[styles.center, themed.safeArea]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, themed.mutedText]}>{T.loading}</Text>
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
          <Text style={[styles.back, themed.link]}>{T.back}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, themed.text]}>{T.title}</Text>
        <Text style={[styles.subtitle, themed.mutedText]}>{T.subtitle}</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!error && items.length === 0 && (
          <View style={[styles.emptyCard, themed.card]}>
            <Text style={[styles.emptyTitle, themed.text]}>{T.emptyTitle}</Text>
            <Text style={[styles.emptyText, themed.mutedText]}>{T.emptyText}</Text>
          </View>
        )}

        {items.map((item) => (
          <View key={item.id} style={[styles.card, themed.card]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, themed.text]}>{item.load_type || T.cargo}</Text>
              <Text style={[styles.price, themed.primaryText]}>{formatPrice(item.price, item.currency)}</Text>
            </View>

            <Text style={[styles.route, themed.text]}>
              {item.from_location || T.dash} {T.arrow} {item.to_location || T.dash}
            </Text>
            <Text style={[styles.meta, themed.mutedText]}>{T.date}: {item.pickupDate || T.notSet}</Text>
            <Text style={[styles.meta, themed.mutedText]}>{T.owner}: {item.ownerCompany || item.ownerName || T.notSet}</Text>
            <Text style={[styles.statusBadge]}>{T.status}: {T.accepted}</Text>

            <View style={styles.actionsGrid}>
              <TouchableOpacity style={[styles.primaryButton, themed.primaryButton, styles.mapButton]} activeOpacity={0.85} onPress={() => openMap(item, false)}>
                <Text style={styles.primaryButtonText}>{T.map}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.primaryButton, styles.goButton]} activeOpacity={0.85} onPress={() => openMap(item, true)}>
                <Text style={styles.primaryButtonText}>{T.go}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.primaryButton, styles.detailsButton]} activeOpacity={0.85} onPress={() => router.push({ pathname: '/cargo-details', params: { id: String(item.loadId) } })}>
                <Text style={styles.primaryButtonText}>{T.details}</Text>
              </TouchableOpacity>
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
  statusBadge: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 12, color: '#22C55E', backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)', fontSize: 13, fontWeight: '900', overflow: 'hidden' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  primaryButton: { flexGrow: 1, minWidth: '30%', backgroundColor: '#2F80ED', borderRadius: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  mapButton: { backgroundColor: '#0891B2' },
  goButton: { backgroundColor: '#22C55E' },
  detailsButton: { backgroundColor: '#2F80ED' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
});

type ActiveCargoThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createThemedStyles(colors: ActiveCargoThemeColors) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background },
    text: { color: colors.text },
    mutedText: { color: colors.mutedText },
    link: { color: colors.primarySoft },
    primaryText: { color: colors.primary },
    primaryButton: { backgroundColor: colors.primary },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  });
}
