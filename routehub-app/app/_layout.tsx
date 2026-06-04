import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/api';
import {
  configureNotificationsAsync,
  getExpoPushTokenAsync,
  registerPushTokenOnServer,
} from '../lib/notifications';
import { AppIntroOverlay } from '../components/app-intro-overlay';
import { AppThemeProvider } from '../lib/theme';
import { syncPersistentLocationTracking } from '../lib/background-location';

export default function RootLayout() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const setupPushNotifications = async () => {
      try {
        const hasPermission = await configureNotificationsAsync();
        if (!hasPermission || cancelled) return;

        const token = await AsyncStorage.getItem('userToken');
        if (!token || cancelled) return;

        const pushToken = await getExpoPushTokenAsync();
        if (!pushToken || cancelled) return;

        await registerPushTokenOnServer({
          apiBaseUrl: API_BASE_URL,
          authToken: token,
          pushToken,
        });
      } catch (error) {
        console.log('Push registration error:', error);
      }
    };

    void setupPushNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncLocationTracking = () => {
      if (cancelled) return;
      void syncPersistentLocationTracking().catch((error) => {
        console.log('Persistent location tracking sync error:', error);
      });
    };

    syncLocationTracking();
    const interval = setInterval(syncLocationTracking, 120000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncLocationTracking();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return (
    <AppThemeProvider>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        <AppIntroOverlay visible={showIntro} onFinish={() => setShowIntro(false)} />
      </SafeAreaProvider>
    </AppThemeProvider>
  );
}
