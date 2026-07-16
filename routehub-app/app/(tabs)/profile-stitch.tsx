import React from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { logoutAndGoHome } from '../../lib/logout';

const avatarUri =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDGpSPqgdSKM4jAgYlc6M0RXkcCTlwDSt8_qv3-gbFxjz1R9rm4LYyFaNZC1cWs8zFlfNt28uqqQxlKuLiZTu_VPYw44skN24FrIbLS9nI5tOj4Ybp7a9QBjgiu1aj1WwPX1e0wrqLbXtXnhjrlyAt9LgBtHmwoCE6G9o0HQDTSruGZWz5zD4JMbB_EmRH9W2oIxw_ZwbnJhcGvWnImora8U3-Pns8ra269uaIZxEfvZi4eUad4N4VzxBQYzg5WlPtsMh12hc6PSu8';

const stats = [
  {
    label: 'Общая дистанция',
    value: '12,480',
    unit: 'км',
    note: '+12% к прошлому месяцу',
  },
  {
    label: 'Пунктуальность',
    value: '98.4',
    unit: '%',
    note: 'Элитный статус подтвержден',
  },
  {
    label: 'Активные грузы',
    value: '06',
    unit: '',
    note: 'Следующая доставка через 4 ч',
  },
];

const documents = [
  {
    icon: 'document-text-outline',
    title: 'TIR Carnet #8821',
    subtitle: 'Истекает: 12 ноя 2026',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Страховой полис',
    subtitle: 'Истекает: 04 янв 2027',
  },
  {
    icon: 'id-card-outline',
    title: 'Водительское удостоверение',
    subtitle: 'Статус: действительно',
  },
] as const;

const routes = [
  {
    id: '#RH-9982',
    route: 'Алматы -> Астана',
    cargo: 'Заморозка',
    date: 'Окт 12',
    status: 'Доставлено',
    active: false,
  },
  {
    id: '#RH-9975',
    route: 'Шымкент -> Алматы',
    cargo: 'Запчасти',
    date: 'Окт 10',
    status: 'Доставлено',
    active: false,
  },
  {
    id: '#RH-9960',
    route: 'Актобе -> Астана',
    cargo: 'Электроника',
    date: 'Окт 08',
    status: 'В пути',
    active: true,
  },
];

const settings = [
  { icon: 'notifications-outline', title: 'Уведомления' },
  { icon: 'lock-closed-outline', title: 'Приватность и безопасность' },
  { icon: 'card-outline', title: 'Способы оплаты' },
] as const;

