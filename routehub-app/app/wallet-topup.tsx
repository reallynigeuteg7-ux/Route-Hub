import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../lib/api';
import { useAppTheme } from '../lib/theme';

type TopupDetails = { title?: string; bank?: string; account?: string; comment?: string; devnetSol?: { enabled?: boolean; network?: string; currency?: string; recipient?: string | null } };
type TopupRequest = { id: number; amount: number; currency?: string; status: string; adminComment?: string; createdAt?: string };
type PickedReceipt = { uri: string; name: string; mimeType?: string; size?: number };

const T = {
  back: '\u041d\u0430\u0437\u0430\u0434',
  title: '\u041f\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0431\u0430\u043b\u0430\u043d\u0441',
  subtitle: '\u041f\u0435\u0440\u0435\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0435\u043d\u044c\u0433\u0438 \u043f\u043e \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u0430\u043c \u0438 \u043f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u0435 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e. \u0411\u0430\u043b\u0430\u043d\u0441 \u043f\u043e\u043f\u043e\u043b\u043d\u0438\u0442 \u0430\u0434\u043c\u0438\u043d \u043f\u043e\u0441\u043b\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438.',
  loading: '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b...',
  receiver: '\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044c',
  bank: '\u0411\u0430\u043d\u043a / \u0441\u043f\u043e\u0441\u043e\u0431',
  account: '\u0420\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b',
  pick: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e',
  submit: '\u042f \u043e\u043f\u043b\u0430\u0442\u0438\u043b',
  requests: '\u041c\u043e\u0438 \u0437\u0430\u044f\u0432\u043a\u0438',
  noRequests: '\u0417\u0430\u044f\u0432\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442',
  pending: '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435',
  approved: '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e',
  rejected: '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e',
  doneTitle: '\u0413\u043e\u0442\u043e\u0432\u043e',
  doneText: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430. \u0410\u0434\u043c\u0438\u043d \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u0438 \u043f\u043e\u043f\u043e\u043b\u043d\u0438\u0442 \u0431\u0430\u043b\u0430\u043d\u0441.',
  error: '\u041e\u0448\u0438\u0431\u043a\u0430', auth: '\u041d\u0443\u0436\u043d\u043e \u0432\u043e\u0439\u0442\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442',
  amountError: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f', fileError: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435', fileTooLarge: '\u0424\u0430\u0439\u043b \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0434\u043e 10 MB', defaultAccount: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b RouteHub',
};
function formatMoney(value?: number | string) { const n = Number(value || 0); return (Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0') + ' \u20b8'; }
function statusLabel(status: string) { if (status === 'approved') return T.approved; if (status === 'rejected') return T.rejected; return T.pending; }
function formatRequestAmount(item: TopupRequest) { const value = Number(item.amount || 0); return item.currency === 'SOL' ? value.toLocaleString('ru-RU', { maximumFractionDigits: 9 }) + ' SOL' : formatMoney(value); }

export default function WalletTopupScreen() {
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [solSubmitting, setSolSubmitting] = useState(false); const [solWithdrawing, setSolWithdrawing] = useState(false); const [details, setDetails] = useState<TopupDetails>({}); const [requests, setRequests] = useState<TopupRequest[]>([]); const [withdrawRequests, setWithdrawRequests] = useState<TopupRequest[]>([]); const [amount, setAmount] = useState(''); const [solAmount, setSolAmount] = useState(''); const [solMessage, setSolMessage] = useState(''); const [solWithdrawAmount, setSolWithdrawAmount] = useState(''); const [solWithdrawAddress, setSolWithdrawAddress] = useState(''); const [solWithdrawMessage, setSolWithdrawMessage] = useState(''); const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  const loadData = async () => { try { setLoading(true); const token = await AsyncStorage.getItem('userToken'); if (!token) { Alert.alert(T.error, T.auth); router.back(); return; } const headers = { Authorization: 'Bearer ' + token }; const [topupResponse, withdrawResponse] = await Promise.all([fetch(API_BASE_URL + '/api/mobile/wallet/topup-requests', { headers }), fetch(API_BASE_URL + '/api/mobile/wallet/withdraw-requests', { headers })]); const topupData = await topupResponse.json().catch(() => ({})); const withdrawData = await withdrawResponse.json().catch(() => ({})); if (!topupResponse.ok) throw new Error(topupData?.error || T.error); if (!withdrawResponse.ok) throw new Error(withdrawData?.error || T.error); setDetails(topupData.details || {}); setRequests(Array.isArray(topupData.requests) ? topupData.requests : []); setWithdrawRequests(Array.isArray(withdrawData.requests) ? withdrawData.requests : []); } catch (err: any) { Alert.alert(T.error, err?.message || T.error); } finally { setLoading(false); } };
  useEffect(() => { loadData(); }, []);
  const createDevnetSolTopup = async () => { const numericAmount = Number(solAmount.replace(',', '.')); if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setSolMessage('Укажите сумму SOL'); return; } try { setSolSubmitting(true); setSolMessage('Создаём платёж...'); const token = await AsyncStorage.getItem('userToken'); if (!token) throw new Error(T.auth); const response = await fetch(API_BASE_URL + '/api/mobile/wallet/devnet-sol/topup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ amount: numericAmount }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || T.error); setSolAmount(''); setSolMessage('Платёж создан. Открываем кошелёк...'); if (data.topup?.solanaPayUrl) await Linking.openURL(data.topup.solanaPayUrl); } catch (err: any) { setSolMessage(err?.message || T.error); } finally { setSolSubmitting(false); } };
  const withdrawDevnetSol = async () => { const numericAmount = Number(solWithdrawAmount.replace(',', '.')); const walletAddress = solWithdrawAddress.trim(); if (!Number.isFinite(numericAmount) || numericAmount < 0.000001 || numericAmount > 1000) { setSolWithdrawMessage('Укажите сумму от 0.000001 до 1000 SOL'); return; } if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) { setSolWithdrawMessage('Проверьте Solana-адрес получателя'); return; } try { setSolWithdrawing(true); setSolWithdrawMessage('Отправляем SOL...'); const token = await AsyncStorage.getItem('userToken'); if (!token) throw new Error(T.auth); const response = await fetch(API_BASE_URL + '/api/mobile/wallet/devnet-sol/withdraw-request', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ amount: numericAmount, walletAddress }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || T.error); setSolWithdrawAmount(''); setSolWithdrawAddress(''); setSolWithdrawMessage('SOL отправлены автоматически. Транзакция подтверждена в Devnet.'); await loadData(); } catch (err: any) { setSolWithdrawMessage(err?.message || T.error); } finally { setSolWithdrawing(false); } };
  const pickReceipt = async () => { try { const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false }); if (result.canceled || !result.assets?.[0]) return; const asset = result.assets[0]; let fileSize = Number(asset.size || 0); if (!fileSize) { const info = await FileSystem.getInfoAsync(asset.uri); fileSize = info.exists && 'size' in info ? Number(info.size || 0) : 0; } if (fileSize && fileSize > 10 * 1024 * 1024) { Alert.alert(T.error, T.fileTooLarge); return; } setReceipt({ uri: asset.uri, name: asset.name || 'receipt', mimeType: asset.mimeType, size: fileSize || asset.size }); } catch (err: any) { Alert.alert(T.error, err?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u0431\u0440\u0430\u0442\u044c \u0444\u0430\u0439\u043b'); } };
  const submit = async () => { const numericAmount = Number(amount.replace(/\s/g, '').replace(',', '.')); if (!Number.isFinite(numericAmount) || numericAmount <= 0) { Alert.alert(T.error, T.amountError); return; } if (!receipt) { Alert.alert(T.error, T.fileError); return; } if (receipt.size && receipt.size > 10 * 1024 * 1024) { Alert.alert(T.error, T.fileTooLarge); return; } try { setSubmitting(true); const token = await AsyncStorage.getItem('userToken'); if (!token) throw new Error(T.auth); const form = new FormData(); form.append('amount', String(numericAmount)); form.append('receipt', { uri: receipt.uri, name: receipt.name || 'receipt.jpg', type: receipt.mimeType || 'application/octet-stream' } as any); const response = await fetch(API_BASE_URL + '/api/mobile/wallet/topup-request', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form }); const raw = await response.text().catch(() => ''); let data: any = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; } if (!response.ok) throw new Error(data?.error || raw?.slice(0, 160) || ('HTTP ' + response.status)); setAmount(''); setReceipt(null); Alert.alert(T.doneTitle, T.doneText); await loadData(); } catch (err: any) { Alert.alert(T.error, err?.message || T.error); } finally { setSubmitting(false); } };
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={styles.backText}>{T.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{T.title}</Text>
        <Text style={styles.subtitle}>{T.subtitle}</Text>
        {loading ? (
          <View style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>{T.loading}</Text></View>
        ) : (
          <>
            <View style={styles.card}>
              <InfoRow label={T.receiver} value={details.title || 'RouteHub Logistics'} styles={styles} />
              <InfoRow label={T.bank} value={details.bank || 'Kaspi / банковский перевод'} styles={styles} />
              <InfoRow label={T.account} value={details.account || T.defaultAccount} styles={styles} />
              {!!details.comment && <Text style={styles.note}>{details.comment}</Text>}
            </View>
            {details.devnetSol?.enabled && (
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Тестовое пополнение Devnet SOL</Text>
                  <Text style={styles.note}>Эти тестовые SOL отображаются отдельно и не влияют на тенговый баланс.</Text>
                  <TextInput value={solAmount} onChangeText={setSolAmount} placeholder="Например, 0.1" placeholderTextColor={colors.mutedText} keyboardType="decimal-pad" style={styles.input} />
                  <Text style={styles.requestDate}>Кошелёк: {details.devnetSol.recipient}</Text>
                  <TouchableOpacity style={[styles.submitButton, solSubmitting && styles.disabledButton]} onPress={createDevnetSolTopup} disabled={solSubmitting} activeOpacity={0.85}>
                    <Text style={styles.submitText}>{solSubmitting ? '...' : 'Создать платёж SOL'}</Text>
                  </TouchableOpacity>
                  {!!solMessage && <Text style={styles.note}>{solMessage}</Text>}
                </View>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Вывести Devnet SOL</Text>
                  <Text style={styles.note}>Сумма спишется с профиля, а SOL автоматически отправятся на указанный адрес.</Text>
                  <TextInput value={solWithdrawAmount} onChangeText={setSolWithdrawAmount} placeholder="Например, 0.01" placeholderTextColor={colors.mutedText} keyboardType="decimal-pad" style={styles.input} />
                  <TextInput value={solWithdrawAddress} onChangeText={setSolWithdrawAddress} placeholder="Адрес кошелька Solana" placeholderTextColor={colors.mutedText} autoCapitalize="none" autoCorrect={false} style={styles.input} />
                  <TouchableOpacity style={[styles.submitButton, solWithdrawing && styles.disabledButton]} onPress={withdrawDevnetSol} disabled={solWithdrawing} activeOpacity={0.85}>
                    <Text style={styles.submitText}>{solWithdrawing ? 'Отправляем...' : 'Вывести SOL автоматически'}</Text>
                  </TouchableOpacity>
                  {!!solWithdrawMessage && <Text style={styles.note}>{solWithdrawMessage}</Text>}
                </View>
              </>
            )}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{T.submit}</Text>
              <TextInput value={amount} onChangeText={setAmount} placeholder="50000" placeholderTextColor={colors.mutedText} keyboardType="numeric" style={styles.input} />
              <TouchableOpacity style={styles.pickButton} onPress={pickReceipt} activeOpacity={0.85}>
                <Ionicons name="document-attach-outline" size={20} color={colors.primary} /><Text style={styles.pickText}>{receipt?.name || T.pick}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, submitting && styles.disabledButton]} onPress={submit} disabled={submitting} activeOpacity={0.85}>
                <Text style={styles.submitText}>{submitting ? '...' : T.submit}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{T.requests}</Text>
              {!requests.length ? <Text style={styles.muted}>{T.noRequests}</Text> : requests.map((item) => (
                <View key={item.id} style={styles.requestRow}><View style={styles.requestInfo}><Text style={styles.requestAmount}>{formatRequestAmount(item)}</Text><Text style={styles.requestDate}>{item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : ''}</Text>{!!item.adminComment && <Text style={styles.requestDate}>{item.adminComment}</Text>}</View><Text style={[styles.status, item.status === 'approved' && styles.statusGood, item.status === 'rejected' && styles.statusBad]}>{statusLabel(item.status)}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>История вывода</Text>
              {!withdrawRequests.length ? <Text style={styles.muted}>Выводов пока нет</Text> : withdrawRequests.map((item) => (
                <View key={item.id} style={styles.requestRow}><View style={styles.requestInfo}><Text style={styles.requestAmount}>-{formatRequestAmount(item)}</Text><Text style={styles.requestDate}>{item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : ''}</Text>{!!item.adminComment && <Text style={styles.requestDate}>{item.adminComment}</Text>}</View><Text style={[styles.status, item.status === 'approved' && styles.statusGood, item.status === 'rejected' && styles.statusBad]}>{statusLabel(item.status)}</Text></View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function InfoRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
function createStyles(colors: ThemeColors) { return StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.background }, scroll: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 32 }, backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }, backText: { color: colors.text, fontSize: 16, fontWeight: '800' }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: 8 }, subtitle: { color: colors.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 18 }, loadingCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 12 }, card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16, gap: 12 }, infoRow: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border }, infoLabel: { color: colors.mutedText, fontSize: 12, fontWeight: '800', marginBottom: 6 }, infoValue: { color: colors.text, fontSize: 15, fontWeight: '900' }, note: { color: colors.primarySoft, fontSize: 13, lineHeight: 19, fontWeight: '700' }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceStrong, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 16, fontWeight: '800' }, pickButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, pickText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800' }, submitButton: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }, disabledButton: { opacity: 0.55 }, submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, muted: { color: colors.mutedText, fontSize: 14, fontWeight: '700' }, requestRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }, requestInfo: { flex: 1 }, requestAmount: { color: colors.text, fontSize: 16, fontWeight: '900' }, requestDate: { color: colors.mutedText, fontSize: 12, marginTop: 4 }, status: { color: colors.primarySoft, fontSize: 12, fontWeight: '900' }, statusGood: { color: '#22C55E' }, statusBad: { color: '#EF4444' } }); }
