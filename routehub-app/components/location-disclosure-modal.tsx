import React, { useMemo } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PRIVACY_POLICY_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

type LocationDisclosureModalProps = {
  visible: boolean;
  onAccept: () => void | Promise<void>;
  onDecline: () => void;
};

export function LocationDisclosureModal({ visible, onAccept, onDecline }: LocationDisclosureModalProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const openPrivacyPolicy = () => {
    void Linking.openURL(PRIVACY_POLICY_URL);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker}>Геолокация активного рейса</Text>
            <Text style={styles.title}>RouteHub будет передавать местоположение перевозчика</Text>
            <Text style={styles.text}>
              RouteHub использует точную геолокацию только во время активной перевозки. Координаты передаются на сервер RouteHub и показываются грузовладельцу по активному грузу.
            </Text>
            <Text style={styles.text}>
              Отслеживание нужно для карты рейса, подтверждения движения, прибытия и доставки. Геолокация не используется для рекламы и не продается третьим лицам.
            </Text>
            <Text style={styles.text}>
              Если вы не согласны, можно продолжить работу без передачи координат, но функции отслеживания активного рейса могут быть недоступны.
            </Text>

            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={onAccept}>
              <Text style={styles.primaryButtonText}>Согласен</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.85} onPress={onDecline}>
              <Text style={styles.secondaryButtonText}>Не сейчас</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} activeOpacity={0.8} onPress={openPrivacyPolicy}>
              <Text style={styles.linkText}>Политика конфиденциальности</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'center',
      padding: 18,
    },
    card: {
      maxHeight: '86%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    content: {
      padding: 20,
    },
    kicker: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 10,
    },
    title: {
      color: colors.text,
      fontSize: 23,
      lineHeight: 29,
      fontWeight: '900',
      marginBottom: 12,
    },
    text: {
      color: colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      alignItems: 'center',
      paddingVertical: 15,
      marginTop: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },
    secondaryButton: {
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 10,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 14,
    },
    linkText: {
      color: colors.primarySoft,
      fontSize: 14,
      fontWeight: '900',
      textDecorationLine: 'underline',
    },
  });
}