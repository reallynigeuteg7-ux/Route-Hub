import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from '../lib/api';
import { goBackOrFallback } from '../lib/navigation';
import { useAppTheme } from '../lib/theme';

type AiLoad = {
  id: number;
  from_location?: string;
  to_location?: string;
  weight?: number | string;
  type?: string;
  price?: number | string;
  date?: string;
  status?: string;
};

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  loads?: AiLoad[];
  pending?: boolean;
};

const QUICK_PROMPTS = [
  'Найди грузы из Алматы',
  'Покажи мои грузы',
  'Как создать груз?',
];

const INITIAL_MESSAGE =
  'Я RouteHub AI. Могу помочь с поиском грузов, вашими публикациями и вопросами по сервису.';

export default function SupportScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: INITIAL_MESSAGE,
    },
  ]);

  const contactItems = useMemo(
    () => [
      { label: 'Email', value: 'support@routehub.kz' },
      { label: 'Телефон', value: '+7 777 123 45 67' },
      { label: 'Время работы', value: 'Пн-Сб, 09:00-19:00' },
    ],
    []
  );

  const faqItems = useMemo(
    () => [
      {
        title: 'Как опубликовать груз?',
        text: 'Откройте вкладку "Создать", заполните форму и опубликуйте груз.',
      },
      {
        title: 'Где посмотреть мои ставки?',
        text: 'Зайдите в профиль и откройте раздел "Мои ставки".',
      },
      {
        title: 'Как связаться с перевозчиком?',
        text: 'Используйте вкладку "Чат" для общения по грузу и условиям перевозки.',
      },
    ],
    []
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const formatPrice = (price?: number | string) => {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return 'Цена не указана';
    }

    return `${numericPrice.toLocaleString('ru-RU')} тг`;
  };

  const getStatusLabel = (status?: string) => {
    if (status === 'open') return 'Открыт';
    if (status === 'assigned') return 'Назначен';
    if (status === 'completed') return 'Завершен';
    return status || 'Не указан';
  };

  const appendMessage = (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
    scrollToBottom();
  };

  const replacePendingMessage = (message: ChatMessage) => {
    setMessages((current) =>
      current.map((item) => (item.pending ? message : item))
    );
    scrollToBottom();
  };

  const sendAiMessage = async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || sending) return;

    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      Alert.alert('Нужен вход', 'Сначала войдите в аккаунт, чтобы пользоваться RouteHub AI.');
      return;
    }

    const nextHistory = [...history, { role: 'user' as const, content: text }];
    appendMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    });

    setHistory(nextHistory);
    setInput('');
    setSending(true);

    appendMessage({
      id: `pending-${Date.now()}`,
      role: 'assistant',
      text: 'Думаю...',
      pending: true,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/mobile/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          history: nextHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.error) {
        throw new Error(data?.error || 'Не удалось получить ответ от AI');
      }

      const assistantText =
        typeof data?.text === 'string' && data.text.trim()
          ? data.text.trim()
          : 'Пустой ответ от AI';

      replacePendingMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: assistantText,
        loads: Array.isArray(data?.loads) ? data.loads : [],
      });

      setHistory([
        ...nextHistory,
        { role: 'assistant', content: assistantText },
      ]);
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : 'Не удалось подключиться к серверу';

      replacePendingMessage({
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: `Ошибка: ${errorText}`,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          <View style={styles.container}>
            <TouchableOpacity
              onPress={() => goBackOrFallback('/(tabs)/profile')}
              activeOpacity={0.85}
            >
              <Text style={styles.back}>← Назад</Text>
            </TouchableOpacity>

            <Text style={styles.pageTitle}>Поддержка и AI</Text>
            <Text style={styles.pageSubtitle}>
              Здесь можно написать в RouteHub AI и быстро получить помощь по грузам, ставкам и сервису.
            </Text>

            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>RouteHub AI</Text>
              <Text style={styles.heroText}>
                Ассистент работает через тот же backend, что и на сайте, и умеет искать грузы и отвечать на вопросы по сервису.
              </Text>
            </View>

            <View style={styles.quickRow}>
              {QUICK_PROMPTS.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.quickButton}
                  activeOpacity={0.85}
                  onPress={() => {
                    setInput(prompt);
                    scrollToBottom();
                  }}
                >
                  <Text style={styles.quickButtonText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.chatCard}>
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageBubble,
                    message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      message.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
                    ]}
                  >
                    {message.text}
                  </Text>

                  {!!message.loads?.length && (
                    <View style={styles.loadsList}>
                      {message.loads.map((load) => (
                        <TouchableOpacity
                          key={`${message.id}-${load.id}`}
                          style={styles.loadCard}
                          activeOpacity={0.88}
                          onPress={() =>
                            router.push({
                              pathname: '/cargo-details',
                              params: { id: String(load.id) },
                            })
                          }
                        >
                          <View style={styles.loadTop}>
                            <Text style={styles.loadRoute}>
                              {load.from_location || '—'} → {load.to_location || '—'}
                            </Text>
                            <Text style={styles.loadPrice}>{formatPrice(load.price)}</Text>
                          </View>

                          <Text style={styles.loadType}>
                            {load.type || 'Тип груза не указан'}
                          </Text>

                          <View style={styles.loadTags}>
                            <Text style={styles.loadTag}>Вес: {load.weight || '—'} т</Text>
                            <Text style={styles.loadTag}>
                              Дата: {load.date || 'Не указана'}
                            </Text>
                            <Text style={styles.loadTag}>
                              Статус: {getStatusLabel(load.status)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Напишите вопрос для AI"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                multiline
              />

              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                activeOpacity={0.85}
                onPress={() => void sendAiMessage(input)}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendButtonText}>Отправить</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Контакты</Text>

              {contactItems.map((item) => (
                <View key={item.label} style={styles.contactCard}>
                  <Text style={styles.contactLabel}>{item.label}</Text>
                  <Text style={styles.contactValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Популярные вопросы</Text>

              {faqItems.map((item) => (
                <View key={item.title} style={styles.faqCard}>
                  <Text style={styles.faqTitle}>{item.title}</Text>
                  <Text style={styles.faqText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  back: {
    color: colors.primarySoft,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },
  pageSubtitle: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  heroText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 22,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  quickButton: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  chatCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    gap: 12,
  },
  messageBubble: {
    borderRadius: 20,
    padding: 14,
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    maxWidth: '88%',
  },
  assistantBubble: {
    backgroundColor: colors.surfaceStrong,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userMessageText: {
    color: '#F0FDF4',
  },
  assistantMessageText: {
    color: colors.text,
  },
  loadsList: {
    marginTop: 12,
    gap: 10,
  },
  loadCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  loadRoute: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  loadPrice: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  loadType: {
    color: colors.mutedText,
    fontSize: 13,
    marginBottom: 10,
  },
  loadTags: {
    gap: 6,
  },
  loadTag: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrap: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
  },
  input: {
    minHeight: 88,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  contactLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  contactValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  faqTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  faqText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
});
