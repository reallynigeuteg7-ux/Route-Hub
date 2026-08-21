import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getExpoHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    '';

  if (!hostUri) return '';
  return hostUri.split(':')[0];
}

const EXPO_HOST = getExpoHost();
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const DEFAULT_API_BASE_URL = 'https://routehub.lunarteam.kz';
const FALLBACK_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_HOST =
  Platform.OS === 'android'
    ? FALLBACK_HOST
    : EXPO_HOST === 'localhost' || EXPO_HOST === '127.0.0.1' || EXPO_HOST === '::1'
      ? FALLBACK_HOST
      : EXPO_HOST || FALLBACK_HOST;

export const API_BASE_URL =
  ENV_API_BASE_URL ||
  DEFAULT_API_BASE_URL;

export const TERMS_URL = `${DEFAULT_API_BASE_URL}/terms.html`;
export const PRIVACY_POLICY_URL = `${DEFAULT_API_BASE_URL}/privacy.html`;
