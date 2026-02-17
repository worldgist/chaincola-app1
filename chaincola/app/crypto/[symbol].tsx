import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Image, ScrollView, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatNgnValue, formatUsdValue, getCryptoPrice } from '@/lib/crypto-price-service';
import { getUserTransactions, TransactionListItem } from '@/lib/transaction-service';
import WalletAddressModal from '@/components/wallet-address-modal';
// Chart visualization using View components

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 200;
const CHART_WIDTH = SCREEN_WIDTH - 40;

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: '1',
  ETH: '2',
  USDT: '3',
  USDC: '4',
  XRP: '6',
  SOL: '7',
};

const SYMBOL_TO_NAME: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  USDT: 'Tether',
  USDC: 'USD Coin',
  XRP: 'XRP',
};

const SYMBOL_TO_LOGO: Record<string, any> = {
  BTC: require('@/assets/images/bitcoin.png'),
  ETH: require('@/assets/images/ethereum.png'),
  SOL: require('@/assets/images/solana.png'),
  USDT: require('@/assets/images/tether.png'),
  USDC: require('@/assets/images/usdc.png'),
  XRP: require('@/assets/images/ripple.png'),
};

const TIME_RANGES = ['1H', '1D', '1W', '1M', '1Y'] as const;
type TimeRange = typeof TIME_RANGES[number];

// Map time ranges to days for fallback
const daysMap: Record<TimeRange, number> = {
  '1H': 0.04, // ~1 hour
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
};

// Chart: no market API — use static price for flat display
function generateFallbackChartData(symbol: string, days: number): number[] {
  // Use approximate base prices
  const basePrices: Record<string, number> = {
    BTC: 88000,
    ETH: 2500,
    SOL: 150,
    USDT: 1,
    USDC: 1,
    XRP: 0.6,
  };
  
  const basePrice = basePrices[symbol] || 1000;
  const points = 50;
  const data: number[] = [];
  const volatility = days <= 7 ? 0.02 : 0.05;
  
  for (let i = 0; i < points; i++) {
    const randomChange = (Math.random() - 0.5) * volatility;
    const trend = Math.sin((i / points) * Math.PI * 2) * 0.01;
    const price = basePrice * (1 + randomChange + trend);
    data.push(Math.max(basePrice * 0.9, Math.min(basePrice * 1.1, price)));
  }
  
  return data;
}

