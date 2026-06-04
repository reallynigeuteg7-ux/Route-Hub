import { router } from 'expo-router';

export function goBackOrFallback(fallback: string = '/(tabs)') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as any);
  }
}