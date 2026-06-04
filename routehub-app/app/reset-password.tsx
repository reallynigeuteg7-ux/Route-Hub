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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

export default function ResetPasswordScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!code.trim() || !newPassword.trim()) {
      Alert.alert('Ошибка', 'Заполни все поля');
      return;
    }

    if (newPassword !== repeatPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Ошибка', 'Пароль должен быть минимум 6 символов');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/api/mobile/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email?.trim(), code: code.trim(), newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось сбросить пароль');
        return;
      }

      Alert.alert('Готово!', 'Пароль успешно изменён. Войди в аккаунт.', [
        { text: 'Войти', onPress: () => router.replace('/login') },
      ]);
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Новый пароль</Text>
          <Text style={styles.subtitle}>Введи код из письма и придумай новый пароль.</Text>

          <View style={styles.emailBadge}>
            <Text style={styles.emailText}>Email: {email}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Text style={styles.label}>Код из письма</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Введите 6-значный код"
                placeholderTextColor={colors.mutedText}
                style={[styles.input, styles.codeInput]}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Новый пароль</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Минимум 6 символов"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                secureTextEntry
              />
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.label}>Повторите пароль</Text>
              <TextInput
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                placeholder="Повторите новый пароль"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Сменить пароль</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendButton} activeOpacity={0.85} onPress={() => router.back()}>
              <Text style={styles.resendText}>Отправить код повторно</Text>
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
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1 },
    container: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 30,
      backgroundColor: colors.background,
    },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 24 },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', marginBottom: 10 },
    subtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 16 },
    emailBadge: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emailText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    form: { gap: 16 },
    inputWrap: { marginBottom: 4 },
    label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
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
    codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingVertical: 17,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    resendButton: {
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    resendText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  });
}