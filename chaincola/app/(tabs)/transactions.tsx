import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { syncPendingWalletFundings } from '@/lib/payment-service';
import { getUserTransactions, TransactionListItem } from '@/lib/transaction-service';
import { createQuickDemoTransactions } from '@/lib/demo-transactions-service';
import { Alert } from 'react-native';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const { transactions: fetchedTransactions, error: fetchError } = await getUserTransactions(user.id, 100);

      const isAborted = fetchError?.message === 'Aborted' || fetchError === 'Aborted' || (typeof fetchError === 'string' && fetchError.includes('Abort'));
      if (fetchError && !isAborted) {
        console.error('Error fetching transactions:', fetchError);
        setError('Failed to load transactions. Please try again.');
        setTransactions([]);
      } else if (!isAborted) {
        setTransactions(fetchedTransactions);
        // Reconcile Flutterwave PENDING deposits in background (don’t block the list)
        void syncPendingWalletFundings(user.id).then(async () => {
          const { transactions: updated, error: e2 } = await getUserTransactions(user.id, 100);
          if (!e2 && updated?.length) {
            setTransactions(updated);
          }
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message === 'Aborted') {
        return;
      }
      console.error('Exception fetching transactions:', err);
      setError('An error occurred. Please try again.');
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        fetchTransactions();
      }
    }, [user?.id])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading transactions...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6B46C1" />
        }
      >
        <View style={styles.header}>
          <ThemedText 
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Transactions
          </ThemedText>
          <ThemedText style={styles.subtitle}>Your transaction history</ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={24} color="#EF4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchTransactions}>
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {!error && transactions.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={64} color="#9CA3AF" />
            <ThemedText style={styles.emptyTitle}>No Transactions Yet</ThemedText>
            <ThemedText style={styles.emptyText}>
              Your transaction history will appear here once you start trading or funding your wallet.
            </ThemedText>
          </View>
        )}

        {!error && transactions.length > 0 && (
          <View style={styles.transactionsList}>
            {transactions.map((transaction) => (
            <TouchableOpacity
              key={transaction.id}
              style={styles.transactionItem}
              onPress={() => router.push({ pathname: '/transaction-detail', params: { id: transaction.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.transactionLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive'
                      ? styles.buyIcon 
                      : styles.sellIcon,
                  ]}
                >
                  <MaterialIcons
                    name={
                      transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive'
                        ? 'arrow-downward'
                        : transaction.type === 'withdraw' || transaction.type === 'withdraw-bank' || transaction.type === 'send'
                        ? 'arrow-upward'
                        : 'arrow-upward'
                    }
                    size={20}
                    color={
                      transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive'
                        ? '#10B981'
                        : '#EF4444'
                    }
                  />
                </View>
                {transaction.logo ? (
                  <Image
                    source={transaction.logo}
                    style={styles.cryptoLogo}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.cryptoLogo, { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' }]}>
                    <MaterialIcons name="account-balance" size={20} color="#6B7280" />
                  </View>
                )}
                <View style={styles.transactionInfo}>
                  <ThemedText 
                    style={styles.transactionType}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {transaction.type === 'buy'
                      ? 'Bought'
                      : transaction.type === 'sell'
                      ? 'Sold'
                      : transaction.type === 'fund'
                      ? 'Funded Wallet'
                      : transaction.type === 'withdraw-bank'
                      ? 'Withdraw to Bank'
                      : transaction.type === 'send'
                      ? 'Sent'
                      : transaction.type === 'receive'
                      ? 'Received'
                      : 'Withdrawn from Wallet'}{' '}
                    {transaction.type !== 'fund' && transaction.type !== 'withdraw' && transaction.type !== 'withdraw-bank'
                      ? transaction.crypto
                      : transaction.type === 'withdraw-bank' && transaction.bankName
                      ? `- ${transaction.bankName}`
                      : ''}
                  </ThemedText>
                  <ThemedText 
                    style={styles.transactionDate}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {transaction.date}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.transactionRight}>
                <ThemedText 
                  style={[
                    styles.transactionAmount,
                    transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive'
                      ? styles.buyAmount
                      : styles.sellAmount,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive' ? '+' : '-'}
                  {transaction.amount} {transaction.symbol}
                </ThemedText>
                <ThemedText 
                  style={[
                    styles.transactionTotal,
                    transaction.type === 'sell' && styles.sellTotal,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {transaction.total}
                </ThemedText>
                {transaction.status === 'pending' && (
                  <View style={styles.pendingBadge}>
                    <ThemedText style={styles.pendingText}>Pending</ThemedText>
                  </View>
                )}
                {transaction.status === 'failed' && (
                  <View style={styles.failedBadge}>
                    <ThemedText style={styles.failedText}>Failed</ThemedText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    width: '100%',
    paddingRight: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 38,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 22,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  demoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  transactionsList: {
    marginTop: 8,
    gap: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  buyIcon: {
    backgroundColor: '#D1FAE5',
  },
  sellIcon: {
    backgroundColor: '#FEE2E2',
  },
  cryptoLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  buyAmount: {
    color: '#10B981',
  },
  sellAmount: {
    color: '#EF4444',
  },
  sellTotal: {
    color: '#10B981',
    fontWeight: '600',
  },
  transactionTotal: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D97706',
  },
  failedBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  failedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
  },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
});

