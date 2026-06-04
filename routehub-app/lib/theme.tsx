import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = 'routehub.themeMode';

type ThemeMode = 'dark' | 'light';

type ThemeColors = {
  background: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  mutedText: string;
  border: string;
  primary: string;
  primarySoft: string;
  success: string;
  statusBar: 'light-content' | 'dark-content';
};

type ThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setDarkTheme: (enabled: boolean) => Promise<void>;
};

const darkColors: ThemeColors = {
  background: '#081120',
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: '#0D1B2E',
  text: '#FFFFFF',
  mutedText: '#94A3B8',
  border: 'rgba(255,255,255,0.08)',
  primary: '#2F80ED',
  primarySoft: '#38BDF8',
  success: '#22C55E',
  statusBar: 'light-content',
};

const lightColors: ThemeColors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceStrong: '#EEF4FB',
  text: '#102033',
  mutedText: '#5E6B7A',
  border: '#D9E2EC',
  primary: '#1F74E8',
  primarySoft: '#0EA5E9',
  success: '#16A34A',
  statusBar: 'dark-content',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (!cancelled && (savedMode === 'dark' || savedMode === 'light')) {
          setMode(savedMode);
        }
      } catch (error) {
        console.log('Load theme error:', error);
      }
    }

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === 'dark';

    return {
      mode,
      isDark,
      colors: isDark ? darkColors : lightColors,
      setDarkTheme: async (enabled: boolean) => {
        const nextMode: ThemeMode = enabled ? 'dark' : 'light';
        setMode(nextMode);
        try {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
        } catch (error) {
          console.log('Save theme error:', error);
        }
      },
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }

  return context;
}
