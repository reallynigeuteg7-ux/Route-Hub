import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';
import { startPersistentLocationTracking } from '../lib/background-location';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Заполни email и пароль');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/api/mobile/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка входа', data.error || 'Не удалось войти');
        return;
      }

      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));
      void startPersistentLocationTracking().catch((error) => {
        console.log('Start location tracking after login error:', error);
      });

      router.replace('/(tabs)');
    } catch (error) {
      console.log('Login error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => goBackOrFallback('/')} activeOpacity={0.8}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Вход в RouteHub</Text>
          <Text style={styles.subtitle}>
            Войди в аккаунт, чтобы управлять грузами, ставками и заявками.
          </Text>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Введите email"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Введите пароль"
                placeholderTextColor={colors.mutedText}
                secureTextEntry
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              onPress={() => router.push('/forgot-password')}
              activeOpacity={0.8}
              style={styles.forgotWrap}
            >
              <Text style={styles.forgotText}>Забыли пароль?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginButton}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? 'Вход...' : 'Войти'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerButton}
              activeOpacity={0.85}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerButtonText}>Создать аккаунт</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 30,
      backgroundColor: colors.background,
    },
    back: {
      color: colors.primarySoft,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 24,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: '900',
      marginBottom: 10,
    },
    subtitle: {
      color: colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 30,
    },
    form: {
      gap: 16,
    },
    inputWrap: {
      marginBottom: 4,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: colors.text,
      fontSize: 15,
    },
    loginButton: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingVertical: 17,
      alignItems: 'center',
      marginTop: 8,
    },
    loginButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    registerButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    registerButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    forgotWrap: {
      alignItems: 'flex-end',
      marginTop: -8,
    },
    forgotText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
  });
}

