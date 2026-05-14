import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, SafeAreaView } from 'react-native';
import AppLoadingIndicator from '@/components/app-loading-indicator';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getNgnBalance, formatBalance } from '@/lib/wallet-service';
export default function WalletNgnScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const b = await getNgnBalance(user.id);
      setBalance(b);
    } catch (err) {
      console.error('Error fetching NGN balance:', err);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchBalance();
  }, [user?.id, fetchBalance]);

  // Refresh balance when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (user?.id) fetchBalance();
      return () => {};
    }, [user?.id, fetchBalance])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>NGN Wallet</ThemedText>
          <View style={styles.placeholder} />
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        <View style={styles.balanceCard}>
          <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
          {loading ? (
            <AppLoadingIndicator size="small" style={{ marginTop: 8 }} />
          ) : (
            <View style={styles.balanceAmountContainer}>
              <ThemedText 
                style={styles.balanceAmount}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
              >
                ₦{formatBalance(balance, 'NGN')}
              </ThemedText>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/fund-wallet')} activeOpacity={0.8}>
          <ThemedText style={styles.primaryButtonText}>Fund Wallet</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/withdraw')} activeOpacity={0.8}>
          <ThemedText style={styles.secondaryButtonText}>Withdraw</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeHeader: { backgroundColor: '#FFFFFF', paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  title: { fontSize: 20, fontWeight: '700' },
  placeholder: { width: 40 },
  content: { padding: 20, gap: 16 },
  balanceCard: { backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', minHeight: 100, justifyContent: 'center' },
  balanceLabel: { fontSize: 14, color: '#6B7280' },
  balanceAmountContainer: { width: '100%', paddingHorizontal: 8, marginTop: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 40, maxHeight: 100 },
  balanceAmount: { fontSize: 34, fontWeight: '800', lineHeight: 42, textAlign: 'center', width: '100%', flexShrink: 1 },
  primaryButton: { marginTop: 20, backgroundColor: '#6B46C1', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  secondaryButton: { marginTop: 12, borderWidth: 1, borderColor: '#6B46C1', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#6B46C1', fontWeight: '700', fontSize: 16 },
});
