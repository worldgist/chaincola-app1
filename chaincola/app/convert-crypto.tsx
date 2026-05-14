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
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSwapCryptoQuote, swapCrypto, SwapCryptoRequest } from '@/lib/buy-sell-service';
import { getUserCryptoBalances } from '@/lib/crypto-price-service';
import { getCryptoPrice } from '@/lib/crypto-price-service';
import { supabase } from '@/lib/supabase';
import AppLoadingIndicator from '@/components/app-loading-indicator';


const cryptoData: Record<string, any> = {
  '1': {
    name: 'Bitcoin',
    symbol: 'BTC',
    logo: require('@/assets/images/bitcoin.png'),
    price: 43250.00,
    change24h: '+2.45%',
  },
  '2': {
    name: 'Ethereum',
    symbol: 'ETH',
    logo: require('@/assets/images/ethereum.png'),
    price: 2450.00,
    change24h: '+1.23%',
  },
  '3': {
    name: 'Tether',
    symbol: 'USDT',
    logo: require('@/assets/images/tether.png'),
    price: 1.00,
    change24h: '+0.01%',
  },
  '4': {
    name: 'USDC',
    symbol: 'USDC',
    logo: require('@/assets/images/usdc.png'),
    price: 1.00,
    change24h: '+0.01%',
  },
  '6': {
    name: 'Ripple',
    symbol: 'XRP',
    logo: require('@/assets/images/ripple.png'),
    price: 0.62,
    change24h: '+1.85%',
  },
  '7': {
    name: 'Solana',
    symbol: 'SOL',
    logo: require('@/assets/images/solana.png'),
    price: 98.50,
    change24h: '+3.21%',
  },
};

const cryptoList = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: require('@/assets/images/bitcoin.png') },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: require('@/assets/images/ethereum.png') },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: require('@/assets/images/tether.png') },
  { id: '4', name: 'USDC', symbol: 'USDC', logo: require('@/assets/images/usdc.png') },
  { id: '6', name: 'Ripple', symbol: 'XRP', logo: require('@/assets/images/ripple.png') },
  { id: '7', name: 'Solana', symbol: 'SOL', logo: require('@/assets/images/solana.png') },
];

