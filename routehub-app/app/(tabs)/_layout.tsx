import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../lib/theme';

const TAB_LABELS: Record<string, string> = {
  index: 'Главная',
  favorites: 'Избранное',
  create: 'Создать',
  chat: 'Чат',
  profile: 'Профиль',
};

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  favorites: 'heart-outline',
  create: 'add-circle-outline',
  chat: 'chatbubble-outline',
  profile: 'person-outline',
};

const TAB_ICONS_ACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  favorites: 'heart',
  create: 'add-circle',
  chat: 'chatbubble',
  profile: 'person',
};

function FloatingTabBar({
  state,
  descriptors,
  navigation,
  hideCreate,
}: BottomTabBarProps & { hideCreate: boolean }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => !(hideCreate && route.name === 'create')),
    [state.routes, hideCreate]
  );

  const [barWidth, setBarWidth] = useState(0);
  const horizontalPadding = 8;
  const gap = 6;
  const totalGap = gap * Math.max(visibleRoutes.length - 1, 0);
  const innerWidth = Math.max(barWidth - horizontalPadding * 2 - totalGap, 0);
  const itemWidth = visibleRoutes.length > 0 ? innerWidth / visibleRoutes.length : 0;

  const activeVisibleIndex = visibleRoutes.findIndex((route) => {
    const originalIndex = state.routes.findIndex((item) => item.key === route.key);
    return originalIndex === state.index;
  });

  const activeX = useSharedValue(0);
  const activeWidth = useSharedValue(0);

  useEffect(() => {
    if (!itemWidth || activeVisibleIndex < 0) return;

    const nextX = horizontalPadding + activeVisibleIndex * (itemWidth + gap);
    activeX.value = withTiming(nextX, { duration: 220 });
    activeWidth.value = withTiming(itemWidth, { duration: 220 });
  }, [activeVisibleIndex, itemWidth, activeWidth, activeX]);

  const activePillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activeX.value }],
    width: activeWidth.value,
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View
        style={[
          styles.shellWrap,
          { shadowColor: isDark ? '#0057a8' : '#94A3B8' },
        ]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        <BlurView
          intensity={18}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.shell,
            !isDark && {
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.topHairline,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)' },
            ]}
          />

          {barWidth > 0 && (
            <Animated.View
              style={[
                styles.activePill,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(47,128,237,0.12)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(47,128,237,0.18)',
                },
                activePillStyle,
              ]}
            />
          )}

          <View style={[styles.tabsRow, { gap }]}> 
            {visibleRoutes.map((route) => {
              const routeIndex = state.routes.findIndex((item) => item.key === route.key);
              const isFocused = state.index === routeIndex;
              const descriptor = descriptors[route.key];
              const options = descriptor.options;
              const label = TAB_LABELS[route.name] ?? options.title ?? route.name;
              const iconName = isFocused
                ? TAB_ICONS_ACTIVE[route.name] ?? 'ellipse'
                : TAB_ICONS[route.name] ?? 'ellipse';

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              };

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  testID={options.tabBarButtonTestID}
                  onLongPress={onLongPress}
                  onPress={onPress}
                  style={({ pressed }) => [
                    styles.tabItem,
                    { width: itemWidth || 64 },
                    pressed && styles.tabItemPressed,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={22}
                    color={isFocused ? colors.text : colors.mutedText}
                  />

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      { color: isFocused ? colors.text : colors.mutedText },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const [role, setRole] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const tabBarSpace = 78 + Math.max(insets.bottom, 4);

  useEffect(() => {
    AsyncStorage.getItem('userData').then((raw) => {
      if (!raw) return;

      try {
        const user = JSON.parse(raw);
        setRole(user?.role || null);
      } catch {
        setRole(null);
      }
    });
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} hideCreate={role === 'carrier'} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: colors.background,
            paddingBottom: tabBarSpace,
          },
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Главная' }} />
        <Tabs.Screen name="favorites" options={{ title: 'Избранное' }} />
        <Tabs.Screen name="create" options={{ title: 'Создать' }} />
        <Tabs.Screen name="chat" options={{ title: 'Чат' }} />
        <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  shellWrap: {
    width: '100%',
    borderRadius: 28,
    marginBottom: 2,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0,
  },
  shell: {
    minHeight: 68,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 6,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    zIndex: 3,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    alignItems: 'center',
    zIndex: 2,
  },
  activePill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 22,
    borderWidth: 1,
    zIndex: 1,
  },
  tabItem: {
    height: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 2,
  },
  tabItemPressed: {
    opacity: 0.9,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
});
