import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export async function logoutAndGoHome() {
  await AsyncStorage.multiRemove(['userToken', 'userData']);

  if (router.canGoBack()) {
    router.dismissAll?.();
  }

  router.replace('/login');
}