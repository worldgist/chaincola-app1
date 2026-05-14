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
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TransactionAuthModal from '@/components/transaction-auth-modal';
import InsufficientBalanceModal from '@/components/insufficient-balance-modal';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, getLunoPrices, formatNgnValue, formatUsdValue } from '@/lib/crypto-price-service';
import { sendBitcoin, sendEthereum, sendUsdc, sendUsdt, sendXrp } from '@/lib/buy-sell-service';
import { sendSOL } from '@/lib/sol-send-service';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';
import { validateAddress, extractAddressFromQR } from '@/lib/address-validator';
import { getDemoWallet } from '@/lib/demo-wallets';
import AppLoadingIndicator from '@/components/app-loading-indicator';

// Import expo-camera with error handling
let CameraView: any = null;
let CameraType: any = null;
let useCameraPermissions: any = null;

try {
  const cameraModule = require('expo-camera');
  CameraView = cameraModule.CameraView;
  useCameraPermissions = cameraModule.useCameraPermissions;
  
  // Handle CameraType - it might be exported differently in different versions
  if (cameraModule.CameraType) {
    CameraType = cameraModule.CameraType;
  } else if (cameraModule.Camera?.CameraType) {
    CameraType = cameraModule.Camera.CameraType;
  } else {
    // Fallback: use string literals directly
    CameraType = { back: 'back', front: 'front' };
  }
  
  // Ensure CameraType has the required properties
  if (!CameraType || typeof CameraType !== 'object') {
    CameraType = { back: 'back', front: 'front' };
  }
  if (!CameraType.back) {
    CameraType.back = 'back';
  }
  if (!CameraType.front) {
    CameraType.front = 'front';
  }
} catch (error) {
  console.warn('expo-camera not available:', error);
  // Provide fallback values
  CameraType = { back: 'back', front: 'front' };
}

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
    price: 117.00,
    change24h: '+2.10%',
  },
};

