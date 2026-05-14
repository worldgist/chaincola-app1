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
  getCryptoPrice,
  formatCryptoBalance,
  formatNgnValue,
  getDisplayBuyRateNgnPerUsd,
} from '@/lib/crypto-price-service';
import { getNgnBalance } from '@/lib/wallet-service';
import { instantBuyCrypto, isTreasuryInventoryShortageError, humanizeInstantBuyNetworkError } from '@/lib/buy-sell-service';
import InsufficientBalanceModal from '@/components/insufficient-balance-modal';
import AppLoadingIndicator from '@/components/app-loading-indicator';

const cryptoList = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: require('@/assets/images/bitcoin.png') },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: require('@/assets/images/ethereum.png') },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: require('@/assets/images/tether.png') },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: require('@/assets/images/usdc.png') },
  { id: '6', name: 'Ripple', symbol: 'XRP', logo: require('@/assets/images/ripple.png') },
  { id: '7', name: 'Solana', symbol: 'SOL', logo: require('@/assets/images/solana.png') },
];

// Naira logo - use a fallback if image doesn't exist
let nairaLogo: any;
try {
  nairaLogo = require('@/assets/images/naira.png');
} catch {
  nairaLogo = null;
}

/** Clear copy when Edge returns insufficient system_* inventory (amounts parsed from API text when present). */
function treasuryInventoryBuyUserMessage(symbol: string, apiError: string): string {
  const avail = apiError.match(/Available:\s*([\d.,]+)\s*(\w+)/i);
  const req = apiError.match(/Requested:\s*([\d.,]+)\s*(\w+)/i);
  const intro = `${symbol} instant buy pulls from the platform treasury (hot ledger), not an on-chain transfer. There is not enough of this asset on the books for this order.`;
  if (avail && req) {
    return (
      `${intro}\n\n• Treasury has about ${avail[1]} ${avail[2]}\n• Your order needs about ${req[1]} ${req[2]}\n\nTry a smaller NGN amount, choose another asset, or ask an admin to add inventory in Admin → Wallet management → System wallets → Fund system ledger.`
    );
  }
  return `${intro} Try a smaller amount or contact support.`;
}

