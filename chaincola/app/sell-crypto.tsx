import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import * as Clipboard from 'expo-clipboard';
import {
  getUserCryptoBalances,
  getCryptoPrice,
  getDisplaySellRateNgnPerUsd,
  formatCryptoBalance,
  syncSolBalanceFromBlockchain,
  creditSolDepositTransaction,
} from '@/lib/crypto-price-service';
import { getSellBtcQuote, getSellEthQuote, getSellSolQuote, getSellXrpQuote, executeSellBtc, executeSellEth, executeSellSol, executeSellXrp, instantSellCrypto } from '@/lib/buy-sell-service';
import InsufficientBalanceModal from '@/components/insufficient-balance-modal';
import AppLoadingIndicator from '@/components/app-loading-indicator';


const cryptoList = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: require('@/assets/images/bitcoin.png') },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: require('@/assets/images/ethereum.png') },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: require('@/assets/images/tether.png') },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: require('@/assets/images/usdc.png') },
  { id: '7', name: 'Solana', symbol: 'SOL', logo: require('@/assets/images/solana.png') },
  { id: '6', name: 'Ripple', symbol: 'XRP', logo: require('@/assets/images/ripple.png') },
];

// Naira logo - use a fallback if image doesn't exist
let nairaLogo: any;
try {
  nairaLogo = require('@/assets/images/naira.png');
} catch {
  // Fallback: use null, we'll show a placeholder
  nairaLogo = null;
}

// USD logo placeholder
let usdLogo: any = null;

const fiatCurrencies = [
  { id: 'NGN', name: 'Nigerian Naira', symbol: 'NGN', logo: nairaLogo },
  { id: 'USD', name: 'US Dollar', symbol: 'USD', logo: usdLogo },
];

