import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrFallback } from '../lib/navigation';
import { API_BASE_URL } from '../lib/api';
import { fetchFreeDrivingRoute } from '../lib/free-route';
import { useAppTheme } from '../lib/theme';

const MAP_TEXT = {
  carrier: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a',
  carrierOnMap: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a \u043d\u0430 \u043a\u0430\u0440\u0442\u0435',
  noCarrierLocation: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a \u043f\u043e\u043a\u0430 \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u0433\u0435\u043e\u043b\u043e\u043a\u0430\u0446\u0438\u044e',
  updated: '\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e',
};

type RoutePoint = [number, number];
type CarrierLocation = {
  lat: number;
  lon: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  updatedAt?: string;
  carrierName?: string;
};

type NearbyLoad = {
  id: number | string;
  from_location?: string;
  to_location?: string;
  price?: number | string;
  pickup_point?: {
    lon: number;
    lat: number;
  };
};

const CITY_COORDS: Record<string, RoutePoint> = {
  'Алматы': [76.9286, 43.2567],
  'Астана': [71.4306, 51.1801],
  'Шымкент': [69.5901, 42.3417],
  'Кызылорда': [65.5093, 44.8488],
  'Караганда': [73.0887, 49.8047],
  'Актобе': [57.2067, 50.2797],
  'Атырау': [51.9227, 47.1167],
  'Актау': [51.1801, 43.6527],
  'Костанай': [63.5744, 53.2144],
  'Павлодар': [76.9674, 52.2873],
  'Тараз': [71.3667, 42.9],
  'Уральск': [51.3667, 51.2333],
  'Семей': [80.2275, 50.4111],
  'Усть-Каменогорск': [82.6278, 49.9787],
  'Туркестан': [68.2667, 43.3],
  'Жанаозен': [52.8597, 43.3456],
  'Талдыкорган': [78.3784, 45.0167],
  'Экибастуз': [75.3244, 51.7167],
  'Рудный': [63.1283, 52.9628],
  'Темиртау': [72.9594, 50.0594],
  'Жезказган': [67.7122, 47.7972],
  'Балхаш': [74.9958, 46.8481],
  'Петропавловск': [69.1522, 54.875],
  'Кокшетау': [69.3919, 53.2833],
};

