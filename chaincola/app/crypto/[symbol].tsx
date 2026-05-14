import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Image, ScrollView, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatNgnValue, getCryptoPrice } from '@/lib/crypto-price-service';
import { getUserTransactions, TransactionListItem } from '@/lib/transaction-service';
import WalletAddressModal from '@/components/wallet-address-modal';
import CryptoPriceChart from '@/components/crypto-price-chart';
import {
  formatCompactNumber,
  type ChartRange,
  type MarketInfo,
} from '@/lib/crypto-market-format';
import { fetchAlchemyCryptoDetails, supportsAlchemyCryptoDetails } from '@/lib/alchemy-crypto-details-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Price card has 20px outer padding from scroll content + 20px internal padding
const CHART_WIDTH = SCREEN_WIDTH - 40 - 40;
const CHART_HEIGHT = 180;

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

const TIME_RANGES: readonly ChartRange[] = ['1H', '1D', '1W', '1M', '1Y'] as const;

// Suffix shown next to the percentage change in the price card.
const RANGE_SUFFIX: Record<ChartRange, string> = {
  '1H': '1H',
  '1D': 'Today',
  '1W': '1W',
  '1M': '1M',
  '1Y': '1Y',
};

// In-app copy when no long-form description is loaded from the server.
const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  BTC: 'Bitcoin uses peer-to-peer technology to operate with no central authority or banks; managing transactions and the issuing of bitcoins is carried out collectively by the network. Bitcoin is open-source; its design is public, nobody owns or controls Bitcoin and everyone can take part. Through many of its unique properties, Bitcoin allows exciting uses that could not be covered by any previous payment system.',
  ETH: 'Ethereum is a global, open-source platform for decentralized applications. On Ethereum, you can write code that controls digital value, runs exactly as programmed, and is accessible anywhere in the world.',
  SOL: 'Solana is a high-performance blockchain that supports builders around the world creating crypto apps that scale today. It offers fast confirmation times and low transaction fees.',
  USDT: 'Tether (USDT) is a stablecoin pegged 1:1 to the US dollar, designed to maintain a stable value while moving across blockchains.',
  USDC: 'USD Coin (USDC) is a fully reserved US dollar stablecoin, redeemable 1:1 for US dollars and audited by independent firms.',
  XRP: 'XRP is the native digital asset of the XRP Ledger, designed for fast, low-cost cross-border payments and settlement.',
};

interface AboutStatRowProps {
  label: string;
  value: string;
  showDivider?: boolean;
}

