import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_BASE_URL } from './api';

const LOCATION_TASK_NAME = 'routehub-carrier-location';

type ActiveLoad = {
  loadId?: number | string;
  status?: string;
  load_status?: string;
  carrierCompleted?: boolean;
};

type OffersResponse = {
  mode?: 'carrier' | 'owner';
  items?: ActiveLoad[];
};

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

async function getAuthToken() {
  return AsyncStorage.getItem('userToken');
}

async function getActiveLoadIds(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/mobile/offers-screen`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [];

  const data = (await response.json().catch(() => ({}))) as OffersResponse;
  if (data.mode !== 'carrier' || !Array.isArray(data.items)) return [];

  return data.items
    .filter(
      (item) =>
        item.status === 'accepted' &&
        item.load_status === 'assigned' &&
        !item.carrierCompleted
    )
    .map((item) => Number(item.loadId))
    .filter((loadId) => Number.isFinite(loadId));
}

async function publishLocation(
  token: string,
  loadId: number,
  location: Location.LocationObject
) {
  await fetch(`${API_BASE_URL}/api/mobile/loads/${loadId}/carrier-location`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
    }),
  });
}

async function publishLocationForLoads(
  token: string,
  loadIds: number[],
  location: Location.LocationObject
) {
  await Promise.all(loadIds.map((loadId) => publishLocation(token, loadId, location)));
}

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.log('Background location task error:', error);
      return;
    }

    const location = data?.locations?.[data.locations.length - 1];
    if (!location) return;

    try {
      const token = await getAuthToken();
      if (!token) return;

      const loadIds = await getActiveLoadIds(token);
      if (loadIds.length) {
        await publishLocationForLoads(token, loadIds, location);
      }
    } catch (taskError) {
      console.log('Background location publish error:', taskError);
    }
  });
}

export async function publishCurrentCarrierLocationForActiveLoads() {
  const token = await getAuthToken();
  if (!token) return;

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) return;

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const loadIds = await getActiveLoadIds(token);

  if (loadIds.length) {
    await publishLocationForLoads(token, loadIds, location);
  }
}

export async function startPersistentLocationTracking() {
  const token = await getAuthToken();
  if (!token) return;

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) return;

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== Location.PermissionStatus.GRANTED) return;

  const loadIds = await getActiveLoadIds(token);
  if (!loadIds.length) return;

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 100,
    deferredUpdatesInterval: 120000,
    deferredUpdatesDistance: 100,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'RouteHub tracking is active',
      notificationBody: 'Your active cargo route is being updated.',
    },
  });
}

export async function syncPersistentLocationTracking() {
  const token = await getAuthToken();
  if (!token) {
    await stopPersistentLocationTracking();
    return;
  }

  const loadIds = await getActiveLoadIds(token);
  if (!loadIds.length) {
    await stopPersistentLocationTracking();
    return;
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (
    foreground.status !== Location.PermissionStatus.GRANTED ||
    background.status !== Location.PermissionStatus.GRANTED
  ) {
    return;
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!alreadyRunning) {
    await startPersistentLocationTracking();
  }
}
export async function stopPersistentLocationTracking() {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export { LOCATION_TASK_NAME };
