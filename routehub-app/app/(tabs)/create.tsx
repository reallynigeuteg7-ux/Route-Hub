import React, { useMemo, useState, useRef } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from '../../lib/api';
import { useAppTheme } from '../../lib/theme';

const CITIES = [
  'Алматы',
  'Астана',
  'Шымкент',
  'Кызылорда',
  'Караганда',
  'Актобе',
  'Атырау',
  'Актау',
  'Костанай',
  'Павлодар',
  'Тараз',
  'Уральск',
  'Семей',
  'Усть-Каменогорск',
  'Туркестан',
];

const TRUCK_TYPES = [
  'Тент',
  'Рефрижератор',
  'Фура',
  'Контейнер',
  'Изотерм',
  'Цельнометалл',
  'Бортовой',
];

const LOADING_TYPES = [
  'Задняя',
  'Боковая',
  'Верхняя',
  'Полная',
  'Ручная',
];

const CURRENCY_TYPES = ['KZT', 'SOL'];

type DropdownType = 'from' | 'to' | 'truck' | 'loading' | 'currency' | null;

const FIELD_HEIGHT = 52;

function formatDate(date: Date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export default function CreateCargoTabScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [readyDate, setReadyDate] = useState<Date | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());


  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [truckType, setTruckType] = useState('');

  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  const [loadingType, setLoadingType] = useState('');
  const [currency, setCurrency] = useState('KZT');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollRef = useRef<any>(null);

  const readyDateLabel = useMemo(
    () => (readyDate ? formatDate(readyDate) : 'Выберите дату'),
    [readyDate]
  );

  const clearForm = () => {
    setFromLocation('');
    setToLocation('');
    setReadyDate(null);
    setWeight('');
    setVolume('');
    setTruckType('');
    setLength('');
    setWidth('');
    setHeight('');
    setLoadingType('');
    setCurrency('KZT');
    setPrice('');
    setDescription('');
    setOpenDropdown(null);
    setShowDatePicker(false);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
  if (Platform.OS === 'android') {
    setShowDatePicker(false);
    if (event.type !== 'dismissed' && selectedDate) {
      setReadyDate(selectedDate);
      setTempDate(selectedDate);
    }
    return;
  }

  if (selectedDate) {
    setTempDate(selectedDate);
  }
};

  const handleCreateLoad = async () => {
    if (!fromLocation.trim() || !toLocation.trim()) {
      Alert.alert('Ошибка', 'Заполни Откуда и Куда');
      return;
    }

    if (!readyDate) {
      Alert.alert('Ошибка', 'Выбери дату готовности к погрузке');
      return;
    }

    if (!weight.trim() || !price.trim()) {
      Alert.alert('Ошибка', 'Заполни Вес и Ставку');
      return;
    }

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Ошибка', 'Нужно войти в аккаунт');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mobile/loads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          from_location: fromLocation.trim(),
          to_location: toLocation.trim(),
          ready_date: formatDate(readyDate),
          weight: Number(weight) || 0,
          type: truckType.trim(),
          price: Number(price) || 0,
          currency,
          lat: 0,
          lng: 0,
          volume: volume.trim() ? Number(volume) : null,
          length: length.trim() ? Number(length) : null,
          width: width.trim() ? Number(width) : null,
          height: height.trim() ? Number(height) : null,
          loading_type: loadingType.trim(),
          description: description.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', data?.error || 'Не удалось создать груз');
        return;
      }

      Alert.alert('Успешно', 'Груз опубликован');
      clearForm();
      router.push('/my-cargos' as any);
    } catch (error) {
      console.log('Create load error:', error);
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

const renderDropdown = (
  visible: boolean,
  items: string[],
  onSelect: (value: string) => void
) => {
  if (!visible) return null;

  return (
    <View style={styles.dropdownMenu}>
      <ScrollView
        style={styles.dropdownScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {items.map((item, index) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.dropdownItem,
              index === items.length - 1 && styles.dropdownItemLast,
            ]}
            activeOpacity={0.85}
            onPress={() => {
              onSelect(item);
              setOpenDropdown(null);
            }}
          >
            <Text style={styles.dropdownItemText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

  return (
  <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior="height"
    >
      <TouchableWithoutFeedback
        onPress={() => {
          Keyboard.dismiss();
          setOpenDropdown(null);
        }}
      >
        <View style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            scrollEnabled={openDropdown === null}
          >
            <View style={styles.container}>
              <Text style={styles.pageTitle}>Добавить груз</Text>
              <Text style={styles.pageSubtitle}>
                Заполните детали, чтобы перевозчики могли предложить точную цену
              </Text>

              <View style={styles.formCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>1.</Text>
                  </View>
                  <Text style={styles.sectionTitle}>Маршрут и дата</Text>
                </View>

                <View style={styles.row}>
                  <View
                    style={[
                      styles.inputWrap,
                      styles.halfBlock,
                      styles.dropdownWrap,
                      openDropdown === 'from' && styles.dropdownWrapActive,
                    ]}
                  >
                    <Text style={styles.label}>Откуда</Text>
                    <TouchableOpacity
                      style={styles.selectInput}
                      activeOpacity={0.85}
                      onPress={() =>
                        setOpenDropdown(openDropdown === 'from' ? null : 'from')
                      }
                    >
                      <Text
                        style={[
                          styles.selectText,
                          !fromLocation && styles.placeholderText,
                        ]}
                        numberOfLines={1}
                      >
                        {fromLocation || 'Выберите город'}
                      </Text>
                      <Text style={styles.selectArrow}>⌄</Text>
                    </TouchableOpacity>
                    {renderDropdown(openDropdown === 'from', CITIES, setFromLocation)}
                  </View>

                  <View
                    style={[
                      styles.inputWrap,
                      styles.halfBlock,
                      styles.dropdownWrap,
                      openDropdown === 'to' && styles.dropdownWrapActive,
                    ]}
                  >
                    <Text style={styles.label}>Куда</Text>
                    <TouchableOpacity
                      style={styles.selectInput}
                      activeOpacity={0.85}
                      onPress={() =>
                        setOpenDropdown(openDropdown === 'to' ? null : 'to')
                      }
                    >
                      <Text
                        style={[
                          styles.selectText,
                          !toLocation && styles.placeholderText,
                        ]}
                        numberOfLines={1}
                      >
                        {toLocation || 'Выберите город'}
                      </Text>
                      <Text style={styles.selectArrow}>⌄</Text>
                    </TouchableOpacity>
                    {renderDropdown(openDropdown === 'to', CITIES, setToLocation)}
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.label}>Дата готовности к погрузке</Text>
                  <TouchableOpacity
                    style={styles.selectInput}
                    activeOpacity={0.85}
                    onPress={() => {
                      setOpenDropdown(null);
                      Keyboard.dismiss();
                      setShowDatePicker(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.selectText,
                        !readyDate && styles.placeholderText,
                      ]}
                    >
                      {readyDateLabel}
                    </Text>
                    <Text style={styles.selectArrow}>⌄</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>2.</Text>
                  </View>
                  <Text style={styles.sectionTitle}>О грузе</Text>
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputWrap, styles.thirdBlock]}>
                    <Text style={styles.label}>Вес (тонн)</Text>
                    <TextInput
                      value={weight}
                      onChangeText={setWeight}
                      placeholder="5"
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>

                  <View style={[styles.inputWrap, styles.thirdBlock]}>
                    <Text style={styles.label}>Объём (м³)</Text>
                    <TextInput
                      value={volume}
                      onChangeText={setVolume}
                      placeholder="82"
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>

                  <View
                    style={[
                      styles.inputWrap,
                      styles.thirdBlock,
                      styles.dropdownWrap,
                      openDropdown === 'truck' && styles.dropdownWrapActive,
                    ]}
                  >
                    <Text style={styles.label}>Тип кузова</Text>
                    <TouchableOpacity
                      style={styles.selectInput}
                      activeOpacity={0.85}
                      onPress={() =>
                        setOpenDropdown(openDropdown === 'truck' ? null : 'truck')
                      }
                    >
                      <Text
                        style={[
                          styles.selectText,
                          !truckType && styles.placeholderText,
                        ]}
                        numberOfLines={1}
                      >
                        {truckType || 'Выберите'}
                      </Text>
                      <Text style={styles.selectArrow}>⌄</Text>
                    </TouchableOpacity>
                    {renderDropdown(openDropdown === 'truck', TRUCK_TYPES, setTruckType)}
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputWrap, styles.thirdBlock]}>
                    <Text style={styles.label}>Длина (м)</Text>
                    <TextInput
                      value={length}
                      onChangeText={setLength}
                      placeholder="13.6"
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>

                  <View style={[styles.inputWrap, styles.thirdBlock]}>
                    <Text style={styles.label}>Ширина (м)</Text>
                    <TextInput
                      value={width}
                      onChangeText={setWidth}
                      placeholder="2.45"
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>

                  <View style={[styles.inputWrap, styles.thirdBlock]}>
                    <Text style={styles.label}>Высота (м)</Text>
                    <TextInput
                      value={height}
                      onChangeText={setHeight}
                      placeholder="2.7"
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>3.</Text>
                  </View>
                  <Text style={styles.sectionTitle}>Условия и оплата</Text>
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.label}>Валюта ставки</Text>
                  <TouchableOpacity
                    style={styles.selectInput}
                    activeOpacity={0.85}
                    onPress={() => setOpenDropdown(openDropdown === 'currency' ? null : 'currency')}
                  >
                    <Text style={styles.selectText}>{currency === 'SOL' ? 'Solana (SOL)' : 'Тенге (KZT)'}</Text>
                    <Text style={styles.selectArrow}>⌄</Text>
                  </TouchableOpacity>
                  {renderDropdown(openDropdown === 'currency', CURRENCY_TYPES, (value) => {
                    setCurrency(value);
                    setPrice('');
                  })}
                </View>

                <View style={styles.row}>
                  <View
                    style={[
                      styles.inputWrap,
                      styles.halfBlock,
                      styles.dropdownWrap,
                      openDropdown === 'loading' && styles.dropdownWrapActive,
                    ]}
                  >
                    <Text style={styles.label}>Способ погрузки</Text>
                    <TouchableOpacity
                      style={styles.selectInput}
                      activeOpacity={0.85}
                      onPress={() =>
                        setOpenDropdown(openDropdown === 'loading' ? null : 'loading')
                      }
                    >
                      <Text
                        style={[
                          styles.selectText,
                          !loadingType && styles.placeholderText,
                        ]}
                        numberOfLines={1}
                      >
                        {loadingType || 'Выберите способ'}
                      </Text>
                      <Text style={styles.selectArrow}>⌄</Text>
                    </TouchableOpacity>
                    {renderDropdown(
                      openDropdown === 'loading',
                      LOADING_TYPES,
                      setLoadingType
                    )}
                  </View>

                  <View style={[styles.inputWrap, styles.halfBlock]}>
                    <Text style={styles.label}>Ставка {currency === 'SOL' ? 'SOL' : '₸'}</Text>
                    <TextInput
                      value={price}
                      onChangeText={setPrice}
                      placeholder={currency === 'SOL' ? '0.1' : '50000'}
                      placeholderTextColor={colors.mutedText}
                      style={styles.input}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.label}>Дополнительное описание</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Напр: Хрупкий груз, нужна медленная езда..."
                    placeholderTextColor={colors.mutedText}
                    style={[styles.input, styles.textarea]}
                    multiline
                    textAlignVertical="top"
                    scrollEnabled
                    returnKeyType="default"
                    blurOnSubmit={false}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 350);
                    }}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.publishButton}
                activeOpacity={0.85}
                onPress={handleCreateLoad}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.publishButtonText}>Опубликовать груз</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {showDatePicker && (
            <View style={styles.dateOverlay}>
              <View style={styles.dateModal}>
                <Text style={styles.dateTitle}>Выберите дату</Text>

                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                  themeVariant={isDark ? 'dark' : 'light'}
                  textColor={colors.text}
                  accentColor={colors.primary}
                />

                {Platform.OS === 'ios' && (
                  <View style={styles.dateActions}>
                    <TouchableOpacity
                      style={styles.dateCancelButton}
                      activeOpacity={0.85}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.dateCancelText}>Отмена</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.dateConfirmButton}
                      activeOpacity={0.85}
                      onPress={() => {
                        setReadyDate(tempDate);
                        setShowDatePicker(false);
                      }}
                    >
                      <Text style={styles.dateConfirmText}>Готово</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
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
  flexGrow: 1,
  paddingBottom: 24,
},
  container: {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 8,
},
  pageTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },
  pageSubtitle: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionBadgeText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  inputWrap: {
    marginBottom: 14,
  },
  dropdownWrap: {
    position: 'relative',
  },
  dropdownWrapActive: {
    zIndex: 1000,
  },
  halfBlock: {
    flex: 1,
    minWidth: '48%',
  },
  thirdBlock: {
    flex: 1,
    minWidth: '30%',
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    height: FIELD_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  selectInput: {
    height: FIELD_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    color: colors.text,
    fontSize: 15,
    flex: 1,
  },
  placeholderText: {
    color: colors.mutedText,
  },
  selectArrow: {
    color: colors.mutedText,
    fontSize: 18,
    marginLeft: 8,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 74,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    maxHeight: 240,
    zIndex: 999,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
 textarea: {
  minHeight: 140,
  height: 140,
  paddingTop: 14,
  paddingBottom: 14,
},
  publishButton: {
    backgroundColor: '#2563EB',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  publishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

dateOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  justifyContent: 'flex-end',
},

dateModal: {
  backgroundColor: colors.surface,
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  padding: 18,
  borderTopWidth: 1,
  borderColor: colors.border,
},

dateTitle: {
  color: colors.text,
  fontSize: 18,
  fontWeight: '800',
  marginBottom: 10,
  textAlign: 'center',
},

dateActions: {
  flexDirection: 'row',
  gap: 10,
  marginTop: 10,
},

dateCancelButton: {
  flex: 1,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: 'center',
},

dateCancelText: {
  color: colors.text,
  fontSize: 15,
  fontWeight: '700',
},

dateConfirmButton: {
  flex: 1,
  backgroundColor: '#2563EB',
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: 'center',
},

dateConfirmText: {
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: '800',
},
keyboardWrap: {
  flex: 1,
},
flex: {
  flex: 1,
},

  });
}







