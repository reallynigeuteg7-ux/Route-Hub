import React, { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../lib/theme';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const t = {
  start: '\u041d\u0430\u0447\u0430\u0442\u044c',
  login: '\u0423 \u043c\u0435\u043d\u044f \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442',
  logistics: 'Logistics',
  app: 'RouteHub app',
  title: '\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0439 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u043a\u043e\u0439 \u0441 \u043f\u0435\u0440\u0432\u043e\u0433\u043e \u043a\u0430\u0441\u0430\u043d\u0438\u044f',
  subtitle: '\u0411\u044b\u0441\u0442\u0440\u044b\u0439 \u0441\u0442\u0430\u0440\u0442 \u0434\u043b\u044f \u0437\u0430\u044f\u0432\u043e\u043a, \u0441\u0442\u0430\u0432\u043e\u043a, \u043a\u0430\u0440\u0442\u044b \u0433\u0440\u0443\u0437\u043e\u0432 \u0438 \u043b\u0438\u0447\u043d\u044b\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u043c\u0435\u0436\u0434\u0443 \u0441\u0442\u043e\u0440\u043e\u043d\u0430\u043c\u0438.',
  trackingLabel: '\u041e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u043d\u0438\u0435 \u0433\u0440\u0443\u0437\u043e\u0432',
  trackingTitle: '\u041e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0439 \u0433\u0440\u0443\u0437 \u0438 \u043c\u0430\u0440\u0448\u0440\u0443\u0442 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438',
  trackingMeta: '\u041a\u0430\u0440\u0442\u0430 \u2022 \u0441\u0442\u0430\u0442\u0443\u0441 \u2022 \u0441\u0432\u044f\u0437\u044c',
  map: '\u041a\u0430\u0440\u0442\u0430 \u0433\u0440\u0443\u0437\u043e\u0432',
  chats: '\u041b\u0438\u0447\u043d\u044b\u0435 \u0447\u0430\u0442\u044b',
  profiles: '\u041f\u0440\u043e\u0444\u0438\u043b\u0438',
};