export default function ConvertCryptoScreen() {
  const params = useLocalSearchParams();
  const fromId = params.fromId as string | undefined;
  
  // Find the initial from crypto based on the fromId parameter, or default to first
  const initialFromCrypto = fromId 
    ? cryptoList.find(c => c.id === fromId) || cryptoList[0]
    : cryptoList[0];
  
  const [fromCrypto, setFromCrypto] = useState(initialFromCrypto);
  const [toCrypto, setToCrypto] = useState(cryptoList[1]);
  const [amount, setAmount] = useState('');
  const [convertedAmount, setConvertedAmount] = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [fromBalance, setFromBalance] = useState(0);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [fromSellPrice, setFromSellPrice] = useState(0);
  const [toBuyPrice, setToBuyPrice] = useState(0);
  const [swapResult, setSwapResult] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);

  // Fetch user balances
  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { balances: cryptoBalances } = await getUserCryptoBalances(user.id);
        const balanceMap: Record<string, number> = {};
        Object.values(cryptoBalances).forEach((bal) => {
          balanceMap[bal.symbol] = bal.balance;
        });
        setBalances(balanceMap);
        
        // Set from balance based on current fromCrypto
        const symbol = fromCrypto.symbol;
        setFromBalance(balanceMap[symbol] || 0);
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
    };

    fetchBalances();
  }, []);

  // Update from balance when fromCrypto changes
  useEffect(() => {
    const symbol = fromCrypto.symbol;
    setFromBalance(balances[symbol] || 0);
  }, [fromCrypto, balances]);

  // Fetch prices and calculate conversion
  useEffect(() => {
    const calculateConversion = async () => {
      if (!amount || !fromCrypto || !toCrypto) {
        setConvertedAmount('');
        setLoadingPrices(false);
        setQuote(null);
        return;
      }

      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setConvertedAmount('');
        setLoadingPrices(false);
        setQuote(null);
        return;
      }

      setLoadingPrices(true);
      setQuote(null);
      
      // Set a timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn('⏱️ Price fetch timeout - resetting loading state');
        setLoadingPrices(false);
      }, 10000); // 10 second timeout
      
      try {
        console.log(`🔄 Calculating conversion: ${amountValue} ${fromCrypto.symbol} → ${toCrypto.symbol}`);
        
        // Get sell price for from_asset with timeout
        const fromPricePromise = getCryptoPrice(fromCrypto.symbol);
        const fromPriceTimeout = new Promise<{ price: any; error: any }>((resolve) => 
          setTimeout(() => resolve({ price: null, error: 'Timeout fetching price' }), 8000)
        );
        const fromPriceResult = await Promise.race([fromPricePromise, fromPriceTimeout]);
        console.log(`📊 From price result for ${fromCrypto.symbol}:`, {
          hasPrice: !!fromPriceResult.price,
          hasError: !!fromPriceResult.error,
          price: fromPriceResult.price ? {
            bid: fromPriceResult.price.bid,
            ask: fromPriceResult.price.ask,
            price_ngn: fromPriceResult.price.price_ngn,
          } : null,
          error: fromPriceResult.error,
        });
        
        // Get buy price for to_asset with timeout
        const toPricePromise = getCryptoPrice(toCrypto.symbol);
        const toPriceTimeout = new Promise<{ price: any; error: any }>((resolve) => 
          setTimeout(() => resolve({ price: null, error: 'Timeout fetching price' }), 8000)
        );
        const toPriceResult = await Promise.race([toPricePromise, toPriceTimeout]);
        console.log(`📊 To price result for ${toCrypto.symbol}:`, {
          hasPrice: !!toPriceResult.price,
          hasError: !!toPriceResult.error,
          price: toPriceResult.price ? {
            bid: toPriceResult.price.bid,
            ask: toPriceResult.price.ask,
            price_ngn: toPriceResult.price.price_ngn,
          } : null,
          error: toPriceResult.error,
        });

        if (fromPriceResult.error) {
          console.error(`❌ Error fetching ${fromCrypto.symbol} price:`, fromPriceResult.error);
        }
        if (toPriceResult.error) {
          console.error(`❌ Error fetching ${toCrypto.symbol} price:`, toPriceResult.error);
        }

        const fromPriceData = fromPriceResult.price;
        const toPriceData = toPriceResult.price;

        if (!fromPriceData || !toPriceData) {
          console.warn('⚠️ Missing price data:', { 
            fromPriceData: !!fromPriceData, 
            toPriceData: !!toPriceData,
            fromError: fromPriceResult.error,
            toError: toPriceResult.error,
          });
          clearTimeout(timeoutId);
          setConvertedAmount('');
          setLoadingPrices(false);
          return;
        }

        // Use bid (sell price) for from_asset, ask (buy price) for to_asset
        // Fallback to price_ngn if bid/ask not available
        const sellPrice = fromPriceData.bid || fromPriceData.price_ngn || 0;
        const buyPrice = toPriceData.ask || toPriceData.price_ngn || 0;

        console.log(`💰 Prices: ${fromCrypto.symbol} sell=${sellPrice}, ${toCrypto.symbol} buy=${buyPrice}`);

        if (sellPrice <= 0 || buyPrice <= 0) {
          console.warn('⚠️ Invalid prices:', { 
            sellPrice, 
            buyPrice,
            fromBid: fromPriceData.bid,
            fromPriceNgn: fromPriceData.price_ngn,
            toAsk: toPriceData.ask,
            toPriceNgn: toPriceData.price_ngn,
          });
          clearTimeout(timeoutId);
          setConvertedAmount('');
          setLoadingPrices(false);
          return;
        }

        setFromSellPrice(sellPrice);
        setToBuyPrice(buyPrice);

        // Client-side estimate (fast UI). Final quote comes from backend when proceeding.
        const valueInNgn = amountValue * sellPrice;
        const swapFee = valueInNgn * 0.005;
        const valueAfterFee = valueInNgn - swapFee;
        const converted = valueAfterFee / buyPrice;

        console.log(`✅ Estimated conversion: ${amountValue} ${fromCrypto.symbol} ≈ ${converted.toFixed(8)} ${toCrypto.symbol}`);
        setConvertedAmount(converted.toFixed(8));
        clearTimeout(timeoutId);
      } catch (error: any) {
        console.error('❌ Error calculating conversion:', error);
        setConvertedAmount('');
        setQuote(null);
        clearTimeout(timeoutId);
      } finally {
        setLoadingPrices(false);
      }
    };

    // Add a small delay to debounce rapid changes
    const debounceTimeoutId = setTimeout(() => {
      calculateConversion();
    }, 300);

    return () => clearTimeout(debounceTimeoutId);
  }, [amount, fromCrypto, toCrypto]);

  const handleSwap = () => {
    const temp = fromCrypto;
    setFromCrypto(toCrypto);
    setToCrypto(temp);
    // Swap amounts
    const tempAmount = amount;
    setAmount(convertedAmount);
    setConvertedAmount(tempAmount);
  };

  const handleMax = () => {
    setAmount(fromBalance.toFixed(8));
  };

  const handleProceed = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > fromBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    if (fromCrypto.id === toCrypto.id) {
      Alert.alert('Error', 'Please select different cryptocurrencies');
      return;
    }

    // Fetch a real quote from backend so preview matches execution.
    (async () => {
      setLoading(true);
      try {
        const amountValue = parseFloat(amount);
        const swapRequest: SwapCryptoRequest = {
          from_asset: fromCrypto.symbol,
          to_asset: toCrypto.symbol,
          from_amount: amountValue,
        };

        const q = await getSwapCryptoQuote(swapRequest);
        if (!q.success) {
          const msg = q.error || 'Unable to get a swap quote right now. Please try again.';
          // Fallback: allow user to proceed with the on-screen estimate.
          console.warn('⚠️ Swap quote failed; proceeding with estimate:', msg);
          setQuote(null);
          setShowConfirmModal(true);
          return;
        }

        setQuote(q);
        if (typeof q.to_amount === 'number' && !Number.isNaN(q.to_amount)) {
          setConvertedAmount(q.to_amount.toFixed(8));
        }
        if (q.exchange_rate?.from_sell_price && q.exchange_rate?.to_buy_price) {
          setFromSellPrice(q.exchange_rate.from_sell_price);
          setToBuyPrice(q.exchange_rate.to_buy_price);
        }

        setShowConfirmModal(true);
      } catch (e: any) {
        // Fallback: allow user to proceed with the on-screen estimate.
        const msg = e?.message || 'Failed to get swap quote.';
        console.warn('⚠️ Exception getting swap quote; proceeding with estimate:', msg);
        setQuote(null);
        setShowConfirmModal(true);
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleConfirmConvert = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    
    try {
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        Alert.alert('Error', 'Invalid amount');
        setLoading(false);
        return;
      }

      const swapRequest: SwapCryptoRequest = {
        from_asset: fromCrypto.symbol,
        to_asset: toCrypto.symbol,
        from_amount: amountValue,
      };

      console.log('🔄 Processing swap:', swapRequest);

      const result = await swapCrypto(swapRequest);

      if (result.success) {
        setSwapResult(result);
        setShowSuccessModal(true);
        setQuote(null);
        
        // Refresh balances
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { balances: cryptoBalances } = await getUserCryptoBalances(user.id);
          const balanceMap: Record<string, number> = {};
          Object.values(cryptoBalances).forEach((bal) => {
            balanceMap[bal.symbol] = bal.balance;
          });
          setBalances(balanceMap);
          setFromBalance(balanceMap[fromCrypto.symbol] || 0);
        }
      } else {
        // Provide user-friendly error messages
        let errorMessage = result.error || 'Failed to process swap. Please try again.';
        
        // Check for inventory errors and provide more helpful messages
        if (errorMessage.includes('Insufficient system inventory')) {
          // Extract asset name from error if possible
          const assetMatch = errorMessage.match(/for (\w+)/);
          const asset = assetMatch ? assetMatch[1] : 'the requested cryptocurrency';
          errorMessage = `Sorry, we currently don't have enough ${asset} in our inventory to complete this swap. Please try again later or contact support.`;
        } else if (errorMessage.includes('insufficient balance') || errorMessage.includes('Insufficient balance')) {
          errorMessage = 'You don\'t have enough balance to complete this swap.';
        } else if (errorMessage.includes('Price not found')) {
          errorMessage = 'Unable to fetch current prices. Please try again in a moment.';
        }
        
        Alert.alert('Swap Failed', errorMessage);
      }
    } catch (error: any) {
      console.error('Error processing swap:', error);
      Alert.alert('Error', error.message || 'Failed to process swap. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const exchangeRate = fromSellPrice && toBuyPrice 
    ? fromSellPrice / toBuyPrice
    : 0;


  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Convert Crypto</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            {/* From Crypto */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                From
              </ThemedText>
              <TouchableOpacity
                style={styles.cryptoSelector}
                onPress={() => setShowFromPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.cryptoSelectorLeft}>
                  <Image
                    source={fromCrypto.logo}
                    style={styles.cryptoSelectorLogo}
                    contentFit="contain"
                  />
                  <View style={styles.cryptoSelectorInfo}>
                    <ThemedText 
                      style={styles.cryptoSelectorName}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {fromCrypto.name}
                    </ThemedText>
                    <ThemedText 
                      style={styles.cryptoSelectorBalance}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      Balance: {fromBalance.toFixed(8)} {fromCrypto.symbol}
                    </ThemedText>
                  </View>
                </View>
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B46C1" />
              </TouchableOpacity>

              <View style={styles.amountInputContainer}>
                <ThemedText style={styles.cryptoSymbol}>{fromCrypto.symbol}</ThemedText>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00000000"
                  placeholderTextColor="#9CA3AF"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  numberOfLines={1}
                />
                <TouchableOpacity
                  style={styles.maxButton}
                  onPress={handleMax}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.maxButtonText}>Max</ThemedText>
                </TouchableOpacity>
              </View>
              {amount && parseFloat(amount) > fromBalance && (
                <ThemedText style={styles.errorText}>
                  Insufficient balance
                </ThemedText>
              )}
            </View>

            {/* Swap Button */}
            <View style={styles.swapContainer}>
              <TouchableOpacity
                style={styles.swapButton}
                onPress={handleSwap}
                activeOpacity={0.7}
              >
                <View style={styles.swapButtonCircle}>
                  <MaterialIcons name="swap-vert" size={24} color="#6B46C1" />
                </View>
              </TouchableOpacity>
            </View>

            {/* To Crypto */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                To
              </ThemedText>
              <TouchableOpacity
                style={styles.cryptoSelector}
                onPress={() => setShowToPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.cryptoSelectorLeft}>
                  <Image
                    source={toCrypto.logo}
                    style={styles.cryptoSelectorLogo}
                    contentFit="contain"
                  />
                  <View style={styles.cryptoSelectorInfo}>
                    <ThemedText 
                      style={styles.cryptoSelectorName}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {toCrypto.name}
                    </ThemedText>
                    <ThemedText 
                      style={styles.cryptoSelectorBalance}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      You'll receive
                    </ThemedText>
                  </View>
                </View>
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B46C1" />
              </TouchableOpacity>

              <View style={styles.amountInputContainer}>
                <ThemedText style={styles.cryptoSymbol}>{toCrypto.symbol}</ThemedText>
                <TextInput
                  style={[styles.amountInput, styles.convertedInput]}
                  placeholder="0.00000000"
                  placeholderTextColor="#9CA3AF"
                  value={loadingPrices ? 'Calculating...' : convertedAmount}
                  editable={false}
                  numberOfLines={1}
                />
                {loadingPrices && (
                  <AppLoadingIndicator size="small" style={{ marginLeft: 8 }} />
                )}
              </View>
            </View>

            {/* Exchange Rate */}
            {amount && convertedAmount && (
              <View style={styles.exchangeRateCard}>
                <ThemedText style={styles.exchangeRateText}>
                  1 {fromCrypto.symbol} = {exchangeRate.toFixed(8)} {toCrypto.symbol}
                </ThemedText>
              </View>
            )}


            {/* Summary */}
            {amount && convertedAmount && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>You're converting</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {parseFloat(amount).toFixed(8)} {fromCrypto.symbol}
                  </ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>You'll receive</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {parseFloat(convertedAmount).toFixed(8)} {toCrypto.symbol}
                  </ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Exchange Rate</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    1 {fromCrypto.symbol} = {exchangeRate.toFixed(8)} {toCrypto.symbol}
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Convert Button */}
            <TouchableOpacity
              style={[styles.convertButton, (!amount || fromCrypto.id === toCrypto.id || loading) && styles.convertButtonDisabled]}
              onPress={handleProceed}
              disabled={!amount || fromCrypto.id === toCrypto.id || loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={amount && fromCrypto.id !== toCrypto.id && !loading ? ['#6B46C1', '#9333EA'] : ['#D1D5DB', '#9CA3AF']}
                style={styles.convertButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <AppLoadingIndicator size="small" variant="onPrimary" />
                ) : (
                  <>
                    <MaterialIcons name="swap-horiz" size={20} color="#FFFFFF" />
                    <ThemedText 
                      style={styles.convertButtonText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Convert
                    </ThemedText>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* From Crypto Picker Modal */}
      <Modal
        visible={showFromPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFromPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select From Crypto</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowFromPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.cryptoList}>
              {cryptoList
                .filter(crypto => crypto.id !== toCrypto.id)
                .map((crypto) => (
                  <TouchableOpacity
                    key={crypto.id}
                    style={[
                      styles.cryptoListItem,
                      fromCrypto.id === crypto.id && styles.cryptoListItemSelected,
                    ]}
                    onPress={() => {
                      setFromCrypto(crypto);
                      setShowFromPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={crypto.logo}
                      style={styles.cryptoListItemLogo}
                      contentFit="contain"
                    />
                    <View style={styles.cryptoListItemInfo}>
                      <ThemedText
                        style={[
                          styles.cryptoListItemName,
                          fromCrypto.id === crypto.id && styles.cryptoListItemNameSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {crypto.name}
                      </ThemedText>
                      <ThemedText style={styles.cryptoListItemSymbol}>
                        {crypto.symbol}
                      </ThemedText>
                    </View>
                    {fromCrypto.id === crypto.id && (
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* To Crypto Picker Modal */}
      <Modal
        visible={showToPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowToPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select To Crypto</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowToPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.cryptoList}>
              {cryptoList
                .filter(crypto => crypto.id !== fromCrypto.id)
                .map((crypto) => (
                  <TouchableOpacity
                    key={crypto.id}
                    style={[
                      styles.cryptoListItem,
                      toCrypto.id === crypto.id && styles.cryptoListItemSelected,
                    ]}
                    onPress={() => {
                      setToCrypto(crypto);
                      setShowToPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={crypto.logo}
                      style={styles.cryptoListItemLogo}
                      contentFit="contain"
                    />
                    <View style={styles.cryptoListItemInfo}>
                      <ThemedText
                        style={[
                          styles.cryptoListItemName,
                          toCrypto.id === crypto.id && styles.cryptoListItemNameSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {crypto.name}
                      </ThemedText>
                      <ThemedText style={styles.cryptoListItemSymbol}>
                        {crypto.symbol}
                      </ThemedText>
                    </View>
                    {toCrypto.id === crypto.id && (
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmIconContainer}>
              <View style={styles.confirmCryptoIcons}>
                <Image
                  source={fromCrypto.logo}
                  style={styles.confirmCryptoIcon}
                  contentFit="contain"
                />
                <MaterialIcons name="arrow-forward" size={24} color="#6B46C1" />
                <Image
                  source={toCrypto.logo}
                  style={styles.confirmCryptoIcon}
                  contentFit="contain"
                />
              </View>
            </View>
            <ThemedText 
              style={styles.confirmModalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Confirm Conversion
            </ThemedText>
            <View style={styles.confirmDetails}>
              <View style={styles.confirmDetailRow}>
                <ThemedText style={styles.confirmDetailLabel}>From:</ThemedText>
                <ThemedText style={styles.confirmDetailValue}>
                  {parseFloat(amount).toFixed(8)} {fromCrypto.symbol}
                </ThemedText>
              </View>
              <View style={styles.confirmDetailRow}>
                <ThemedText style={styles.confirmDetailLabel}>To:</ThemedText>
                <ThemedText style={styles.confirmDetailValue}>
                  {parseFloat(convertedAmount).toFixed(8)} {toCrypto.symbol}
                </ThemedText>
              </View>
              <View style={styles.confirmDetailRow}>
                <ThemedText style={styles.confirmDetailLabel}>Exchange Rate:</ThemedText>
                <ThemedText style={styles.confirmDetailValue}>
                  1 {fromCrypto.symbol} = {exchangeRate.toFixed(8)} {toCrypto.symbol}
                </ThemedText>
              </View>
            </View>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowConfirmModal(false)}
                activeOpacity={0.8}
              >
                <ThemedText 
                  style={styles.confirmCancelText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmProceedButton}
                onPress={handleConfirmConvert}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.confirmProceedButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <ThemedText 
                    style={styles.confirmProceedText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Confirm
                  </ThemedText>
                </LinearGradient>
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
        onRequestClose={handleSuccessModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <View style={styles.successCheckCircle}>
                <MaterialIcons name="check-circle" size={64} color="#10B981" />
              </View>
              <View style={styles.successCryptoIcons}>
                <Image
                  source={fromCrypto.logo}
                  style={styles.successCryptoIcon}
                  contentFit="contain"
                />
                <MaterialIcons name="arrow-forward" size={24} color="#10B981" />
                <Image
                  source={toCrypto.logo}
                  style={styles.successCryptoIcon}
                  contentFit="contain"
                />
              </View>
            </View>
            <ThemedText 
              style={styles.successModalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Conversion Successful!
            </ThemedText>
            
            {/* Conversion Details */}
            <View style={styles.successDetails}>
              <View style={styles.successDetailRow}>
                <ThemedText style={styles.successDetailLabel}>You converted:</ThemedText>
                <ThemedText style={styles.successDetailValue}>
                  {swapResult?.from_amount?.toFixed(8) || parseFloat(amount).toFixed(8)} {swapResult?.from_asset || fromCrypto.symbol}
                </ThemedText>
              </View>
              <View style={styles.successDetailRow}>
                <ThemedText style={styles.successDetailLabel}>You received:</ThemedText>
                <ThemedText style={[styles.successDetailValue, styles.successDetailValueHighlight]}>
                  {swapResult?.to_amount?.toFixed(8) || parseFloat(convertedAmount).toFixed(8)} {swapResult?.to_asset || toCrypto.symbol}
                </ThemedText>
              </View>
              {swapResult?.value_in_ngn && (
                <View style={styles.successDetailRow}>
                  <ThemedText style={styles.successDetailLabel}>Value:</ThemedText>
                  <ThemedText style={styles.successDetailValue}>
                    ₦{swapResult.value_in_ngn.toFixed(2)}
                  </ThemedText>
                </View>
              )}
              {swapResult?.exchange_rate && (
                <View style={styles.successDetailRow}>
                  <ThemedText style={styles.successDetailLabel}>Exchange rate:</ThemedText>
                  <ThemedText style={styles.successDetailValue}>
                    1 {swapResult.from_asset} = {(swapResult.exchange_rate.from_sell_price / swapResult.exchange_rate.to_buy_price).toFixed(8)} {swapResult.to_asset}
                  </ThemedText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.successModalButton}
              onPress={handleSuccessModalClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.successModalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText 
                  style={styles.successModalButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Done
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    width: '100%',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    width: '100%',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  cryptoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    minHeight: 70,
  },
  cryptoSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  cryptoSelectorLogo: {
    width: 40,
    height: 40,
  },
  cryptoSelectorInfo: {
    flex: 1,
  },
  cryptoSelectorName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cryptoSelectorBalance: {
    fontSize: 12,
    color: '#6B7280',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    minHeight: 60,
  },
  cryptoSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#11181C',
    paddingVertical: 16,
  },
  maxButton: {
    backgroundColor: '#6B46C1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 8,
  },
  maxButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  convertedInput: {
    color: '#6B7280',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
  },
  swapContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  swapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#DDD6FE',
  },
  swapButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exchangeRateCard: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  exchangeRateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  quickAmountsLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  quickAmountsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAmountButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 80,
  },
  quickAmountButtonActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    textAlign: 'center',
  },
  quickAmountTextActive: {
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  convertButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  convertButtonDisabled: {
    opacity: 0.6,
  },
  convertButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  convertButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 12,
  },
  cryptoListItemSelected: {
    backgroundColor: '#EDE9FE',
  },
  cryptoListItemLogo: {
    width: 40,
    height: 40,
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
  cryptoListItemNameSelected: {
    color: '#6B46C1',
  },
  cryptoListItemSymbol: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    margin: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmIconContainer: {
    marginBottom: 16,
  },
  confirmCryptoIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  confirmCryptoIcon: {
    width: 48,
    height: 48,
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#11181C',
  },
  confirmDetails: {
    width: '100%',
    marginBottom: 24,
    gap: 16,
  },
  confirmDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  confirmDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmDetailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmProceedButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmProceedButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmProceedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    margin: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
  },
  successCheckCircle: {
    marginBottom: 16,
  },
  successCryptoIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  successCryptoIcon: {
    width: 40,
    height: 40,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#11181C',
  },
  successDetails: {
    width: '100%',
    marginBottom: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  successDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  successDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  successDetailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
    textAlign: 'right',
    flex: 1,
  },
  successDetailValueHighlight: {
    color: '#10B981',
    fontWeight: 'bold',
  },
  successModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
    color: '#11181C',
  },
  successModalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  successModalButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successModalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});


