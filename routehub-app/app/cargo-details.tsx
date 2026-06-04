import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';

type LoadDetails = {
  id: number;
  from_location: string;
  to_location: string;
  weight: number | string;
  type: string;
  price: number | string;
  date: string;
  contact_info?: string;
  volume?: number | string;
  length?: number | string;
  width?: number | string;
  height?: number | string;
  loading_type?: string;
  description?: string;
  status?: string;
  client_name?: string;
  client_phone?: string;
  client_company?: string;
  client_person_type?: string;
  client_code?: string;
  client_ecp_verified?: boolean;
  client_address?: string;
  client_rating?: number | string;
  client_reviews_count?: number | string;
  userId?: number | string;
  carrierUserId?: number;
  carrierName?: string;
  carrierPhone?: string;
};

type FavoriteLoad = {
  id: number;
};

type RoutePoint = [number, number];

const MAPGL_API_KEY = '9951811e-e54b-4b36-b793-ebf47deb7d64';

const CITY_COORDS: Record<string, RoutePoint> = {
  'Алматы': [76.8897, 43.2389],
  'Астана': [71.4491, 51.1694],
  'Шымкент': [69.5901, 42.3417],
  'Караганда': [73.085, 49.806],
  'Актобе': [57.167, 50.2839],
  'Актау': [51.1694, 43.6532],
  'Атырау': [51.9239, 47.0945],
  'Тараз': [71.3658, 42.9],
  'Павлодар': [76.9674, 52.2871],
  'Костанай': [63.6246, 53.2198],
  'Уральск': [51.3865, 51.2225],
  'Усть-Каменогорск': [82.6059, 49.9483],
  'Кызылорда': [65.5092, 44.8488],
  'Семей': [80.2275, 50.4111],
  'Петропавловск': [69.1628, 54.8728],
  'Туркестан': [68.2519, 43.2973],
  'Кокшетау': [69.385, 53.2833],
};

const CITY_ALIASES: Record<string, string> = {
  almaata: 'Алматы',
  almaty: 'Алматы',
  astana: 'Астана',
  nursultan: 'Астана',
  shymkent: 'Шымкент',
  karaganda: 'Караганда',
  aktobe: 'Актобе',
  aktau: 'Актау',
  atyrau: 'Атырау',
  taraz: 'Тараз',
  pavlodar: 'Павлодар',
  kostanay: 'Костанай',
  uralsk: 'Уральск',
  oral: 'Уральск',
  ustkamenogorsk: 'Усть-Каменогорск',
  oskemen: 'Усть-Каменогорск',
  qyzylorda: 'Кызылорда',
  kzylorda: 'Кызылорда',
  semey: 'Семей',
  petropavlovsk: 'Петропавловск',
  turkestan: 'Туркестан',
  kokshetau: 'Кокшетау',
};

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLocationName(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    default:
      return 'Не указан';
  }
}
function isRoutePoint(value: unknown): value is RoutePoint {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function safeRoutePoint(value: unknown, fallback: RoutePoint): RoutePoint {
  if (!isRoutePoint(value)) return fallback;
  return [Number(value[0]), Number(value[1])];
}

function resolveCoords(location?: string | null, fallback: RoutePoint = CITY_COORDS['Алматы']) {
  const safeFallback = safeRoutePoint(fallback, CITY_COORDS['Алматы']);
  const normalized = normalizeLocationName(location);
  if (!normalized) return safeFallback;

  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(normalizeLocationName(city))) {
      return safeRoutePoint(coords, safeFallback);
    }
  }

  const latin = normalized.replace(/[^a-z0-9]/g, '');
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (latin.includes(alias)) {
      return safeRoutePoint(CITY_COORDS[city], safeFallback);
    }
  }

  return safeFallback;
}

