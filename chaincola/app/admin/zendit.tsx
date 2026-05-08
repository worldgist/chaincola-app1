import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/lib/admin-service';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     SUPABASE_URL;

const ZENDIT_BALANCE_URL = `${supabaseUrl}/functions/v1/get-zendit-balance`;
const ZENDIT_PURCHASES_URL = `${supabaseUrl}/functions/v1/get-zendit-voucher-purchases`;

interface ZenditBalance {
  availableBalance: number;
  currency: string;
  balance: number;
}

interface ZenditPurchase {
  purchaseId: string;
  offerId: string;
  brand: string;
  country: string;
  status: string;
  cost?: {
    currency?: string;
    fixed?: number;
  };
  price?: {
    currency?: string;
    fixed?: number;
  };
  send?: {
    currency?: string;
    fixed?: number;
  };
  receipt?: any;
  createdAt?: string;
  updatedAt?: string;
}

export default function ZenditManagementScreen() {
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState<ZenditBalance | null>(null);
  const [purchases, setPurchases] = useState<ZenditPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const limit = 50;

  useFocusEffect(
    useCallback(() => {
      checkAdmin();
    }, [user])
  );

  const checkAdmin = async () => {
    if (!user) {
      router.replace('/(tabs)/profile');
      return;
    }

    const admin = await isAdmin();
    setIsAdminUser(admin);
    
    if (!admin) {
      Alert.alert('Access Denied', 'Admin access required');
      router.replace('/(tabs)/profile');
      return;
    }

    setLoading(false);
    fetchData();
  };

  const fetchBalance = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                             process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                             process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                             SUPABASE_ANON_KEY;

      const response = await fetch(ZENDIT_BALANCE_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setBalance(result.data);
          setError(null);
        } else {
          setError(result.error || 'Failed to fetch balance');
        }
      } else {
        const errorText = await response.text();
        setError(`Failed to fetch balance (${response.status}): ${errorText}`);
      }
    } catch (err: any) {
      console.error('Error fetching balance:', err);
      setError(err.message || 'Failed to fetch balance');
    }
  };

  const fetchPurchases = async (page: number = 1, status?: string) => {
    try {
      setPurchasesLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                             process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                             process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                             SUPABASE_ANON_KEY;

      const offset = (page - 1) * limit;
      let url = `${ZENDIT_PURCHASES_URL}?_limit=${limit}&_offset=${offset}`;
      
      if (status) {
        url += `&status=${status}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.purchases) {
          setPurchases(result.purchases);
          setTotalPurchases(result.total || 0);
          setError(null);
        } else {
          setError(result.error || 'Failed to fetch purchases');
        }
      } else {
        const errorText = await response.text();
        setError(`Failed to fetch purchases (${response.status}): ${errorText}`);
      }
    } catch (err: any) {
      console.error('Error fetching purchases:', err);
      setError(err.message || 'Failed to fetch purchases');
    } finally {
      setPurchasesLoading(false);
    }
  };

  const fetchData = async () => {
    await Promise.all([
      fetchBalance(),
      fetchPurchases(currentPage, statusFilter || undefined),
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [currentPage, statusFilter]);

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status === statusFilter ? '' : status);
    setCurrentPage(1);
    fetchPurchases(1, status === statusFilter ? undefined : status);
  };

  const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
    if (amount === undefined || amount === null) return 'N/A';
    return `${currency} ${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return '#10B981';
      case 'FAILED':
        return '#EF4444';
      case 'PENDING':
      case 'IN_PROGRESS':
        return '#F59E0B';
      case 'ACCEPTED':
      case 'AUTHORIZED':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading Zendit Management...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!isAdminUser) {
    return null;
  }

  const totalPages = Math.ceil(totalPurchases / limit);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Zendit Management</ThemedText>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={refreshing}
        >
          <MaterialIcons 
            name="refresh" 
            size={24} 
            color={refreshing ? "#9CA3AF" : "#11181C"} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <MaterialIcons name="account-balance-wallet" size={32} color="#6B46C1" />
            <ThemedText style={styles.balanceTitle}>Zendit Balance</ThemedText>
          </View>
          {balance ? (
            <View style={styles.balanceContent}>
              <ThemedText style={styles.balanceAmount}>
                {balance.currency} {balance.balance.toFixed(2)}
              </ThemedText>
              <ThemedText style={styles.balanceSubtext}>
                Available Balance: {balance.availableBalance}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.balanceContent}>
              <ActivityIndicator size="small" color="#6B46C1" />
              <ThemedText style={styles.balanceSubtext}>Loading balance...</ThemedText>
            </View>
          )}
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={24} color="#EF4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Status Filters */}
        <View style={styles.filtersContainer}>
          <ThemedText style={styles.sectionTitle}>Filter by Status</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
            {['', 'DONE', 'PENDING', 'FAILED', 'IN_PROGRESS', 'ACCEPTED', 'AUTHORIZED'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterChip,
                  statusFilter === status && styles.filterChipActive,
                ]}
                onPress={() => handleStatusFilter(status)}
              >
                <ThemedText
                  style={[
                    styles.filterChipText,
                    statusFilter === status && styles.filterChipTextActive,
                  ]}
                >
                  {status || 'All'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Transactions List */}
        <View style={styles.transactionsContainer}>
          <View style={styles.transactionsHeader}>
            <ThemedText style={styles.sectionTitle}>
              Transactions ({totalPurchases})
            </ThemedText>
          </View>

          {purchasesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6B46C1" />
            </View>
          ) : purchases.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="receipt-long" size={64} color="#9CA3AF" />
              <ThemedText style={styles.emptyText}>No transactions found</ThemedText>
            </View>
          ) : (
            <>
              {purchases.map((purchase) => (
                <View key={purchase.purchaseId} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionBrand}>
                      <MaterialIcons name="card-giftcard" size={24} color="#6B46C1" />
                      <View style={styles.transactionBrandInfo}>
                        <ThemedText style={styles.transactionBrandName}>
                          {purchase.brand}
                        </ThemedText>
                        <ThemedText style={styles.transactionCountry}>
                          {purchase.country}
                        </ThemedText>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${getStatusColor(purchase.status)}20` },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.statusText,
                          { color: getStatusColor(purchase.status) },
                        ]}
                      >
                        {purchase.status}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.transactionDetails}>
                    <View style={styles.transactionDetailRow}>
                      <ThemedText style={styles.transactionLabel}>Purchase ID:</ThemedText>
                      <ThemedText style={styles.transactionValue}>
                        {purchase.purchaseId.substring(0, 20)}...
                      </ThemedText>
                    </View>
                    <View style={styles.transactionDetailRow}>
                      <ThemedText style={styles.transactionLabel}>Offer ID:</ThemedText>
                      <ThemedText style={styles.transactionValue}>
                        {purchase.offerId.substring(0, 20)}...
                      </ThemedText>
                    </View>
                    {purchase.cost?.fixed !== undefined && (
                      <View style={styles.transactionDetailRow}>
                        <ThemedText style={styles.transactionLabel}>Cost:</ThemedText>
                        <ThemedText style={styles.transactionValue}>
                          {formatCurrency(purchase.cost.fixed, purchase.cost.currency)}
                        </ThemedText>
                      </View>
                    )}
                    {purchase.price?.fixed !== undefined && (
                      <View style={styles.transactionDetailRow}>
                        <ThemedText style={styles.transactionLabel}>Price:</ThemedText>
                        <ThemedText style={styles.transactionValue}>
                          {formatCurrency(purchase.price.fixed, purchase.price.currency)}
                        </ThemedText>
                      </View>
                    )}
                    {purchase.send?.fixed !== undefined && (
                      <View style={styles.transactionDetailRow}>
                        <ThemedText style={styles.transactionLabel}>Value Sent:</ThemedText>
                        <ThemedText style={styles.transactionValue}>
                          {formatCurrency(purchase.send.fixed, purchase.send.currency)}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.transactionDetailRow}>
                      <ThemedText style={styles.transactionLabel}>Created:</ThemedText>
                      <ThemedText style={styles.transactionValue}>
                        {formatDate(purchase.createdAt)}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      currentPage === 1 && styles.paginationButtonDisabled,
                    ]}
                    onPress={() => {
                      if (currentPage > 1) {
                        const newPage = currentPage - 1;
                        setCurrentPage(newPage);
                        fetchPurchases(newPage, statusFilter || undefined);
                      }
                    }}
                    disabled={currentPage === 1}
                  >
                    <MaterialIcons name="chevron-left" size={24} color={currentPage === 1 ? "#9CA3AF" : "#11181C"} />
                  </TouchableOpacity>
                  <ThemedText style={styles.paginationText}>
                    Page {currentPage} of {totalPages}
                  </ThemedText>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      currentPage === totalPages && styles.paginationButtonDisabled,
                    ]}
                    onPress={() => {
                      if (currentPage < totalPages) {
                        const newPage = currentPage + 1;
                        setCurrentPage(newPage);
                        fetchPurchases(newPage, statusFilter || undefined);
                      }
                    }}
                    disabled={currentPage === totalPages}
                  >
                    <MaterialIcons name="chevron-right" size={24} color={currentPage === totalPages ? "#9CA3AF" : "#11181C"} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
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
    color: '#6B7280',
  },
  balanceCard: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  balanceContent: {
    alignItems: 'center',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#6B46C1',
    marginBottom: 8,
  },
  balanceSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    marginLeft: 12,
    color: '#DC2626',
    flex: 1,
  },
  filtersContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  filters: {
    marginHorizontal: -4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  filterChipText: {
    fontSize: 14,
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  transactionsContainer: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  transactionsHeader: {
    marginBottom: 16,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  transactionBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionBrandInfo: {
    marginLeft: 12,
    flex: 1,
  },
  transactionBrandName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionCountry: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  transactionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transactionLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  transactionValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  paginationButton: {
    padding: 8,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
  },
});