const CITY_ALIASES: Record<string, string> = {
  almaata: 'Алматы',
  almaty: 'Алматы',
  astana: 'Астана',
  nursultan: 'Астана',
  shymkent: 'Шымкент',
  shimkent: 'Шымкент',
  kyzylorda: 'Кызылорда',
  karaganda: 'Караганда',
  aktobe: 'Актобе',
  atyrau: 'Атырау',
  aktau: 'Актау',
  kostanay: 'Костанай',
  pavlodar: 'Павлодар',
  taraz: 'Тараз',
  uralsk: 'Уральск',
  oral: 'Уральск',
  semey: 'Семей',
  'ust-kamenogorsk': 'Усть-Каменогорск',
  oskemen: 'Усть-Каменогорск',
  turkestan: 'Туркестан',
  zhanaozen: 'Жанаозен',
  taldykorgan: 'Талдыкорган',
  ekibastuz: 'Экибастуз',
  rudny: 'Рудный',
  temirtau: 'Темиртау',
  zhezkazgan: 'Жезказган',
  balkhash: 'Балхаш',
  petropavlovsk: 'Петропавловск',
  kokshetau: 'Кокшетау',
};

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLocationName(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCoords(location: string, fallback: RoutePoint) {
  const raw = String(location || '').trim();
  if (CITY_COORDS[raw]) return CITY_COORDS[raw];

  const normalized = normalizeLocationName(raw);
  const alias = CITY_ALIASES[normalized];
  if (alias && CITY_COORDS[alias]) return CITY_COORDS[alias];

  const directMatch = Object.entries(CITY_COORDS).find(
    ([city]) => normalizeLocationName(city) === normalized
  );
  if (directMatch) return directMatch[1];

  const partialMatch = Object.entries(CITY_COORDS).find(([city]) => {
    const normalizedCity = normalizeLocationName(city);
    return normalized.includes(normalizedCity) || normalizedCity.includes(normalized);
  });

  return partialMatch?.[1] || fallback;
}

function formatCarrierUpdatedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function MapScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState('');
  const [routeCoords, setRouteCoords] = useState<RoutePoint[] | null>(null);
  const [nearbyLoads, setNearbyLoads] = useState<NearbyLoad[]>([]);
  const [showAllNearbyLoads, setShowAllNearbyLoads] = useState(false);
  const [carrierLocation, setCarrierLocation] = useState<CarrierLocation | null>(null);

  const from = typeof params.from === 'string' ? params.from : 'Алматы';
  const to = typeof params.to === 'string' ? params.to : 'Астана';
  const title = typeof params.title === 'string' ? params.title : 'Груз';
  const price = typeof params.price === 'string' ? params.price : '';
  const loadId = typeof params.loadId === 'string' ? params.loadId : '';
  const showCarrierLocation = params.ownerMap === '1';
  const trackCarrierLocation = params.trackCarrier === '1';

  const fromCoords = useMemo(() => resolveCoords(from, CITY_COORDS['Алматы']), [from]);
  const toCoords = useMemo(() => resolveCoords(to, CITY_COORDS['Астана']), [to]);
  const visibleNearbyLoads = showAllNearbyLoads ? nearbyLoads : nearbyLoads.slice(0, 2);
  const hiddenNearbyLoadsCount = Math.max(nearbyLoads.length - 2, 0);

  useEffect(() => {
    let cancelled = false;

    async function loadRoute() {
      try {
        setMapLoaded(false);
        setMapError('');
        setRouteCoords(null);
        setNearbyLoads([]);
        setShowAllNearbyLoads(false);

        const freeRoute = await fetchFreeDrivingRoute(fromCoords, toCoords);
        if (cancelled) return;
        setRouteCoords(freeRoute);

        // Nearby loads are optional enrichment; the map itself does not
        // depend on a paid routing provider.
        try {
          const response = await fetch(`${API_BASE_URL}/api/mobile/route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: { lon: fromCoords[0], lat: fromCoords[1] },
              to: { lon: toCoords[0], lat: toCoords[1] },
              loadId,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && Array.isArray(data?.nearby_loads)) {
            setNearbyLoads(data.nearby_loads);
          }
        } catch {
          // Keep the route visible even when optional cargo suggestions fail.
        }
      } catch (error: any) {
        if (cancelled) return;

        setMapError(error?.message || 'Не удалось построить маршрут');
        setRouteCoords([
          [fromCoords[0], fromCoords[1]],
          [toCoords[0], toCoords[1]],
        ]);
        setNearbyLoads([]);
        setShowAllNearbyLoads(false);
      }
    }

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [fromCoords, toCoords, loadId]);

  useEffect(() => {
    if (!showCarrierLocation || !loadId) {
      setCarrierLocation(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function loadCarrierLocation() {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/api/mobile/loads/${loadId}/carrier-location`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.ok && data?.available) {
          setCarrierLocation({
            lat: Number(data.lat),
            lon: Number(data.lon),
            accuracy: data.accuracy ?? null,
            heading: data.heading ?? null,
            speed: data.speed ?? null,
            updatedAt: data.updatedAt,
            carrierName: data.carrierName || MAP_TEXT.carrier,
          });
        } else if (response.ok) {
          setCarrierLocation(null);
        }
      } catch (error) {
        console.log('Load carrier location error:', error);
      }
    }

    void loadCarrierLocation();
    timer = setInterval(() => void loadCarrierLocation(), 15000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [showCarrierLocation, loadId]);

  const updateCarrierLocation = async (payload: any) => {
    if (!trackCarrierLocation || !loadId) return;

    const lat = Number(payload?.lat);
    const lon = Number(payload?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/mobile/loads/${loadId}/carrier-location`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lat,
          lon,
          accuracy: payload?.accuracy ?? null,
          heading: payload?.heading ?? null,
          speed: payload?.speed ?? null,
        }),
      });
    } catch (error) {
      console.log('Update carrier location error:', error);
    }
  };
  const safeFrom = escapeHtml(from);
  const safeTo = escapeHtml(to);
  const safeLoadsJson = JSON.stringify(nearbyLoads).replace(/</g, '\\u003c');
  const safeCarrierLocationJson = JSON.stringify(carrierLocation).replace(/</g, '\\u003c');

  const mapHtml = useMemo(() => {
    const coords =
      routeCoords && routeCoords.length >= 2
        ? routeCoords
        : [
            [fromCoords[0], fromCoords[1]],
            [toCoords[0], toCoords[1]],
          ];

    const coordsJson = JSON.stringify(coords);
    const ownerMapMode = showCarrierLocation;
    const mapCenter = ownerMapMode && carrierLocation
      ? [carrierLocation.lon, carrierLocation.lat]
      : fromCoords;
    const mapZoom = ownerMapMode && carrierLocation ? 14 : 11;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map {
      width: 100%;
      height: 100%;
      background: #081120;
      overflow: hidden;
    }
    .map-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 10;
      background: rgba(8, 17, 32, 0.78);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
    }
    .pin {
      position: relative;
      width: 40px;
      height: 40px;
      user-select: none;
      pointer-events: none;
    }
    .pin-dot {
      width: 40px;
      height: 40px;
      border-radius: 50% 50% 50% 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 15px;
      color: white;
      border: 3px solid white;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
      transform: rotate(-45deg);
    }
    .pin-a .pin-dot { background: #2F80ED; }
    .pin-b .pin-dot { background: #38BDF8; }
    .pin-inner { transform: rotate(45deg); }
    .pin-label {
      position: absolute;
      top: 46px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(8, 17, 32, 0.88);
      color: white;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 10px;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      pointer-events: none;
    }
    .load-marker {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #22C55E;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.28);
      cursor: pointer;
    }
    .carrier-marker {
      position: relative;
      width: 52px;
      height: 52px;
      border-radius: 999px;
      background: linear-gradient(145deg, #2F80ED 0%, #0EA5E9 100%);
      border: 3px solid #ffffff;
      box-shadow: 0 10px 24px rgba(47,128,237,0.45), 0 0 0 8px rgba(47,128,237,0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .carrier-marker svg {
      width: 30px;
      height: 30px;
      display: block;
      flex: 0 0 auto;
      transform: translateY(1px);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    function post(type, payload) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      } catch (e) {}
    }

    window.addEventListener('error', function(event) {
      post('error', { message: event.message || 'Ошибка внутри WebView' });
    });
  </script>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>

  <script>
    try {
      var routeCoords = ${coordsJson};
      var routeLoads = ${safeLoadsJson};
      var carrierLocation = ${safeCarrierLocationJson};
      var shouldTrackCarrier = ${trackCarrierLocation ? 'true' : 'false'};
      var ownerMapMode = ${showCarrierLocation ? 'true' : 'false'};
      var fromPoint = [${fromCoords[0]}, ${fromCoords[1]}];
      var toPoint = [${toCoords[0]}, ${toCoords[1]}];
      var mapCenter = [${mapCenter[0]}, ${mapCenter[1]}];
      var mapZoom = ${mapZoom};

      var map = L.map('map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      var routeLatLngs = routeCoords.map(function(point) {
        return [Number(point[1]), Number(point[0])];
      });
      var routeLine = L.polyline(routeLatLngs, {
        color: '#2F80ED',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round'
      }).addTo(map);

      function createMarker(className, text, coordinates, letter) {
        var el = document.createElement('div');
        el.className = 'pin ' + className;
        el.innerHTML =
          '<div class="pin-dot"><span class="pin-inner">' + letter + '</span></div>' +
          '<div class="pin-label">' + text + '</div>';

        L.marker([coordinates[1], coordinates[0]], {
          icon: L.divIcon({
            className: 'leaflet-route-pin',
            html: el.outerHTML,
            iconSize: [90, 86],
            iconAnchor: [45, 40]
          }),
          keyboard: false
        }).addTo(map);
      }


      function createCarrierMarker(location) {
        if (!location || typeof location.lon !== 'number' || typeof location.lat !== 'number') return;

        var markerEl = document.createElement('div');
        markerEl.className = 'carrier-marker';
        markerEl.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="#FFFFFF" d="M8 15c0-2.2 1.8-4 4-4h18c2.2 0 4 1.8 4 4v5h3.8c1.2 0 2.3.6 3 1.6l3.1 4.8c.4.6.6 1.3.6 2.1V34c0 1.7-1.3 3-3 3H39a5.5 5.5 0 0 1-10.6 0H20a5.5 5.5 0 0 1-10.6 0H8c-1.7 0-3-1.3-3-3V18c0-1.7 1.3-3 3-3Zm4 4v11h18V15H12v4Zm22 5v6h6.5l-2.6-4.1c-.4-.6-1-.9-1.7-.9H34ZM14.7 39a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm19 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>';
        markerEl.title = location.carrierName || '${MAP_TEXT.carrier}';

        L.marker([location.lat, location.lon], {
          icon: L.divIcon({
            className: 'leaflet-carrier-marker',
            html: markerEl.outerHTML,
            iconSize: [58, 58],
            iconAnchor: [29, 29]
          }),
          keyboard: false
        }).addTo(map).bindTooltip(location.carrierName || '${MAP_TEXT.carrier}', { direction: 'top' });
      }

      function startCarrierLocationWatch() {
        if (!shouldTrackCarrier || !navigator.geolocation) return;

        navigator.geolocation.watchPosition(function(position) {
          var coords = position.coords || {};
          post('deviceLocation', {
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed
          });
        }, function(error) {
          post('locationError', { message: error && error.message ? error.message : 'Геолокация недоступна' });
        }, {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        });
      }
      function createLoadMarker(load) {
        if (!load || !load.pickup_point) return;

        var markerEl = document.createElement('div');
        markerEl.className = 'load-marker';
        markerEl.title = (load.from_location || 'Груз') + ' → ' + (load.to_location || '');
        markerEl.addEventListener('click', function() {
          post('openLoad', { id: String(load.id) });
        });

        L.marker([load.pickup_point.lat, load.pickup_point.lon], {
          icon: L.divIcon({
            className: 'leaflet-load-marker',
            html: markerEl.outerHTML,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          }),
          keyboard: false
        }).addTo(map).on('click', function() {
          post('openLoad', { id: String(load.id) });
        });
      }

      createMarker('pin-a', '${safeFrom}', fromPoint, 'A');
      createMarker('pin-b', '${safeTo}', toPoint, 'B');
      routeLoads.forEach(createLoadMarker);
      createCarrierMarker(carrierLocation);
      startCarrierLocationWatch();

      if (routeLatLngs.length >= 2) {
        map.fitBounds(routeLine.getBounds(), { padding: [52, 52], maxZoom: 14 });
      } else {
        map.setView([mapCenter[1], mapCenter[0]], mapZoom);
      }

      post('ready', { ok: true });
    } catch (e) {
      post('error', {
        message: e && e.message ? e.message : 'Ошибка карты'
      });
    }
  </script>
</body>
</html>
    `;
  }, [routeCoords, fromCoords, toCoords, safeFrom, safeTo, safeLoadsJson, safeCarrierLocationJson, trackCarrierLocation, showCarrierLocation, carrierLocation]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data || '{}');

      if (data.type === 'ready') {
        setMapLoaded(true);
        return;
      }

      if (data.type === 'openLoad' && data.payload?.id) {
        router.push({
          pathname: '/cargo-details',
          params: { id: String(data.payload.id) },
        });
        return;
      }

      if (data.type === 'deviceLocation') {
        void updateCarrierLocation(data.payload);
        return;
      }

      if (data.type === 'locationError') {
        console.log('Carrier location WebView error:', data.payload?.message);
        return;
      }

      if (data.type === 'error') {
        setMapLoaded(true);
        setMapError((prev) => prev || `Ошибка карты: ${data.payload?.message || 'неизвестно'}`);
      }
    } catch {
      setMapLoaded(true);
      setMapError('Ошибка связи с картой');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOrFallback()} activeOpacity={0.85}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerRoute}>
            {from} → {to}
          </Text>
        </View>

        {!!price && <Text style={styles.headerPrice}>{price} ₸</Text>}
      </View>

      <View style={styles.mapContainer}>
        {!mapLoaded && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#2F80ED" />
            <Text style={styles.loaderText}>Строим маршрут...</Text>
          </View>
        )}

        <WebView
          source={{ html: mapHtml }}
          style={styles.webview}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          geolocationEnabled
        />
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.routeRow}>
          <View style={styles.pointRow}>
            <View style={styles.dotPrimary} />
            <Text style={styles.pointText}>{from}</Text>
          </View>

          <Text style={styles.arrow}>→</Text>

          <View style={styles.pointRow}>
            <View style={styles.dotSecondary} />
            <Text style={styles.pointText}>{to}</Text>
          </View>
        </View>

        {!!mapError && <Text style={styles.errorText}>{mapError}</Text>}

        {showCarrierLocation && (
          <Text style={styles.carrierLocationText}>
            {carrierLocation
              ? MAP_TEXT.carrierOnMap + ': ' + (carrierLocation.carrierName || MAP_TEXT.carrier) + (formatCarrierUpdatedAt(carrierLocation.updatedAt) ? ' - ' + MAP_TEXT.updated + ': ' + formatCarrierUpdatedAt(carrierLocation.updatedAt) : '')
              : MAP_TEXT.noCarrierLocation}
          </Text>
        )}

        {!showCarrierLocation && <View style={styles.actionsRow}>
          <Text style={styles.routeOnlyText}>Маршрут построен на карте</Text>
          {!!loadId && (
            <TouchableOpacity
              style={styles.detailsButton}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/cargo-details',
                  params: { id: loadId },
                })
              }
            >
              <Text style={styles.detailsButtonText}>Детали груза</Text>
            </TouchableOpacity>
          )}
        </View>}

        {!showCarrierLocation && <View style={styles.nearbyPanel}>
          <View style={styles.nearbyHeader}>
            <Text style={styles.nearbyTitle}>Грузы по пути</Text>
            <Text style={styles.nearbyCount}>{nearbyLoads.length}</Text>
          </View>

          {nearbyLoads.length ? (
            <>
              <ScrollView
                style={[styles.nearbyList, showAllNearbyLoads && styles.nearbyListExpanded]}
                contentContainerStyle={styles.nearbyListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={showAllNearbyLoads}
              >
                {visibleNearbyLoads.map((load) => (
                  <TouchableOpacity
                    key={String(load.id)}
                    style={styles.nearbyItem}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: '/cargo-details',
                        params: { id: String(load.id) },
                      })
                    }
                  >
                    <View style={styles.nearbyItemMain}>
                      <Text style={styles.nearbyRoute} numberOfLines={1}>
                        {load.from_location || 'Откуда'} → {load.to_location || 'Куда'}
                      </Text>
                      <Text style={styles.nearbyMeta}>Можно забрать по маршруту</Text>
                    </View>
                    {!!load.price && (
                      <Text style={styles.nearbyPrice} numberOfLines={1}>
                        {Number(load.price).toLocaleString('ru-RU')} ₸
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {hiddenNearbyLoadsCount > 0 && (
                <TouchableOpacity
                  style={styles.nearbyMoreButton}
                  activeOpacity={0.85}
                  onPress={() => setShowAllNearbyLoads((value) => !value)}
                >
                  <Text style={styles.nearbyMoreText}>
                    {showAllNearbyLoads ? 'Скрыть' : `Посмотреть еще ${hiddenNearbyLoadsCount}`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.nearbyEmpty}>По этому маршруту пока нет дополнительных грузов.</Text>
          )}
        </View>}
      </View>
    </SafeAreaView>
  );
}

type MapThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: MapThemeColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  back: {
    color: colors.primarySoft,
    fontSize: 22,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  headerRoute: {
    color: colors.mutedText,
    fontSize: 13,
    marginTop: 2,
  },
  headerPrice: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: colors.mutedText,
    fontSize: 14,
    marginTop: 12,
  },
  webview: {
    flex: 1,
  },
  bottomBar: {
    backgroundColor: colors.surfaceStrong,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dotPrimary: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  dotSecondary: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primarySoft,
  },
  pointText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  arrow: {
    color: colors.mutedText,
    fontSize: 18,
  },
  routeHint: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#F59E0B',
    fontSize: 13,
    lineHeight: 18,
  },
  carrierLocationText: {
    color: colors.primarySoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  routeOnlyText: {
    flex: 1,
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
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
  nearbyPanel: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  nearbyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  nearbyCount: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '900',
  },
  nearbyList: {
    maxHeight: 124,
  },
  nearbyListExpanded: {
    maxHeight: 188,
  },
  nearbyListContent: {
    gap: 8,
  },
  nearbyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surfaceStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nearbyItemMain: {
    flex: 1,
  },
  nearbyRoute: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  nearbyMeta: {
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
  nearbyPrice: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: '900',
    maxWidth: 96,
  },
  nearbyMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
  },
  nearbyMoreText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '800',
  },
  nearbyEmpty: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  });
}



















