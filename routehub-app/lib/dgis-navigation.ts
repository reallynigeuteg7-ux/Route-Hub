import { NativeModules, Platform } from 'react-native';

type DgisNavigationModule = {
  openNavigation: (
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number
  ) => void;
};

const nativeModule = NativeModules.DgisNavigation as DgisNavigationModule | undefined;

export function canOpenDgisNavigation() {
  return Platform.OS === 'android' && !!nativeModule?.openNavigation;
}

export async function openDgisNavigation(
  fromCoords: [number, number],
  toCoords: [number, number]
) {
  if (!canOpenDgisNavigation()) {
    throw new Error('Встроенная навигация 2GIS доступна только в Android-сборке приложения');
  }

  nativeModule!.openNavigation(
    fromCoords[1],
    fromCoords[0],
    toCoords[1],
    toCoords[0]
  );
}
