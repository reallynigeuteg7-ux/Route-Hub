import React, { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

const T = {
  cargo: '\u0413\u0440\u0443\u0437',
  routeMissing: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d',
  error: '\u041e\u0448\u0438\u0431\u043a\u0430',
  priceRequired: '\u0423\u043a\u0430\u0436\u0438 \u0446\u0435\u043d\u0443 \u0441\u0442\u0430\u0432\u043a\u0438',
  loginRequired: '\u041d\u0443\u0436\u043d\u043e \u0432\u043e\u0439\u0442\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442',
  carrierOnly: '\u0421\u0442\u0430\u0432\u043a\u0438 \u043c\u043e\u0433\u0443\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0438',
  ownLoad: '\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443 \u043d\u0430 \u0441\u0432\u043e\u0439 \u0433\u0440\u0443\u0437',
  sendFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443',
  success: '\u0423\u0441\u043f\u0435\u0448\u043d\u043e',
  sent: '\u0421\u0442\u0430\u0432\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430',
  serverFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443',
  back: '\u2190 \u041d\u0430\u0437\u0430\u0434',
  title: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443',
  subtitle: '\u0417\u0430\u043f\u043e\u043b\u043d\u0438 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0433\u0440\u0443\u0437\u0430',
  priceLabel: '\u0426\u0435\u043d\u0430 \u0441\u0442\u0430\u0432\u043a\u0438 \u20b8',
  pricePlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 450000',
  dateLabel: '\u0414\u0430\u0442\u0430 \u043f\u043e\u0434\u0430\u0447\u0438 / \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438',
  datePlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 25.03.2026',
  truckTypeLabel: '\u0422\u0438\u043f \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430',
  truckTypePlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 \u0422\u0435\u043d\u0442',
  commentLabel: '\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439',
  commentPlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 \u043c\u043e\u0436\u0435\u043c \u0437\u0430\u0431\u0440\u0430\u0442\u044c \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0432\u0435\u0447\u0435\u0440\u043e\u043c',
};

export default function SendOfferScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams();

  const loadId = String(params.loadId || '');
  const loadTitle = String(params.title || T.cargo);
  const loadRoute = String(params.route || T.routeMissing);
  const ownerId = String(params.ownerId || '');

  const [price, setPrice] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [truckType, setTruckType] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSendOffer = async () => {
    if (!price.trim()) {
      Alert.alert(T.error, T.priceRequired);
      return;
    }

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem('userToken');
      const rawUser = await AsyncStorage.getItem('userData');
      const currentUser = rawUser ? JSON.parse(rawUser) : {};

      if (!token) {
        Alert.alert(T.error, T.loginRequired);
        return;
      }

      if (currentUser?.role !== 'carrier') {
        Alert.alert(T.error, T.carrierOnly);
        return;
      }

      const currentUserId = String(currentUser?.id ?? currentUser?.userId ?? '');
      if (ownerId && currentUserId && ownerId === currentUserId) {
        Alert.alert(T.error, T.ownLoad);
        return;
      }

      const response = await fetch(API_BASE_URL + '/api/mobile/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          loadId: Number(loadId),
          price: Number(price),
          currency: 'KZT',
          pickupDate: pickupDate.trim(),
          truckType: truckType.trim(),
          comment: comment.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(T.error, data?.error || T.sendFailed);
        return;
      }

      Alert.alert(T.success, T.sent);
      router.replace('/stavki');
    } catch (error) {
      console.log('Send offer error:', error);
      Alert.alert(T.error, T.serverFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={styles.back}>{T.back}</Text>
            </TouchableOpacity>

            <Text style={styles.pageTitle}>{T.title}</Text>
            <Text style={styles.pageSubtitle}>{T.subtitle}</Text>

            <View style={styles.infoCard}>
              <Text style={styles.loadTitle}>{loadTitle}</Text>
              <Text style={styles.loadRoute}>{loadRoute}</Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>{T.priceLabel}</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder={T.pricePlaceholder}
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.label}>{T.dateLabel}</Text>
                <TextInput
                  value={pickupDate}
                  onChangeText={setPickupDate}
                  placeholder={T.datePlaceholder}
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.label}>{T.truckTypeLabel}</Text>
                <TextInput
                  value={truckType}
                  onChangeText={setTruckType}
                  placeholder={T.truckTypePlaceholder}
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.label}>{T.commentLabel}</Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={T.commentPlaceholder}
                  placeholderTextColor={colors.mutedText}
                  style={[styles.input, styles.textarea]}
                  multiline
                  textAlignVertical="top"
                  onFocus={() => {
                    setTimeout(() => {
                      scrollRef.current?.scrollToEnd({ animated: true });
                    }, 300);
                  }}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              activeOpacity={0.85}
              onPress={handleSendOffer}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>{T.title}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type TabThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: TabThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
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
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    loadTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 8,
    },
    loadRoute: {
      color: colors.mutedText,
      fontSize: 15,
      fontWeight: '600',
    },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    inputWrap: {
      marginBottom: 14,
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
    textarea: {
      minHeight: 110,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
  });
}
