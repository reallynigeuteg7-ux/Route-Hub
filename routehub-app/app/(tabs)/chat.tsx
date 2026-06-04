import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../lib/api';
import { useAppTheme } from '../../lib/theme';

type Chat = {
  id: number;
  loadId: number;
  from_location: string;
  to_location: string;
  load_type?: string;
  client_name: string;
  carrier_name: string;
  clientId: number;
  carrierId: number;
  last_message?: string;
  last_message_time?: string;
};

type TabKey = 'clients' | 'ai';

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

const QUICK_PROMPTS = [
  'Найди грузы из Алматы',
  'Покажи мои грузы',
  'Покажи попутные грузы',
  'Найди тент до 5 тонн до 500000 тг',
  'Как создать груз?',
];

export default function ChatScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
const aiScrollRef = useRef<ScrollView | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('clients');
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [chatSearch, setChatSearch] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiHistory, setAiHistory] = useState<HistoryMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: 'ai-welcome',
      role: 'assistant',
      text: 'Я RouteHub AI. Помогу найти грузы, показать ваши публикации и быстро ответить по сервису.',
    },
  ]);

  const scrollAiToBottom = () => {
    requestAnimationFrame(() => {
      aiScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const appendAiMessage = (message: AiMessage) => {
    setAiMessages((current) => [...current, message]);
    scrollAiToBottom();
  };

  const replacePendingAiMessage = (message: AiMessage) => {
    setAiMessages((current) =>
      current.map((item) => (item.pending ? message : item))
    );
    scrollAiToBottom();
  };

  useEffect(() => {
    AsyncStorage.removeItem('routehub_ai_chat_state_v1').catch((error) => {
      console.log('Clear AI state error:', error);
    });
  }, []);

  const fetchFavorites = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setFavoriteIds([]);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setFavoriteIds(data.map((item) => Number(item.id)).filter(Number.isFinite));
      }
    } catch (error) {
      console.log('Fetch favorites error:', error);
    }
  };

  const fetchChats = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');

      if (userData) {
        const parsedUser = JSON.parse(userData);
        setMyUserId(parsedUser.id);
        setUserRole(parsedUser.role || '');
      }

      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/mobile/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        setChats(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.log('Fetch chats error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchChats(true);
      fetchFavorites();
    }, [])
  );

  const getChatName = (chat: Chat) =>
    myUserId === chat.clientId ? chat.carrier_name : chat.client_name;

  const filteredChats = chats.filter((chat) => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return true;

    const searchable = [
      getChatName(chat),
      chat.from_location,
      chat.to_location,
      chat.load_type || '',
      chat.last_message || '',
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  });

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    const isToday = date.toDateString() === new Date().toDateString();

    return isToday
      ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
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

  const openLoadDetails = (loadId: number) => {
    router.push({
      pathname: '/cargo-details',
      params: { id: String(loadId) },
    });
  };

  const openLoadChat = async (load: AiLoad) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Нужен вход', 'Сначала войдите в аккаунт.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ loadId: load.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось открыть чат');
        return;
      }

      router.push({
        pathname: '/chat-details',
        params: {
          chatId: String(data.id),
          chatName: 'Чат по грузу',
          fromLocation: load.from_location || '',
          toLocation: load.to_location || '',
          loadType: load.type || '',
          loadId: String(load.id),
        },
      });
    } catch (error) {
      console.log('Open AI load chat error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  };

  const toggleFavorite = async (loadId: number) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Нужен вход', 'Сначала войдите в аккаунт.');
        return;
      }

      const isFavorite = favoriteIds.includes(loadId);
      const response = await fetch(
        isFavorite
          ? `${API_BASE_URL}/api/mobile/favorites/${loadId}`
          : `${API_BASE_URL}/api/mobile/favorites`,
        {
          method: isFavorite ? 'DELETE' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: isFavorite ? undefined : JSON.stringify({ loadId }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось обновить избранное');
        return;
      }

      setFavoriteIds((current) =>
        isFavorite ? current.filter((id) => id !== loadId) : [...current, loadId]
      );
    } catch (error) {
      console.log('Toggle favorite error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  };

  const sendAiMessage = async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || aiSending) return;

    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      Alert.alert('Нужен вход', 'Сначала войдите в аккаунт, чтобы пользоваться ИИ помощником.');
      return;
    }

    const nextHistory = [...aiHistory, { role: 'user' as const, content: text }];

    appendAiMessage({
      id: `ai-user-${Date.now()}`,
      role: 'user',
      text,
    });

    setAiHistory(nextHistory);
    setAiInput('');
    setAiSending(true);

    appendAiMessage({
      id: `ai-pending-${Date.now()}`,
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
        throw new Error(data?.error || 'Не удалось получить ответ от ИИ');
      }

      const assistantText =
        typeof data?.text === 'string' && data.text.trim()
          ? data.text.trim()
          : 'Пустой ответ от ИИ';

      replacePendingAiMessage({
        id: `ai-assistant-${Date.now()}`,
        role: 'assistant',
        text: assistantText,
        loads: Array.isArray(data?.loads) ? data.loads : [],
      });

      setAiHistory([
        ...nextHistory,
        { role: 'assistant', content: assistantText },
      ]);
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : 'Не удалось подключиться к серверу';

      replacePendingAiMessage({
        id: `ai-error-${Date.now()}`,
        role: 'assistant',
        text: `Ошибка: ${errorText}`,
      });
    } finally {
      setAiSending(false);
    }
  };

  const renderTabs = () => (
    <View style={styles.switcher}>
      <TouchableOpacity
        style={[styles.switchButton, activeTab === 'clients' && styles.switchButtonActive]}
        activeOpacity={0.85}
        onPress={() => setActiveTab('clients')}
      >
        <Text
          style={[styles.switchButtonText, activeTab === 'clients' && styles.switchButtonTextActive]}
        >
          Клиенты
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.switchButton, activeTab === 'ai' && styles.switchButtonActive]}
        activeOpacity={0.85}
        onPress={() => setActiveTab('ai')}
      >
        <Text style={[styles.switchButtonText, activeTab === 'ai' && styles.switchButtonTextActive]}>
          ИИ помощник
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderClientChats = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchChats(false);
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.container}>
          <Text style={styles.pageTitle}>Чат</Text>
          <Text style={styles.pageSubtitle}>Общение с клиентами и перевозчиками</Text>
          {renderTabs()}

          <View style={styles.searchWrap}>
            <TextInput
              value={chatSearch}
              onChangeText={setChatSearch}
              placeholder="Поиск по имени, маршруту или сообщению"
              placeholderTextColor={colors.mutedText}
              style={styles.searchInput}
            />
          </View>

          {chats.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Пока нет сообщений</Text>
              <Text style={styles.emptySubtitle}>
                Здесь появятся диалоги после отправки ставки на груз.
              </Text>
            </View>
          ) : filteredChats.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Ничего не найдено</Text>
              <Text style={styles.emptySubtitle}>
                Попробуйте другое имя, маршрут или текст сообщения.
              </Text>
            </View>
          ) : (
            <View style={styles.chatList}>
              {filteredChats.map((chat) => (
                <TouchableOpacity
                  key={chat.id}
                  style={styles.chatCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/chat-details',
                      params: {
                        chatId: String(chat.id),
                        chatName: getChatName(chat),
                        fromLocation: chat.from_location,
                        toLocation: chat.to_location,
                        loadType: chat.load_type || '',
                        loadId: String(chat.loadId),
                      },
                    })
                  }
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getChatName(chat).charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.chatContent}>
                    <View style={styles.topRow}>
                      <Text style={styles.chatName} numberOfLines={1}>
                        {getChatName(chat)}
                      </Text>
                      <Text style={styles.chatTime}>{formatTime(chat.last_message_time)}</Text>
                    </View>
                    <Text style={styles.routeText} numberOfLines={1}>
                      {chat.from_location} → {chat.to_location}
                    </Text>
                    <Text
                      style={chat.last_message ? styles.chatMessage : styles.noMessage}
                      numberOfLines={1}
                    >
                      {chat.last_message || 'Нет сообщений'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderAiTab = () => (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={aiScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollAiToBottom}
      >
        <View style={styles.container}>
          <Text style={styles.pageTitle}>Чат</Text>
          <Text style={styles.pageSubtitle}>Общение с клиентами и перевозчиками</Text>
          {renderTabs()}

          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>ИИ помощник RouteHub</Text>
            <Text style={styles.heroText}>
              Помогает искать грузы, показывать ваши публикации и отвечать на вопросы по сервису.
            </Text>
          </View>

          <View style={styles.quickRow}>
            {QUICK_PROMPTS.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.quickButton}
                activeOpacity={0.85}
                onPress={() => {
                  setAiInput(prompt);
                  scrollAiToBottom();
                }}
              >
                <Text style={styles.quickButtonText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.aiCard}>
            {aiMessages.map((message) => (
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
                        onPress={() => openLoadDetails(load.id)}
                      >
                        <View style={styles.loadTop}>
                          <Text style={styles.loadRoute}>
                            {load.from_location || '—'} → {load.to_location || '—'}
                          </Text>
                          <Text style={styles.loadPrice}>{formatPrice(load.price)}</Text>
                        </View>

                        <Text style={styles.loadType}>{load.type || 'Тип груза не указан'}</Text>

                        {!!load.recommendation_reason && (
                          <View style={styles.reasonPill}>
                            <Text style={styles.reasonText}>{load.recommendation_reason}</Text>
                          </View>
                        )}

                        <View style={styles.loadTags}>
                          <Text style={styles.loadTag}>Вес: {load.weight || '—'} т</Text>
                          <Text style={styles.loadTag}>Дата: {load.date || 'Не указана'}</Text>
                          <Text style={styles.loadTag}>
                            Статус: {getStatusLabel(load.status)}
                          </Text>
                        </View>

                        <View style={styles.loadActions}>
                          <TouchableOpacity
                            style={styles.loadActionButton}
                            activeOpacity={0.85}
                            onPress={() => openLoadDetails(load.id)}
                          >
                            <Text style={styles.loadActionText}>Открыть</Text>
                          </TouchableOpacity>

                          {userRole === 'carrier' && (
                            <TouchableOpacity
                              style={styles.loadActionButton}
                              activeOpacity={0.85}
                              onPress={() => void openLoadChat(load)}
                            >
                              <Text style={styles.loadActionText}>Написать</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.loadActionButton}
                            activeOpacity={0.85}
                            onPress={() => void toggleFavorite(load.id)}
                          >
                            <Text style={styles.loadActionText}>
                              {favoriteIds.includes(load.id) ? 'Убрать' : 'В избранное'}
                            </Text>
                          </TouchableOpacity>
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
              value={aiInput}
              onChangeText={setAiInput}
              placeholder="Напишите вопрос для ИИ"
              placeholderTextColor={colors.mutedText}
              style={styles.input}
              multiline
            />

            <TouchableOpacity
              style={[styles.sendButton, aiSending && styles.sendButtonDisabled]}
              activeOpacity={0.85}
              onPress={() => void sendAiMessage(aiInput)}
              disabled={aiSending}
            >
              {aiSending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>Отправить</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      {activeTab === 'clients' ? renderClientChats() : renderAiTab()}
    </SafeAreaView>
  );
}

type TabThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: TabThemeColors) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 28 },
  container: { paddingHorizontal: 18, paddingTop: 16 },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  pageTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 },
  pageSubtitle: { color: colors.mutedText, fontSize: 15, marginBottom: 16 },
  switcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
  },
  switchButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonActive: {
    backgroundColor: colors.primary,
  },
  switchButtonText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '800',
  },
  switchButtonTextActive: {
    color: colors.text,
  },
  searchWrap: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchInput: {
    color: colors.text,
    fontSize: 14,
    paddingVertical: 14,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginTop: 14,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySubtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  chatList: { gap: 12 },
  chatCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  chatContent: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
    gap: 10,
  },
  chatName: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  chatTime: { color: colors.mutedText, fontSize: 12, fontWeight: '700' },
  routeText: { color: colors.primarySoft, fontSize: 12, fontWeight: '700', marginBottom: 3 },
  chatMessage: { color: colors.mutedText, fontSize: 13 },
  noMessage: { color: colors.mutedText, fontSize: 13, fontStyle: 'italic' },
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
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickButtonText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: '700',
  },
  aiCard: {
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
    backgroundColor: 'rgba(47,128,237,0.18)',
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
    color: colors.text,
  },
  assistantMessageText: {
    color: colors.text,
  },
  loadsList: {
    marginTop: 12,
    gap: 10,
  },
  loadCard: {
    backgroundColor: colors.surfaceStrong,
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
  reasonPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(47,128,237,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(47,128,237,0.24)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  reasonText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  loadTags: {
    gap: 6,
  },
  loadTag: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
  },
  loadActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  loadActionButton: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  loadActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  inputWrap: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
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
  });
}




