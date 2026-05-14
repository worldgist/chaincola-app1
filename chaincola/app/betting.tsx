import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';
import { placeBet } from '@/lib/betting-service';
import { useAuth } from '@/contexts/AuthContext';
import AppLoadingIndicator from '@/components/app-loading-indicator';


const providers = [
  { id: 'BET9JA', name: 'Bet9ja' },
  { id: 'SPORTYBET', name: 'Sportybet' },
  { id: 'BETKING', name: 'BetKing' },
  { id: '1XBET', name: '1xBet' },
  { id: 'NAIRABET', name: 'NairaBet' },
];

export default function Betting() {
  const { user } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState(providers[0].id);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [reference, setReference] = useState('');
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePlaceBet = () => {
    if (!accountId.trim()) {
      alert('Please enter your account ID');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // show confirmation modal
    setShowConfirm(true);
  };

  const confirmPlaceBet = async () => {
    setShowConfirm(false);
    setProcessing(true);
    try {
      const resp = await placeBet(user?.id || 'anon', {
        match_id: selectedProvider,
        selection: accountId,
        odds: 1.0,
        stake: parseFloat(amount),
      });

      if (resp.success) {
        setReference(resp.reference || resp.bet_id || '');
        setSuccess(true);
        setAccountId('');
        setAmount('');
      } else {
        alert(resp.error || 'Failed to place bet');
      }
    } catch (err) {
      console.error(err);
      alert('Error placing bet');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ThemedText style={styles.backText}>Back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.title}>Betting</ThemedText>
        </View>

        <ThemedText style={styles.label}>Provider</ThemedText>
        <View style={styles.providersRow}>
          {providers.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.providerBtn, selectedProvider === p.id && styles.providerBtnActive]}
              onPress={() => setSelectedProvider(p.id)}
            >
              <ThemedText style={[styles.providerText, selectedProvider === p.id && styles.providerTextActive]}>{p.name}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <ThemedText style={styles.label}>Account ID</ThemedText>
        <TextInput style={styles.input} placeholder="Enter betting account id" value={accountId} onChangeText={setAccountId} />

        <ThemedText style={styles.label}>Amount</ThemedText>
        <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

        <TouchableOpacity style={styles.betButton} onPress={handlePlaceBet} disabled={processing}>
          {processing ? <AppLoadingIndicator size="small" variant="onPrimary" /> : <ThemedText style={styles.betText}>Place Bet</ThemedText>}
        </TouchableOpacity>

        {success && (
          <View style={styles.successBox}>
            <ThemedText style={styles.successTitle}>Bet Placed</ThemedText>
            <ThemedText>Reference: {reference}</ThemedText>
            <TouchableOpacity style={styles.doneBtn} onPress={() => { setSuccess(false); router.back(); }}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Confirmation Modal */}
        {showConfirm && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <ThemedText style={styles.modalTitle}>Confirm Bet</ThemedText>
              <View style={styles.modalRow}>
                <ThemedText style={styles.modalLabel}>Provider:</ThemedText>
                <ThemedText style={styles.modalValue}>{providers.find(p => p.id === selectedProvider)?.name}</ThemedText>
              </View>
              <View style={styles.modalRow}>
                <ThemedText style={styles.modalLabel}>Account ID:</ThemedText>
                <ThemedText style={styles.modalValue}>{accountId}</ThemedText>
              </View>
              <View style={styles.modalRow}>
                <ThemedText style={styles.modalLabel}>Amount:</ThemedText>
                <ThemedText style={styles.modalValue}>₦{parseFloat(amount || '0').toLocaleString()}</ThemedText>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowConfirm(false)}>
                  <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirmButton} onPress={confirmPlaceBet}>
                  <ThemedText style={styles.modalConfirmText}>Confirm</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { padding: 8 },
  backText: { color: '#6B46C1' },
  title: { fontSize: 20, fontWeight: '700' },
  label: { marginTop: 12, marginBottom: 8, fontWeight: '600' },
  providersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F8FAFC', marginRight: 8, marginBottom: 8 },
  providerBtnActive: { backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#6B46C1' },
  providerText: { fontWeight: '600' },
  providerTextActive: { color: '#6B46C1' },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E6E6E6' },
  betButton: { marginTop: 16, backgroundColor: '#6B46C1', padding: 14, borderRadius: 12, alignItems: 'center' },
  betText: { color: '#fff', fontWeight: '700' },
  successBox: { marginTop: 20, padding: 12, borderRadius: 10, backgroundColor: '#ECFDF5' },
  successTitle: { fontWeight: '700', color: '#059669' },
  doneBtn: { marginTop: 10, backgroundColor: '#6B46C1', padding: 10, borderRadius: 8, alignItems: 'center' },
  doneText: { color: '#fff', fontWeight: '700' },
  modalOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  modalLabel: { color: '#6B7280' },
  modalValue: { fontWeight: '700' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalCancelButton: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F3F4F6', marginRight: 8, alignItems: 'center' },
  modalCancelText: { color: '#6B7280' },
  modalConfirmButton: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#6B46C1', marginLeft: 8, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
