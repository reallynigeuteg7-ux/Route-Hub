import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';
import { KeyboardSafeView } from './keyboard-safe-view';

type AiLoad = {
  id: number;
  from_location?: string;
  to_location?: string;
  weight?: number | string;
  type?: string;
  price?: number | string;
  date?: string;
  status?: string;
  recommendation_reason?: string;
};

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  loads?: AiLoad[];
  pending?: boolean;
};

type RouteHubAiAssistantProps = {
  currentPath?: string;
  bottomOffset?: number;
};

const QUICK_PROMPTS = [
  'Что я могу сделать здесь?',
  'Найди грузы из Алматы',
  'Покажи мои грузы',
  'Как отправить ставку?',
];

function formatPrice(value?: number | string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Цена не указана';
  return numeric.toLocaleString('ru-RU') + ' ₸';
}

function getStatusLabel(status?: string) {
  if (status === 'open') return 'Открыт';
  if (status === 'assigned') return 'Назначен';
  if (status === 'completed') return 'Завершен';
  return status || 'Не указан';
}

export function RouteHubAiAssistant({ currentPath = '', bottomOffset = 96 }: RouteHubAiAssistantProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark, bottomOffset), [colors, isDark, bottomOffset]);
  const scrollRef = useRef<ScrollView | null>(null);
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Я RouteHub AI. Могу помочь по любой вкладке: грузы, ставки, маршруты, профиль, кошелек и настройки.',
    },
  ]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const appendMessage = (message: AiMessage) => {
    setMessages((current) => [...current, message]);
    scrollToBottom();
  };

  const replacePendingMessage = (message: AiMessage) => {
    setMessages((current) => current.map((item) => (item.pending ? message : item)));
    scrollToBottom();
  };

  const openCargo = (loadId: number) => {
    setVisible(false);
    router.push({ pathname: '/cargo-details', params: { id: String(loadId) } });
  };

  const sendAiMessage = async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || sending) return;

    const nextHistory = [...history, { role: 'user' as const, content: text }];
    appendMessage({ id: 'user-' + Date.now(), role: 'user', text });
    setHistory(nextHistory);
    setInput('');
    setSending(true);
    appendMessage({ id: 'pending-' + Date.now(), role: 'assistant', text: 'Думаю...', pending: true });

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        replacePendingMessage({
          id: 'assistant-auth-' + Date.now(),
          role: 'assistant',
          text: 'Нужно войти в аккаунт, чтобы я мог видеть твои грузы, ставки и баланс.',
        });
        return;
      }

      const response = await fetch(API_BASE_URL + '/api/mobile/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          message: text,
          history: nextHistory,
          context: {
            screen: currentPath,
            source: 'global-tab-assistant',
          },
        }),
      });

      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      if (!response.ok || data?.error) {
        throw new Error(data?.error || raw || 'Не удалось получить ответ от AI');
      }

      const assistantText = typeof data?.text === 'string' && data.text.trim()
        ? data.text.trim()
        : 'Пустой ответ от AI';

      replacePendingMessage({
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        text: assistantText,
        loads: Array.isArray(data?.loads) ? data.loads : [],
      });
      setHistory([...nextHistory, { role: 'assistant', content: assistantText }]);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Не удалось подключиться к серверу';
      replacePendingMessage({
        id: 'assistant-error-' + Date.now(),
        role: 'assistant',
        text: 'Ошибка AI: ' + errorText,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} activeOpacity={0.88} onPress={() => setVisible(true)}>
        <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
        <Text style={styles.fabText}>AI</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardSafeView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <SafeAreaView style={styles.sheet} edges={['top', 'left', 'right', 'bottom']}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>RouteHub AI</Text>
                  <Text style={styles.subtitle}>Помощник по всем вкладкам</Text>
                </View>
                <TouchableOpacity style={styles.closeButton} activeOpacity={0.85} onPress={() => setVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onContentSizeChange={scrollToBottom}
              >
                <View style={styles.quickRow}>
                  {QUICK_PROMPTS.map((prompt) => (
                    <TouchableOpacity key={prompt} style={styles.quickButton} activeOpacity={0.85} onPress={() => void sendAiMessage(prompt)}>
                      <Text style={styles.quickText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {messages.map((message) => (
                  <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.messageText, message.role === 'user' ? styles.userMessageText : styles.assistantMessageText]}>
                      {message.text}
                    </Text>

                    {!!message.loads?.length && (
                      <View style={styles.loadsList}>
                        {message.loads.map((load) => (
                          <TouchableOpacity key={String(load.id)} style={styles.loadCard} activeOpacity={0.88} onPress={() => openCargo(load.id)}>
                            <View style={styles.loadTop}>
                              <Text style={styles.loadRoute} numberOfLines={2}>
                                {(load.from_location || '—') + ' → ' + (load.to_location || '—')}
                              </Text>
                              <Text style={styles.loadPrice}>{formatPrice(load.price)}</Text>
                            </View>
                            <Text style={styles.loadMeta}>{load.type || 'Тип не указан'} · {load.weight || '—'} т · {getStatusLabel(load.status)}</Text>
                            {!!load.recommendation_reason && <Text style={styles.loadReason}>{load.recommendation_reason}</Text>}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.inputWrap}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Спроси что угодно"
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                  multiline
                  maxLength={1000}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
                  activeOpacity={0.85}
                  onPress={() => void sendAiMessage(input)}
                  disabled={!input.trim() || sending}
                >
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </KeyboardSafeView>
        </View>
      </Modal>
    </>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors, isDark: boolean, bottomOffset: number) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 18,
      bottom: bottomOffset,
      minWidth: 62,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      shadowColor: colors.primary,
      shadowOpacity: 0.26,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
      zIndex: 20,
    },
    fabText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalKeyboard: {
      justifyContent: 'flex-end',
    },
    sheet: {
      height: '88%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '900',
    },
    subtitle: {
      color: colors.mutedText,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 2,
    },
    closeButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 18,
      gap: 12,
    },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 2,
    },
    quickButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    quickText: {
      color: colors.primarySoft,
      fontSize: 12,
      fontWeight: '800',
    },
    messageBubble: {
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '90%',
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    assistantBubble: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
    },
    messageText: {
      fontSize: 14,
      lineHeight: 21,
    },
    userMessageText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    assistantMessageText: {
      color: colors.text,
      fontWeight: '600',
    },
    loadsList: {
      marginTop: 12,
      gap: 10,
    },
    loadCard: {
      backgroundColor: isDark ? 'rgba(8,17,32,0.8)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
    },
    loadTop: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    loadRoute: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    loadPrice: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    loadMeta: {
      color: colors.mutedText,
      fontSize: 12,
      fontWeight: '700',
    },
    loadReason: {
      color: colors.primarySoft,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 8,
    },
    inputWrap: {
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
    },
    input: {
      flex: 1,
      minHeight: 46,
      maxHeight: 110,
      borderRadius: 18,
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    sendButton: {
      width: 46,
      height: 46,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendButtonDisabled: {
      opacity: 0.55,
    },
  });
}