export default function WelcomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleStart = async () => {
    try {
      const userToken = await AsyncStorage.getItem('userToken');
      router.replace(userToken ? '/(tabs)' : '/register');
    } catch (error) {
      router.replace('/register');
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['#02040A', '#06101B', '#02040A'] : ['#EAF1FA', '#F8FBFF', '#EAF1FA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backdrop}
      />
      <View pointerEvents="none" style={styles.blueprintGrid}>
        {Array.from({ length: 8 }).map((_, index) => (
          <View key={'v-' + index} style={[styles.gridLineVertical, { left: index * 58 }]} />
        ))}
        {Array.from({ length: 11 }).map((_, index) => (
          <View key={'h-' + index} style={[styles.gridLineHorizontal, { top: index * 78 }]} />
        ))}
        <View style={styles.diagonalBandOne} />
        <View style={styles.diagonalBandTwo} />
        <View style={styles.cornerPlate} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={colors.statusBar} backgroundColor="transparent" translucent />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Image source={require('../images/logo2.png')} style={styles.logoImage} resizeMode="contain" />
                <View>
                  <Text style={styles.brand}>RouteHub</Text>
                  <Text style={styles.brandSub}>{t.logistics}</Text>
                </View>
              </View>
            </View>

            <View style={styles.copyBlock}>
              <Text style={styles.kicker}>{t.app}</Text>
              <Text style={styles.title}>{t.title}</Text>
              <Text style={styles.subtitle}>{t.subtitle}</Text>
            </View>

            <View style={styles.featureGrid}>
              <FeatureChip styles={styles} icon="map-outline" text={t.map} />
              <FeatureChip styles={styles} icon="chatbubbles-outline" text={t.chats} />
              <FeatureChip styles={styles} icon="shield-checkmark-outline" text={t.profiles} />
            </View>

            <View style={styles.trackingCard}>
              <View style={styles.mapGrid}>
                <View style={styles.trackOne} />
                <View style={styles.trackTwo} />
                <View style={[styles.node, styles.nodeLeft]} />
                <View style={[styles.node, styles.nodeCenter]} />
                <View style={[styles.node, styles.nodeRight]} />
              </View>
              <View style={styles.trackingInfo}>
                <Text style={styles.cardLabel}>{t.trackingLabel}</Text>
                <Text style={styles.cardTitle}>{t.trackingTitle}</Text>
                <Text style={styles.cardMeta}>{t.trackingMeta}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} activeOpacity={0.86} onPress={handleStart}>
                <Text style={styles.primaryButtonText}>{t.start}</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.86} onPress={() => router.push('/login')}>
                <Text style={styles.secondaryButtonText}>{t.login}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function FeatureChip({ styles, icon, text }: { styles: ReturnType<typeof createStyles>; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.featureChip}>
      <Ionicons name={icon} size={18} color="#FFFFFF" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const darkSurface = isDark ? 'rgba(255,255,255,0.055)' : colors.surface;
  const deep = isDark ? '#050A13' : '#EAF1FA';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    safeArea: { flex: 1, backgroundColor: 'transparent' },
    scrollContent: { flexGrow: 1 },
    container: { flexGrow: 1, minHeight: '100%', backgroundColor: 'transparent', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 },
    backdrop: { ...StyleSheet.absoluteFillObject },
    blueprintGrid: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
    gridLineVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: isDark ? 'rgba(47,128,237,0.075)' : 'rgba(31,116,232,0.07)' },
    gridLineHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: isDark ? 'rgba(47,128,237,0.055)' : 'rgba(31,116,232,0.055)' },
    diagonalBandOne: { position: 'absolute', top: 92, left: -90, width: 520, height: 86, backgroundColor: isDark ? 'rgba(47,128,237,0.11)' : 'rgba(31,116,232,0.08)', transform: [{ rotate: '-14deg' }], borderRadius: 28 },
    diagonalBandTwo: { position: 'absolute', bottom: 92, right: -150, width: 560, height: 92, backgroundColor: isDark ? 'rgba(56,189,248,0.065)' : 'rgba(14,165,233,0.06)', transform: [{ rotate: '-14deg' }], borderRadius: 30 },
    cornerPlate: { position: 'absolute', top: 0, right: 0, width: 148, height: 148, borderBottomLeftRadius: 52, backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.48)' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 24 },
    brandRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0, flex: 1 },
    logoImage: { width: 46, height: 46, marginRight: 10 },
    brand: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 0 },
    brandSub: { color: colors.primarySoft, fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginTop: -2 },
    copyBlock: { marginTop: 10 },
    kicker: { color: colors.primarySoft, fontSize: 12, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
    title: { color: colors.text, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: 0, marginTop: 10, marginBottom: 14 },
    subtitle: { color: colors.mutedText, fontSize: 16, lineHeight: 24 },
    featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
    featureChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 16, backgroundColor: darkSurface, borderWidth: 1, borderColor: colors.border },
    featureText: { color: colors.text, fontSize: 13, fontWeight: '900' },
    trackingCard: { minHeight: 242, borderRadius: 30, padding: 14, backgroundColor: deep, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: 18 },
    mapGrid: { height: 112, borderRadius: 24, backgroundColor: isDark ? '#07101D' : '#DDEBFA', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    trackOne: { position: 'absolute', left: 54, top: 56, width: 126, height: 3, borderRadius: 8, backgroundColor: colors.primary, transform: [{ rotate: '-15deg' }] },
    trackTwo: { position: 'absolute', left: 174, top: 62, width: 108, height: 3, borderRadius: 8, backgroundColor: colors.primary, transform: [{ rotate: '26deg' }] },
    node: { position: 'absolute', width: 20, height: 20, borderRadius: 99, backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: colors.primary, zIndex: 2 },
    nodeLeft: { left: 42, top: 61 },
    nodeCenter: { left: 169, top: 30 },
    nodeRight: { right: 42, top: 79 },
    trackingInfo: { marginTop: 12, padding: 14, borderRadius: 22, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF', borderWidth: 1, borderColor: colors.border },
    cardLabel: { color: colors.primarySoft, fontSize: 12, fontWeight: '900', marginBottom: 5 },
    cardTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
    cardMeta: { color: colors.mutedText, fontSize: 13, fontWeight: '800', marginTop: 7 },
    actions: { marginTop: 24, gap: 12 },
    primaryButton: { minHeight: 58, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
    secondaryButton: { minHeight: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: darkSurface, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  });
}