export default function BuyCryptoScreen() {
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
  const [ngnBalance, setNgnBalance] = useState(0);
  const [ngnAmount, setNgnAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  /** NGN per 1 USD from USDT buy quote — same idea as sell screen’s “Sell rate: 1 USD = ₦…” */
  const [buyRatePerUsdNgn, setBuyRatePerUsdNgn] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [showCryptoPicker, setShowCryptoPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [buyResult, setBuyResult] = useState<any>(null);
  const [estimatedCrypto, setEstimatedCrypto] = useState<number | null>(null);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
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

  useEffect(() => {
    // Apply rate first, then platform fee: crypto at rate = ngn/rate; fee = 1%; you receive crypto * (1 - fee%)
    if (exchangeRate && ngnAmount && parseFloat(ngnAmount) > 0) {
      const amount = parseFloat(ngnAmount);
      const cryptoAtRate = amount / exchangeRate;
      const feePercentage = 0.01;
      const estimated = cryptoAtRate * (1 - feePercentage);
      setEstimatedCrypto(estimated);
    } else {
      setEstimatedCrypto(null);
    }
  }, [ngnAmount, exchangeRate]);

  const fetchBalance = async () => {
    if (!user?.id) return;
    try {
      setNgnBalance(await getNgnBalance(user.id));
    } catch (error) {
      console.error('Error fetching NGN balance:', error);
      setNgnBalance(0);
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
        console.warn(`⚠️ No buy rate for ${selectedCrypto.symbol}`);
        setPriceError(`No rate for ${selectedCrypto.symbol}`);
        setExchangeRate(null);
        setBuyRatePerUsdNgn(null);
        return;
      }
      const buyRateNgn = price.ask ?? price.price_ngn ?? 0;
      if (buyRateNgn > 0) {
        setExchangeRate(buyRateNgn);
        setPriceError(null);
        const perUsd = getDisplayBuyRateNgnPerUsd(usdtRes.price ?? null);
        setBuyRatePerUsdNgn(perUsd);
      } else {
        setExchangeRate(null);
        setBuyRatePerUsdNgn(null);
        setPriceError(`No buy rate for ${selectedCrypto.symbol}`);
      }
    } catch (error: any) {
      console.error('Error getting exchange rate:', error);
      setPriceError(error?.message || 'Error getting exchange rate');
      setExchangeRate(null);
      setBuyRatePerUsdNgn(null);
    } finally {
      if (!forceRefresh) {
        setFetchingPrice(false);
      }
    }
  };

  const handleMaxAmount = () => {
    setNgnAmount(ngnBalance.toFixed(2));
  };

  const handleGetQuote = async () => {
    if (!ngnAmount || parseFloat(ngnAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid NGN amount');
      return;
    }

    const amount = parseFloat(ngnAmount);
    if (amount > ngnBalance) {
      setShowInsufficientBalanceModal(true);
      return;
    }

    if (amount < 100) {
      Alert.alert('Error', 'Minimum purchase amount is ₦100');
      return;
    }

    if (!exchangeRate || exchangeRate <= 0) {
      Alert.alert('Error', 'Unable to get current price. Please try again.');
      return;
    }

    // Apply rate first, then platform fee: at rate → crypto; then fee (1%) deducted from value
    const cryptoAtRate = amount / exchangeRate;
    const platformFeeNgn = amount * 0.01; // 1% platform fee (in NGN)
    const cryptoToReceive = cryptoAtRate * (1 - 0.01);

    setQuote({
      success: true,
      ngn_amount: amount,
      exchange_rate: exchangeRate.toFixed(2),
      platform_fee: platformFeeNgn.toFixed(2),
      platform_fee_percentage: 0.01,
      crypto_amount: cryptoToReceive.toFixed(8),
      instant_buy: true,
      price_per_unit: exchangeRate,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmBuy = async () => {
    if (!quote) {
      Alert.alert('Error', 'No quote available');
      return;
    }

    const requiredNgn = parseFloat(ngnAmount);
    if (requiredNgn > ngnBalance) {
      setShowConfirmModal(false);
      setShowInsufficientBalanceModal(true);
      return;
    }

    setShowConfirmModal(false);
    setExecuting(true);

    try {
      const result = await instantBuyCrypto({
        asset: selectedCrypto.symbol as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL',
        ngn_amount: requiredNgn,
      });

      if (result.success && result.crypto_amount !== undefined) {
        const buyResultData = {
          cryptoAmount: result.crypto_amount.toString(),
          cryptoSymbol: selectedCrypto.symbol,
          ngnAmount: ngnAmount,
          transactionId: (result as any).transaction_id || result.balances?.transaction_id || `instant_buy_${Date.now()}`,
          rate: result.rate,
          feePercentage: result.fee_percentage,
        };
        setBuyResult(buyResultData);
        setShowSuccessModal(true);
        await fetchBalance();
      } else {
        const err = result.error || 'Failed to execute buy';
        if (isTreasuryInventoryShortageError(err)) {
          Alert.alert('Temporarily unavailable', treasuryInventoryBuyUserMessage(selectedCrypto.symbol, err));
        } else if (err.toLowerCase().includes('insufficient')) {
          await fetchBalance();
          setShowInsufficientBalanceModal(true);
        } else if (err.includes('Could not reach ChainCola')) {
          Alert.alert('Connection problem', err);
        } else {
          Alert.alert('Error', err);
        }
      }
    } catch (error: any) {
      const err = humanizeInstantBuyNetworkError(error);
      if (isTreasuryInventoryShortageError(err)) {
        Alert.alert('Temporarily unavailable', treasuryInventoryBuyUserMessage(selectedCrypto.symbol, err));
      } else if (err.toLowerCase().includes('insufficient')) {
        fetchBalance().then(() => setShowInsufficientBalanceModal(true));
      } else if (err.includes('Could not reach ChainCola')) {
        Alert.alert('Connection problem', err);
      } else {
        Alert.alert('Error', err);
      }
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
            <ThemedText style={styles.headerTitle}>Buy</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {/* Balance Section */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceSection}>
              <View style={styles.balanceHeader}>
                <ThemedText style={styles.balanceLabel}>Available NGN Balance</ThemedText>
              </View>
              <View style={styles.balanceAmountContainer}>
                <ThemedText 
                  style={styles.balanceAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  ₦{ngnBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              </View>
            </View>
            {fetchingPrice && !exchangeRate && (
              <View style={styles.exchangeRateBadge}>
                <AppLoadingIndicator size="small" style={{ marginRight: 8 }} />
                <ThemedText style={styles.exchangeRateText}>Fetching price...</ThemedText>
              </View>
            )}
            {priceError && !exchangeRate && (
              <View style={styles.exchangeRateBadge}>
                <ThemedText style={[styles.exchangeRateText, { color: '#EF4444' }]}>{priceError}</ThemedText>
              </View>
            )}
            {exchangeRate && buyRatePerUsdNgn != null && (
              <View style={styles.exchangeRateBadge}>
                <ThemedText style={styles.exchangeRateText}>
                  Buy rate: 1 USD = ₦
                  {buyRatePerUsdNgn.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </ThemedText>
              </View>
            )}
          </View>

          {/* From Section - NGN */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Spending</ThemedText>
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
                <View style={styles.currencyInfo}>
                  <ThemedText style={styles.currencySymbol}>NGN</ThemedText>
                  <ThemedText style={styles.currencyBalance}>
                    Nigerian Naira
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>

            {/* Amount Input Section */}
            <View style={styles.amountSection}>
              <View style={styles.amountInputContainer}>
                <View style={styles.amountInputWrapper}>
                  <ThemedText style={styles.amountInputPrefix}>₦</ThemedText>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    value={ngnAmount}
                    onChangeText={(text) => {
                      // Allow only numbers and decimal point
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      // Ensure only one decimal point
                      const parts = cleaned.split('.');
                      const formatted = parts.length > 2 
                        ? parts[0] + '.' + parts.slice(1).join('')
                        : cleaned;
                      setNgnAmount(formatted);
                    }}
                    keyboardType="decimal-pad"
                    editable={!loading && !executing}
                  />
                </View>
                <View style={styles.amountInputActions}>
                  <TouchableOpacity
                    style={styles.maxButton}
                    onPress={handleMaxAmount}
                    disabled={loading || executing || ngnBalance === 0}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.maxButtonText}>Max</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Estimated Crypto Display */}
            {estimatedCrypto !== null && exchangeRate && (
              <ThemedText style={styles.cryptoEquivalent}>
                ≈ {formatCryptoBalance(estimatedCrypto, selectedCrypto.symbol)} {selectedCrypto.symbol}
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
            <ThemedText style={styles.sectionLabel}>You'll Receive</ThemedText>
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
                  <ThemedText style={styles.currencyBalance}>
                    {selectedCrypto.name}
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.receiveAmountContainer}>
              <ThemedText style={styles.receiveAmount}>
                {estimatedCrypto !== null 
                  ? `${formatCryptoBalance(estimatedCrypto, selectedCrypto.symbol)} ${selectedCrypto.symbol}`
                  : `0.00 ${selectedCrypto.symbol}`
                }
              </ThemedText>
            </View>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              (!ngnAmount || loading || executing) && styles.continueButtonDisabled,
            ]}
            onPress={handleGetQuote}
            disabled={!ngnAmount || loading || executing}
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
                    setNgnAmount('');
                    fetchExchangeRate();
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

      {/* Buy Summary Modal */}
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
                <MaterialIcons name="shopping-cart" size={32} color="#6B46C1" />
              </View>
              <ThemedText style={styles.summaryModalTitle}>Buy Summary</ThemedText>
              <ThemedText style={styles.summaryModalSubtitle}>Review your purchase details</ThemedText>
            </View>
            
            {quote && (
              <View style={styles.summaryDetails}>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryRowLeft}>
                      <MaterialIcons name="attach-money" size={20} color="#6B7280" />
                      <ThemedText style={styles.summaryLabel}>Spending</ThemedText>
                    </View>
                    <View style={styles.summaryRowRight}>
                      <ThemedText style={styles.summaryValue}>
                        ₦{parseFloat(quote.ngn_amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.summaryDivider} />
                  
                  {quote.exchange_rate && (
                    <>
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
                      <View style={styles.summaryDivider} />
                    </>
                  )}
                  
                  {quote.platform_fee && (
                    <>
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
                      <View style={styles.summaryDivider} />
                    </>
                  )}
                  
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryRowLeft}>
                      <MaterialIcons name="account-balance-wallet" size={20} color="#6B7280" />
                      <ThemedText style={styles.summaryLabel}>You'll Receive</ThemedText>
                    </View>
                    <View style={styles.summaryRowRight}>
                      <ThemedText style={[styles.summaryValue, styles.summaryValueHighlight]}>
                        {formatCryptoBalance(parseFloat(quote.crypto_amount || '0'), selectedCrypto.symbol)} {selectedCrypto.symbol}
                      </ThemedText>
                    </View>
                  </View>
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
                style={[styles.buyNowButton, executing && styles.buyNowButtonDisabled]}
                onPress={handleConfirmBuy}
                disabled={executing}
              >
                {executing ? (
                  <AppLoadingIndicator size="small" variant="onPrimary" />
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.buyNowButtonText}>Buy Now</ThemedText>
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
                <MaterialIcons name="check-circle" size={64} color="#6B46C1" />
              </View>
            </View>
            
            <ThemedText style={styles.successModalTitle}>Purchase Successful!</ThemedText>
            <ThemedText style={styles.successModalSubtitle}>
              Your cryptocurrency has been credited to your wallet successfully
            </ThemedText>
            
            {buyResult && (
              <View style={styles.successDetails}>
                <View style={styles.successCard}>
                  {/* Cryptocurrency Received */}
                  <View style={styles.successRow}>
                    <View style={styles.successRowLeft}>
                      <Image
                        source={selectedCrypto.logo}
                        style={styles.successCryptoLogo}
                        contentFit="contain"
                      />
                      <ThemedText style={styles.successLabel}>Crypto Received</ThemedText>
                    </View>
                    <View style={styles.successRowRight}>
                      <ThemedText style={[styles.successValue, styles.successValueHighlight]}>
                        {formatCryptoBalance(parseFloat(buyResult.cryptoAmount || '0'), buyResult.cryptoSymbol)} {buyResult.cryptoSymbol}
                      </ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.successDivider} />
                  
                  {/* Amount Spent */}
                  <View style={styles.successRow}>
                    <View style={styles.successRowLeft}>
                      <MaterialIcons name="attach-money" size={20} color="#6B7280" />
                      <ThemedText style={styles.successLabel}>Amount Spent</ThemedText>
                    </View>
                    <View style={styles.successRowRight}>
                      <ThemedText style={styles.successValue}>
                        ₦{parseFloat(buyResult.ngnAmount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.successDivider} />
                  
                  {/* Status */}
                  <View style={styles.successRow}>
                    <View style={styles.successRowLeft}>
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                      <ThemedText style={styles.successLabel}>Status</ThemedText>
                    </View>
                    <View style={styles.successRowRight}>
                      <View style={styles.successStatusBadge}>
                        <ThemedText style={styles.successStatusText}>Completed</ThemedText>
                      </View>
                    </View>
                  </View>
                  
                  {/* Transaction ID */}
                  {buyResult.transactionId && (
                    <>
                      <View style={styles.successDivider} />
                      <View style={styles.successRow}>
                        <View style={styles.successRowLeft}>
                          <MaterialIcons name="receipt" size={20} color="#6B7280" />
                          <ThemedText style={styles.successLabel}>Transaction ID</ThemedText>
                        </View>
                        <View style={styles.successRowRight}>
                          <TouchableOpacity
                            onPress={() => {
                              Clipboard.setStringAsync(buyResult.transactionId);
                              Alert.alert('Copied', 'Transaction ID copied to clipboard');
                            }}
                            style={styles.transactionIdContainer}
                          >
                            <ThemedText style={styles.successHash} numberOfLines={1}>
                              {buyResult.transactionId.length > 20 
                                ? `${buyResult.transactionId.substring(0, 20)}...`
                                : buyResult.transactionId}
                            </ThemedText>
                            <MaterialIcons name="content-copy" size={16} color="#6B46C1" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}
                  
                  {/* View Transaction Button */}
                  {buyResult.transactionId && (
                    <>
                      <View style={styles.successDivider} />
                      <TouchableOpacity
                        style={styles.viewTransactionButton}
                        onPress={() => {
                          setShowSuccessModal(false);
                          router.push(`/transaction-detail?id=${buyResult.transactionId}`);
                        }}
                      >
                        <MaterialIcons name="visibility" size={18} color="#6B46C1" />
                        <ThemedText style={styles.viewTransactionText}>View Transaction Details</ThemedText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
            
            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.successButtonSecondary}
                onPress={() => {
                  setShowSuccessModal(false);
                  setNgnAmount('');
                  setQuote(null);
                  fetchBalance();
                }}
              >
                <ThemedText style={styles.successButtonSecondaryText}>Buy More</ThemedText>
              </TouchableOpacity>
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
        </View>
      </Modal>

      {/* Full-screen loader while instant buy runs (modal closes first) */}
      <Modal visible={executing} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.executingLoaderOverlay}>
          <View style={styles.executingLoaderCard}>
            <AppLoadingIndicator size="large" variant="onLight" durationMs={1100} />
            <ThemedText style={styles.executingLoaderTitle}>Processing your purchase</ThemedText>
            <ThemedText style={styles.executingLoaderSubtitle}>
              Completing your buy securely. This usually takes a few seconds.
            </ThemedText>
          </View>
        </View>
      </Modal>

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalanceModal}
        onClose={() => setShowInsufficientBalanceModal(false)}
        availableBalance={ngnBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        requiredAmount={ngnAmount}
        currency="fiat"
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
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    width: '100%',
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  balanceAmountContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    minHeight: 50,
  },
  balanceAmount: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#11181C',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  exchangeRateBadge: {
    backgroundColor: '#E9D5FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#6B46C1',
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
  executingLoaderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  executingLoaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  executingLoaderTitle: {
    marginTop: 22,
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
  },
  executingLoaderSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
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
    color: '#6B46C1',
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
  buyNowButton: {
    flex: 1,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buyNowButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  buyNowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
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
    backgroundColor: '#F3E8FF',
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
  successRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  successRowRight: {
    alignItems: 'flex-end',
    flex: 1,
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
    color: '#6B46C1',
    fontWeight: 'bold',
  },
  successDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  successCryptoLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  successStatusBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  successStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B46C1',
  },
  transactionIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  successHash: {
    fontSize: 12,
    color: '#6B46C1',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  viewTransactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewTransactionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  successButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  successButtonSecondary: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  successButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  successButton: {
    flex: 1,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