export default function CryptoDetailsScreen() {
  const params = useLocalSearchParams();
  const symbol = (params.symbol || '').toString().toUpperCase();
  const id = SYMBOL_TO_ID[symbol] || '1';
  const { user } = useAuth();
  
  const [priceUSD, setPriceUSD] = useState<number | null>(null);
  const [priceNGN, setPriceNGN] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [balanceValue, setBalanceValue] = useState<number>(0);
  const [balanceNGNValue, setBalanceNGNValue] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ACTIVITY' | 'ABOUT'>('ACTIVITY');
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1D');
  const [isFavorited, setIsFavorited] = useState(false);
  const [chartData, setChartData] = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fullName = SYMBOL_TO_NAME[symbol] || symbol;
  const logo = SYMBOL_TO_LOGO[symbol] || require('@/assets/images/bitcoin.png');

  // Fetch price from pricing engine (static rate only, no market API)
  useEffect(() => {
    let mounted = true;
    async function fetchPrice() {
      if (!symbol) return;
      const { price, error } = await getCryptoPrice(symbol);
      if (!mounted) return;
      if (price) {
        setPriceUSD(price.price_usd || null);
        setPriceNGN(price.price_ngn || null);
        setChange24h(null); // Static rate: no 24h change
      } else {
        setPriceUSD(null);
        setPriceNGN(null);
        setChange24h(null);
      }
    }
    fetchPrice();
    const iv = setInterval(fetchPrice, 60000);
    return () => { mounted = false; clearInterval(iv); };
  }, [symbol]);

  // Handle showReceive param
  useEffect(() => {
    if (params.showReceive === 'true') {
      setShowWalletModal(true);
    }
  }, [params.showReceive]);

  // Fetch user balance
  useEffect(() => {
    let mounted = true;
    async function fetchBalance() {
      if (!user?.id || !symbol) {
        if (mounted) {
          setBalanceValue(0);
          setBalanceNGNValue(0);
          setBalanceLoading(false);
        }
        return;
      }

      try {
        setBalanceLoading(true);
        const { balances, error } = await getUserCryptoBalances(user.id);
        if (!mounted) return;
        
        if (error) {
          console.warn(`Error fetching balances for ${symbol}:`, error);
        }
        
        // Debug: Log all balances to see what we're getting
        console.log(`📊 All balances fetched:`, balances);
        console.log(`🔍 Looking for symbol: ${symbol}`);
        console.log(`📋 Available symbols in balances:`, Object.keys(balances || {}));
        
        // Try multiple ways to get the balance
        let balance = balances?.[symbol];
        
        // Fallback: Try case-insensitive lookup
        if (!balance && balances) {
          const symbolLower = symbol.toLowerCase();
          const symbolUpper = symbol.toUpperCase();
          balance = balances[symbolUpper] || balances[symbolLower] || 
                   Object.values(balances).find((b: any) => 
                     b?.symbol?.toUpperCase() === symbol.toUpperCase()
                   ) as any;
        }
        
        // Final fallback: create default balance object
        if (!balance) {
          console.warn(`⚠️ Balance object not found for ${symbol}. Creating default.`);
          balance = { symbol, balance: 0, usdValue: 0, ngnValue: 0 };
        }
        
        const balanceAmount = typeof balance.balance === 'number' ? balance.balance : parseFloat(balance.balance?.toString() || '0') || 0;
        const ngnValue = typeof balance.ngnValue === 'number' ? balance.ngnValue : parseFloat(balance.ngnValue?.toString() || '0') || 0;
        
        console.log(`💰 Balance for ${symbol}:`, { 
          balanceAmount, 
          ngnValue, 
          balance,
          balanceExists: !!balance,
          balanceObject: balance,
          balanceType: typeof balance.balance,
          ngnValueType: typeof balance.ngnValue
        });
        
        // Always set the values, even if 0
        setBalanceValue(balanceAmount);
        setBalanceNGNValue(ngnValue);
      } catch (err) {
        console.error(`❌ Failed to fetch crypto balance for ${symbol}:`, err);
        if (mounted) {
          setBalanceValue(0);
          setBalanceNGNValue(0);
        }
      } finally {
        if (mounted) setBalanceLoading(false);
      }
    }

    fetchBalance();
  }, [user?.id, symbol]);

  // Fetch transactions for activity tab
  useEffect(() => {
    if (activeTab !== 'ACTIVITY' || !user?.id) return;
    
    let mounted = true;
    async function fetchActivity() {
      try {
        setTransactionsLoading(true);
        const { transactions: fetchedTransactions } = await getUserTransactions(user.id, 50);
        if (!mounted) return;
        
        // Filter transactions for this crypto
        const cryptoTransactions = fetchedTransactions.filter(
          tx => tx.symbol === symbol || tx.crypto === fullName
        );
        setTransactions(cryptoTransactions);
      } catch (err) {
        console.warn('Failed to fetch transactions', err);
        if (mounted) setTransactions([]);
      } finally {
        if (mounted) setTransactionsLoading(false);
      }
    }

    fetchActivity();
    return () => { mounted = false; };
  }, [user?.id, symbol, activeTab, fullName]);

  // Chart: no market API — use static price (flat line from current price or fallback)
  useEffect(() => {
    let mounted = true;
    async function loadChartData() {
      if (!symbol) return;
      setChartLoading(true);
      try {
        const { price } = await getCryptoPrice(symbol);
        const base = price?.price_usd ? price.price_usd : (generateFallbackChartData(symbol, 1)[0] || 1000);
        const days = daysMap[selectedRange] || 1;
        const data = price ? Array(50).fill(base) : generateFallbackChartData(symbol, days);
        if (mounted) setChartData(data);
      } catch {
        if (mounted) setChartData(generateFallbackChartData(symbol, daysMap[selectedRange] || 1));
      } finally {
        if (mounted) setChartLoading(false);
      }
    }
    loadChartData();
    return () => { mounted = false; };
  }, [symbol, selectedRange]);

  const handleSend = () => {
    if (!symbol || !id) {
      console.warn('Cannot navigate to send: missing symbol or id', { symbol, id });
      return;
    }
    router.push({ 
      pathname: '/send-crypto', 
      params: { 
        id: id, 
        crypto: symbol,
        from: 'crypto-details' 
      } 
    });
  };
  const handleReceive = () => {
    setShowWalletModal(true);
  };

  const handleBuy = () => {
    if (!symbol || !id) {
      console.warn('Cannot navigate to buy: missing symbol or id', { symbol, id });
      return;
    }
    router.push({ 
      pathname: '/buy-crypto', 
      params: { 
        cryptoId: id 
      } 
    });
  };

  const handleSell = () => {
    if (!symbol || !id) {
      console.warn('Cannot navigate to sell: missing symbol or id', { symbol, id });
      return;
    }
    router.push({ 
      pathname: '/sell-crypto', 
      params: { 
        cryptoId: id 
      } 
    });
  };

  // Calculate chart visualization data
  const getChartBars = () => {
    if (chartData.length === 0) return [];
    const min = Math.min(...chartData);
    const max = Math.max(...chartData);
    const range = max - min || 1;
    // Account for padding in chartView (60px left, 20px right)
    const chartAreaWidth = CHART_WIDTH - 80;
    const barWidth = chartAreaWidth / chartData.length;
    
    return chartData.map((value, index) => {
      const height = ((value - min) / range) * CHART_HEIGHT;
      return {
        x: 60 + index * barWidth, // Offset by left padding
        height: Math.max(2, height),
        value,
      };
    });
  };

  const chartBars = getChartBars();
  const isPositive = (change24h ?? 0) >= 0;
  const chartColor = isPositive ? '#10B981' : '#EF4444';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            {logo && (
              <Image source={logo} style={styles.headerLogo} />
            )}
            <ThemedText style={styles.headerTitle}>{fullName}</ThemedText>
          </View>
          <TouchableOpacity 
            style={styles.starButton}
            onPress={() => setIsFavorited(!isFavorited)}
          >
            <MaterialIcons 
              name={isFavorited ? "star" : "star-border"} 
              size={24} 
              color={isFavorited ? "#FFD700" : "#000000"} 
            />
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleSend}>
            <MaterialIcons name="arrow-upward" size={22} color="#FFFFFF" />
            <ThemedText style={styles.actionButtonText}>Send</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleReceive}>
            <MaterialIcons name="call-received" size={22} color="#FFFFFF" />
            <ThemedText style={styles.actionButtonText}>Receive</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleBuy}>
            <MaterialIcons name="add-circle" size={22} color="#FFFFFF" />
            <ThemedText style={styles.actionButtonText}>Buy</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleSell}>
            <MaterialIcons name="remove-circle" size={22} color="#FFFFFF" />
            <ThemedText style={styles.actionButtonText}>Sell</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Crypto Overview Card */}
          <View style={styles.cryptoOverviewCard}>
            <View style={styles.cryptoOverviewContent}>
              <View style={styles.cryptoOverviewLeft}>
                <View style={styles.cryptoOverviewIconContainer}>
                  <Image source={logo} style={styles.cryptoOverviewIcon} />
                </View>
                <View style={styles.cryptoOverviewText}>
                  <ThemedText style={styles.cryptoOverviewName}>{fullName}</ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* Available Balance Card */}
          <View style={styles.availableBalanceCard}>
            <ThemedText style={styles.availableBalanceLabel}>Available Balance</ThemedText>
            {balanceLoading ? (
              <ActivityIndicator size="large" color="#6B46C1" style={{ marginVertical: 16 }} />
            ) : (
              <ThemedText 
                style={styles.availableBalanceAmount}
                numberOfLines={2}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.5}
                allowFontScaling={true}
              >
                {formatCryptoBalance(balanceValue || 0, symbol)} {symbol}
              </ThemedText>
            )}
          </View>

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'ACTIVITY' && styles.tabActive]}
              onPress={() => setActiveTab('ACTIVITY')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'ACTIVITY' && styles.tabTextActive]}>
                ACTIVITY
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'ABOUT' && styles.tabActive]}
              onPress={() => setActiveTab('ABOUT')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'ABOUT' && styles.tabTextActive]}>
                ABOUT
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'ACTIVITY' ? (
              <View style={styles.activityContent}>
                {/* Activity Header with View All */}
                {transactions.length > 0 && (
                  <View style={styles.activityHeader}>
                    <ThemedText style={styles.activityHeaderTitle}>Recent Activity</ThemedText>
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => router.push('/transactions')}
                    >
                      <ThemedText style={styles.viewAllButtonText}>View All</ThemedText>
                      <MaterialIcons name="arrow-forward" size={16} color="#6B46C1" />
                    </TouchableOpacity>
                  </View>
                )}
                {transactionsLoading ? (
                  <ActivityIndicator size="small" color="#6B46C1" style={styles.loader} />
                ) : transactions.length === 0 ? (
                  <ThemedText style={styles.emptyText}>
                    You don't have any {symbol} activity yet.
                  </ThemedText>
                ) : (
                  transactions.map((tx) => {
                    const isSell = tx.type === 'sell';
                    const isBuy = tx.type === 'buy';
                    const isReceive = tx.type === 'receive' || tx.type === 'deposit';
                    const isSend = tx.type === 'send' || tx.type === 'withdrawal';
                    
                    // Determine transaction type colors
                    const iconBgColor = isSell ? '#FEE2E2' : isBuy ? '#D1FAE5' : isReceive ? '#DBEAFE' : '#F3E8FF';
                    const iconColor = isSell ? '#EF4444' : isBuy ? '#10B981' : isReceive ? '#3B82F6' : '#6B46C1';
                    const amountColor = isSell ? '#EF4444' : isBuy ? '#10B981' : isReceive ? '#3B82F6' : '#6B46C1';
                    const iconName = isSell ? 'arrow-downward' : isBuy ? 'arrow-upward' : isReceive ? 'call-received' : 'arrow-upward';
                    const typeLabel = isSell ? 'Sold' : isBuy ? 'Bought' : isReceive ? 'Received' : isSend ? 'Sent' : tx.type;
                    
                    return (
                      <TouchableOpacity
                        key={tx.id}
                        style={styles.transactionItem}
                        onPress={() => router.push(`/transaction-detail?id=${tx.id}`)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.transactionLeft}>
                          <View style={[
                            styles.transactionIcon,
                            { backgroundColor: iconBgColor }
                          ]}>
                            <MaterialIcons
                              name={iconName}
                              size={20}
                              color={iconColor}
                            />
                          </View>
                          <View style={styles.transactionInfo}>
                            <ThemedText style={styles.transactionType}>
                              {typeLabel}
                            </ThemedText>
                            <ThemedText style={styles.transactionDate}>{tx.date}</ThemedText>
                          </View>
                        </View>
                        <View style={styles.transactionRight}>
                          <ThemedText style={[
                            styles.transactionAmount,
                            { color: amountColor }
                          ]}>
                            {isSell ? '-' : isReceive ? '+' : ''}{tx.amount} {tx.symbol}
                          </ThemedText>
                          <ThemedText style={styles.transactionValue}>
                            {tx.total}
                          </ThemedText>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={styles.aboutContent}>
                <ThemedText style={styles.aboutTitle}>{fullName} ({symbol})</ThemedText>
                <ThemedText style={styles.aboutText}>
                  {symbol === 'BTC' && 'Bitcoin is a decentralized digital currency that enables peer-to-peer transactions without intermediaries.'}
                  {symbol === 'ETH' && 'Ethereum is a blockchain platform that enables smart contracts and decentralized applications.'}
                  {symbol === 'SOL' && 'Solana is a high-performance blockchain supporting decentralized apps and crypto-currencies.'}
                  {symbol === 'USDT' && 'Tether is a stablecoin pegged to the US dollar, designed to maintain a stable value.'}
                  {symbol === 'USDC' && 'USD Coin is a fully collateralized US dollar stablecoin.'}
                  {symbol === 'XRP' && 'XRP is a digital asset built for payments, enabling fast and low-cost transactions.'}
                </ThemedText>
              </View>
            )}
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* Wallet Address Modal */}
      <WalletAddressModal
        visible={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        asset={symbol}
        assetName={fullName}
        logo={logo}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F3F4F6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  starButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 20,
    paddingHorizontal: 20,
    width: '100%',
    flexGrow: 1,
  },
  cryptoOverviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cryptoOverviewContent: {
    width: '100%',
  },
  cryptoOverviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cryptoOverviewIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cryptoOverviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  cryptoOverviewText: {
    flex: 1,
  },
  cryptoOverviewName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 8,
  },
  cryptoOverviewUSD: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  cryptoOverviewNGN: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
  },
  availableBalanceCard: {
    backgroundColor: '#EDE9FE',
    borderRadius: 16,
    padding: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 140,
    width: '100%',
  },
  availableBalanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
    marginBottom: 16,
    textAlign: 'center',
  },
  availableBalanceAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#6B46C1',
    textAlign: 'center',
    includeFontPadding: false,
    letterSpacing: 0.5,
    width: '100%',
    paddingHorizontal: 4,
    lineHeight: 44,
  },
  assetHeader: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
    width: '100%',
  },
  assetIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  assetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  cryptoCard: {
    width: '100%',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginTop: 0,
    marginBottom: 20,
    marginHorizontal: 20,
    borderWidth: 3,
    borderColor: '#6B46C1',
    shadowColor: '#6B46C1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
    zIndex: 10,
  },
  cardSection: {
    alignItems: 'center',
    marginVertical: 6,
    width: '100%',
    paddingHorizontal: 2,
  },
  cardLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  cardBalanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 6,
    lineHeight: 40,
    width: '100%',
    paddingHorizontal: 2,
    flexShrink: 1,
  },
  cardBalanceNGN: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B46C1',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.3,
    width: '100%',
    paddingHorizontal: 2,
  },
  priceAmountContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    overflow: 'hidden',
    marginVertical: 2,
  },
  cardPriceUSD: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 2,
    width: '100%',
    paddingHorizontal: 2,
    flexShrink: 1,
    lineHeight: 26,
  },
  cardPriceNGN: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
    paddingHorizontal: 2,
    flexShrink: 1,
  },
  cardDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 12,
  },
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 4,
  },
  priceChange: {
    fontSize: 12,
    fontWeight: '700',
  },
  priceChangePositive: {
    color: '#10B981',
  },
  priceChangeNegative: {
    color: '#EF4444',
  },
  priceChangeLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  priceValueNGN: {
    fontSize: 24,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  assetName: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  chartContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  chartWrapper: {
    height: CHART_HEIGHT,
    marginBottom: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartView: {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    position: 'relative',
    paddingLeft: 60,
    paddingRight: 20,
  },
  chartLabels: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  chartLabelTop: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  chartLabelBottom: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  chartBarsContainer: {
    width: '100%',
    height: CHART_HEIGHT,
    position: 'relative',
  },
  chartLine: {
    height: 2,
    position: 'absolute',
    borderRadius: 1,
  },
  chartGradient: {
    position: 'absolute',
    left: 60,
    right: 20,
    top: 0,
    bottom: 0,
    opacity: 0.3,
  },
  chartPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRangeContainer: {
    marginTop: 8,
  },
  timeRangeContent: {
    paddingHorizontal: 4,
  },
  timeRangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeRangeButtonActive: {
    backgroundColor: '#F3F4F6',
    borderColor: '#6B46C1',
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  timeRangeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  balanceContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 32,
    gap: 12,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    alignItems: 'flex-start',
    borderWidth: 2,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 38,
  },
  balanceSymbol: {
    fontSize: 16,
    color: '#6B46C1',
    fontWeight: '700',
    marginTop: 4,
  },
  balanceSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 8,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#6B46C1',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  tabContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    minHeight: 200,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  activityHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  loader: {
    marginVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'right',
  },
  transactionValue: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'right',
  },
  aboutContent: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  aboutText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 24,
  },
  priceInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  priceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  priceInfoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  priceInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  changePositive: {
    color: '#10B981',
  },
  changeNegative: {
    color: '#EF4444',
  },
  balanceSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    flexShrink: 1,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  balanceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  balanceAmountContainer: {
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 70,
    maxHeight: 220,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.3,
    lineHeight: 48,
  },
  balanceNGNContainer: {
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    backgroundColor: 'transparent',
  },
  balanceNGNValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    width: '100%',
    letterSpacing: 0.3,
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  priceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceCardLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  infoButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceCardAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  priceChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceChangeAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  topActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingHorizontal: 4,
    minWidth: 70,
  },
  actionButtonText: {
    fontSize: 11,
    color: '#FFFFFF',
    marginTop: 4,
    fontWeight: '600',
  },
  actionButtonPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
    paddingHorizontal: 8,
  },
  buySellIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