export default function CargoDetailsScreen() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const [cargo, setCargo] = useState<LoadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [, setMapError] = useState('');
  const [routeCoords, setRouteCoords] = useState<RoutePoint[] | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | number | null>(null);

  const fetchCargo = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_BASE_URL}/api/loads/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || 'Не удалось загрузить груз');
        setCargo(null);
        return;
      }

      setCargo(data);
    } catch (fetchError) {
      console.log('Cargo details error:', fetchError);
      setError('Не удалось подключиться к серверу');
      setCargo(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const checkFavoriteStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token || !id) return;

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) return;

      const found = data.some((item: FavoriteLoad) => String(item.id) === String(id));
      setIsFavorite(found);
    } catch (favoriteError) {
      console.log('Favorite status error:', favoriteError);
    }
  }, [id]);

  const loadUserRole = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('userData');
      if (!raw) return;

      const parsed = JSON.parse(raw);
      setUserRole(parsed?.role || '');
      setCurrentUserId(parsed?.id ?? parsed?.userId ?? null);
    } catch (roleError) {
      console.log('User role read error:', roleError);
    }
  }, []);

  const fromCoords = useMemo(
    () => resolveCoords(cargo?.from_location, CITY_COORDS['Алматы']),
    [cargo?.from_location]
  );
  const toCoords = useMemo(
    () => resolveCoords(cargo?.to_location, CITY_COORDS['Астана']),
    [cargo?.to_location]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRoutePreview() {
      if (!cargo?.id) {
        setRouteCoords(null);
        setMapLoaded(false);
        setMapError('');
        return;
      }

      try {
        setMapLoaded(false);
        setMapError('');
        setRouteCoords(null);

        const response = await fetch(`${API_BASE_URL}/api/mobile/route`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: { lon: fromCoords[0], lat: fromCoords[1] },
            to: { lon: toCoords[0], lat: toCoords[1] },
            loadId: String(cargo.id),
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || `Route preview error ${response.status}`);
        }

        const geometry = Array.isArray(data?.geometry) ? data.geometry : [];
        const normalized = geometry
          .map((item: any): RoutePoint | null => {
            if (Array.isArray(item) && item.length >= 2) return [Number(item[0]), Number(item[1])];
            if (item && typeof item.lon === 'number' && typeof item.lat === 'number') {
              return [item.lon, item.lat];
            }
            if (item && typeof item.x === 'number' && typeof item.y === 'number') {
              return [item.x, item.y];
            }
            return null;
          })
          .filter(isRoutePoint) as RoutePoint[];

        if (cancelled) return;

        if (normalized.length >= 2) {
          setRouteCoords(normalized);
          return;
        }

        throw new Error('Route preview returned empty geometry');
      } catch (routeError: any) {
        if (cancelled) return;

        console.log('Cargo route preview error:', routeError);
        setMapError('');
        setRouteCoords([
          [fromCoords[0], fromCoords[1]],
          [toCoords[0], toCoords[1]],
        ]);
      }
    }

    void loadRoutePreview();

    return () => {
      cancelled = true;
    };
  }, [cargo?.id, fromCoords, toCoords]);

  const mapPreviewHtml = useMemo(() => {
    const routeTitle = escapeHtml(
      `${cargo?.from_location || 'Pickup point'} > ${cargo?.to_location || 'Drop-off point'}`
    );
    const fromLabel = escapeHtml(cargo?.from_location || 'Pickup point');
    const toLabel = escapeHtml(cargo?.to_location || 'Drop-off point');
    const fallbackCoords: RoutePoint[] = [fromCoords, toCoords].filter(isRoutePoint);
    const coordinates =
      routeCoords && routeCoords.filter(isRoutePoint).length >= 2
        ? routeCoords.filter(isRoutePoint)
        : fallbackCoords.length >= 2
          ? fallbackCoords
          : [CITY_COORDS['Алматы'], CITY_COORDS['Астана']];
    const centerLng =
      coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length;
    const centerLat =
      coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;
    const routeCoordsJson = JSON.stringify(coordinates).replace(/</g, '\\u003c');
    const [fromLng, fromLat] = fromCoords;
    const [toLng, toLat] = toCoords;

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
          <style>
            * { box-sizing: border-box; }
            html, body, #map {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background: #081120;
              overflow: hidden;
            }
            .route-badge {
              position: absolute;
              left: 12px;
              right: 12px;
              bottom: 12px;
              z-index: 999;
              background: rgba(8, 17, 32, 0.92);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 14px;
              padding: 10px 12px;
              color: #fff;
              font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
              box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
            }
            .route-badge__label {
              font-size: 11px;
              color: #7dd3fc;
              margin-bottom: 4px;
              letter-spacing: 0.4px;
              text-transform: uppercase;
            }
            .route-badge__title {
              font-size: 13px;
              font-weight: 700;
              line-height: 1.35;
            }
            .pin {
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .pin-dot {
              width: 34px;
              height: 34px;
              border-radius: 50% 50% 50% 0;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 13px;
              color: white;
              border: 2px solid white;
              box-shadow: 0 6px 18px rgba(0,0,0,0.35);
              transform: rotate(-45deg);
            }
            .pin-a .pin-dot { background: #2F80ED; }
            .pin-b .pin-dot { background: #38BDF8; }
            .pin-inner { transform: rotate(45deg); }
            .pin-label {
              margin-top: 6px;
              background: rgba(8, 17, 32, 0.88);
              color: white;
              font-size: 12px;
              font-weight: 700;
              padding: 5px 9px;
              border-radius: 10px;
              white-space: nowrap;
              border: 1px solid rgba(255,255,255,0.08);
              box-shadow: 0 4px 14px rgba(0,0,0,0.2);
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <div class="route-badge">
            <div class="route-badge__label">Route</div>
            <div class="route-badge__title">${routeTitle}</div>
          </div>
          <script>
            function post(type, payload) {
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
              } catch (e) {}
            }
          </script>
          <script src="https://mapgl.2gis.com/api/js/v1"></script>
          <script>
            try {
              const routeCoords = ${routeCoordsJson};
              const fromPoint = [${fromLng}, ${fromLat}];
              const toPoint = [${toLng}, ${toLat}];
              const map = new mapgl.Map('map', {
                center: [${centerLng}, ${centerLat}],
                zoom: 10,
                key: '${MAPGL_API_KEY}',
                zoomControl: false,
                trafficControl: false,
              });

              new mapgl.Polyline(map, {
                coordinates: routeCoords,
                width: 5,
                color: '#2F80ED',
                opacity: 0.95,
              });

              function createMarker(className, text, coordinates, letter) {
                const el = document.createElement('div');
                el.className = 'pin ' + className;
                el.innerHTML =
                  '<div class="pin-dot"><span class="pin-inner">' + letter + '</span></div>' +
                  '<div class="pin-label">' + text + '</div>';

                new mapgl.HtmlMarker(map, {
                  coordinates: coordinates,
                  html: el,
                  anchor: [0.5, 1],
                });
              }

              createMarker('pin-a', '${fromLabel}', fromPoint, 'A');
              createMarker('pin-b', '${toLabel}', toPoint, 'B');

              const lngs = routeCoords.map((point) => point[0]);
              const lats = routeCoords.map((point) => point[1]);
              const bounds = [
                [Math.min.apply(null, lngs), Math.min.apply(null, lats)],
                [Math.max.apply(null, lngs), Math.max.apply(null, lats)],
              ];

              map.fitBounds(bounds, { padding: 56, duration: 250 });
              post('ready', { ok: true });
            } catch (e) {
              post('error', {
                message: e && e.message ? e.message : 'Map error',
              });
            }
          </script>
        </body>
      </html>`;
  }, [cargo?.from_location, cargo?.to_location, fromCoords, routeCoords, toCoords]);

  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data || '{}');

      if (data.type === 'ready') {
        setMapLoaded(true);
        return;
      }

      if (data.type === 'error') {
        setMapLoaded(true);
        setMapError('');
      }
    } catch {
      setMapLoaded(true);
      setMapError('');
    }
  }, []);

  useEffect(() => {
    if (!id) return;

    const bootstrap = async () => {
      await Promise.all([fetchCargo(), checkFavoriteStatus(), loadUserRole()]);
    };

    void bootstrap();
  }, [id, fetchCargo, checkFavoriteStatus, loadUserRole]);


  const addToFavorites = async () => {
    try {
      setFavoriteLoading(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          loadId: Number(id),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось добавить в избранное');
        return;
      }

      setIsFavorite(true);
      Alert.alert('Успешно', 'Груз добавлен в избранное');
    } catch (favoriteError) {
      console.log('Add favorite error:', favoriteError);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const removeFromFavorites = async () => {
    try {
      setFavoriteLoading(true);
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites/${id}`, {
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

      setIsFavorite(false);
      Alert.alert('Успешно', 'Груз убран из избранного');
    } catch (favoriteError) {
      console.log('Remove favorite error:', favoriteError);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleFavoritePress = async () => {
    if (isFavorite) {
      await removeFromFavorites();
      return;
    }

    await addToFavorites();
  };

  const openChat = async () => {
    try {
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
        body: JSON.stringify({ loadId: Number(id) }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось открыть чат');
        return;
      }

      router.push({
        pathname: '/chat-details',
        params: {
          chatId: String(data.id),
          chatName: cargo?.client_name || 'Грузовладелец',
          fromLocation: cargo?.from_location || '',
          toLocation: cargo?.to_location || '',
          loadType: cargo?.type || '',
          loadId: String(id),
        },
      });
    } catch (chatError) {
      console.log('Open chat error:', chatError);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  };

  const formatPrice = (price: number | string) => {
    const numeric = Number(price || 0);
    if (Number.isNaN(numeric)) return `${price} ₸`;
    return `${numeric.toLocaleString('ru-RU')} ₸`;
  };

  const formatWeight = (weight: number | string) => {
    if (weight === null || weight === undefined || weight === '') return '—';
    return `${weight} т`;
  };

  const formatSize = () => {
    if (!cargo) return '—';

    const hasAny =
      cargo.length !== null && cargo.length !== undefined && cargo.length !== '' ||
      cargo.width !== null && cargo.width !== undefined && cargo.width !== '' ||
      cargo.height !== null && cargo.height !== undefined && cargo.height !== '';
    if (!hasAny) return '—';
    return `${cargo.length || '—'} × ${cargo.width || '—'} × ${cargo.height || '—'}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themed.safeArea]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={[styles.centerState, themed.safeArea]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, themed.mutedText]}>Загружаем груз...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !cargo) {
    return (
      <SafeAreaView style={[styles.safeArea, themed.safeArea]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <View style={[styles.centerState, themed.safeArea]}>
          <Text style={[styles.errorTitle, themed.text]}>Ошибка</Text>
          <Text style={styles.errorText}>{error || 'Груз не найден'}</Text>

          <TouchableOpacity style={[styles.retryButton, themed.primaryButton]} onPress={fetchCargo} activeOpacity={0.85}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => goBackOrFallback()} activeOpacity={0.85}>
            <Text style={[styles.back, themed.link]}>← Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const ownerProfileType = getProfileTypeLabel(cargo.client_person_type);
  const ownerDisplayName = cargo.client_company?.trim() || cargo.client_name?.trim() || 'Не указано';
  const ownerAddress = cargo.client_address?.trim() || 'Адрес не указан';
  const ownerRole = 'Грузовладелец';
  const ownerRating = Number(cargo.client_rating || 0);
  const ownerCode = String(cargo.client_code || cargo.userId || cargo.id || '').padStart(6, '0');
  const ownerPhone = cargo.client_phone || cargo.contact_info || 'Контакт не указан';
  const isOwnerViewing = currentUserId !== null && Number(cargo.userId) === Number(currentUserId);
  const hasAssignedCarrier = Boolean(cargo.carrierUserId);
  const showCarrierContact = isOwnerViewing && hasAssignedCarrier;
  const contactCardName = showCarrierContact
    ? cargo.carrierName?.trim() || 'Перевозчик назначен'
    : ownerDisplayName + ', ' + ownerProfileType;
  const contactCardSubText = showCarrierContact ? 'Назначенный перевозчик' : ownerAddress;
  const contactCardRole = showCarrierContact ? 'Перевозчик' : ownerRole;
  const contactPersonName = showCarrierContact
    ? cargo.carrierName?.trim() || 'Перевозчик'
    : cargo.client_name || ownerDisplayName;
  const contactPhone = showCarrierContact
    ? cargo.carrierPhone || 'Телефон не указан'
    : ownerPhone;
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

          <View style={[styles.headerCard, themed.card]}>
            <Text style={[styles.title, themed.text]}>{cargo.type || 'Груз'}</Text>
            <Text style={[styles.price, themed.primaryText]}>{formatPrice(cargo.price)}</Text>
            <Text style={[styles.route, themed.text]}>
              {cargo.from_location} → {cargo.to_location}
            </Text>
          </View>

          <View style={[styles.mapCard, themed.card]}>
            <View style={styles.mapCardHeader}>
              <Text style={[styles.sectionTitle, themed.text]}>Маршрут</Text>
              <Text style={[styles.mapHint, themed.link]}>Загрузка → выгрузка</Text>
            </View>

            <View style={styles.mapPreview}>
              {!mapLoaded && (
                <View style={styles.mapLoader}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.mapLoaderText}>Building 2GIS route...</Text>
                </View>
              )}
              <WebView
                source={{ html: mapPreviewHtml }}
                style={styles.mapWebView}
                onMessage={handleMapMessage}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
                mixedContentMode="always"
              />
            </View>
            <TouchableOpacity
              style={[styles.mapOpenButton, themed.primaryButton]}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/map',
                  params: {
                    loadId: String(cargo.id),
                    title: cargo.type || 'Груз',
                    from: cargo.from_location || '',
                    to: cargo.to_location || '',
                    price: String(cargo.price || ''),
                    trackCarrier: userRole === 'carrier' ? '1' : '',
                  },
                })
              }
            >
              <Text style={styles.mapOpenButtonText}>Открыть карту</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.infoCard, themed.card]}>
            <Text style={[styles.sectionTitle, themed.text]}>Основная информация</Text>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Дата загрузки</Text>
              <Text style={[styles.value, themed.text]}>{cargo.date || 'Не указана'}</Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Вес</Text>
              <Text style={[styles.value, themed.text]}>{formatWeight(cargo.weight)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Тип груза</Text>
              <Text style={[styles.value, themed.text]}>{cargo.type || '—'}</Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Статус</Text>
              <Text style={[styles.value, themed.text]}>{cargo.status || 'open'}</Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Объём</Text>
              <Text style={[styles.value, themed.text]}>
                {cargo.volume !== null && cargo.volume !== undefined && cargo.volume !== ''
                  ? `${cargo.volume} м³`
                  : '—'}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Размеры</Text>
              <Text style={[styles.value, themed.text]}>{formatSize()}</Text>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, themed.mutedText]}>Тип погрузки</Text>
              <Text style={[styles.value, themed.text]}>{cargo.loading_type || '—”'}</Text>
            </View>
          </View>

          <View style={[styles.infoCard, themed.card]}>
            <Text style={[styles.sectionTitle, themed.text]}>Описание груза</Text>
            <Text style={[styles.description, themed.mutedText]}>
              {cargo.description?.trim() || 'Описание не указано'}
            </Text>
          </View>

          <View style={[styles.ownerCard, themed.card]}>
            <View style={styles.ownerHeaderRow}>
              <View style={[styles.ownerIconBox, themed.ownerIconBox]}>
                <Ionicons name="business" size={20} color={colors.mutedText} />
              </View>

              <View style={styles.ownerMain}>
                <View style={styles.ownerNameRow}>
                  <Text style={[styles.ownerName, themed.text]} numberOfLines={2}>
                    {contactCardName}
                  </Text>
                  {!showCarrierContact && (
                  <TouchableOpacity
                    style={styles.ownerInfoCircle}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: '/owner-profile',
                        params: {
                          userId: String(cargo.userId || ''),
                          userName: cargo.client_name || '',
                          company: cargo.client_company || '',
                          personType: cargo.client_person_type || '',
                          address: cargo.client_address || '',
                          phone: cargo.client_phone || cargo.contact_info || '',
                          code: ownerCode,
                          verified: cargo.client_ecp_verified ? '1' : '0',
                          rating: String(cargo.client_rating || 0),
                          reviewsCount: String(cargo.client_reviews_count || 0),
                        },
                      })
                    }
                  >
                    <Ionicons name="information" size={16} color={colors.primarySoft} />
                  </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.ownerSubText, themed.mutedText]}>{contactCardSubText}</Text>
                <Text style={[styles.ownerSubText, themed.mutedText]}>{contactCardRole}</Text>

                {!showCarrierContact && (
                <View style={styles.ownerStarsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Math.round(ownerRating) ? 'star' : 'star-outline'}
                      size={20}
                      color={star <= Math.round(ownerRating) ? '#8BC47C' : colors.border}
                    />
                  ))}
                </View>
                )}

                {!showCarrierContact && (
                <Text style={[styles.ownerCode, themed.mutedText]}>
                  {'Код: '}<Text style={styles.ownerCodeValue}>{ownerCode}</Text>
                </Text>
                )}
              </View>
            </View>

            <View style={styles.ownerContactRow}>
              <View style={styles.ownerAvatarCircle}>
                <Ionicons name={showCarrierContact ? 'car' : 'person'} size={18} color={colors.mutedText} />
              </View>
              <View style={styles.ownerContactMain}>
                <View style={styles.ownerVerifiedNameRow}>
                  <Text style={[styles.ownerContactName, themed.text]} numberOfLines={1}>
                    {contactPersonName}
                  </Text>
                  {!showCarrierContact && cargo.client_ecp_verified ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : null}
                </View>
                <View style={styles.ownerPhoneRow}>
                  <Ionicons name="call" size={16} color={colors.mutedText} />
                  <Text style={[styles.ownerPhone, themed.text]}>{contactPhone}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            {userRole === 'carrier' && !isOwnerViewing && (
              <TouchableOpacity
                style={[styles.primaryButton, themed.primaryButton]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/send-offer',
                    params: {
                      loadId: String(id),
                      title: cargo.type || 'Груз',
                      route: `${cargo.from_location} → ${cargo.to_location}`,
                      ownerId: String(cargo.userId || ''),
                    },
                  })
                }
              >
                <Text style={styles.primaryButtonText}>Отправить ставку</Text>
              </TouchableOpacity>
            )}

            {userRole === 'client' && cargo.status === 'completed' && cargo.carrierUserId && (
              <TouchableOpacity
                style={styles.reviewButton}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/write-review',
                    params: {
                      revieweeId: String(cargo.carrierUserId),
                      revieweeName: cargo.carrierName || 'Перевозчик',
                      loadId: String(cargo.id),
                      loadRoute: `${cargo.from_location} → ${cargo.to_location}`,
                    },
                  })
                }
              >
                <Text style={styles.reviewButtonText}>Оставить отзыв</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.secondaryButton, themed.outlineButton, isFavorite && styles.secondaryButtonActive]}
              activeOpacity={0.85}
              onPress={handleFavoritePress}
              disabled={favoriteLoading}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  themed.outlineButtonText,
                  isFavorite && themed.favoriteButtonTextActive,
                ]}
              >
                {favoriteLoading
                  ? 'Подождите...'
                  : isFavorite
                    ? 'Убрать из избранного'
                    : 'Добавить в избранное'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chatButton} activeOpacity={0.85} onPress={openChat}>
              <Text style={styles.chatButtonText}>Написать</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#081120',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#081120',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  centerState: {
    flex: 1,
    backgroundColor: '#081120',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerText: {
    marginTop: 14,
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '600',
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2F80ED',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginBottom: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  back: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 18,
  },
  headerCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  price: {
    color: '#2F80ED',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  route: {
    color: '#D7E0EE',
    fontSize: 16,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
  },
  ownerCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
  },
  ownerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ownerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: 'rgba(148,163,184,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerMain: {
    flex: 1,
    minWidth: 0,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ownerName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  ownerInfoCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(56,189,248,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  ownerSubText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  ownerStarsRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
    marginBottom: 10,
  },
  ownerCode: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
  },
  ownerCodeValue: {
    color: '#93C5FD',
    fontWeight: '800',
  },
  ownerContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  ownerAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.08)',
  },
  ownerContactMain: {
    flex: 1,
    minWidth: 0,
  },
  ownerVerifiedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  ownerContactName: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  ownerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerPhone: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  mapCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  mapHint: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
  },
  mapPreview: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#0B1422',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mapWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,17,32,0.52)',
    gap: 10,
  },
  mapLoaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mapOpenButton: {
    marginTop: 14,
    backgroundColor: '#2F80ED',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mapOpenButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 7,
  },
  label: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  description: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 20,
  },
  contactName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  contactText: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 20,
  },
  actions: {
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#2F80ED',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryButtonActive: {
    borderColor: '#2F80ED',
    backgroundColor: 'rgba(47,128,237,0.12)',
  },
  secondaryButtonText: {
    color: '#D7E0EE',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButtonTextActive: {
    color: '#FFFFFF',
  },
  chatButton: {
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.4)',
    backgroundColor: 'rgba(56,189,248,0.08)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  chatButtonText: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewButton: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewButtonText: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '800',
  },
});









type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createThemedStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background },
    card: { backgroundColor: colors.surface, borderColor: colors.border },
    text: { color: colors.text },
    mutedText: { color: colors.mutedText },
    link: { color: colors.primarySoft },
    primaryText: { color: colors.primary },
    primaryButton: { backgroundColor: colors.primary },
    outlineButton: { borderColor: colors.border, backgroundColor: colors.surface },
    outlineButtonText: { color: colors.text },
    favoriteButtonTextActive: { color: colors.primary },
    ownerIconBox: { backgroundColor: colors.surfaceStrong },
  });
}