export default function SellCryptoScreen() {
  const params = useLocalSearchParams();
  const cryptoId = params.cryptoId as string | undefined;
  const cryptoSymbol = params.crypto as string | undefined;
  const { user } = useAuth();
  
  // Find the initial crypto based on the cryptoId parameter, or crypto symbol, or default to BTC
  let initialCrypto = cryptoList[0]; // Default to BTC
  
  if (cryptoId) {
    // If cryptoId is provided, find by ID
    initialCrypto = cryptoList.find(c => c.id === cryptoId) || cryptoList[0];
  } else if (cryptoSymbol) {
    // If crypto symbol is provided, find by symbol (fallback for compatibility)
    const symbolUpper = cryptoSymbol.toUpperCase();
    initialCrypto = cryptoList.find(c => c.symbol === symbolUpper) || cryptoList[0];
  }
  
  const [selectedCrypto, setSelectedCrypto] = useState(initialCrypto);
  const [selectedFiat, setSelectedFiat] = useState(fiatCurrencies[0]);
  const [cryptoBalance, setCryptoBalance] = useState(0);
  const [fiatAmount, setFiatAmount] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [inputMode, setInputMode] = useState<'crypto' | 'fiat'>('crypto'); // 'crypto' or 'fiat'
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number | null>(null);
  const [usdToNgnRate, setUsdToNgnRate] = useState<number | null>(null);
  const [showCryptoPicker, setShowCryptoPicker] = useState(false);
  const [showFiatPicker, setShowFiatPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncingBalance, setSyncingBalance] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sellResult, setSellResult] = useState<any>(null);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  /** Sell rate per USD (NGN) from pricing engine - USDT sell price */
  const [sellRatePerUsdNgn, setSellRatePerUsdNgn] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace('/(tabs)/wallet');
      return;
    }
    fetchBalance();
    fetchExchangeRate(false);
    const id = setInterval(() => {
      void fetchExchangeRate(true);
    }, 2500);
    return () => clearInterval(id);
  }, [user, selectedCrypto]);

  const fetchBalance = async () => {
    if (!user?.id) return;
    
    try {
      const { balances } = await getUserCryptoBalances(user.id);
      const balance = balances[selectedCrypto.symbol];
      if (balance) {
        setCryptoBalance(parseFloat(balance.balance || '0'));
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const handleSyncBalance = async () => {
    if (!user?.id || selectedCrypto.symbol !== 'SOL') return;
    
    setSyncingBalance(true);
    try {
      // First, trigger deposit detection and reconciliation
      const result = await syncSolBalanceFromBlockchain(user.id);
      
      if (result.success) {
        // Wait a moment for the sync to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Refresh balance after sync
        await fetchBalance();
        Alert.alert('Success', 'SOL balance synced successfully. Your balance should now be updated.');
      } else {
        Alert.alert('Error', result.error || 'Failed to sync balance. Please try again or contact support.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sync balance');
    } finally {
      setSyncingBalance(false);
    }
  };

  const fetchExchangeRate = async (forceRefresh = false) => {
    if (!forceRefresh) {
      setFetchingPrice(true);
      setPriceError(null);
    }
    try {
      const [cryptoRes, usdtRes] = await Promise.all([
        getCryptoPrice(selectedCrypto.symbol, { forceRefresh }),
        getCryptoPrice('USDT', { forceRefresh }),
      ]);
      const { price, error } = cryptoRes;
      if (error || !price) {
        setPriceError(`No live rate for ${selectedCrypto.symbol}`);
        setExchangeRate(null);
        setSellRatePerUsdNgn(null);
        return;
      }
      const sellRateNgn = price.bid ?? price.price_ngn ?? 0;
      if (sellRateNgn > 0) {
        setExchangeRate(sellRateNgn);
        setPriceError(null);
        const usdToNgn = getDisplaySellRateNgnPerUsd(usdtRes.price ?? null);
        setExchangeRateUSD(sellRateNgn / usdToNgn);
        setUsdToNgnRate(usdToNgn);
        setSellRatePerUsdNgn(usdToNgn);
      } else {
        setPriceError(`No sell rate for ${selectedCrypto.symbol}`);
        setExchangeRate(null);
        setSellRatePerUsdNgn(null);
      }
    } catch (error: any) {
      setPriceError(error?.message || 'Error getting exchange rate');
      setExchangeRate(null);
      setSellRatePerUsdNgn(null);
    } finally {
      if (!forceRefresh) {
        setFetchingPrice(false);
      }
    }
  };

  // Calculate crypto amount when fiat amount changes (if input mode is fiat)
  useEffect(() => {
    if (inputMode === 'fiat' && fiatAmount) {
      const fiatValue = parseFloat(fiatAmount.replace(/[₦$,]/g, ''));
      if (!isNaN(fiatValue) && fiatValue > 0) {
        // Use USD rate if USD is selected, otherwise use NGN rate
        const rate = selectedFiat.id === 'USD' ? exchangeRateUSD : exchangeRate;
        if (rate) {
          const cryptoValue = fiatValue / rate;
          setCryptoAmount(cryptoValue.toFixed(8));
        } else {
          setCryptoAmount('');
        }
      } else {
        setCryptoAmount('');
      }
    }
  }, [fiatAmount, exchangeRate, exchangeRateUSD, selectedFiat, inputMode]);

  // Calculate fiat amount when crypto amount changes (if input mode is crypto)
  useEffect(() => {
    if (inputMode === 'crypto' && cryptoAmount) {
      const cryptoValue = parseFloat(cryptoAmount);
      if (!isNaN(cryptoValue) && cryptoValue > 0) {
        // Use USD rate if USD is selected, otherwise use NGN rate
        const rate = selectedFiat.id === 'USD' ? exchangeRateUSD : exchangeRate;
        if (rate) {
          const fiatValue = cryptoValue * rate;
          setFiatAmount(fiatValue.toFixed(2));
        } else {
          setFiatAmount('');
        }
      } else {
        setFiatAmount('');
      }
    }
  }, [cryptoAmount, exchangeRate, exchangeRateUSD, selectedFiat, inputMode]);

  const handleMaxAmount = () => {
    if (inputMode === 'crypto') {
      // Set max crypto amount
      setCryptoAmount(cryptoBalance.toFixed(8));
    } else {
      // Set max fiat amount
      const rate = selectedFiat.id === 'USD' ? exchangeRateUSD : exchangeRate;
      if (rate && cryptoBalance > 0) {
        const maxFiat = cryptoBalance * rate;
        setFiatAmount(maxFiat.toFixed(2));
      }
    }
  };

  const handleGetQuote = async () => {
    // Validate based on input mode
    if (inputMode === 'crypto') {
      if (!cryptoAmount || parseFloat(cryptoAmount) <= 0) {
        Alert.alert('Error', 'Please enter a valid crypto amount');
        return;
      }
    } else {
      if (!fiatAmount || parseFloat(fiatAmount) <= 0) {
        Alert.alert('Error', 'Please enter a valid amount');
        return;
      }
    }

    const cryptoValue = parseFloat(cryptoAmount);
    if (cryptoValue > cryptoBalance) {
      setShowInsufficientBalanceModal(true);
      return;
    }

    // Use instant sell - no need for quote, execute directly
    setLoading(true);
    try {
      // Get current price from exchange rate
      // If USD is selected, convert USD price to NGN using the exchange rate
      let currentPrice: number | null = null;
      if (selectedFiat.id === 'USD' && exchangeRateUSD) {
        // User entered USD amount, convert USD price to NGN price
        // exchangeRateUSD is price in USD, exchangeRate is price in NGN
        // If we have both, use NGN price directly, otherwise convert USD to NGN
        if (exchangeRate && usdToNgnRate) {
          currentPrice = exchangeRateUSD * usdToNgnRate;
        } else if (exchangeRate) {
          // Fallback: use NGN price directly
          currentPrice = exchangeRate;
        } else {
          // Last resort: estimate USD to NGN conversion (1650 rate)
          currentPrice = exchangeRateUSD * 1650;
        }
      } else {
        // NGN selected, use NGN price directly
        currentPrice = exchangeRate;
      }

      if (!currentPrice || currentPrice <= 0) {
        console.error('❌ Invalid current price:', {
          currentPrice,
          exchangeRate,
          exchangeRateUSD,
          selectedFiat: selectedFiat.id,
          cryptoSymbol: selectedCrypto.symbol,
        });
        
        // Try again for a live sell quote (bid or mid)
        try {
          const { price: retryPrice } = await getCryptoPrice(selectedCrypto.symbol, { forceRefresh: true });
          const sellRateNgn = retryPrice?.bid ?? retryPrice?.price_ngn ?? 0;
          if (sellRateNgn > 0) {
            setExchangeRate(sellRateNgn);
            setExchangeRateUSD(sellRateNgn / 1650);
            setUsdToNgnRate(1650);
            currentPrice = selectedFiat.id === 'USD' ? sellRateNgn / 1650 : sellRateNgn;
          }
          if (!currentPrice || currentPrice <= 0) {
            throw new Error('No live price available');
          }
        } catch (retryError: any) {
          console.error('Failed to fetch price on retry:', retryError);
          Alert.alert(
            'Price Unavailable',
            `Unable to get current price for ${selectedCrypto.symbol}. Please check your internet connection and try again.`,
            [
              { text: 'Retry', onPress: () => {
                fetchExchangeRate();
                setTimeout(() => handleGetQuote(), 2000);
              }},
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          setLoading(false);
          return;
        }
      }

      // Apply rate first, then platform fee: at rate → NGN; then fee (1%) deducted
      const totalNgnBeforeFee = cryptoValue * currentPrice;
      const platformFee = totalNgnBeforeFee * 0.01; // 1% platform fee
      const ngnToReceive = totalNgnBeforeFee - platformFee;

      setQuote({
        success: true,
        [`${selectedCrypto.symbol.toLowerCase()}_amount`]: cryptoAmount,
        exchange_rate: currentPrice.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        platform_fee_percentage: 0.01,
        final_ngn_payout: ngnToReceive.toFixed(2),
        instant_sell: true,
        price_per_unit: currentPrice,
      });
      setShowConfirmModal(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to prepare sell');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSell = async () => {
    if (!quote) {
      Alert.alert('Error', 'No quote available');
      return;
    }

    setShowConfirmModal(false);
    setExecuting(true);

    try {
      const cryptoValue = parseFloat(cryptoAmount);
      const pricePerUnit = quote.price_per_unit || exchangeRate || 0;

      if (!pricePerUnit || pricePerUnit <= 0) {
        Alert.alert('Error', 'Invalid price. Please try again.');
        setExecuting(false);
        return;
      }

      // Use instant sell for all cryptocurrencies
      const result = await instantSellCrypto({
        asset: selectedCrypto.symbol,
        amount: parseFloat(cryptoAmount),
      });

      if (result.success && result.ngn_amount !== undefined) {
        const sellResultData = {
          cryptoAmount: cryptoAmount,
          cryptoSymbol: selectedCrypto.symbol,
          ngnAmount: result.ngn_amount.toString(),
          transactionHash: `instant_sell_${Date.now()}`,
        };
        setSellResult(sellResultData);
        setShowSuccessModal(true);
        fetchBalance();
        
        // Push notification is sent by the backend function
      } else {
        Alert.alert('Error', result.error || 'Failed to execute sell');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to execute sell');
    } finally {
      setExecuting(false);
    }
  };


  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Sell</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {/* Balance Section */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceSection}>
              <View style={styles.balanceHeader}>
                <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
                {selectedCrypto.symbol === 'SOL' && (
                  <TouchableOpacity
                    onPress={handleSyncBalance}
                    disabled={syncingBalance}
                    style={styles.syncButton}
                  >
                    {syncingBalance ? (
                      <AppLoadingIndicator size="small" />
                    ) : (
                      <>
                        <MaterialIcons name="sync" size={16} color="#6B46C1" />
                        <ThemedText style={styles.syncButtonText}>Sync</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.balanceAmountContainer}>
                <ThemedText 
                  style={styles.balanceAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {formatCryptoBalance(cryptoBalance, selectedCrypto.symbol)} {selectedCrypto.symbol}
                </ThemedText>
              </View>
              {exchangeRate && cryptoBalance > 0 && (
                <View style={styles.balanceValueNGN}>
                  <ThemedText 
                    style={styles.balanceValueNGNText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    ≈ ₦{(cryptoBalance * exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {exchangeRateUSD && ` / $${(cryptoBalance * exchangeRateUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </ThemedText>
                </View>
              )}
            </View>
            {fetchingPrice && !exchangeRate && (
              <View style={styles.exchangeRateBadge}>
                <AppLoadingIndicator size="small" style={{ marginRight: 8 }} />
                <ThemedText style={styles.exchangeRateText}>
                  Fetching price...
                </ThemedText>
              </View>
            )}
            {priceError && !exchangeRate && (
              <View style={styles.exchangeRateBadge}>
                <ThemedText style={[styles.exchangeRateText, { color: '#EF4444' }]}>
                  {priceError}
                </ThemedText>
              </View>
            )}
            {exchangeRate && sellRatePerUsdNgn != null && (
              <View style={styles.exchangeRateBadge}>
                <ThemedText style={styles.exchangeRateText}>
                  Sell rate: 1 USD = ₦{sellRatePerUsdNgn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              </View>
            )}
          </View>

          {/* From Section */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>From</ThemedText>
            <TouchableOpacity
              style={styles.currencySelector}
              onPress={() => setShowCryptoPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.currencySelectorContent}>
                <Image
                  source={selectedCrypto.logo}
                  style={styles.currencyLogo}
                  contentFit="contain"
                />
                <View style={styles.currencyInfo}>
                  <ThemedText style={styles.currencySymbol}>{selectedCrypto.symbol}</ThemedText>
                  <ThemedText 
                    style={styles.currencyBalance}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {formatCryptoBalance(cryptoBalance, selectedCrypto.symbol)}
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>

            {/* Input Mode Toggle */}
            <View style={styles.inputModeToggle}>
              <TouchableOpacity
                style={[styles.inputModeButton, inputMode === 'crypto' && styles.inputModeButtonActive]}
                onPress={() => {
                  setInputMode('crypto');
                  setFiatAmount('');
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.inputModeText, inputMode === 'crypto' && styles.inputModeTextActive]}>
                  Amount ({selectedCrypto.symbol})
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inputModeButton, inputMode === 'fiat' && styles.inputModeButtonActive]}
                onPress={() => {
                  setInputMode('fiat');
                  setCryptoAmount('');
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.inputModeText, inputMode === 'fiat' && styles.inputModeTextActive]}>
                  Value ({selectedFiat.symbol})
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Amount Input Section */}
            {inputMode === 'crypto' ? (
              <View style={styles.amountSection}>
                <View style={styles.amountInputContainer}>
                  <View style={styles.amountInputWrapper}>
                    <ThemedText style={styles.amountInputPrefix}>
                      {selectedCrypto.symbol}
                    </ThemedText>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00000000"
                      placeholderTextColor="#9CA3AF"
                      value={cryptoAmount}
                      onChangeText={(text) => {
                        // Allow only numbers and decimal point
                        const cleaned = text.replace(/[^0-9.]/g, '');
                        // Ensure only one decimal point
                        const parts = cleaned.split('.');
                        const formatted = parts.length > 2 
                          ? parts[0] + '.' + parts.slice(1).join('')
                          : cleaned;
                        setCryptoAmount(formatted);
                      }}
                      keyboardType="decimal-pad"
                      editable={!loading && !executing}
                    />
                  </View>
                  <View style={styles.amountInputActions}>
                    <TouchableOpacity
                      style={styles.maxButton}
                      onPress={handleMaxAmount}
                      disabled={loading || executing || cryptoBalance === 0}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.maxButtonText}>Max</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.amountSection}>
                <View style={styles.amountInputContainer}>
                  <View style={styles.amountInputWrapper}>
                    <ThemedText style={styles.amountInputPrefix}>
                      {selectedFiat.id === 'USD' ? '$' : '₦'}
                    </ThemedText>
                    <TextInput
                      style={styles.amountInput}
                      placeholder={selectedFiat.id === 'USD' ? '1' : '1'}
                      placeholderTextColor="#9CA3AF"
                      value={fiatAmount}
                      onChangeText={(text) => {
                        // Allow only numbers and decimal point
                        const cleaned = text.replace(/[^0-9.]/g, '');
                        // Ensure only one decimal point
                        const parts = cleaned.split('.');
                        const formatted = parts.length > 2 
                          ? parts[0] + '.' + parts.slice(1).join('')
                          : cleaned;
                        setFiatAmount(formatted);
                      }}
                      keyboardType="decimal-pad"
                      editable={!loading && !executing}
                    />
                  </View>
                  <View style={styles.amountInputActions}>
                    <TouchableOpacity
                      style={styles.maxButton}
                      onPress={handleMaxAmount}
                      disabled={loading || executing || cryptoBalance === 0}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.maxButtonText}>Max</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Currency Selector for Fiat Input */}
                <TouchableOpacity
                  style={styles.inputCurrencySelector}
                  onPress={() => setShowFiatPicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.inputCurrencyContent}>
                    {selectedFiat.logo ? (
                      <Image
                        source={selectedFiat.logo}
                        style={styles.inputCurrencyLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={[styles.inputCurrencyLogo, styles.currencyLogoPlaceholder]}>
                        <ThemedText style={styles.currencyLogoText}>
                          {selectedFiat.id === 'USD' ? '$' : '₦'}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText style={styles.inputCurrencySymbol}>{selectedFiat.symbol}</ThemedText>
                    <MaterialIcons name="arrow-drop-down" size={20} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Equivalent Display */}
            {inputMode === 'crypto' && cryptoAmount && parseFloat(cryptoAmount) > 0 && (
              <ThemedText style={styles.cryptoEquivalent}>
                ≈ {selectedFiat.id === 'USD' ? '$' : '₦'}{fiatAmount && parseFloat(fiatAmount) > 0 ? parseFloat(fiatAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </ThemedText>
            )}
            {inputMode === 'fiat' && fiatAmount && parseFloat(fiatAmount) > 0 && (
              <ThemedText style={styles.cryptoEquivalent}>
                ≈ {parseFloat(cryptoAmount).toFixed(8)} {selectedCrypto.symbol}
              </ThemedText>
            )}
          </View>

          {/* Swap Icon */}
          <View style={styles.swapContainer}>
            <View style={styles.swapIcon}>
              <MaterialIcons name="swap-vert" size={24} color="#6B46C1" />
            </View>
          </View>

          {/* You Receive Section */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>You receive</ThemedText>
            <TouchableOpacity
              style={styles.currencySelector}
              onPress={() => {}}
              activeOpacity={1}
              disabled
            >
              <View style={styles.currencySelectorContent}>
                {nairaLogo ? (
                  <Image
                    source={nairaLogo}
                    style={styles.currencyLogo}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.currencyLogo, styles.currencyLogoPlaceholder]}>
                    <ThemedText style={styles.currencyLogoText}>₦</ThemedText>
                  </View>
                )}
                <ThemedText style={styles.currencySymbol}>NGN</ThemedText>
              </View>
            </TouchableOpacity>

            <View style={styles.receiveAmountContainer}>
              <ThemedText style={styles.receiveAmount}>
                {(() => {
                  if (!fiatAmount || parseFloat(fiatAmount) <= 0) {
                    return '₦0.00';
                  }
                  const amount = parseFloat(fiatAmount);
                  // If USD is selected, convert to NGN
                  if (selectedFiat.id === 'USD' && usdToNgnRate) {
                    const ngnAmount = amount * usdToNgnRate;
                    return `₦${ngnAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  }
                  // If NGN is selected, show as is
                  return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                })()}
              </ThemedText>
            </View>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              ((inputMode === 'crypto' && !cryptoAmount) || (inputMode === 'fiat' && !fiatAmount) || loading || executing) && styles.continueButtonDisabled,
            ]}
            onPress={handleGetQuote}
            disabled={(inputMode === 'crypto' && !cryptoAmount) || (inputMode === 'fiat' && !fiatAmount) || loading || executing}
            activeOpacity={0.8}
          >
            {loading ? (
              <AppLoadingIndicator size="small" variant="onPrimary" />
            ) : (
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Crypto Picker Modal */}
      <Modal
        visible={showCryptoPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCryptoPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select Cryptocurrency</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCryptoPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.cryptoList}>
              {cryptoList.map((crypto) => (
                <TouchableOpacity
                  key={crypto.id}
                  style={[
                    styles.cryptoListItem,
                    selectedCrypto.id === crypto.id && styles.cryptoListItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCrypto(crypto);
                    setShowCryptoPicker(false);
                    setFiatAmount('');
                    setCryptoAmount('');
                  }}
                  activeOpacity={0.7}
                >
                  <Image
                    source={crypto.logo}
                    style={styles.cryptoListItemLogo}
                    contentFit="contain"
                  />
                  <View style={styles.cryptoListItemInfo}>
                    <ThemedText style={styles.cryptoListItemName}>{crypto.name}</ThemedText>
                    <ThemedText style={styles.cryptoListItemSymbol}>{crypto.symbol}</ThemedText>
                  </View>
                  {selectedCrypto.id === crypto.id && (
                    <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fiat Picker Modal */}
      <Modal
        visible={showFiatPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFiatPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select Currency</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowFiatPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.cryptoList}>
              {fiatCurrencies.map((fiat) => (
                <TouchableOpacity
                  key={fiat.id}
                  style={[
                    styles.cryptoListItem,
                    selectedFiat.id === fiat.id && styles.cryptoListItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedFiat(fiat);
                    setShowFiatPicker(false);
                    // Clear amounts when currency changes to recalculate
                    setFiatAmount('');
                    setCryptoAmount('');
                  }}
                  activeOpacity={0.7}
                >
                  {fiat.logo ? (
                    <Image
                      source={fiat.logo}
                      style={styles.cryptoListItemLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={[styles.cryptoListItemLogo, styles.currencyLogoPlaceholder]}>
                      <ThemedText style={styles.currencyLogoText}>
                        {fiat.id === 'USD' ? '$' : '₦'}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.cryptoListItemInfo}>
                    <ThemedText style={styles.cryptoListItemName}>{fiat.name}</ThemedText>
                    <ThemedText style={styles.cryptoListItemSymbol}>{fiat.symbol}</ThemedText>
                  </View>
                  {selectedFiat.id === fiat.id && (
                    <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sell Summary Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.summaryModal}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryIconContainer}>
                <MaterialIcons name="sell" size={32} color="#6B46C1" />
              </View>
              <ThemedText style={styles.summaryModalTitle}>Sell Summary</ThemedText>
              <ThemedText style={styles.summaryModalSubtitle}>Review your sell order details</ThemedText>
            </View>
            
            {quote && (
              <View style={styles.summaryDetails}>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryRowLeft}>
                      <MaterialIcons name="account-balance-wallet" size={20} color="#6B7280" />
                      <ThemedText style={styles.summaryLabel}>Selling</ThemedText>
                    </View>
                    <View style={styles.summaryRowRight}>
                      <ThemedText style={styles.summaryValue}>
                        {quote.btc_amount || quote.eth_amount || quote.sol_amount || quote.xrp_amount} {selectedCrypto.symbol}
                      </ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.summaryDivider} />
                  
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryRowLeft}>
                      <MaterialIcons name="attach-money" size={20} color="#6B7280" />
                      <ThemedText style={styles.summaryLabel}>You'll Receive</ThemedText>
                    </View>
                    <View style={styles.summaryRowRight}>
                      <ThemedText style={[styles.summaryValue, styles.summaryValueHighlight]}>
                        ₦{parseFloat(quote.final_ngn_payout || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </ThemedText>
                    </View>
                  </View>
                  
                  {quote.exchange_rate && (
                    <>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryRowLeft}>
                          <MaterialIcons name="swap-vert" size={20} color="#6B7280" />
                          <ThemedText style={styles.summaryLabel}>Exchange Rate</ThemedText>
                        </View>
                        <View style={styles.summaryRowRight}>
                          <ThemedText style={styles.summaryValue}>
                            1 {selectedCrypto.symbol} = ₦{quote.exchange_rate}
                          </ThemedText>
                        </View>
                      </View>
                    </>
                  )}
                  
                  {quote.platform_fee && (
                    <>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryRowLeft}>
                          <MaterialIcons name="percent" size={20} color="#6B7280" />
                          <ThemedText style={styles.summaryLabel}>Platform Fee</ThemedText>
                        </View>
                        <View style={styles.summaryRowRight}>
                          <ThemedText style={styles.summaryValue}>
                            ₦{parseFloat(quote.platform_fee || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({quote.platform_fee_percentage * 100}%)
                          </ThemedText>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
            
            <View style={styles.summaryButtons}>
              <TouchableOpacity
                style={styles.summaryCancelButton}
                onPress={() => setShowConfirmModal(false)}
                disabled={executing}
              >
                <ThemedText style={styles.summaryCancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sellNowButton, executing && styles.sellNowButtonDisabled]}
                onPress={handleConfirmSell}
                disabled={executing}
              >
                {executing ? (
                  <AppLoadingIndicator size="small" variant="onPrimary" />
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.sellNowButtonText}>Sell Now</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowSuccessModal(false);
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="check-circle" size={64} color="#10B981" />
              </View>
            </View>
            
            <ThemedText style={styles.successModalTitle}>Sell Successful!</ThemedText>
            <ThemedText style={styles.successModalSubtitle}>
              Your cryptocurrency has been sold successfully
            </ThemedText>
            
            {sellResult && (
              <View style={styles.successDetails}>
                <View style={styles.successCard}>
                  <View style={styles.successRow}>
                    <ThemedText style={styles.successLabel}>Amount Sold</ThemedText>
                    <ThemedText style={styles.successValue}>
                      {sellResult.cryptoAmount} {sellResult.cryptoSymbol}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.successDivider} />
                  
                  <View style={styles.successRow}>
                    <ThemedText style={styles.successLabel}>NGN Received</ThemedText>
                    <ThemedText style={[styles.successValue, styles.successValueHighlight]}>
                      ₦{parseFloat(sellResult.ngnAmount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                  
                  {sellResult.transactionHash && (
                    <>
                      <View style={styles.successDivider} />
                      <View style={styles.successRow}>
                        <ThemedText style={styles.successLabel}>Transaction Hash</ThemedText>
                        <TouchableOpacity
                          onPress={() => {
                            Clipboard.setStringAsync(sellResult.transactionHash);
                            Alert.alert('Copied', 'Transaction hash copied to clipboard');
                          }}
                        >
                          <ThemedText style={styles.successHash} numberOfLines={1}>
                            {sellResult.transactionHash.substring(0, 12)}...
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
            
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setShowSuccessModal(false);
                router.back();
              }}
            >
              <ThemedText style={styles.successButtonText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalanceModal}
        onClose={() => setShowInsufficientBalanceModal(false)}
        availableBalance={formatCryptoBalance(cryptoBalance, selectedCrypto.symbol)}
        requiredAmount={cryptoAmount}
        cryptoSymbol={selectedCrypto.symbol}
        currency="crypto"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#11181C',
  },
  placeholder: {
    width: 40,
  },
  balanceCard: {
    backgroundColor: '#F3E8FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    width: '100%',
    overflow: 'visible',
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3E8FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  syncButtonText: {
    fontSize: 12,
    color: '#6B46C1',
    fontWeight: '600',
  },
  balanceAmountContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
    minHeight: 40,
    maxWidth: '100%',
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#11181C',
    letterSpacing: 0.2,
    textAlign: 'center',
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  balanceValueNGN: {
    marginTop: 2,
  },
  balanceValueNGNText: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: '500',
  },
  exchangeRateBadge: {
    backgroundColor: '#E9D5FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'center',
  },
  exchangeRateText: {
    fontSize: 10,
    color: '#6B46C1',
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  currencySelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currencySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: 2,
    minWidth: 0,
  },
  currencyBalance: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  currencyLogo: {
    width: 36,
    height: 36,
  },
  currencyLogoPlaceholder: {
    backgroundColor: '#10B981',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  currencyLogoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 2,
    flex: 1,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  amountInputPrefix: {
    fontSize: 22,
    fontWeight: '600',
    color: '#11181C',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#11181C',
    paddingVertical: 12,
  },
  inputCurrencySelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 80,
  },
  inputCurrencyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputCurrencyLogo: {
    width: 24,
    height: 24,
  },
  inputCurrencySymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  amountInputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  maxButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  maxButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  cryptoEquivalent: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    marginLeft: 16,
  },
  swapContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  swapIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveAmountContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  receiveAmount: {
    fontSize: 22,
    fontWeight: '600',
    color: '#11181C',
  },
  inputModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  inputModeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputModeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputModeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  inputModeTextActive: {
    color: '#6B46C1',
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#6B46C1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  continueButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#11181C',
  },
  closeButton: {
    padding: 4,
  },
  cryptoList: {
    maxHeight: 400,
  },
  cryptoListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cryptoListItemSelected: {
    backgroundColor: '#F9FAFB',
  },
  cryptoListItemLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  cryptoListItemInfo: {
    flex: 1,
  },
  cryptoListItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 4,
  },
  cryptoListItemSymbol: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    margin: 20,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 20,
    textAlign: 'center',
  },
  confirmDetails: {
    marginBottom: 24,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  confirmLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmValueHighlight: {
    fontSize: 18,
    color: '#6B46C1',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Summary Modal Styles
  summaryModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    margin: 20,
    maxWidth: '100%',
  },
  summaryHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  summaryModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  summaryDetails: {
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  summaryRowRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    textAlign: 'right',
  },
  summaryValueHighlight: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: 'bold',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  summaryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  summaryCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  sellNowButton: {
    flex: 1,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sellNowButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sellNowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Success Modal Styles
  successModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    margin: 20,
    maxWidth: '100%',
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 8,
    textAlign: 'center',
  },
  successModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  successDetails: {
    width: '100%',
    marginBottom: 24,
  },
  successCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  successLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  successValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  successValueHighlight: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: 'bold',
  },
  successDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  successHash: {
    fontSize: 12,
    color: '#6B46C1',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  successButton: {
    width: '100%',
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
