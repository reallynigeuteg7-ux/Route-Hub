import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { goBackOrFallback } from '../lib/navigation';

export default function SecurityScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loginAlertsEnabled, setLoginAlertsEnabled] = useState(true);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback('/(tabs)/profile')} activeOpacity={0.85}>
        <Text style={styles.back}>← Назад</Text>
      </TouchableOpacity>

          <Text style={styles.pageTitle}>Безопасность</Text>
          <Text style={styles.pageSubtitle}>
            Управляй паролем, защитой аккаунта и уведомлениями о входах
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Смена пароля</Text>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Текущий пароль</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Введите текущий пароль"
                placeholderTextColor="#7C8BA1"
                style={styles.input}
                secureTextEntry
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Новый пароль</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Введите новый пароль"
                placeholderTextColor="#7C8BA1"
                style={styles.input}
                secureTextEntry
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Повторите новый пароль</Text>
              <TextInput
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                placeholder="Повторите новый пароль"
                placeholderTextColor="#7C8BA1"
                style={styles.input}
                secureTextEntry
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Защита аккаунта</Text>

            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Двухфакторная защита</Text>
                <Text style={styles.settingText}>
                  Дополнительная проверка при входе в аккаунт
                </Text>
              </View>
              <Switch
                value={twoFactorEnabled}
                onValueChange={setTwoFactorEnabled}
                trackColor={{ false: '#334155', true: '#2F80ED' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Уведомления о входе</Text>
                <Text style={styles.settingText}>
                  Получать уведомления при новом входе в аккаунт
                </Text>
              </View>
              <Switch
                value={loginAlertsEnabled}
                onValueChange={setLoginAlertsEnabled}
                trackColor={{ false: '#334155', true: '#2F80ED' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Сессии</Text>

            <View style={styles.sessionCard}>
              <Text style={styles.sessionTitle}>Текущее устройство</Text>
              <Text style={styles.sessionText}>iPhone • Safari / Expo Go</Text>
              <Text style={styles.sessionMeta}>Активно сейчас</Text>
            </View>

            <View style={styles.sessionCard}>
              <Text style={styles.sessionTitle}>Последний вход</Text>
              <Text style={styles.sessionText}>Windows • VS Code / Expo</Text>
              <Text style={styles.sessionMeta}>Сегодня, 11:10</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} activeOpacity={0.85}>
            <Text style={styles.saveButtonText}>Сохранить изменения</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerButton} activeOpacity={0.85}>
            <Text style={styles.dangerButtonText}>Выйти со всех устройств</Text>
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
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
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
  inputWrap: {
    marginBottom: 14,
  },
  label: {
    color: '#D7E0EE',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },
  settingCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 8,
  },
  settingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  settingText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  sessionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  sessionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sessionText: {
    color: '#D7E0EE',
    fontSize: 14,
    marginBottom: 4,
  },
  sessionMeta: {
    color: '#94A3B8',
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: '#2F80ED',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  dangerButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  dangerButtonText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '800',
  },
});