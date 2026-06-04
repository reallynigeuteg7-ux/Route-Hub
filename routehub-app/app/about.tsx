import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';

function openLegalUrl(path: '/terms.html' | '/privacy.html') {
  void Linking.openURL(API_BASE_URL + path);
}
export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback()} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.pageTitle}>О приложении</Text>
          <Text style={styles.pageSubtitle}>
            Информация о платформе RouteHub и текущей версии приложения
          </Text>

          <View style={styles.heroCard}>
            <View style={styles.logoBox}>
              <Image
                source={require('../images/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.version}>Версия 1.0.0</Text>
            <Text style={styles.heroText}>
              RouteHub — это логистическая платформа для грузовладельцев и
              перевозчиков, где можно публиковать грузы, отправлять ставки,
              общаться и управлять перевозками в одном приложении.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Основные возможности</Text>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Поиск и публикация грузов</Text>
              <Text style={styles.infoText}>
                Удобный просмотр грузов, создание новых заявок и работа с маршрутами.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Ставки и отклики</Text>
              <Text style={styles.infoText}>
                Перевозчики могут отправлять ставки, а грузовладельцы — выбирать
                подходящее предложение.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Чаты и взаимодействие</Text>
              <Text style={styles.infoText}>
                Быстрое общение между сторонами внутри приложения без лишних
                переходов.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Информация</Text>

            <View style={styles.metaCard}>
              <Text style={styles.metaValue}>@adocksulumenov :D</Text>
              <Text style={styles.metaLabel}>Все права защищены авторским правом</Text>
            </View>

            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Платформа</Text>
              <Text style={styles.metaValue}>iOS / Android</Text>
            </View>

            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Статус проекта</Text>
              <Text style={styles.metaValue}>MVP / UI stage</Text>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Документы</Text>
            <TouchableOpacity style={styles.documentCard} activeOpacity={0.85} onPress={() => openLegalUrl('/terms.html')}>
              <View style={styles.documentTextBlock}>
                <Text style={styles.infoTitle}>Условия использования</Text>
                <Text style={styles.infoText}>Правила работы RouteHub, сделки, баланс и ответственность сторон</Text>
              </View>
              <Text style={styles.documentArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.documentCard} activeOpacity={0.85} onPress={() => openLegalUrl('/privacy.html')}>
              <View style={styles.documentTextBlock}>
                <Text style={styles.infoTitle}>Политика конфиденциальности</Text>
                <Text style={styles.infoText}>Персональные данные, геолокация, платежные заявки и квитанции</Text>
              </View>
              <Text style={styles.documentArrow}>→</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.button} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Проверить обновления</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#081120',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#081120',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  back: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },
  pageSubtitle: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBox: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '400',
    marginBottom: 4,
  },
  version: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  infoText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
  },
  documentCard: {
    backgroundColor: 'rgba(47,128,237,0.10)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  documentTextBlock: {
    flex: 1,
  },
  documentArrow: {
    color: '#38BDF8',
    fontSize: 24,
    fontWeight: '900',
  },  metaCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  metaLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  button: {
    backgroundColor: '#2F80ED',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});