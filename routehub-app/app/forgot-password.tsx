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
import { router } from 'expo-router';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

export default function ForgotPasswordScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      Alert.alert('Ошибка', 'Введи email');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/api/mobile/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось отправить код');
        return;
      }

      router.push({
        pathname: '/reset-password',
        params: { email: email.trim() },
      });
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

          <Text style={styles.title}>Забыли пароль?</Text>
          <Text style={styles.subtitle}>
            Введи email от аккаунта — отправим код для сброса пароля.
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

            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.85}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Отправить код</Text>}
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
    subtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 30 },
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
    button: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingVertical: 17,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
}