export default function SendCryptoScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const cryptoId = params.id as string;
  const fromWallet = params.from === 'wallet'; // Check if navigated from wallet page
  const crypto = cryptoData[cryptoId || '1'];

  const [amount, setAmount] = useState('');
  const [amountInputMode, setAmountInputMode] = useState<'crypto' | 'ngn'>('crypto');
  const [ngnAmountInput, setNgnAmountInput] = useState('');
  const [sentAmount, setSentAmount] = useState<string>(''); // Store amount that was sent
  const [recipientAddress, setRecipientAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [insufficientBalanceError, setInsufficientBalanceError] = useState<string | null>(null);
  const [cryptoBalance, setCryptoBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cryptoPriceUSD, setCryptoPriceUSD] = useState<number | null>(null);
  const [cryptoPriceNGN, setCryptoPriceNGN] = useState<number | null>(null);
  const [sendFee, setSendFee] = useState(0);
  const [feeLoading, setFeeLoading] = useState(false);
  const [totalRequired, setTotalRequired] = useState(0);
  const [estimatedFees, setEstimatedFees] = useState<{ networkFee: number; platformFee: number; totalFee: number } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions 
    ? useCameraPermissions() 
    : [null, async () => ({ granted: false })];
  const [addressError, setAddressError] = useState<string | null>(null);
  const [networkFee, setNetworkFee] = useState<number>(0);
  const [feeLoadingEstimate, setFeeLoadingEstimate] = useState(false);
  const [isContractAddress, setIsContractAddress] = useState<boolean>(false);
  const [checkingContract, setCheckingContract] = useState<boolean>(false);
  const [lastTransactionHash, setLastTransactionHash] = useState<string | null>(null);

  // Fetch balance on mount
  useEffect(() => {
    if (user?.id && crypto) {
      fetchBalance();
    }
  }, [user?.id, crypto]);

  // Sync crypto amount when NGN input changes
  useEffect(() => {
    if (amountInputMode === 'ngn' && cryptoPriceNGN && cryptoPriceNGN > 0 && ngnAmountInput) {
      const ngnVal = parseFloat(ngnAmountInput.replace(/,/g, ''));
      if (!isNaN(ngnVal) && ngnVal > 0) {
        const cryptoVal = ngnVal / cryptoPriceNGN;
        setAmount(cryptoVal.toFixed(8));
      } else {
        setAmount('');
      }
    } else if (amountInputMode === 'ngn' && !ngnAmountInput) {
      setAmount('');
    }
  }, [amountInputMode, ngnAmountInput, cryptoPriceNGN]);

  // Send functionality has been removed
  // Fee calculation removed - no longer fetching fees
  useEffect(() => {
    const estimateFees = async () => {
      if (!amount || !crypto?.symbol) {
        setSendFee(0);
        setTotalRequired(0);
        setEstimatedFees(null);
        return;
      }

      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setSendFee(0);
        setTotalRequired(0);
        setEstimatedFees(null);
        return;
      }

      if (crypto.symbol === 'ETH') {
        const estimatedNetworkFee = networkFee > 0 ? networkFee : 0.0000275;
        const platformFee = amountValue * 0.03;
        setSendFee(estimatedNetworkFee + platformFee);
        setTotalRequired(amountValue + estimatedNetworkFee + platformFee);
        setEstimatedFees({
          networkFee: estimatedNetworkFee,
          platformFee,
          totalFee: estimatedNetworkFee + platformFee,
        });
        return;
      }

      if (crypto.symbol === 'SOL') {
        const estimatedNetworkFee = 0.0001;
        const platformFee = amountValue * 0.03;
        setSendFee(estimatedNetworkFee + platformFee);
        setTotalRequired(amountValue + estimatedNetworkFee + platformFee);
        setEstimatedFees({
          networkFee: estimatedNetworkFee,
          platformFee,
          totalFee: estimatedNetworkFee + platformFee,
        });
        return;
      }

      if (crypto.symbol === 'BTC') {
        const estimatedNetworkFee = 0.000025;
        const platformFee = amountValue * 0.03;
        setSendFee(estimatedNetworkFee + platformFee);
        setTotalRequired(amountValue + estimatedNetworkFee + platformFee);
        setEstimatedFees({
          networkFee: estimatedNetworkFee,
          platformFee,
          totalFee: estimatedNetworkFee + platformFee,
        });
        return;
      }

      if (crypto.symbol === 'XRP') {
        const estimatedNetworkFee = 0.000012;
        const platformFee = 0;
        setSendFee(estimatedNetworkFee);
        setTotalRequired(amountValue + estimatedNetworkFee);
        setEstimatedFees({
          networkFee: estimatedNetworkFee,
          platformFee,
          totalFee: estimatedNetworkFee,
        });
        return;
      }

      // USDT/USDC transfer fees are paid in ETH gas, not token amount.
      if (crypto.symbol === 'USDT' || crypto.symbol === 'USDC') {
        setSendFee(0);
        setTotalRequired(amountValue);
        setEstimatedFees({
          networkFee: 0.001, // ETH gas estimate from backend logic.
          platformFee: 0,
          totalFee: 0.001,
        });
        return;
      }

      setSendFee(0);
      setTotalRequired(amountValue);
      setEstimatedFees(null);
    };

    estimateFees();
  }, [amount, crypto?.symbol, networkFee]);

  const fetchBalance = async () => {
    if (!user?.id || !crypto) {
      setBalanceLoading(false);
      return;
    }
    
    try {
      setBalanceLoading(true);
      
      // Fetch balance and live spot price (for fiat equivalent display) in parallel
      const balancePromise = getUserCryptoBalances(user.id);
      const pricePromise = getLunoPrices([crypto.symbol], { retailOverlay: false });
      
      // Helper function to add timeout to a promise
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
          ),
        ]);
      };
      
      // Fetch with individual timeouts (longer timeout for balance, shorter for price)
      const [balancesResult, priceResult] = await Promise.allSettled([
        withTimeout(balancePromise, 15000, 'Balance fetch timeout').catch(err => {
          console.warn('Balance fetch error:', err.message);
          return { balances: {}, error: err.message };
        }),
        withTimeout(pricePromise, 22000, 'Price fetch timeout').catch(err => {
          console.warn('Price fetch error:', err.message);
          return { prices: {}, error: err.message };
        }),
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : { balances: {}, error: 'Failed to fetch balance' },
        results[1].status === 'fulfilled' ? results[1].value : { prices: {}, error: 'Failed to fetch price' },
      ]) as [
        { balances: Record<string, any>; error?: string },
        { prices: Record<string, any>; error?: string }
      ];
      
      // Set balance - always set a value, even if 0
      if (balancesResult.balances && balancesResult.balances[crypto.symbol]) {
        const balance = balancesResult.balances[crypto.symbol].balance;
        setCryptoBalance(balance || 0);
      } else {
        setCryptoBalance(0);
      }
      
      // Set price from market spot (retail overlay off)
      if (priceResult.prices && priceResult.prices[crypto.symbol]) {
        const price = priceResult.prices[crypto.symbol];
        setCryptoPriceUSD(price.price_usd || null);
        setCryptoPriceNGN(price.price_ngn || null);
        console.log(`✅ Using spot rate for ${crypto.symbol}: $${price.price_usd} / ₦${price.price_ngn}`);
      } else {
        console.warn(`Could not fetch ${crypto.symbol} price:`, priceResult.error);
        // Try to use fallback price from cryptoData if available
        if (crypto.price) {
          // Convert USD price to NGN (assuming 1650 NGN per USD)
          setCryptoPriceUSD(crypto.price);
          setCryptoPriceNGN(crypto.price * 1650);
        } else {
          setCryptoPriceUSD(null);
          setCryptoPriceNGN(null);
        }
      }
    } catch (error: any) {
      console.error('Error fetching balance:', error);
      // Always set balance to 0 on error to stop loading
      setCryptoBalance(0);
      // Try fallback price
      if (crypto.price) {
        setCryptoPriceUSD(crypto.price);
        setCryptoPriceNGN(crypto.price * 1650);
      } else {
        setCryptoPriceUSD(null);
        setCryptoPriceNGN(null);
      }
    } finally {
      // Always stop loading, even on error
      setBalanceLoading(false);
    }
  };

  const handleQuickAmount = (percentage: number) => {
    const quickCrypto = (cryptoBalance * percentage) / 100;
    setAmount(quickCrypto.toFixed(8));
    if (amountInputMode === 'ngn' && cryptoPriceNGN) {
      setNgnAmountInput((quickCrypto * cryptoPriceNGN).toFixed(2));
    }
  };

  const handleQuickNgnAmount = (ngnValue: number) => {
    if (!cryptoPriceNGN || cryptoPriceNGN <= 0) return;
    setNgnAmountInput(ngnValue.toFixed(2));
    setAmount((ngnValue / cryptoPriceNGN).toFixed(8));
  };

  const handleAmountInputChange = (text: string) => {
    if (amountInputMode === 'crypto') {
      setAmount(text);
    } else {
      setNgnAmountInput(text.replace(/[^0-9.]/g, ''));
    }
  };

  const switchAmountMode = (mode: 'crypto' | 'ngn') => {
    if (mode === amountInputMode) return;
    if (mode === 'ngn' && !cryptoPriceNGN) {
      Alert.alert('Price Unavailable', 'NGN conversion requires the current price. Please wait for prices to load.');
      return;
    }
    if (mode === 'ngn') {
      // Switching to NGN: convert current crypto amount to NGN
      const cryptoVal = parseFloat(amount);
      if (!isNaN(cryptoVal) && cryptoVal > 0) {
        setNgnAmountInput((cryptoVal * cryptoPriceNGN!).toFixed(2));
      } else {
        setNgnAmountInput('');
      }
    } else {
      // Switching to crypto: amount is already set from ngnAmountInput
      setNgnAmountInput('');
    }
    setAmountInputMode(mode);
  };

  const handlePasteAddress = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        const extractedAddress = extractAddressFromQR(text);
        const validation = validateAddress(extractedAddress, crypto.symbol);
        
        if (validation.valid) {
          setRecipientAddress(extractedAddress);
          setAddressError(null);
        Alert.alert('Success', 'Address pasted from clipboard');
        } else {
          setAddressError(validation.error || 'Invalid address format');
          Alert.alert('Invalid Address', validation.error || 'The pasted address is not valid for this cryptocurrency');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to paste address');
    }
  };

  const handleScanQR = async () => {
    // Reset scanning flag when opening scanner
    setIsScanning(false);
    
    // Check if CameraView is available
    if (!CameraView) {
      Alert.alert(
        'QR Scanner Not Available',
        'Camera module is not available. Please restart the app after installing expo-camera.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Request camera permission
    if (!cameraPermission) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to scan QR codes. You can enable it in your device settings.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to scan QR codes. You can enable it in your device settings.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    setShowScanner(true);
  };

  const handleQRCodeScanned = ({ data }: { data: string }) => {
    // Prevent multiple scans
    if (!data || isScanning) {
      return;
    }

    // Set scanning flag to prevent multiple scans
    setIsScanning(true);
    
    // Close scanner immediately
    setShowScanner(false);
    
    // Process the scanned data
    const extractedAddress = extractAddressFromQR(data);
    const validation = validateAddress(extractedAddress, crypto.symbol);

    if (validation.valid) {
      setRecipientAddress(extractedAddress);
      setAddressError(null);
      // Reset scanning flag after a short delay
      setTimeout(() => setIsScanning(false), 500);
    } else {
      setAddressError(validation.error || 'Invalid address format');
      setIsScanning(false);
      Alert.alert(
        'Invalid Address',
        validation.error || 'The scanned QR code does not contain a valid address for this cryptocurrency',
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Allow user to scan again
              setIsScanning(false);
            }
          }
        ]
      );
    }
  };

  const handleAddressChange = async (text: string) => {
    setRecipientAddress(text);
    setAddressError(null);
    setIsContractAddress(false);
    
    // Validate address as user types (only if address is long enough)
    if (text.length > 10) {
      const validation = validateAddress(text, crypto.symbol);
      if (!validation.valid) {
        setAddressError(validation.error || 'Invalid address format');
        return;
      }
      
      // Check if address is a contract (only for ETH)
      if (crypto.symbol === 'ETH' && text.trim().length === 42 && /^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
        setCheckingContract(true);
        try {
          const { checkIfContract } = await import('@/lib/contract-checker');
          const result = await checkIfContract(text.trim());
          setIsContractAddress(result.isContract);
          if (result.isContract) {
            // Don't set as error, just a warning - user can still proceed
            console.warn('⚠️ Contract address detected:', text.trim());
          }
        } catch (error) {
          console.error('Error checking contract:', error);
          // Don't block user if check fails
        } finally {
          setCheckingContract(false);
        }
      }
    }
  };

  const handleProceed = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > cryptoBalance) {
      Alert.alert('Error', 'Insufficient crypto balance');
      return;
    }

    if (!recipientAddress || recipientAddress.trim().length < 10) {
      Alert.alert('Error', 'Please enter a valid recipient address');
      return;
    }

    // Check transaction limit based on NGN value (if crypto price is available)
    if (user?.id && cryptoPriceNGN) {
      const ngnValue = parseFloat(amount) * cryptoPriceNGN;
      const { checkTransactionLimit } = await import('@/lib/transaction-limit-service');
      const limitCheck = await checkTransactionLimit(user.id, ngnValue);
      
      if (!limitCheck.allowed && limitCheck.requiresVerification) {
        Alert.alert(
          'Account Verification Required',
          limitCheck.message || `Transactions above ₦50,000 require account verification. Please verify your account to upgrade your transaction limit.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Account',
              onPress: () => {
                router.push('/profile/verify-account');
              },
            },
          ]
        );
        return;
      }
    }

    // Check if sending to contract address (for ETH)
    if (crypto.symbol === 'ETH' && isContractAddress) {
      Alert.alert(
        'Contract Address Detected',
        'You are sending to a contract address. Some contracts may reject ETH transfers, which could cause your transaction to fail. Do you want to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              // Show confirmation modal first (for ETH, estimate fees first)
              if (amount && parseFloat(amount) > 0) {
                setFeeLoadingEstimate(true);
                try {
                  await estimateETHNetworkFee();
                } catch (error) {
                  console.error('Error estimating fee:', error);
                  setNetworkFee(0.0000275);
                } finally {
                  setFeeLoadingEstimate(false);
                }
              }
              setShowConfirmModal(true);
            },
          },
        ]
      );
      return;
    }

    // Show confirmation modal first (for ETH, estimate fees first)
    if (crypto.symbol === 'ETH' && amount && parseFloat(amount) > 0) {
      setFeeLoadingEstimate(true);
      try {
        await estimateETHNetworkFee();
      } catch (error) {
        console.error('Error estimating fee:', error);
        // Use default fee if estimation fails
        setNetworkFee(0.0000275); // Default fee ~$0.12
      } finally {
        setFeeLoadingEstimate(false);
      }
    }
    
    setShowConfirmModal(true);
  };

  const handleConfirmButtonClick = () => {
    // Close confirmation modal and show PIN entry modal
    setShowConfirmModal(false);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = async () => {
    // PIN verified, now process the payment
    setShowAuthModal(false);
    await handleConfirmSend();
  };

  const estimateETHNetworkFee = async () => {
    try {
      const alchemyUrl = 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
      
      const gasPriceResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        }),
      });

      if (gasPriceResponse.ok) {
        const gasPriceData = await gasPriceResponse.json();
        const gasPriceWei = BigInt(gasPriceData.result || '0x0');
        const gasLimit = BigInt(21000); // Standard ETH transfer gas limit
        const estimatedGasFee = gasPriceWei * gasLimit;
        const estimatedGasFeeEth = Number(estimatedGasFee) / 1e18;
        setNetworkFee(estimatedGasFeeEth);
      } else {
        // Fallback to default fee
        setNetworkFee(0.0000275);
      }
    } catch (error) {
      console.error('Error estimating ETH network fee:', error);
      // Fallback to default fee
      setNetworkFee(0.0000275);
    }
  };

  const handleConfirmSend = async () => {
    setShowConfirmModal(false);
    
    if (!user?.id || !crypto) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setSending(true);
      
      // Validate inputs
      if (!amount || parseFloat(amount) <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid amount to send.');
        setSending(false);
        return;
      }

      if (!recipientAddress.trim()) {
        Alert.alert('Invalid Address', 'Please enter a recipient address.');
        setSending(false);
        return;
      }

      // Check user profile balance (from wallet_balances table)
      // This balance is synced via deposit detection
      const sendAmount = parseFloat(amount);
      const requiredTotal = totalRequired > 0 ? totalRequired : sendAmount + sendFee;
      
      // Use the user's wallet balance from wallet_balances table
      // This is the authoritative balance that includes all deposits and transactions
      if (requiredTotal > cryptoBalance) {
        const feeText = sendFee > 0 ? ` (${formatCryptoBalance(sendAmount, crypto.symbol)} send + ${formatCryptoBalance(sendFee, crypto.symbol)} fee)` : '';
        setSending(false);
        setInsufficientBalanceError(
          `Insufficient balance. Available: ${formatCryptoBalance(cryptoBalance, crypto.symbol)} ${crypto.symbol}, Required: ${formatCryptoBalance(requiredTotal, crypto.symbol)} ${crypto.symbol}${feeText}`
        );
        setShowInsufficientBalanceModal(true);
        return;
      }

      // Process transaction - use appropriate send function for each crypto
      if (crypto.symbol === 'ETH') {
        // Check if user has an Ethereum wallet
        const { data: ethWallet } = await supabase
          .from('crypto_wallets')
          .select('id, address')
          .eq('user_id', user.id)
          .eq('asset', 'ETH')
          .eq('network', 'mainnet')
          .eq('is_active', true)
          .single();

        if (!ethWallet) {
          setSending(false);
          Alert.alert(
            'Ethereum Wallet Required',
            'You need to set up your Ethereum wallet before sending ETH.\n\nPlease contact support or use the wallet setup feature to add your Ethereum wallet address and private key.',
            [
              { text: 'OK', style: 'default' },
            ]
          );
          return;
        }

        try {
          const result = await sendEthereum({
            destination_address: recipientAddress.trim(),
            amount_eth: amount,
          });

          if (result.success && result.transaction_hash) {
            setLastTransactionHash(result.transaction_hash);
            setSentAmount(result.amount || amount);
            setSending(false);
            setShowSuccessModal(true);
            setAmount('');
            setRecipientAddress('');
            setMemo('');
            setAddressError(null);
            setTimeout(() => {
              fetchBalance();
            }, 1000);
          } else {
            setSending(false);
            const errorMsg = result.error || 'Failed to send ETH. Please try again.';
            if (errorMsg.toLowerCase().includes('insufficient balance') || 
                errorMsg.toLowerCase().includes('insufficient')) {
              setInsufficientBalanceError(errorMsg);
              setShowInsufficientBalanceModal(true);
            } else {
              Alert.alert('Error', errorMsg);
            }
          }
        } catch (error: any) {
          console.error('Error sending ETH:', error);
          setSending(false);
          const errorMsg = error.message || 'Failed to send ETH. Please try again.';
          if (errorMsg.toLowerCase().includes('insufficient balance') || 
              errorMsg.toLowerCase().includes('insufficient')) {
            setInsufficientBalanceError(errorMsg);
            setShowInsufficientBalanceModal(true);
          } else {
            Alert.alert('Error', errorMsg);
          }
        }
      } else if (crypto.symbol === 'SOL') {
        // Check if user has a Solana wallet
        const { data: solWallet } = await supabase
          .from('crypto_wallets')
          .select('id, address')
          .eq('user_id', user.id)
          .eq('asset', 'SOL')
          .eq('network', 'mainnet')
          .eq('is_active', true)
          .single();

        if (!solWallet) {
          setSending(false);
          Alert.alert(
            'Solana Wallet Required',
            'You need to set up your Solana wallet before sending SOL.\n\nPlease contact support or use the wallet setup feature to add your Solana wallet address and private key.',
            [
              { text: 'OK', style: 'default' },
            ]
          );
          return;
        }

        try {
          const result = await sendSOL({
            destination_address: recipientAddress.trim(),
            amount_sol: amount,
          });

          if (result.success && result.transaction_hash) {
            setLastTransactionHash(result.transaction_hash);
            setSentAmount(result.amount || amount);
            setSending(false);
            setShowSuccessModal(true);
            setAmount('');
            setRecipientAddress('');
            setMemo('');
            setAddressError(null);
            setTimeout(() => {
              fetchBalance();
            }, 1000);
          } else {
            setSending(false);
            const errorMsg = result.error || 'Failed to send SOL. Please try again.';
            if (errorMsg.toLowerCase().includes('insufficient balance') || 
                errorMsg.toLowerCase().includes('insufficient')) {
              setInsufficientBalanceError(errorMsg);
              setShowInsufficientBalanceModal(true);
            } else {
              Alert.alert('Error', errorMsg);
            }
          }
        } catch (error: any) {
          console.error('Error sending SOL:', error);
          setSending(false);
          const errorMsg = error.message || 'Failed to send SOL. Please try again.';
          if (errorMsg.toLowerCase().includes('insufficient balance') || 
              errorMsg.toLowerCase().includes('insufficient')) {
            setInsufficientBalanceError(errorMsg);
            setShowInsufficientBalanceModal(true);
          } else {
            Alert.alert('Error', errorMsg);
          }
        }
      } else if (crypto.symbol === 'BTC' || crypto.symbol === 'USDT' || crypto.symbol === 'USDC' || crypto.symbol === 'XRP') {
        let result: any = null;
        const destination = recipientAddress.trim();

        if (crypto.symbol === 'BTC') {
          result = await sendBitcoin({ destination_address: destination, amount_btc: amount });
        } else if (crypto.symbol === 'USDT') {
          result = await sendUsdt({ destination_address: destination, amount_usdt: amount });
        } else if (crypto.symbol === 'USDC') {
          result = await sendUsdc({ destination_address: destination, amount_usdc: amount });
        } else if (crypto.symbol === 'XRP') {
          result = await sendXrp({ destination_address: destination, amount_xrp: amount });
        }

        if (result?.success && result?.transaction_hash) {
          setLastTransactionHash(result.transaction_hash);
          setSentAmount(result.amount || amount);
          setSending(false);
          setShowSuccessModal(true);
          setAmount('');
          setRecipientAddress('');
          setMemo('');
          setAddressError(null);
          setTimeout(() => {
            fetchBalance();
          }, 1000);
        } else {
          setSending(false);
          const errorMsg = result?.error || `Failed to send ${crypto.symbol}. Please try again.`;
          if (errorMsg.toLowerCase().includes('insufficient')) {
            setInsufficientBalanceError(errorMsg);
            setShowInsufficientBalanceModal(true);
          } else {
            Alert.alert('Error', errorMsg);
          }
        }
      } else {
        setSending(false);
        Alert.alert('Feature Unavailable', `Send ${crypto.symbol} is not supported yet.`);
      }
    } catch (error: any) {
      console.error('Error sending crypto:', error);
      Alert.alert('Error', error.message || 'Failed to send crypto. Please try again.');
      setSending(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setLastTransactionHash(null);
    setSentAmount(''); // Clear sent amount when closing modal
    router.back();
  };

  if (!crypto) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Crypto not found</ThemedText>
      </ThemedView>
    );
  }

  const quickPercentages = [
    { label: '25%', value: 25 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
  ];
  const quickNgnAmounts = [
    { label: '₦1,000', value: 1000 },
    { label: '₦5,000', value: 5000 },
    { label: '₦10,000', value: 10000 },
    { label: '₦50,000', value: 50000 },
  ];

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
              onPress={() => {
                if (fromWallet) {
                  // Navigate back to wallet page if coming from wallet
                  router.push('/(tabs)/wallet');
                } else {
                  // Otherwise use default back navigation
                  router.back();
                }
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Send {crypto.symbol}</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            {/* Crypto Info Card */}
            <View style={styles.cryptoCard}>
              <Image
                source={crypto.logo}
                style={styles.cryptoLogo}
                contentFit="contain"
              />
              <View style={styles.cryptoInfo}>
                <ThemedText 
                  style={styles.cryptoName}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {crypto.name}
                </ThemedText>
              </View>
            </View>

            {/* Available Balance */}
            <View style={styles.balanceCard}>
              <ThemedText 
                style={styles.balanceLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Available Balance
              </ThemedText>
              {balanceLoading ? (
                <AppLoadingIndicator size="small" style={{ marginTop: 8 }} />
              ) : (
                <View style={styles.balanceAmountContainer}>
                  <ThemedText 
                    style={styles.balanceAmount}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.4}
                  >
                    {formatCryptoBalance(cryptoBalance, crypto.symbol)} {crypto.symbol}
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Amount Input Section */}
            <View style={styles.section}>
              <View style={styles.amountSectionHeader}>
                <ThemedText style={[styles.sectionLabel, styles.amountSectionLabel]}>Amount</ThemedText>
                <View style={styles.amountModeToggle}>
                  <TouchableOpacity
                    style={[styles.amountModeButton, amountInputMode === 'crypto' && styles.amountModeButtonActive]}
                    onPress={() => switchAmountMode('crypto')}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={[styles.amountModeText, amountInputMode === 'crypto' && styles.amountModeTextActive]}>
                      {crypto.symbol}
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.amountModeButton, amountInputMode === 'ngn' && styles.amountModeButtonActive]}
                    onPress={() => switchAmountMode('ngn')}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={[styles.amountModeText, amountInputMode === 'ngn' && styles.amountModeTextActive]}>
                      NGN
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.amountInputContainer}>
                <ThemedText style={styles.cryptoSymbol}>
                  {amountInputMode === 'crypto' ? crypto.symbol : '₦'}
                </ThemedText>
                <TextInput
                  style={styles.amountInput}
                  placeholder={amountInputMode === 'crypto' ? '0.00000000' : '0.00'}
                  placeholderTextColor="#9CA3AF"
                  value={amountInputMode === 'crypto' ? amount : ngnAmountInput}
                  onChangeText={handleAmountInputChange}
                  keyboardType="decimal-pad"
                  numberOfLines={1}
                />
              </View>
              
              {/* Fee Display */}
              {amount && parseFloat(amount) > 0 && recipientAddress && validateAddress(recipientAddress, crypto.symbol).valid && (
                <View style={styles.feeContainer}>
                  {feeLoading ? (
                    <View style={styles.feeRow}>
                      <ThemedText style={styles.feeLabel}>Calculating fee...</ThemedText>
                      <AppLoadingIndicator size="small" />
                    </View>
                  ) : (
                    <>
                      {sendFee > 0 && (
                        <View style={styles.feeRow}>
                          <ThemedText style={styles.feeLabel}>Network Fee:</ThemedText>
                          <ThemedText style={styles.feeAmount}>
                            {formatCryptoBalance(sendFee, crypto.symbol)} {crypto.symbol}
                          </ThemedText>
                        </View>
                      )}
                      {totalRequired > parseFloat(amount) && (
                        <View style={[styles.feeRow, styles.totalRow]}>
                          <ThemedText style={styles.totalLabel}>Total Required:</ThemedText>
                          <ThemedText style={styles.totalAmount}>
                            {formatCryptoBalance(totalRequired, crypto.symbol)} {crypto.symbol}
                          </ThemedText>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
              
              {amount && cryptoPriceNGN && (
                <ThemedText style={styles.equivalentText}>
                  {amountInputMode === 'crypto'
                    ? `≈ ${formatNgnValue(parseFloat(amount) * cryptoPriceNGN)}`
                    : `≈ ${formatCryptoBalance(parseFloat(amount), crypto.symbol)} ${crypto.symbol}`}
                </ThemedText>
              )}
              {amount && parseFloat(amount) > cryptoBalance && (
                <ThemedText style={styles.errorText}>
                  Insufficient balance
                </ThemedText>
              )}
            </View>

            {/* Quick Amounts */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.quickAmountsLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Quick Amounts
              </ThemedText>
              <View style={styles.quickAmountsContainer}>
                {amountInputMode === 'crypto'
                  ? quickPercentages.map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.quickAmountButton,
                          amount === ((cryptoBalance * item.value) / 100).toFixed(8) && styles.quickAmountButtonActive,
                        ]}
                        onPress={() => handleQuickAmount(item.value)}
                        activeOpacity={0.7}
                      >
                        <ThemedText
                          style={[
                            styles.quickAmountText,
                            amount === ((cryptoBalance * item.value) / 100).toFixed(8) && styles.quickAmountTextActive,
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {item.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))
                  : quickNgnAmounts.map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.quickAmountButton,
                          ngnAmountInput === item.value.toFixed(2) && styles.quickAmountButtonActive,
                          !cryptoPriceNGN && styles.quickAmountButtonDisabled,
                        ]}
                        onPress={() => handleQuickNgnAmount(item.value)}
                        activeOpacity={0.7}
                        disabled={!cryptoPriceNGN}
                      >
                        <ThemedText
                          style={[
                            styles.quickAmountText,
                            ngnAmountInput === item.value.toFixed(2) && styles.quickAmountTextActive,
                            !cryptoPriceNGN && styles.quickAmountTextDisabled,
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {item.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
              </View>
            </View>

            {/* Recipient Address */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>Recipient Address</ThemedText>
              <View style={styles.addressInputContainer}>
                <TextInput
                  style={[styles.addressInput, addressError && styles.addressInputError]}
                  placeholder="Enter recipient address"
                  placeholderTextColor="#9CA3AF"
                  value={recipientAddress}
                  onChangeText={handleAddressChange}
                  multiline
                  numberOfLines={2}
                />
                {checkingContract && (
                  <View style={styles.checkingContractContainer}>
                    <AppLoadingIndicator size="small" />
                    <ThemedText style={styles.checkingContractText}>Checking address...</ThemedText>
                  </View>
                )}
                <View style={styles.addressActions}>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanQR}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="qr-code-scanner" size={20} color="#6B46C1" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pasteButton}
                    onPress={handlePasteAddress}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="content-paste" size={20} color="#6B46C1" />
                  </TouchableOpacity>
                  {/* Demo Button - Only visible for demo users */}
                  {user?.email?.toLowerCase() === 'demo@chaincola.com' && (
                    <TouchableOpacity
                      style={styles.demoButton}
                      onPress={() => {
                        const demoWallet = getDemoWallet(crypto.symbol);
                        if (demoWallet) {
                          setRecipientAddress(demoWallet.address);
                          Alert.alert(
                            'Demo Address Loaded',
                            `Demo ${demoWallet.name} address loaded. This is a test address for demonstration purposes.`,
                            [{ text: 'OK' }]
                          );
                        } else {
                          Alert.alert('Demo Address Not Available', `No demo address available for ${crypto.symbol}`);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="science" size={20} color="#F59E0B" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {addressError && (
                <ThemedText style={styles.addressErrorText}>{addressError}</ThemedText>
              )}
              {isContractAddress && !addressError && (
                <View style={styles.contractWarningContainer}>
                  <MaterialIcons name="warning" size={16} color="#F59E0B" />
                  <ThemedText style={styles.contractWarningText}>
                    This is a contract address. Some contracts may reject ETH transfers, which could cause your transaction to fail.
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Memo (Optional) */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>Memo (Optional)</ThemedText>
              <TextInput
                style={styles.memoInput}
                placeholder="Add a note (optional)"
                placeholderTextColor="#9CA3AF"
                value={memo}
                onChangeText={setMemo}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Summary */}
            {amount && recipientAddress && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>You're sending</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {parseFloat(amount).toFixed(8)} {crypto.symbol}
                  </ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Network fee</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {crypto.symbol === 'USDT' || crypto.symbol === 'USDC'
                      ? `~${estimatedFees?.networkFee?.toFixed(6) || '0.001000'} ETH`
                      : `~${formatCryptoBalance(estimatedFees?.networkFee || 0, crypto.symbol)} ${crypto.symbol}`}
                  </ThemedText>
                </View>
              {(estimatedFees?.platformFee || 0) > 0 && (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Platform fee</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {formatCryptoBalance(estimatedFees?.platformFee || 0, crypto.symbol)} {crypto.symbol}
                  </ThemedText>
                </View>
              )}
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Total</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {(totalRequired > 0 ? totalRequired : parseFloat(amount)).toFixed(8)} {crypto.symbol}
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendButton, (!amount || !recipientAddress) && styles.sendButtonDisabled]}
              onPress={handleProceed}
              disabled={!amount || !recipientAddress}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={amount && recipientAddress ? ['#6B46C1', '#9333EA'] : ['#D1D5DB', '#9CA3AF']}
                style={styles.sendButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <MaterialIcons name="send" size={20} color="#FFFFFF" />
                <ThemedText 
                  style={styles.sendButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Send {crypto.symbol}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Authentication Modal */}
      {user?.id && (
        <TransactionAuthModal
          visible={showAuthModal}
          onSuccess={handleAuthSuccess}
          onCancel={() => setShowAuthModal(false)}
          userId={user.id}
          transactionType="send"
        />
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (sending) return;
          setShowConfirmModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView 
            contentContainerStyle={styles.confirmModalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={crypto.symbol === 'ETH' ? styles.confirmModalContent : styles.summaryModal}>
              {/* Header with back button */}
              <View style={styles.confirmModalHeader}>
                <TouchableOpacity
                  style={styles.confirmModalBackButton}
                  onPress={() => {
                    if (sending) return;
                    setShowConfirmModal(false);
                  }}
                  activeOpacity={sending ? 1 : 0.8}
                  disabled={sending}
                >
                  <MaterialIcons name="arrow-back" size={24} color={sending ? '#9CA3AF' : '#11181C'} />
                </TouchableOpacity>
                <ThemedText 
                  style={styles.confirmModalTitleHeader}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {crypto.symbol === 'ETH' 
                    ? `Confirm ${crypto.symbol} ${parseFloat(amount || '0').toFixed(8)} send to ${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)}`
                    : `Confirm Send ${crypto.symbol}`
                  }
                </ThemedText>
              </View>

              {crypto.symbol === 'ETH' ? (
                // ETH-specific confirmation modal matching the design
                <>
                  {/* Crypto Logo */}
                  <View style={styles.confirmCryptoIconContainer}>
                    <Image
                      source={crypto.logo}
                      style={styles.confirmCryptoIcon}
                      contentFit="contain"
                    />
                  </View>

                {/* Wallet Address */}
                <View style={styles.confirmAddressSection}>
                  <ThemedText style={styles.confirmAddressLabel}>WALLET ADDRESS</ThemedText>
                  <ThemedText style={styles.confirmAddressValue} numberOfLines={1}>
                    {recipientAddress}
                  </ThemedText>
                </View>

                {/* Network */}
                <View style={styles.confirmNetworkSection}>
                  <ThemedText style={styles.confirmNetworkLabel}>NETWORK</ThemedText>
                  <ThemedText style={styles.confirmNetworkValue}>Ethereum</ThemedText>
                </View>

                {/* Memo (if provided) */}
                {memo && memo.trim() && (
                  <View style={styles.confirmMemoSection}>
                    <ThemedText style={styles.confirmMemoLabel}>MEMO</ThemedText>
                    <ThemedText style={styles.confirmMemoValue}>{memo}</ThemedText>
                  </View>
                )}

                {/* You Send */}
                <View style={styles.confirmSendSection}>
                  <ThemedText style={styles.confirmSendLabel}>YOU SEND</ThemedText>
                  <View style={styles.confirmSendAmountRow}>
                    <ThemedText style={styles.confirmSendAmount}>
                      {crypto.symbol} {parseFloat(amount || '0').toFixed(8)}
                    </ThemedText>
                    {cryptoPriceNGN && (
                      <ThemedText style={styles.confirmSendEquivalent}>
                        {formatNgnValue(parseFloat(amount || '0') * cryptoPriceNGN)}
                      </ThemedText>
                    )}
                  </View>
                </View>

                {/* Network Fee */}
                <View style={styles.confirmFeeSection}>
                  <View style={styles.confirmFeeHeader}>
                    <ThemedText style={styles.confirmFeeLabel}>NETWORK FEE</ThemedText>
                    <TouchableOpacity activeOpacity={0.7}>
                      <MaterialIcons name="help-outline" size={18} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  {feeLoadingEstimate ? (
                    <AppLoadingIndicator size="small" style={{ marginTop: 4 }} />
                  ) : (
                    <View style={styles.confirmFeeAmountRow}>
                      <ThemedText style={styles.confirmFeeAmount}>
                        {crypto.symbol} {(estimatedFees?.networkFee || 0).toFixed(8)}
                      </ThemedText>
                      {cryptoPriceNGN && (
                        <ThemedText style={styles.confirmFeeEquivalent}>
                          {formatNgnValue((estimatedFees?.networkFee || 0) * cryptoPriceNGN)}
                        </ThemedText>
                      )}
                    </View>
                  )}
                </View>

                {(estimatedFees?.platformFee || 0) > 0 && (
                  <View style={styles.confirmFeeSection}>
                    <View style={styles.confirmFeeHeader}>
                      <ThemedText style={styles.confirmFeeLabel}>PLATFORM FEE</ThemedText>
                    </View>
                    <View style={styles.confirmFeeAmountRow}>
                      <ThemedText style={styles.confirmFeeAmount}>
                        {crypto.symbol} {(estimatedFees?.platformFee || 0).toFixed(8)}
                      </ThemedText>
                      {cryptoPriceNGN && (
                        <ThemedText style={styles.confirmFeeEquivalent}>
                          {formatNgnValue((estimatedFees?.platformFee || 0) * cryptoPriceNGN)}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                )}

                {/* You Spend */}
                <View style={styles.confirmSpendSection}>
                  <ThemedText style={styles.confirmSpendLabel}>YOU SPEND</ThemedText>
                  <View style={styles.confirmSpendAmountRow}>
                    <ThemedText style={styles.confirmSpendAmount}>
                      {crypto.symbol} {(totalRequired > 0 ? totalRequired : parseFloat(amount || '0')).toFixed(8)}
                    </ThemedText>
                    {cryptoPriceNGN && (
                      <ThemedText style={styles.confirmSpendEquivalent}>
                        {formatNgnValue((totalRequired > 0 ? totalRequired : parseFloat(amount || '0')) * cryptoPriceNGN)}
                      </ThemedText>
                    )}
                  </View>
                </View>

                {/* Note */}
                <View style={styles.confirmNoteSection}>
                  <ThemedText style={styles.confirmNoteText}>
                    Total spend includes estimated network and platform fees.
                  </ThemedText>
                </View>

                {/* Confirm Button */}
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleConfirmButtonClick}
                  activeOpacity={0.8}
                  disabled={feeLoadingEstimate}
                >
                  <LinearGradient
                    colors={['#6B46C1', '#9333EA']}
                    style={styles.confirmButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {feeLoadingEstimate ? (
                      <AppLoadingIndicator size="small" variant="onPrimary" />
                    ) : (
                      <ThemedText 
                        style={styles.confirmButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        CONFIRM
                      </ThemedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              // Default confirmation modal for other cryptos - matching sell modal style
              <>
                <View style={[styles.summaryHeader, sending && styles.summaryHeaderSending]}>
                  <View style={[styles.summaryIconContainer, sending && styles.summaryIconContainerSending]}>
                    <Image
                      source={crypto.logo}
                      style={[styles.confirmCryptoLogo, sending && styles.confirmCryptoLogoSending]}
                      contentFit="contain"
                    />
                  </View>
                  <ThemedText style={[styles.summaryModalTitle, sending && styles.summaryModalTitleSending]}>
                    Send Summary
                  </ThemedText>
                  <ThemedText style={styles.summaryModalSubtitle}>
                    {sending ? 'Processing your send…' : 'Review your send transaction details'}
                  </ThemedText>
                </View>
                
                <View style={styles.summaryDetails}>
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowLeft}>
                        <MaterialIcons name="account-balance-wallet" size={20} color="#6B7280" />
                        <ThemedText style={styles.summaryLabel}>Sending</ThemedText>
                      </View>
                      <View style={styles.summaryRowRight}>
                        <ThemedText style={styles.summaryValue}>
                          {parseFloat(amount || '0').toFixed(8)} {crypto.symbol}
                        </ThemedText>
                      </View>
                    </View>
                    
                    <View style={styles.summaryDivider} />
                    
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryRowLeft}>
                        <MaterialIcons name="person" size={20} color="#6B7280" />
                        <ThemedText style={styles.summaryLabel}>To Address</ThemedText>
                      </View>
                      <View style={styles.summaryRowRight}>
                        <ThemedText style={[styles.summaryValue, styles.addressValue]} numberOfLines={1}>
                          {recipientAddress.substring(0, 8)}...{recipientAddress.substring(recipientAddress.length - 6)}
                        </ThemedText>
                      </View>
                    </View>
                    
                    {memo && memo.trim() && (
                      <>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryRow}>
                          <View style={styles.summaryRowLeft}>
                            <MaterialIcons name="note" size={20} color="#6B7280" />
                            <ThemedText style={styles.summaryLabel}>Memo</ThemedText>
                          </View>
                          <View style={styles.summaryRowRight}>
                            <ThemedText style={styles.summaryValue} numberOfLines={2}>
                              {memo}
                            </ThemedText>
                          </View>
                        </View>
                      </>
                    )}
                    
                    {cryptoPriceNGN && (
                      <>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryRow}>
                          <View style={styles.summaryRowLeft}>
                            <MaterialIcons name="attach-money" size={20} color="#6B7280" />
                            <ThemedText style={styles.summaryLabel}>Value</ThemedText>
                          </View>
                          <View style={styles.summaryRowRight}>
                            <ThemedText style={styles.summaryValue}>
                              {formatNgnValue(parseFloat(amount || '0') * cryptoPriceNGN)}
                            </ThemedText>
                          </View>
                        </View>
                      </>
                    )}

                    <>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryRowLeft}>
                          <MaterialIcons name="speed" size={20} color="#6B7280" />
                          <ThemedText style={styles.summaryLabel}>Network Fee</ThemedText>
                        </View>
                        <View style={styles.summaryRowRight}>
                          <ThemedText style={styles.summaryValue}>
                            {crypto.symbol === 'USDT' || crypto.symbol === 'USDC'
                              ? `${(estimatedFees?.networkFee || 0.001).toFixed(6)} ETH`
                              : `${(estimatedFees?.networkFee || 0).toFixed(8)} ${crypto.symbol}`}
                          </ThemedText>
                        </View>
                      </View>
                    </>

                    {(estimatedFees?.platformFee || 0) > 0 && (
                      <>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryRow}>
                          <View style={styles.summaryRowLeft}>
                            <MaterialIcons name="percent" size={20} color="#6B7280" />
                            <ThemedText style={styles.summaryLabel}>Platform Fee</ThemedText>
                          </View>
                          <View style={styles.summaryRowRight}>
                            <ThemedText style={styles.summaryValue}>
                              {(estimatedFees?.platformFee || 0).toFixed(8)} {crypto.symbol}
                            </ThemedText>
                          </View>
                        </View>
                      </>
                    )}

                    <>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryRowLeft}>
                          <MaterialIcons name="calculate" size={20} color="#6B7280" />
                          <ThemedText style={styles.summaryLabel}>Total</ThemedText>
                        </View>
                        <View style={styles.summaryRowRight}>
                          <ThemedText style={styles.summaryValue}>
                            {(totalRequired > 0 ? totalRequired : parseFloat(amount || '0')).toFixed(8)} {crypto.symbol}
                          </ThemedText>
                        </View>
                      </View>
                    </>
                  </View>
                </View>
                
                <View style={styles.summaryButtons}>
                  <TouchableOpacity
                    style={[
                      styles.summaryCancelButton,
                      sending && styles.summaryCancelButtonSending,
                    ]}
                    onPress={() => {
                      if (sending) return;
                      setShowConfirmModal(false);
                    }}
                    activeOpacity={sending ? 1 : 0.8}
                    disabled={sending}
                  >
                    <ThemedText
                      style={[
                        styles.summaryCancelButtonText,
                        sending && styles.summaryCancelButtonTextSending,
                      ]}
                    >
                      Cancel
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendNowButton, sending && styles.sendNowButtonSending]}
                    onPress={handleConfirmSend}
                    activeOpacity={sending ? 1 : 0.8}
                    disabled={sending}
                  >
                    <LinearGradient
                      colors={
                        sending ? ['#7C3AED', '#6B46C1'] : ['#6B46C1', '#9333EA']
                      }
                      style={styles.sendNowButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {sending ? (
                        <View style={styles.sendNowLoadingRow}>
                          <AppLoadingIndicator variant="onPrimary" size="medium" />
                          <ThemedText
                            style={styles.sendNowLoadingText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            Processing…
                          </ThemedText>
                        </View>
                      ) : (
                        <>
                          <MaterialIcons name="send" size={20} color="#FFFFFF" />
                          <ThemedText style={styles.sendNowButtonText}>Send Now</ThemedText>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Loading Overlay Modal */}
      <Modal
        visible={sending && !showSuccessModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingModalContent}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingModalText}>
              Sending {crypto.symbol}...
            </ThemedText>
            <ThemedText style={styles.loadingModalSubtext}>
              Please wait while we process your transaction
            </ThemedText>
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
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText 
              style={styles.successModalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Send Successful!
            </ThemedText>
            <ThemedText 
              style={styles.successModalMessage}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              You have successfully sent {sentAmount ? parseFloat(sentAmount).toFixed(8) : '0.00000000'} {crypto.symbol} to the recipient address.
            </ThemedText>
            {lastTransactionHash && (
              <ThemedText style={styles.summaryHashValue}>
                Tx: {lastTransactionHash}
              </ThemedText>
            )}
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
                  OK
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Code Scanner Modal */}
      <Modal
        visible={showScanner}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity
              style={styles.scannerCloseButton}
              onPress={() => setShowScanner(false)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <ThemedText style={styles.scannerTitle}>Scan QR Code</ThemedText>
            <View style={styles.placeholder} />
          </View>
          
          {CameraView && cameraPermission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={isScanning ? undefined : handleQRCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
            >
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <ThemedText style={styles.scannerInstruction}>
                  Position the QR code within the frame
                </ThemedText>
              </View>
            </CameraView>
          ) : !CameraView ? (
            <View style={styles.scannerPermissionContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
              <ThemedText style={styles.scannerPermissionText}>
                Camera module not available. Please restart the app.
              </ThemedText>
              <ThemedText style={[styles.scannerPermissionText, { fontSize: 12, marginTop: 10 }]}>
                Make sure expo-camera is installed: npm install expo-camera
              </ThemedText>
            </View>
          ) : (
            <View style={styles.scannerPermissionContainer}>
              <MaterialIcons name="camera-alt" size={64} color="#6B7280" />
              <ThemedText style={styles.scannerPermissionText}>
                Camera permission is required to scan QR codes
              </ThemedText>
              <TouchableOpacity
                style={styles.scannerPermissionButton}
                onPress={async () => {
                  const { granted } = await requestCameraPermission();
                  if (!granted) {
                    Alert.alert(
                      'Permission Denied',
                      'Please enable camera permission in your device settings'
                    );
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.scannerPermissionButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <ThemedText style={styles.scannerPermissionButtonText}>
                    Grant Permission
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalanceModal}
        onClose={() => {
          setShowInsufficientBalanceModal(false);
          setInsufficientBalanceError(null);
        }}
        errorMessage={insufficientBalanceError || undefined}
        cryptoSymbol={crypto.symbol}
      />
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
  cryptoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  cryptoLogo: {
    width: 56,
    height: 56,
  },
  cryptoInfo: {
    flex: 1,
  },
  cryptoName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cryptoPriceNGN: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    marginTop: 2,
  },
  cryptoPrice: {
    fontSize: 16,
    opacity: 0.7,
  },
  balanceCard: {
    backgroundColor: '#EDE9FE',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B46C1',
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
    lineHeight: 20,
  },
  balanceAmountContainer: {
    width: '100%',
    paddingHorizontal: 8,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 30,
    maxHeight: 80,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B46C1',
    textAlign: 'center',
    width: '100%',
    lineHeight: 32,
    flexShrink: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  amountSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountSectionLabel: {
    marginBottom: 0,
  },
  amountModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
  },
  amountModeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  amountModeButtonActive: {
    backgroundColor: '#6B46C1',
  },
  amountModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  amountModeTextActive: {
    color: '#FFFFFF',
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
  equivalentText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
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
  quickAmountButtonDisabled: {
    opacity: 0.5,
  },
  quickAmountTextDisabled: {
    color: '#9CA3AF',
  },
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 80,
  },
  addressInput: {
    flex: 1,
    fontSize: 14,
    color: '#11181C',
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  addressActions: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  scanButton: {
    padding: 8,
  },
  pasteButton: {
    padding: 8,
  },
  demoButton: {
    padding: 8,
  },
  addressInputError: {
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  feeContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
  },
  feeLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  feeAmount: {
    fontSize: 13,
    color: '#11181C',
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 14,
    color: '#11181C',
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 14,
    color: '#6B46C1',
    fontWeight: '700',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    backgroundColor: '#000000',
  },
  scannerCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#6B46C1',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scannerInstruction: {
    marginTop: 40,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  scannerPermissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#11181C',
  },
  scannerPermissionText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  scannerPermissionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 300,
  },
  scannerPermissionButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerPermissionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addressErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
    marginLeft: 4,
  },
  checkingContractContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  checkingContractText: {
    fontSize: 12,
    color: '#6B46C1',
  },
  contractWarningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  contractWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  memoInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#11181C',
    minHeight: 60,
    textAlignVertical: 'top',
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
  sendButton: {
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
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  summaryModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    margin: 20,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  summaryHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryHeaderSending: {
    opacity: 0.92,
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
  summaryIconContainerSending: {
    transform: [{ scale: 0.96 }],
  },
  summaryModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryModalTitleSending: {
    color: '#5B21B6',
  },
  summaryModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  summaryDetails: {
    marginBottom: 24,
    width: '100%',
    alignSelf: 'stretch',
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
    alignSelf: 'stretch',
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
    width: '100%',
    alignItems: 'stretch',
  },
  summaryCancelButton: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryCancelButtonSending: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
    opacity: 0.85,
  },
  summaryCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  summaryCancelButtonTextSending: {
    color: '#9CA3AF',
  },
  sendNowButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sendNowButtonSending: {
    opacity: 0.8,
  },
  sendNowButtonGradient: {
    minHeight: 52,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sendNowLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    width: '100%',
  },
  sendNowLoadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EDE9FE',
  },
  sendNowButtonDisabled: {
    opacity: 0.55,
  },
  sendNowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmIconContainer: {
    marginBottom: 16,
  },
  confirmCryptoLogo: {
    width: 48,
    height: 48,
  },
  confirmCryptoLogoSending: {
    width: 44,
    height: 44,
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
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  addressValue: {
    fontFamily: 'monospace',
    fontSize: 12,
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
  loadingModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 280,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingModalText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 20,
    textAlign: 'center',
  },
  loadingModalSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
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
    marginBottom: 16,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
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
  // ETH Confirmation Modal Styles
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  confirmModalTitleHeader: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#11181C',
    marginLeft: 8,
  },
  confirmModalBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  confirmAddressSection: {
    width: '100%',
    marginBottom: 20,
  },
  confirmAddressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  confirmAddressValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#11181C',
    fontFamily: 'monospace',
  },
  confirmNetworkSection: {
    width: '100%',
    marginBottom: 24,
  },
  confirmNetworkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  confirmNetworkValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmSendSection: {
    width: '100%',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  confirmSendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  confirmSendAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmSendAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmSendEquivalent: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
  },
  confirmFeeSection: {
    width: '100%',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  confirmFeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  confirmFeeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  confirmFeeAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmFeeAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmFeeEquivalent: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  confirmSpendSection: {
    width: '100%',
    marginBottom: 16,
  },
  confirmSpendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  confirmSpendAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmSpendAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
  },
  confirmSpendEquivalent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmNoteSection: {
    width: '100%',
    marginBottom: 24,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  confirmNoteText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    textAlign: 'center',
  },
  confirmMemoSection: {
    width: '100%',
    marginBottom: 20,
  },
  confirmMemoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  confirmMemoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#11181C',
  },
  confirmCryptoIconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmCryptoIcon: {
    width: 48,
    height: 48,
  },
  confirmButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  confirmModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  summaryModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 0,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  summaryDetails: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  summarySection: {
    marginBottom: 20,
  },
  summarySectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  summaryAmountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  summaryAmountValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#11181C',
    marginRight: 8,
  },
  summaryAmountSymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  summaryAmountEquivalent: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryTotalRow: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#11181C',
    flex: 1,
    textAlign: 'right',
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
    flex: 1,
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#11181C',
    flex: 1,
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  summaryAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryAddressValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#11181C',
    fontFamily: 'monospace',
    flex: 1,
    marginRight: 8,
  },
  summaryHashContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryHashValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B46C1',
    fontFamily: 'monospace',
    flex: 1,
    marginRight: 8,
  },
  summaryModalButton: {
    width: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  summaryModalButtonGradient: {
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryModalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
