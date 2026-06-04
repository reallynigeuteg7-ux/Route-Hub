import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, StatusBar, TouchableOpacity,
  TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/api';
import { io, Socket } from 'socket.io-client';

type Message = {
  id: number;
  chatId: number;
  senderId: number;
  text: string;
  createdAt: string;
  sender_name: string;
};

type SocketMessagePayload = Message | {
  chatId?: number | string;
  message?: Partial<Message> & Record<string, unknown>;
};

function normalizeSocketMessage(payload: SocketMessagePayload, activeChatId?: string): Message | null {
  const wrapped = payload as { chatId?: number | string; message?: Partial<Message> & Record<string, unknown> };
  const source = (wrapped?.message && typeof wrapped.message === 'object' ? wrapped.message : payload) as Partial<Message> & Record<string, unknown>;
  const payloadChatId = wrapped?.chatId ?? source.chatId ?? source.chat_id;

  if (activeChatId && payloadChatId && String(payloadChatId) !== String(activeChatId)) return null;

  const rawText = source.text ?? source.message ?? '';
  const messageText = typeof rawText === 'string' ? rawText : String(rawText || '');
  if (!messageText.trim()) return null;

  const rawDate = source.createdAt ?? source.created_at;
  const parsedDate = rawDate ? new Date(String(rawDate)) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  return {
    id: Number(source.id) || Date.now(),
    chatId: Number(source.chatId ?? source.chat_id ?? payloadChatId ?? activeChatId ?? 0),
    senderId: Number(source.senderId ?? source.sender_id ?? 0),
    text: messageText,
    createdAt: safeDate.toISOString(),
    sender_name: String(source.sender_name ?? source.senderName ?? ''),
  };
}

function formatMessageTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatDetailsScreen() {
  const { chatId, chatName, fromLocation, toLocation, loadType, loadId } = useLocalSearchParams<{ chatId: string; chatName: string; fromLocation?: string; toLocation?: string; loadType?: string; loadId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let token: string | null = null;

    const init = async () => {
      token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      if (userData) setMyUserId(JSON.parse(userData).id);
      if (!token) return;

      // Загрузить сообщения
      const response = await fetch(`${API_BASE_URL}/api/mobile/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        const normalizedMessages = (data.messages || [])
          .map((item: SocketMessagePayload) => normalizeSocketMessage(item, chatId))
          .filter(Boolean) as Message[];
        setMessages(normalizedMessages);
      }
      setLoading(false);

      // Подключить socket
      const socket = io(API_BASE_URL, { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join_chat', chatId);
      });

      socket.on('new_message', (payload: SocketMessagePayload) => {
        const msg = normalizeSocketMessage(payload, chatId);
        if (!msg) return;

        setMessages((prev) => {
          if (prev.some((item) => String(item.id) === String(msg.id))) return prev;
          return [...prev, msg];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
    };

    init();

    return () => {
      socketRef.current?.emit('leave_chat', chatId);
      socketRef.current?.disconnect();
    };
  }, [chatId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    try {
      setSending(true);
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_BASE_URL}/api/mobile/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (response.ok) setText('');
    } catch (err) {
      console.log('Send message error:', err);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = Number(item.senderId) === Number(myUserId);
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgWrapMe : styles.msgWrapOther]}>
        {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={styles.bubbleText}>{item.text}</Text>
        </View>
        <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
          {formatMessageTime(item.createdAt)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{chatName?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{chatName}</Text>
          {fromLocation && toLocation && (
            <Text style={styles.headerRoute} numberOfLines={1}>{fromLocation} → {toLocation}</Text>
          )}
        </View>
      </View>

      {fromLocation && toLocation && (
        <TouchableOpacity
          style={styles.cargoCard}
          activeOpacity={0.85}
          onPress={() => loadId && router.push({ pathname: '/cargo-details', params: { id: loadId } })}
        >
          <Text style={styles.cargoCardLabel}>Груз →</Text>
          <Text style={styles.cargoCardRoute}>{fromLocation} → {toLocation}</Text>
          {loadType ? <Text style={styles.cargoCardType}>{loadType}</Text> : null}
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centerState}><ActivityIndicator size="large" color="#2F80ED" /></View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyMessages}>
                <Text style={styles.emptyText}>Начните общение!</Text>
              </View>
            }
          />

          <View style={styles.inputBar}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Сообщение..."
              placeholderTextColor="#7C8BA1"
              style={styles.input}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendIcon}>➤</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#081120' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  back: { color: '#38BDF8', fontSize: 22, fontWeight: '700', paddingRight: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#2F80ED', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  headerInfo: { flex: 1 },
  headerName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  headerRoute: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginTop: 2 },
  cargoCard: {
    marginHorizontal: 14,
    marginVertical: 8,
    backgroundColor: 'rgba(56,189,248,0.08)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cargoCardLabel: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  cargoCardRoute: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 },
  cargoCardType: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesList: { padding: 16, paddingBottom: 8 },
  emptyMessages: { flex: 1, alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#475569', fontSize: 15 },
  msgWrap: { marginBottom: 12, maxWidth: '80%' },
  msgWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgWrapOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: { color: '#38BDF8', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: '#2F80ED', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 11, color: '#7C8BA1', marginTop: 3 },
  msgTimeMe: { alignSelf: 'flex-end' },
  msgTimeOther: { alignSelf: 'flex-start' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#2F80ED', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: 'rgba(47,128,237,0.3)' },
  sendIcon: { color: '#FFFFFF', fontSize: 18 },
});