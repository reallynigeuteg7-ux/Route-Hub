import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

const RATING_LABELS: Record<number, string> = {
  1: 'Очень плохо',
  2: 'Плохо',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
};

export default function WriteReviewScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { revieweeId, revieweeName, loadId, loadRoute } = useLocalSearchParams<{
    revieweeId: string;
    revieweeName: string;
    loadId: string;
    loadRoute: string;
  }>();

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Ошибка', 'Выбери оценку от 1 до 5');
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          revieweeId: Number(revieweeId),
          loadId: Number(loadId),
          rating,
          text: text.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось отправить отзыв');
        return;
      }

      Alert.alert('Готово', 'Рейтинг сохранен', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      console.log('Write review error:', err);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.back}>← Назад</Text>
          </TouchableOpacity>

          <Text style={styles.pageTitle}>Оставить рейтинг</Text>
          <Text style={styles.pageSubtitle}>Оцени сотрудничество после завершения перевозки.</Text>

          {!!loadRoute && (
            <View style={styles.contextCard}>
              <Text style={styles.contextLabel}>Груз</Text>
              <Text style={styles.contextRoute}>{loadRoute}</Text>
            </View>
          )}

          <View style={styles.recipientCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{revieweeName?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
            <View style={styles.recipientInfo}>
              <Text style={styles.recipientLabel}>Кому ставим рейтинг</Text>
              <Text style={styles.recipientName}>{revieweeName || 'Пользователь'}</Text>
            </View>
          </View>

          <View style={styles.ratingCard}>
            <Text style={styles.sectionTitle}>Оценка</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.75} style={styles.starButton}>
                  <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={42} color={star <= rating ? '#F59E0B' : colors.border} />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Комментарий</Text>
            <Text style={styles.fieldHint}>Необязательно, но полезно для других пользователей</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Напиши пару слов о сотрудничестве"
              placeholderTextColor={colors.mutedText}
              style={styles.textarea}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{text.length}/500</Text>
          </View>

          <TouchableOpacity style={[styles.submitButton, rating === 0 && styles.submitButtonDisabled]} activeOpacity={0.85} onPress={handleSubmit} disabled={loading || rating === 0}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Сохранить рейтинг</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 32 },
    container: { paddingHorizontal: 18, paddingTop: 16 },
    back: { color: colors.primarySoft, fontSize: 16, fontWeight: '700', marginBottom: 16 },
    pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
    pageSubtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    contextCard: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    contextLabel: { color: colors.primarySoft, fontSize: 12, fontWeight: '800' },
    contextRoute: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
    recipientCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
    recipientInfo: { flex: 1 },
    avatar: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
    recipientLabel: { color: colors.mutedText, fontSize: 12, fontWeight: '700', marginBottom: 4 },
    recipientName: { color: colors.text, fontSize: 18, fontWeight: '800' },
    ratingCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14, alignItems: 'center' },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12, alignSelf: 'flex-start', width: '100%' },
    starsRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
    starButton: { padding: 4 },
    ratingLabel: { color: '#F59E0B', fontSize: 15, fontWeight: '800' },
    formCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    fieldHint: { color: colors.mutedText, fontSize: 12, fontWeight: '600', marginTop: -8, marginBottom: 12 },
    textarea: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15, minHeight: 120, lineHeight: 22 },
    charCount: { color: colors.mutedText, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 8 },
    submitButton: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
}