function AboutStatRow({ label, value, showDivider }: AboutStatRowProps) {
  return (
    <View style={[styles.aboutStatRow, showDivider && styles.aboutStatRowDivider]}>
      <ThemedText style={styles.aboutStatLabel}>{label}</ThemedText>
      <ThemedText
        style={styles.aboutStatValue}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </ThemedText>
    </View>
  );
}

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
  const [selectedRange, setSelectedRange] = useState<ChartRange>('1D');
  const [isFavorited, setIsFavorited] = useState(false);
  const [chartData, setChartData] = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fullName = SYMBOL_TO_NAME[symbol] || symbol;
  const logo = SYMBOL_TO_LOGO[symbol] || require('@/assets/images/bitcoin.png');

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

  // Price, chart, cap & volume: Alchemy (Supabase Edge) when available; else spot from getCryptoPrice + flat chart.
  useEffect(() => {
    let mounted = true;
    async function loadMarketData() {
      if (!symbol) return;
      setChartLoading(true);
      try {
        if (supportsAlchemyCryptoDetails(symbol)) {
          const alchemy = await fetchAlchemyCryptoDetails(symbol, selectedRange);
          if (!mounted) return;
          if (alchemy?.success && alchemy.spot) {
            setPriceUSD(alchemy.spot.price_usd);
            setPriceNGN(alchemy.spot.price_ngn);
            setChange24h(
              typeof alchemy.change_24h_pct === 'number' ? alchemy.change_24h_pct : null
            );
            const pts = alchemy.chart?.points ?? [];
            if (pts.length >= 2) {
              setChartData(pts);
            } else {
              const base = alchemy.spot.price_ngn || generateFallbackChartData(symbol, 1)[0] || 1000;
              setChartData(Array(24).fill(base));
            }
            setMarketInfo({
              marketCap: alchemy.market?.market_cap_ngn ?? null,
              totalVolume: alchemy.market?.total_volume_ngn ?? null,
              circulatingSupply: alchemy.market?.circulating_supply ?? null,
              description: null,
              vsCurrency: 'ngn',
            });
            return;
          }
        }

        const { price } = await getCryptoPrice(symbol, { retailOverlay: false });
        if (!mounted) return;
        if (price) {
          setPriceUSD(price.price_usd ?? null);
          setPriceNGN(price.price_ngn ?? null);
          setChange24h(
            typeof price.change_24h_pct === 'number' ? price.change_24h_pct : null
          );
        } else {
          setPriceUSD(null);
          setPriceNGN(null);
          setChange24h(null);
        }

        const fallbackBase =
          (price?.price_ngn != null ? price.price_ngn : null) ||
          generateFallbackChartData(symbol, 1)[0] ||
          1000;
        setChartData(Array(24).fill(fallbackBase));

        if (mounted) {
          setMarketInfo({
            marketCap: null,
            totalVolume: null,
            circulatingSupply: null,
            description: null,
            vsCurrency: 'ngn',
          });
        }
      } catch {
        if (mounted) {
          setChartData(Array(24).fill(1000));
        }
      } finally {
        if (mounted) setChartLoading(false);
      }
    }

    loadMarketData();
    const iv = setInterval(loadMarketData, 60000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
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

  // Period-based change derived from the chart series (start vs end of the selected range).
  // Falls back to the 24h change from the price service when the chart has no data yet.
  const periodChange = (() => {
    if (chartData.length >= 2) {
      const first = chartData[0];
      const last = chartData[chartData.length - 1];
      if (first && Number.isFinite(first) && first !== 0) {
        const absolute = last - first;
        const pct = (absolute / first) * 100;
        return { absolute, pct };
      }
    }
    if (typeof change24h === 'number' && priceNGN != null) {
      const absolute = (priceNGN * change24h) / 100;
      return { absolute, pct: change24h };
    }
    return { absolute: 0, pct: 0 };
  })();
  const isPositive = periodChange.pct >= 0;
  const changeColor = isPositive ? '#10B981' : '#EF4444';

  const handleBack = () => {
    // `router.back()` falls back to the root when there is no history.
    // Prefer returning to the actual previous screen, and only fall back to a sane tab.
    const from = (params.from || '').toString();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (from === 'wallet') {
      router.replace('/(tabs)/wallet');
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
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
          {/* Balance section (matches screenshot: small label with icon, big amount, NGN equivalent) */}
          <View style={styles.balanceSectionV2}>
            <View style={styles.balanceLabelRow}>
              <Image source={logo} style={styles.balanceLabelIcon} />
              <ThemedText style={styles.balanceLabelV2}>{symbol} balance</ThemedText>
            </View>
            {balanceLoading ? (
              <AppLoadingIndicator size="large" style={{ marginVertical: 16 }} />
            ) : (
              <>
                <ThemedText
                  style={styles.balanceAmountV2}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {formatCryptoBalance(balanceValue || 0, symbol)} {symbol}
                </ThemedText>
                <ThemedText
                  style={styles.balanceNgnV2}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatNgnValue(balanceNGNValue || 0)}
                </ThemedText>
              </>
            )}
          </View>

          {/* Price card with chart and time-range selector */}
          <View style={styles.priceCardV2}>
            <View style={styles.priceCardHeaderV2}>
              <ThemedText style={styles.priceCardLabelV2}>{symbol} Price</ThemedText>
              <TouchableOpacity
                style={styles.priceCardInfoButton}
                onPress={() =>
                  Alert.alert(
                    `${fullName} (${symbol}) price`,
                    `Live ${symbol} market price in NGN (Alchemy via Chaincola). Chart uses historical prices from the same source when available.`,
                  )
                }
                hitSlop={8}
              >
                <MaterialIcons name="info-outline" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.priceCardAmountWrap}>
              <ThemedText
                style={styles.priceCardAmountV2}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                allowFontScaling
              >
                {priceNGN != null ? formatNgnValue(priceNGN) : '—'}
              </ThemedText>
            </View>

            <View style={styles.priceChangeRowV2}>
              <ThemedText
                style={[styles.priceChangeAmountV2, { color: changeColor }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {isPositive ? '+' : '-'}
                {formatNgnValue(Math.abs(periodChange.absolute))}
              </ThemedText>
              <ThemedText style={[styles.priceChangePctV2, { color: changeColor }]} numberOfLines={1}>
                ({isPositive ? '+' : ''}
                {periodChange.pct.toFixed(2)}%)
              </ThemedText>
              <ThemedText style={styles.priceChangeSuffixV2} numberOfLines={1}>
                {RANGE_SUFFIX[selectedRange]}
              </ThemedText>
            </View>

            <View style={styles.chartContainerV2}>
              <CryptoPriceChart
                data={chartData}
                width={CHART_WIDTH}
                height={CHART_HEIGHT}
                color={changeColor}
                loading={chartLoading}
              />
            </View>

            <View style={styles.rangeSelectorV2}>
              {TIME_RANGES.map((range) => {
                const active = selectedRange === range;
                return (
                  <TouchableOpacity
                    key={range}
                    style={[styles.rangeButtonV2, active && styles.rangeButtonV2Active]}
                    onPress={() => setSelectedRange(range)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[styles.rangeButtonTextV2, active && styles.rangeButtonTextV2Active]}
                    >
                      {range}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                  <AppLoadingIndicator size="small" style={styles.loader} />
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
                <View style={styles.aboutHeaderV2}>
                  <ThemedText style={styles.aboutTitleV2} numberOfLines={2}>
                    About {fullName}
                  </ThemedText>
                  <Image source={logo} style={styles.aboutLogoV2} />
                </View>

                <View style={styles.aboutDescriptionCard}>
                  <ThemedText style={styles.aboutDescriptionText}>
                    {marketInfo?.description || FALLBACK_DESCRIPTIONS[symbol] || `${fullName} is a digital cryptocurrency.`}
                  </ThemedText>
                </View>

                <View style={styles.aboutStatsCard}>
                  <AboutStatRow
                    label="Market cap"
                    value={formatCompactNumber(marketInfo?.marketCap, '₦')}
                    showDivider
                  />
                  <AboutStatRow
                    label="Volume"
                    value={formatCompactNumber(marketInfo?.totalVolume, '₦')}
                    showDivider
                  />
                  <AboutStatRow
                    label="Circulating supply"
                    value={formatCompactNumber(marketInfo?.circulatingSupply)}
                  />
                </View>
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
    fontSize: 16,
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

  // ---- New balance section (matches design: small label + big amount + ngn) ----
  balanceSectionV2: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 16,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabelIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 6,
  },
  balanceLabelV2: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  balanceAmountV2: {
    width: '100%',
    maxWidth: SCREEN_WIDTH - 48,
    alignSelf: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 34,
    paddingHorizontal: 8,
    includeFontPadding: false,
  },
  balanceNgnV2: {
    width: '100%',
    maxWidth: SCREEN_WIDTH - 48,
    alignSelf: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 20,
    includeFontPadding: false,
  },

  // ---- Price card with chart and time-range selector ----
  priceCardV2: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  priceCardHeaderV2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceCardLabelV2: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  priceCardInfoButton: {
    marginLeft: 6,
    padding: 2,
  },
  /** Bounds width so adjustsFontSizeToFit works; long ₦ amounts stay on-screen */
  priceCardAmountWrap: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  priceCardAmountV2: {
    width: '100%',
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.15,
    textAlign: 'center',
    lineHeight: 28,
    includeFontPadding: false,
  },
  priceChangeRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
    width: '100%',
    gap: 4,
  },
  priceChangeAmountV2: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  priceChangePctV2: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  priceChangeSuffixV2: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  chartContainerV2: {
    marginTop: 8,
    marginBottom: 4,
  },
  rangeSelectorV2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    padding: 4,
    marginTop: 12,
  },
  rangeButtonV2: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeButtonV2Active: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  rangeButtonTextV2: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  rangeButtonTextV2Active: {
    color: '#000000',
    fontWeight: '700',
  },

  // ---- About tab (header, description card, stats card) ----
  aboutHeaderV2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 4,
  },
  aboutTitleV2: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.2,
    lineHeight: 30,
    paddingRight: 12,
  },
  aboutLogoV2: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  aboutDescriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  aboutDescriptionText: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 22,
  },
  aboutStatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  aboutStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  aboutStatRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  aboutStatLabel: {
    flexShrink: 0,
    maxWidth: '42%',
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  aboutStatValue: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#000000',
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 19,
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
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 8,
  },
  cryptoOverviewUSD: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  cryptoOverviewNGN: {
    fontSize: 15,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#6B46C1',
    marginBottom: 16,
    textAlign: 'center',
  },
  availableBalanceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#6B46C1',
    textAlign: 'center',
    includeFontPadding: false,
    letterSpacing: 0.4,
    width: '100%',
    paddingHorizontal: 4,
    lineHeight: 34,
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
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.25,
    marginBottom: 6,
    lineHeight: 32,
    width: '100%',
    paddingHorizontal: 2,
    flexShrink: 1,
  },
  cardBalanceNGN: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B46C1',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.25,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 2,
    width: '100%',
    paddingHorizontal: 2,
    flexShrink: 1,
    lineHeight: 22,
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
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  priceValueNGN: {
    fontSize: 18,
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
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 32,
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
    fontSize: 13,
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
  balanceAmountContainer: {
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 70,
    maxHeight: 220,
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
