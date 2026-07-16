import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { API_BASE_URL } from './api';

const LEGACY_LOCATION_TASK_NAME = 'routehub-persistent-carrier-location';
const LOCATION_DISCLOSURE_ACCEPTED_KEY = 'routehub_location_disclosure_accepted_v1';
const TRACKED_LOAD_IDS_KEY = 'routehub_tracked_carrier_load_ids_v1';
const LAST_LOAD_REFRESH_KEY = 'routehub_tracked_load_refresh_at_v1';
const LOAD_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

type OffersScreenResponse = {
  mode?: 'carrier' | 'owner';
  items?: Array<{
    loadId?: number | string;
    status?: string;
    load_status?: string;
    carrierCompleted?: boolean;
  }>;
};

function normalizeRole(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

async function isCarrierUser() {
  const raw = await AsyncStorage.getItem('userData');
  if (!raw) return false;

  try {
    const user = JSON.parse(raw);
    const role = normalizeRole(user?.role || user?.userRole || user?.type);
    return role === 'carrier' || role === 'driver' || role.includes('carrier') || role.includes('driver') || role.includes('\u043f\u0435\u0440\u0435\u0432\u043e\u0437');
  } catch {
    return false;
  }
}

async function readTrackedLoadIds() {
  const raw = await AsyncStorage.getItem(TRACKED_LOAD_IDS_KEY);
  if (!raw) return [] as string[];

  try {
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => String(id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeTrackedLoadIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)));
  await AsyncStorage.setItem(TRACKED_LOAD_IDS_KEY, JSON.stringify(uniqueIds));
  await AsyncStorage.setItem(LAST_LOAD_REFRESH_KEY, String(Date.now()));
  return uniqueIds;
}

async function sendLocationForLoad(loadId: string, location: Location.LocationObject) {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) return;

  const coords = location.coords;
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;

  await fetch(`${API_BASE_URL}/api/mobile/loads/${loadId}/carrier-location`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy ?? null,
      heading: coords.heading ?? null,
      speed: coords.speed ?? null,
    }),
  });
}

async function refreshTrackedCarrierLoadIds() {
  const token = await AsyncStorage.getItem('userToken');
  if (!token || !(await isCarrierUser())) {
    await writeTrackedLoadIds([]);
    return [] as string[];
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/mobile/offers-screen`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: OffersScreenResponse = await response.json().catch(() => ({}));

    if (!response.ok || data.mode !== 'carrier' || !Array.isArray(data.items)) {
      await writeTrackedLoadIds([]);
      return [];
    }

    const ids = data.items
      .filter((item) => {
        const status = String(item.status || '').toLowerCase();
        const loadStatus = String(item.load_status || '').toLowerCase();
        return status === 'accepted' && loadStatus !== 'completed' && !item.carrierCompleted;
      })
      .map((item) => item.loadId)
      .filter((id) => id !== undefined && id !== null)
      .map((id) => String(id));

    return writeTrackedLoadIds(ids);
  } catch (error) {
    console.log('Refresh tracked carrier loads error:', error);
    return readTrackedLoadIds();
  }
}

async function refreshTrackedLoadsIfStale() {
  const raw = await AsyncStorage.getItem(LAST_LOAD_REFRESH_KEY);
  const lastRefresh = Number(raw || 0);

  if (!Number.isFinite(lastRefresh) || Date.now() - lastRefresh > LOAD_REFRESH_INTERVAL_MS) {
    return refreshTrackedCarrierLoadIds();
  }

  return readTrackedLoadIds();
}

export async function hasAcceptedLocationDisclosure() {
  return (await AsyncStorage.getItem(LOCATION_DISCLOSURE_ACCEPTED_KEY)) === '1';
}

export async function acceptLocationDisclosure() {
  await AsyncStorage.setItem(LOCATION_DISCLOSURE_ACCEPTED_KEY, '1');
}

async function ensureForegroundLocationPermission() {
  if (Platform.OS === 'web') return false;
  if (!(await hasAcceptedLocationDisclosure())) return false;

  const foregroundStatus = await Location.getForegroundPermissionsAsync();
  const foreground = foregroundStatus.status === Location.PermissionStatus.GRANTED
    ? foregroundStatus
    : foregroundStatus.canAskAgain
      ? await Location.requestForegroundPermissionsAsync()
      : foregroundStatus;

  return foreground.status === Location.PermissionStatus.GRANTED;
}

async function getCurrentForegroundLocation() {
  if (!(await ensureForegroundLocationPermission())) return null;

  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
}

export async function publishCurrentCarrierLocationForActiveLoads() {
  if (Platform.OS === 'web') return false;

  const token = await AsyncStorage.getItem('userToken');
  if (!token || !(await isCarrierUser())) return false;

  const loadIds = await refreshTrackedCarrierLoadIds();
  if (!loadIds.length) return false;

  const location = await getCurrentForegroundLocation();
  if (!location) return false;

  await Promise.all(loadIds.map((loadId) => sendLocationForLoad(loadId, location).catch((error) => {
    console.log('Carrier location upload error:', error);
  })));

  return true;
}

export async function startPersistentLocationTracking() {
  return publishCurrentCarrierLocationForActiveLoads();
}

export async function stopPersistentLocationTracking() {
  if (Platform.OS !== 'web') {
    const started = await Location.hasStartedLocationUpdatesAsync(LEGACY_LOCATION_TASK_NAME).catch(() => false);
    if (started) {
      await Location.stopLocationUpdatesAsync(LEGACY_LOCATION_TASK_NAME).catch((error) => {
        console.log('Stop legacy background location error:', error);
      });
    }
  }

  await writeTrackedLoadIds([]);
}

export async function syncPersistentLocationTracking() {
  const token = await AsyncStorage.getItem('userToken');
  if (!token || !(await isCarrierUser())) {
    await stopPersistentLocationTracking();
    return false;
  }

  await refreshTrackedLoadsIfStale();
  return publishCurrentCarrierLocationForActiveLoads();
}