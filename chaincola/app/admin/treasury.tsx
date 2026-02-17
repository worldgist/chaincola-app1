import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { 
  isAdmin, 
  getSystemWallet, 
  adjustLiquidity, 
  getTreasuryStats, 
  getUserWallet,
  type SystemWallet,
  type TreasuryStats,
  type UserWallet,
} from '@/lib/admin-service';
import { getLunoPrices } from '@/lib/crypto-price-service';

const CRYPTO_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', color: '#627EEA' },
  { symbol: 'USDT', name: 'Tether', color: '#26A17B' },
  { symbol: 'USDC', name: 'USD Coin', color: '#2775CA' },
  { symbol: 'XRP', name: 'Ripple', color: '#000000' },
  { symbol: 'SOL', name: 'Solana', color: '#9945FF' },
];

type TabType = 'treasury' | 'settlement' | 'limits' | 'reconciliation' | 'audit';

export default function AdminTreasuryScreen() {
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('treasury');
  
  // Treasury state
  const [systemWallet, setSystemWallet] = useState<SystemWallet | null>(null);
  const [stats, setStats] = useState<TreasuryStats | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  
  // Liquidity adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAsset, setAdjustAsset] = useState<'NGN' | 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL'>('NGN');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustOperation, setAdjustOperation] = useState<'add' | 'remove'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  
  // User wallet search
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [searchUserId, setSearchUserId] = useState('');
  const [searchedWallet, setSearchedWallet] = useState<UserWallet | null>(null);
  const [searching, setSearching] = useState(false);
  
  // Settlement state
  const [settlements, setSettlements] = useState<any[]>([]);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementType, setSettlementType] = useState<'DAILY' | 'WEEKLY' | 'MANUAL'>('DAILY');
  
  // Limits state
  const [limits, setLimits] = useState<any[]>([]);
  const [showLimitModal, setShowLimitModal] = useState(false);
  
  // Reconciliation state
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  
  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilters, setAuditFilters] = useState({
    action_type: '',
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (isAdminUser) {
        loadData();
      }
    }, [isAdminUser])
  );

  const checkAdminAndLoad = async () => {
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
    loadData();
  };

  const loadData = async () => {
    try {
      await Promise.all([
        loadSystemWallet(),
        loadStats(),
        loadPrices(),
      ]);
    } catch (error) {
      console.error('Error loading treasury data:', error);
    }
  };

  const loadSystemWallet = async () => {
    const result = await getSystemWallet();
    if (result.data) {
      setSystemWallet(result.data);
    }
  };

  const loadStats = async () => {
    const result = await getTreasuryStats();
    if (result.data) {
      setStats(result.data);
    }
  };

  const loadPrices = async () => {
    const { prices: staticPrices } = await getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL']);
    const priceMap: Record<string, number> = {};
    Object.keys(staticPrices).forEach(symbol => {
      priceMap[symbol] = staticPrices[symbol].price_ngn || 0;
    });
    setPrices(priceMap);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAdjustLiquidity = async () => {
    if (!adjustAmount || parseFloat(adjustAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!adjustReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for this adjustment');
      return;
    }

    setAdjusting(true);
    try {
      const result = await adjustLiquidity({
        asset: adjustAsset,
        amount: parseFloat(adjustAmount),
        operation: adjustOperation,
        reason: adjustReason,
      });

      if (result.success) {
        Alert.alert('Success', `Liquidity ${adjustOperation === 'add' ? 'added' : 'removed'} successfully`);
        setShowAdjustModal(false);
        setAdjustAmount('');
        setAdjustReason('');
        await loadData();
      } else {
        Alert.alert('Error', result.error || 'Failed to adjust liquidity');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to adjust liquidity');
    } finally {
      setAdjusting(false);
    }
  };

  const handleSearchUser = async () => {
    if (!searchUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }

    setSearching(true);
    try {
      const result = await getUserWallet(searchUserId.trim());
      if (result.data) {
        setSearchedWallet(result.data);
      } else {
        Alert.alert('Error', result.error || 'User wallet not found');
        setSearchedWallet(null);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to search user');
    } finally {
      setSearching(false);
    }
  };

  const formatAmount = (amount: number, decimals: number = 2): string => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const getInventoryValue = (symbol: string, amount: number): number => {
    const price = prices[symbol] || 0;
    return amount * price;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading Treasury...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!isAdminUser) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setSidebarOpen(!sidebarOpen)}
        >
          <MaterialIcons name="menu" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Control Center</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'treasury' && styles.tabActive]}
            onPress={() => setActiveTab('treasury')}
          >
            <MaterialIcons 
              name="account-balance" 
              size={20} 
              color={activeTab === 'treasury' ? '#6B46C1' : '#6B7280'} 
            />
            <ThemedText style={[styles.tabText, activeTab === 'treasury' && styles.tabTextActive]}>
              Treasury
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'settlement' && styles.tabActive]}
            onPress={() => setActiveTab('settlement')}
          >
            <MaterialIcons 
              name="account-balance-wallet" 
              size={20} 
              color={activeTab === 'settlement' ? '#6B46C1' : '#6B7280'} 
            />
            <ThemedText style={[styles.tabText, activeTab === 'settlement' && styles.tabTextActive]}>
              Settlement
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'limits' && styles.tabActive]}
            onPress={() => setActiveTab('limits')}
          >
            <MaterialIcons 
              name="speed" 
              size={20} 
              color={activeTab === 'limits' ? '#6B46C1' : '#6B7280'} 
            />
            <ThemedText style={[styles.tabText, activeTab === 'limits' && styles.tabTextActive]}>
              Limits
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'reconciliation' && styles.tabActive]}
            onPress={() => setActiveTab('reconciliation')}
          >
            <MaterialIcons 
              name="compare-arrows" 
              size={20} 
              color={activeTab === 'reconciliation' ? '#6B46C1' : '#6B7280'} 
            />
            <ThemedText style={[styles.tabText, activeTab === 'reconciliation' && styles.tabTextActive]}>
              Reconcile
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'audit' && styles.tabActive]}
            onPress={() => setActiveTab('audit')}
          >
            <MaterialIcons 
              name="history" 
              size={20} 
              color={activeTab === 'audit' ? '#6B46C1' : '#6B7280'} 
            />
            <ThemedText style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>
              Audit Logs
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.content}>
        {/* Sidebar */}
        <View style={[styles.sidebar, sidebarOpen && styles.sidebarOpen]}>
          <ScrollView style={styles.sidebarContent}>
            <View style={styles.sidebarHeader}>
              <MaterialIcons name="admin-panel-settings" size={32} color="#6B46C1" />
              <ThemedText style={styles.sidebarTitle}>Admin Panel</ThemedText>
            </View>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                router.push('/admin');
                setSidebarOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#6B46C120' }]}>
                <MaterialIcons name="dashboard" size={24} color="#6B46C1" />
              </View>
              <ThemedText style={styles.sidebarItemText}>Dashboard</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, styles.sidebarItemActive]}
              onPress={() => setSidebarOpen(false)}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#6B46C120' }]}>
                <MaterialIcons name="account-balance" size={24} color="#6B46C1" />
              </View>
              <ThemedText style={[styles.sidebarItemText, styles.sidebarItemTextActive]}>Treasury</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                router.push('/(tabs)/transactions');
                setSidebarOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#F59E0B20' }]}>
                <MaterialIcons name="history" size={24} color="#F59E0B" />
              </View>
              <ThemedText style={styles.sidebarItemText}>Transactions</ThemedText>
            </TouchableOpacity>

            <View style={styles.sidebarFooter}>
              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => {
                  router.back();
                  setSidebarOpen(false);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sidebarIconContainer, { backgroundColor: '#FEE2E220' }]}>
                  <MaterialIcons name="arrow-back" size={24} color="#EF4444" />
                </View>
                <ThemedText style={styles.sidebarItemText}>Back to App</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6B46C1" />
          }
        >
        {activeTab === 'treasury' && (
          <>
        {/* Statistics Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <MaterialIcons name="account-balance-wallet" size={24} color="#6B46C1" />
              <ThemedText style={styles.statLabel}>NGN Float</ThemedText>
              <ThemedText style={styles.statValue}>
                ₦{formatAmount(stats.total_ngn_float)}
              </ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="inventory" size={24} color="#10B981" />
              <ThemedText style={styles.statLabel}>Crypto Inventory</ThemedText>
              <ThemedText style={styles.statValue}>
                ₦{formatAmount(stats.total_crypto_inventory_value_ngn)}
              </ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="trending-up" size={24} color="#F59E0B" />
              <ThemedText style={styles.statLabel}>Total System Value</ThemedText>
              <ThemedText style={styles.statValue}>
                ₦{formatAmount(stats.total_system_value)}
              </ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="sell" size={24} color="#EF4444" />
              <ThemedText style={styles.statLabel}>Daily Sell Volume</ThemedText>
              <ThemedText style={styles.statValue}>
                ₦{formatAmount(stats.daily_sell_volume)}
              </ThemedText>
            </View>
          </View>
        )}

        {/* System Wallet Balances */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>System Wallet</ThemedText>
            <TouchableOpacity
              style={styles.adjustButton}
              onPress={() => setShowAdjustModal(true)}
            >
              <MaterialIcons name="add-circle" size={20} color="#6B46C1" />
              <ThemedText style={styles.adjustButtonText}>Adjust</ThemedText>
            </TouchableOpacity>
          </View>

          {/* NGN Float */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <View style={styles.balanceLeft}>
                <View style={[styles.balanceIcon, { backgroundColor: '#D1FAE5' }]}>
                  <MaterialIcons name="currency-exchange" size={24} color="#10B981" />
                </View>
                <View style={styles.balanceInfo}>
                  <ThemedText style={styles.balanceLabel}>NGN Float Balance</ThemedText>
                  <ThemedText style={styles.balanceAmount}>
                    ₦{systemWallet ? formatAmount(parseFloat(systemWallet.ngn_float_balance.toString())) : '0.00'}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* Crypto Inventory */}
          <View style={styles.cryptoGrid}>
            {CRYPTO_ASSETS.map((asset) => {
              const inventoryField = `${asset.symbol.toLowerCase()}_inventory` as keyof SystemWallet;
              const inventory = systemWallet ? parseFloat(systemWallet[inventoryField]?.toString() || '0') : 0;
              const value = getInventoryValue(asset.symbol, inventory);
              
              return (
                <View key={asset.symbol} style={styles.cryptoCard}>
                  <View style={styles.cryptoHeader}>
                    <View style={[styles.cryptoIcon, { backgroundColor: `${asset.color}20` }]}>
                      <ThemedText style={[styles.cryptoSymbol, { color: asset.color }]}>
                        {asset.symbol}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.cryptoName}>{asset.name}</ThemedText>
                  </View>
                  <ThemedText style={styles.cryptoAmount}>
                    {formatAmount(inventory, asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 8 : asset.symbol === 'XRP' ? 6 : 2)}
                  </ThemedText>
                  <ThemedText style={styles.cryptoValue}>
                    ≈ ₦{formatAmount(value)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                setAdjustAsset('NGN');
                setShowAdjustModal(true);
              }}
            >
              <MaterialIcons name="add-circle-outline" size={32} color="#10B981" />
              <ThemedText style={styles.actionText}>Add NGN</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setShowUserSearch(true)}
            >
              <MaterialIcons name="search" size={32} color="#6B46C1" />
              <ThemedText style={styles.actionText}>Search User</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/transactions')}
            >
              <MaterialIcons name="history" size={32} color="#F59E0B" />
              <ThemedText style={styles.actionText}>Transactions</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={loadData}
            >
              <MaterialIcons name="refresh" size={32} color="#3B82F6" />
              <ThemedText style={styles.actionText}>Refresh</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        </>
        )}
      </ScrollView>

      {/* Adjust Liquidity Modal */}
      <Modal
        visible={showAdjustModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdjustModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {adjustOperation === 'add' ? 'Add' : 'Remove'} Liquidity
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowAdjustModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Asset</ThemedText>
                <View style={styles.assetSelector}>
                  {(['NGN', 'BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const).map((asset) => (
                    <TouchableOpacity
                      key={asset}
                      style={[
                        styles.assetOption,
                        adjustAsset === asset && styles.assetOptionActive,
                      ]}
                      onPress={() => setAdjustAsset(asset)}
                    >
                      <ThemedText
                        style={[
                          styles.assetOptionText,
                          adjustAsset === asset && styles.assetOptionTextActive,
                        ]}
                      >
                        {asset}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Operation</ThemedText>
                <View style={styles.operationSelector}>
                  <TouchableOpacity
                    style={[
                      styles.operationButton,
                      adjustOperation === 'add' && styles.operationButtonActive,
                    ]}
                    onPress={() => setAdjustOperation('add')}
                  >
                    <MaterialIcons 
                      name="add-circle" 
                      size={20} 
                      color={adjustOperation === 'add' ? '#FFFFFF' : '#10B981'} 
                    />
                    <ThemedText
                      style={[
                        styles.operationButtonText,
                        adjustOperation === 'add' && styles.operationButtonTextActive,
                      ]}
                    >
                      Add
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.operationButton,
                      adjustOperation === 'remove' && styles.operationButtonActive,
                    ]}
                    onPress={() => setAdjustOperation('remove')}
                  >
                    <MaterialIcons 
                      name="remove-circle" 
                      size={20} 
                      color={adjustOperation === 'remove' ? '#FFFFFF' : '#EF4444'} 
                    />
                    <ThemedText
                      style={[
                        styles.operationButtonText,
                        adjustOperation === 'remove' && styles.operationButtonTextActive,
                      ]}
                    >
                      Remove
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Amount</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  value={adjustAmount}
                  onChangeText={setAdjustAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Reason</ThemedText>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter reason for this adjustment..."
                  placeholderTextColor="#9CA3AF"
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, adjusting && styles.submitButtonDisabled]}
                onPress={handleAdjustLiquidity}
                disabled={adjusting}
              >
                {adjusting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>
                    {adjustOperation === 'add' ? 'Add' : 'Remove'} Liquidity
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* User Search Modal */}
      <Modal
        visible={showUserSearch}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUserSearch(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Search User Wallet</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setShowUserSearch(false);
                  setSearchUserId('');
                  setSearchedWallet(null);
                }}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>User ID</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Enter user ID..."
                  placeholderTextColor="#9CA3AF"
                  value={searchUserId}
                  onChangeText={setSearchUserId}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, searching && styles.submitButtonDisabled]}
                onPress={handleSearchUser}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>Search</ThemedText>
                )}
              </TouchableOpacity>

              {searchedWallet && (
                <View style={styles.userWalletCard}>
                  <ThemedText style={styles.userWalletTitle}>User Wallet Balances</ThemedText>
                  <View style={styles.userBalanceRow}>
                    <ThemedText style={styles.userBalanceLabel}>NGN:</ThemedText>
                    <ThemedText style={styles.userBalanceValue}>
                      ₦{formatAmount(parseFloat(searchedWallet.ngn_balance.toString()))}
                    </ThemedText>
                  </View>
                  {CRYPTO_ASSETS.map((asset) => {
                    const balanceField = `${asset.symbol.toLowerCase()}_balance` as keyof UserWallet;
                    const balance = parseFloat(searchedWallet[balanceField]?.toString() || '0');
                    if (balance === 0) return null;
                    return (
                      <View key={asset.symbol} style={styles.userBalanceRow}>
                        <ThemedText style={styles.userBalanceLabel}>{asset.symbol}:</ThemedText>
                        <ThemedText style={styles.userBalanceValue}>
                          {formatAmount(balance, asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 8 : asset.symbol === 'XRP' ? 6 : 2)}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    transform: [{ translateX: -280 }],
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sidebarOpen: {
    transform: [{ translateX: 0 }],
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 20,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  sidebarItemActive: {
    backgroundColor: '#F3F4F6',
    borderLeftWidth: 4,
    borderLeftColor: '#6B46C1',
  },
  sidebarIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#11181C',
  },
  sidebarItemTextActive: {
    fontWeight: '600',
    color: '#6B46C1',
  },
  sidebarFooter: {
    marginTop: 'auto',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#11181C',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#11181C',
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  adjustButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  balanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  cryptoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cryptoCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cryptoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cryptoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cryptoSymbol: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cryptoName: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  cryptoAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 4,
  },
  cryptoValue: {
    fontSize: 12,
    color: '#6B7280',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  assetSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assetOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  assetOptionActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  assetOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  assetOptionTextActive: {
    color: '#FFFFFF',
  },
  operationSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  operationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  operationButtonActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  operationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  operationButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#6B46C1',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userWalletCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  userWalletTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 12,
  },
  userBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  userBalanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  userBalanceValue: {
    fontSize: 14,
    color: '#11181C',
    fontWeight: '600',
  },
});