export default function ProfileStitchScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Ionicons name="cube-outline" size={24} color={colors.primary} />
            <Text style={styles.brandText}>ROUTEHUB</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.75} onPress={() => Alert.alert('Уведомления', 'Новых уведомлений нет.')}>
            <Ionicons name="notifications-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.heroInfo}>
            <Text style={styles.name}>Касым-Жомарт Нурлыбай</Text>
            <Text style={styles.position}>Старший логист • Алматы, KZ</Text>

            <View style={styles.metaRow}>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Проверенный партнер</Text>
              </View>
              <View style={styles.rating}>
                <Ionicons name="star" size={15} color={colors.tertiary} />
                <Text style={styles.ratingText}>4.9 (124 отзыва)</Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          activeOpacity={0.85}
          onPress={() => router.push('/edit-profile' as never)}
        >
          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
          <Text style={styles.editButtonText}>Редактировать</Text>
        </TouchableOpacity>

        <View style={styles.performanceCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle}>Показатели перевозчика</Text>
              <Text style={styles.cardSubtitle}>Операционные показатели за последние 30 дней</Text>
            </View>
            <Ionicons name="stats-chart-outline" size={24} color={colors.primary} />
          </View>

          <View style={styles.statsGrid}>
            {stats.map((item) => (
              <View style={styles.statItem} key={item.label}>
                <Text style={styles.statLabel}>{item.label}</Text>
                <View style={styles.statValueRow}>
                  <Text style={styles.statValue}>{item.value}</Text>
                  {!!item.unit && <Text style={styles.statUnit}>{item.unit}</Text>}
                </View>
                <Text style={styles.statNote}>{item.note}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.walletCard}>
          <View>
            <Text style={styles.walletTitle}>Баланс кошелька</Text>
            <Text style={styles.walletSubtitle}>Доступно к выводу</Text>
          </View>
          <View style={styles.walletBalanceBlock}>
            <Text style={styles.walletBalance}>₸840,500</Text>
            <Text style={styles.walletCardNumber}>**** 4402 • KASPI GOLD</Text>
          </View>
          <TouchableOpacity style={styles.withdrawButton} activeOpacity={0.85} onPress={() => router.push('/wallet-topup' as never)}>
            <Text style={styles.withdrawButtonText}>Вывести средства</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Документы</Text>
            <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/edit-profile' as never)}>
              <Text style={styles.uploadText}>Загрузить</Text>
            </TouchableOpacity>
          </View>

          {documents.map((item) => (
            <View style={styles.documentRow} key={item.title}>
              <View style={styles.documentIcon}>
                <Ionicons name={item.icon} size={22} color={colors.textMuted} />
              </View>
              <View style={styles.documentText}>
                <Text style={styles.documentTitle}>{item.title}</Text>
                <Text style={styles.documentSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Последние маршруты</Text>

          {routes.map((item) => (
            <View style={styles.routeRow} key={item.id}>
              <View style={styles.routeTopLine}>
                <Text style={styles.routeId}>{item.id}</Text>
                <View style={[styles.statusBadge, item.active && styles.statusBadgeActive]}>
                  <Text style={[styles.statusText, item.active && styles.statusTextActive]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.routeName}>{item.route}</Text>
              <View style={styles.routeMetaLine}>
                <Text style={styles.routeMeta}>{item.cargo}</Text>
                <Text style={styles.routeMeta}>{item.date}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Настройки аккаунта</Text>

          {settings.map((item, index) => (
            <TouchableOpacity style={styles.settingsRow} key={item.title} activeOpacity={0.78} onPress={() => {
              if (index === 0) router.push('/settings' as never);
              else if (index === 1) router.push('/security' as never);
              else router.push('/wallet-topup' as never);
            }}>
              <View style={styles.settingsLeft}>
                <Ionicons name={item.icon} size={22} color={colors.textMuted} />
                <Text style={styles.settingsText}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          <TouchableOpacity style={styles.logoutRow} activeOpacity={0.78} onPress={() => void logoutAndGoHome()}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={styles.logoutText}>Выйти</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  background: '#F8F9FB',
  surface: '#FFFFFF',
  surfaceLow: '#F3F4F6',
  border: '#E5E7EB',
  primary: '#0058BE',
  primaryContainer: '#D8E2FF',
  primaryStrong: '#001A42',
  text: '#191C1E',
  textMuted: '#555E74',
  outline: '#727785',
  tertiary: '#924700',
  success: '#16A34A',
  successBg: '#DCFCE7',
  error: '#BA1A1A',
  errorBg: '#FFDAD6',
};

const shadow = {
  shadowColor: '#334155',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 2,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    width: 98,
    height: 98,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceLow,
  },
  onlineDot: {
    position: 'absolute',
    right: 4,
    bottom: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  position: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  verifiedBadge: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verifiedText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: colors.tertiary,
    fontSize: 12,
    fontWeight: '800',
  },
  editButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  performanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadow,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  cardSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  statsGrid: {
    gap: 16,
  },
  statItem: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: 16,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statValueRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  statValue: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  statUnit: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 24,
    fontWeight: '600',
  },
  statNote: {
    marginTop: 2,
    color: colors.success,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  walletCard: {
    overflow: 'hidden',
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 22,
    gap: 22,
  },
  walletTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  walletSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
  },
  walletBalanceBlock: {
    gap: 4,
  },
  walletBalance: {
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
  },
  walletCardNumber: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  withdrawButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
    ...shadow,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  uploadText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  documentRow: {
    minHeight: 68,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  documentIcon: {
    width: 28,
    alignItems: 'center',
  },
  documentText: {
    flex: 1,
  },
  documentTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  documentSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  routeRow: {
    paddingVertical: 2,
    gap: 6,
  },
  routeTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  routeId: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: colors.primaryContainer,
  },
  statusText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusTextActive: {
    color: colors.primaryStrong,
  },
  routeName: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  routeMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  routeMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  settingsRow: {
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  settingsLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  logoutRow: {
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
});
