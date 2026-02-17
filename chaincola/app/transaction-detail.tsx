import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Share, Alert, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { useAuth } from '@/contexts/AuthContext';
import { getTransactionById, Transaction, formatRelativeTime } from '@/lib/transaction-service';
import { getCryptoPrice } from '@/lib/crypto-price-service';

// Helper function to get crypto logo
function getCryptoLogo(symbol: string): any {
  const logoMap: Record<string, any> = {
    BTC: require('@/assets/images/bitcoin.png'),
    ETH: require('@/assets/images/ethereum.png'),
    USDT: require('@/assets/images/tether.png'),
    USDC: require('@/assets/images/usdc.png'),
    XRP: require('@/assets/images/ripple.png'),
    SOL: require('@/assets/images/solana.png'),
  };
  return logoMap[symbol] || null;
}

// Helper function to get crypto name
function getCryptoName(symbol: string): string {
  const nameMap: Record<string, string> = {
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    USDT: 'Tether',
    USDC: 'USD Coin',
    XRP: 'Ripple',
    SOL: 'Solana',
  };
  return nameMap[symbol] || symbol;
}

// Helper function to get network name
function getNetworkName(cryptoType?: string, currency?: string): string {
  if (cryptoType) {
    return `${cryptoType} Network`;
  }
  if (currency === 'BTC') return 'Bitcoin Network';
  if (currency === 'ETH') return 'Ethereum Network';
  if (currency === 'USDT' || currency === 'USDC') return 'Ethereum Network';
  if (currency === 'XRP') return 'Ripple Network';
  if (currency === 'NGN') return 'Bank Transfer';
  return 'Network';
}

// Map database transaction to UI format
function mapTransactionToUI(transaction: Transaction): any {
  const currency = transaction.currency;
  const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'].includes(currency);
  const isNaira = currency === 'NGN';
  
  
  // Get fiat currency from metadata or transaction (for SELL transactions, this is NGN)
  const fiatCurrency = transaction.metadata?.fiat_currency || 
                       (transaction as any).fiat_currency || 
                       'NGN';
  const isFiatNaira = fiatCurrency === 'NGN';

  // Determine UI type
  let uiType: string = transaction.type;
  if (transaction.type === 'deposit') {
    uiType = 'fund';
  } else if (transaction.type === 'withdraw' || transaction.type === 'withdrawal') {
    uiType = transaction.bank_name ? 'withdraw-bank' : 'withdraw';
  }

  // Get crypto info
  const cryptoName = isCrypto ? getCryptoName(currency) : (isNaira ? 'Bank' : 'Wallet');
  const cryptoLogo = isCrypto ? getCryptoLogo(currency) : null;

  // Format amounts
  const formatAmount = (amount: number, currency: string): string => {
    const isNaira = currency === 'NGN';
    const symbol = isNaira ? '₦' : '$';
    return `${symbol}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatCryptoAmount = (amount: number, decimals: number = 8): string => {
    return Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Convert NGN to USD for display (approximate rate: 1650 NGN = 1 USD)
  const NGN_TO_USD_RATE = 1650;
  const convertNGNToUSD = (ngnAmount: number): number => {
    return ngnAmount / NGN_TO_USD_RATE;
  };

  let amount = '';
  let price = '';
  let total = '';

  if (isCrypto) {
    // For RECEIVE transactions, always use crypto_amount (the actual amount received)
    // Don't fall back to transaction.amount which might be a different value
    const cryptoAmount = transaction.crypto_amount !== undefined && transaction.crypto_amount !== null
      ? transaction.crypto_amount
      : (transaction.type === 'receive' || transaction.type === 'RECEIVE' ? 0 : (transaction.amount || 0));
    amount = formatCryptoAmount(cryptoAmount);
    
    // Check fiat_currency to determine display currency
    if (transaction.fiat_amount) {
      const displayCurrency = isFiatNaira ? 'NGN' : ((transaction as any).fiat_currency || 'USD');
      const fiatAmount = transaction.fiat_amount;
      const unitPrice = cryptoAmount > 0 ? fiatAmount / cryptoAmount : 0;
      price = formatAmount(unitPrice, displayCurrency);
      total = formatAmount(fiatAmount, displayCurrency);
    } else {
      // Fallback: use USD for old transactions without fiat_amount
      const unitPrice = cryptoAmount > 0 ? transaction.amount / cryptoAmount : 0;
      price = formatAmount(unitPrice, 'USD');
      total = formatAmount(transaction.net_amount || transaction.amount, 'USD');
    }
  } else if (isNaira) {
    amount = formatAmount(transaction.amount, 'NGN');
    // Don't set price for fund wallet transactions
    price = transaction.type === 'deposit' || transaction.type === 'fund' ? '' : '₦1.00';
    total = formatAmount(transaction.net_amount || transaction.amount, 'NGN');
  } else {
    amount = formatAmount(transaction.amount, 'USD');
    price = '$1.00';
    total = formatAmount(transaction.net_amount || transaction.amount, 'USD');
  }

  // Format fee
  const fee = transaction.fee > 0 
    ? formatAmount(transaction.fee, isNaira ? 'NGN' : 'USD')
    : 'Free';

  // Format date
  const date = formatRelativeTime(transaction.created_at);
  const timestamp = new Date(transaction.created_at).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Extract confirmations from metadata or transaction
  const confirmations = transaction.metadata?.confirmations || 
                       transaction.metadata?.confirmation_count || 
                       0;
  const requiredConfirmations = currency === 'BTC' ? 1 : 
                                currency === 'ETH' ? 12 : 1;
  const confirmationsDisplay = confirmations > 0 
    ? `${confirmations}/${requiredConfirmations}` 
    : null;

  // Extract transaction hash
  const transactionHash = transaction.metadata?.transaction_hash || 
                          transaction.metadata?.hash ||
                          transaction.crypto_hash || 
                          null;

  // Extract address (to_address for receive, from_address for send)
  const address = transaction.type === 'receive' 
    ? (transaction.metadata?.to_address || transaction.metadata?.address || transaction.sender_address)
    : (transaction.metadata?.from_address || transaction.recipient_address);

  // For sell transactions, get NGN amount
  let ngnAmountSold = '';
  if (transaction.type === 'sell' && isFiatNaira && transaction.fiat_amount) {
    ngnAmountSold = formatAmount(transaction.fiat_amount, 'NGN');
  }

  return {
    id: transaction.id,
    type: uiType,
    crypto: cryptoName,
    symbol: currency,
    logo: cryptoLogo,
    amount: amount.replace(/[₦$]/g, '').trim(),
    price,
    total,
    ngnAmountSold, // NGN amount for sell transactions
    date,
    timestamp,
    status: (transaction.status === 'completed' || transaction.status === 'confirmed') 
      ? 'completed' 
      : (transaction.status === 'failed' || transaction.status === 'FAILED')
      ? 'failed'
      : 'pending',
    transactionId: transaction.transaction_id || transaction.id,
    fee,
    network: getNetworkName(transaction.crypto_type, currency),
    bankName: transaction.bank_name,
    accountNumber: transaction.account_number,
    accountName: transaction.account_name,
    recipientAddress: transaction.recipient_address,
    senderAddress: transaction.sender_address,
    crypto_hash: transaction.crypto_hash,
    reference: transaction.payment_reference || transaction.flutterwave_tx_ref || transaction.transaction_id,
    hash: transactionHash,
    confirmations: confirmationsDisplay,
    address: address,
    giftCardCode: transaction.gift_card_code,
    recipientEmail: transaction.recipient_email,
    recipientName: transaction.recipient_name,
    phoneNumber: transaction.phone_number,
    networkProvider: transaction.network,
    metadata: transaction.metadata,
  };
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState<any>(null);
  const [rawTransaction, setRawTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cryptoPriceNGN, setCryptoPriceNGN] = useState<number | null>(null);
  const [cryptoPriceUSD, setCryptoPriceUSD] = useState<number | null>(null);
  const [approxValueNGN, setApproxValueNGN] = useState<string | null>(null);
  const [approxValueUSD, setApproxValueUSD] = useState<string | null>(null);

  useEffect(() => {
    const fetchTransaction = async () => {
      if (!id || !user?.id) {
        setLoading(false);
        setError('Transaction ID or user not found');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const { transaction: fetchedTransaction, error: fetchError } = await getTransactionById(id, user.id);

        if (fetchError) {
          console.error('Error fetching transaction:', fetchError);
          setError('Failed to load transaction. Please try again.');
          setTransaction(null);
        } else if (!fetchedTransaction) {
          setError('Transaction not found');
          setTransaction(null);
        } else {
          // Store raw transaction data for accurate calculations
          setRawTransaction(fetchedTransaction);
          
          const uiTransaction = mapTransactionToUI(fetchedTransaction);
          setTransaction(uiTransaction);

          // Fetch crypto price in NGN and USD for approximate value calculation
          if (['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'].includes(uiTransaction.symbol)) {
            // Use raw crypto amount for price calculation
            // For RECEIVE transactions, always use crypto_amount (the actual amount received)
            const txType = (fetchedTransaction.transaction_type || '').toUpperCase();
            const rawCryptoAmount = fetchedTransaction.crypto_amount !== undefined && fetchedTransaction.crypto_amount !== null
              ? fetchedTransaction.crypto_amount
              : (txType === 'RECEIVE' ? 0 : (fetchedTransaction.amount || 0));
            fetchCryptoPrices(uiTransaction.symbol, rawCryptoAmount.toString());
          }

        }
      } catch (err: any) {
        console.error('Exception fetching transaction:', err);
        setError('An error occurred. Please try again.');
        setTransaction(null);
      } finally {
        setLoading(false);
      }
    };

    const fetchCryptoPrices = async (symbol: string, cryptoAmount: string) => {
      try {
        const { price, error: priceError } = await getCryptoPrice(symbol);
        if (!priceError && price) {
          if (price.price_ngn) {
            setCryptoPriceNGN(price.price_ngn);
            // Calculate approximate value in NGN
            const amount = parseFloat(cryptoAmount.replace(/,/g, ''));
            const approxNGN = amount * price.price_ngn;
            setApproxValueNGN(`₦${approxNGN.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`);
          }
          if (price.price_usd) {
            setCryptoPriceUSD(price.price_usd);
            // Calculate approximate value in USD
            const amount = parseFloat(cryptoAmount.replace(/,/g, ''));
            const approxUSD = amount * price.price_usd;
            setApproxValueUSD(`$${approxUSD.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`);
          }
        }
      } catch (err) {
        console.error('Error fetching crypto price:', err);
      }
    };

    fetchTransaction();
  }, [id, user?.id]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading transaction...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !transaction) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          <ThemedText style={styles.errorTitle}>Transaction Not Found</ThemedText>
          <ThemedText style={styles.errorText}>{error || 'The transaction you are looking for does not exist.'}</ThemedText>
          <TouchableOpacity
            style={styles.backButtonError}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }


  const formatTransactionType = (type: string) => {
    switch (type) {
      case 'buy':
        return 'Purchase';
      case 'sell':
        return 'Sale';
      case 'fund':
        return 'Fund Wallet';
      case 'withdraw-bank':
        return 'Withdraw to Bank';
      case 'send':
        return 'Send Crypto';
      case 'receive':
        return 'Receive Crypto';
      default:
        return 'Withdraw';
    }
  };

  const getTransactionActionText = () => {
    if (transaction.type === 'sell') {
      return `for ${transaction.symbol === 'BTC' ? 'NGN' : transaction.symbol}`;
    } else if (transaction.type === 'receive') {
      return 'from External Wallet';
    } else if (transaction.type === 'send') {
      return 'to External Wallet';
    } else if (transaction.type === 'buy') {
      return `with ${transaction.symbol === 'BTC' ? 'NGN' : 'USD'}`;
    }
    return '';
  };

  

  const generateReceiptText = () => {
    const statusText = (transaction.status === 'completed' || transaction.status === 'confirmed') 
      ? 'Completed' 
      : transaction.status === 'failed'
      ? 'Failed'
      : 'Pending';
    
    const receipt = `
═══════════════════════════════════════
         CHAINCOLA TRANSACTION RECEIPT
═══════════════════════════════════════

Transaction ID: ${transaction.transactionId}
Date & Time: ${transaction.timestamp}
Type: ${formatTransactionType(transaction.type)}
Status: ${statusText}

───────────────────────────────────────
TRANSACTION DETAILS
───────────────────────────────────────

${transaction.type === 'withdraw-bank' && transaction.bankName ? `Bank Name: ${transaction.bankName}\nAccount Number: ${transaction.accountNumber || 'N/A'}\nAccount Name: ${transaction.accountName || 'N/A'}\n` : ''}
${transaction.type === 'send' && transaction.recipientAddress ? `Recipient Address: ${transaction.recipientAddress}\n` : ''}
${transaction.type === 'receive' && transaction.senderAddress ? `Sender Address: ${transaction.senderAddress}\n` : ''}
Cryptocurrency: ${transaction.crypto} (${transaction.symbol})
Amount: ${transaction.amount} ${transaction.symbol}
${transaction.type === 'sell' && transaction.ngnAmountSold ? `Amount Sold (NGN): ${transaction.ngnAmountSold}\n` : ''}Price per Unit: ${transaction.price}
Total Value: ${transaction.total}
Transaction Fee: ${transaction.fee}
Network: ${transaction.network}

───────────────────────────────────────
Transaction Reference: ${transaction.reference || transaction.transactionId}
───────────────────────────────────────

───────────────────────────────────────
${(transaction.status === 'completed' || transaction.status === 'confirmed') 
  ? '✓ Transaction Completed Successfully' 
  : transaction.status === 'failed'
  ? '✗ Transaction Failed'
  : '⏳ Transaction Pending'}
───────────────────────────────────────

Thank you for using ChainCola!

═══════════════════════════════════════
    `.trim();

    return receipt;
  };

  const generateReceiptPDFHTML = async () => {
    const isCompleted = transaction.status === 'completed' || transaction.status === 'confirmed';
    const isFailed = transaction.status === 'failed';
    const statusIcon = isCompleted ? '✓' : isFailed ? '✗' : '⏳';
    const statusText = isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Pending';
    const statusColor = isCompleted ? '#10B981' : isFailed ? '#DC2626' : '#F59E0B';

    // Load and convert logo to base64
    let logoBase64 = '';
    try {
      const logoAsset = Asset.fromModule(require('@/assets/images/logo.png'));
      await logoAsset.downloadAsync();
      console.log('Logo asset loaded:', logoAsset.localUri);
      if (logoAsset.localUri) {
        const base64 = await readAsStringAsync(logoAsset.localUri, {
          encoding: 'base64',
        });
        console.log('Logo base64 length:', base64.length);
        logoBase64 = `data:image/png;base64,${base64}`;
      }
    } catch (error) {
      console.error('Failed to load logo for PDF:', error);
    }

    console.log('Logo base64 status:', logoBase64 ? 'Loaded successfully' : 'Failed to load');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 20px;
            background: #FFFFFF;
            color: #111827;
        }
        .receipt-container {
            max-width: 600px;
            margin: 0 auto;
            background: #FFFFFF;
            border: 1px solid #E5E7EB;
        }
        .receipt-header {
            background: #6B46C1;
            padding: 30px 20px;
            text-align: center;
            color: #FFFFFF;
        }
        .receipt-logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 15px;
            display: block;
            border-radius: 8px;
        }
        .receipt-header h1 {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .receipt-header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .receipt-body {
            padding: 30px 20px;
        }
        .receipt-section {
            margin-bottom: 25px;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #6B46C1;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #E5E7EB;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #F3F4F6;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            font-size: 14px;
            color: #6B7280;
            font-weight: 500;
        }
        .info-value {
            font-size: 14px;
            color: #111827;
            font-weight: 600;
            text-align: right;
            max-width: 60%;
            word-break: break-word;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            background: ${statusColor}15;
            color: ${statusColor};
        }
        .address-value {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #4B5563;
            word-break: break-all;
        }
        .receipt-footer {
            background: #F9FAFB;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #E5E7EB;
        }
        .receipt-footer p {
            font-size: 14px;
            color: #6B7280;
            margin-bottom: 5px;
        }
        .receipt-footer .logo {
            font-size: 20px;
            font-weight: bold;
            color: #6B46C1;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="receipt-header">
            ${logoBase64 ? `<img src="${logoBase64}" class="receipt-logo" alt="Chaincola Logo" />` : '<div style="color: white; font-size: 12px; margin-bottom: 10px;">Logo not loaded</div>'}
            <h1>CHAINCOLA</h1>
            <p>Transaction Receipt</p>
        </div>
        <div class="receipt-body">
            <div class="receipt-section">
                <div class="section-title">Transaction Information</div>
                <div class="info-row">
                    <span class="info-label">Transaction ID</span>
                    <span class="info-value">${transaction.transactionId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date & Time</span>
                    <span class="info-value">${transaction.timestamp}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Type</span>
                    <span class="info-value">${formatTransactionType(transaction.type)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status</span>
                    <span class="info-value">
                        <span class="status-badge">${statusIcon} ${statusText}</span>
                    </span>
                </div>
            </div>

            <div class="receipt-section">
                <div class="section-title">Transaction Details</div>
                ${transaction.type === 'withdraw-bank' && transaction.bankName ? `
                <div class="info-row">
                    <span class="info-label">Bank Name</span>
                    <span class="info-value">${transaction.bankName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Account Number</span>
                    <span class="info-value">${transaction.accountNumber || 'N/A'}</span>
                </div>
                ${transaction.accountName ? `
                <div class="info-row">
                    <span class="info-label">Account Name</span>
                    <span class="info-value">${transaction.accountName}</span>
                </div>
                ` : ''}
                ` : ''}
                ${transaction.type === 'send' && transaction.recipientAddress ? `
                <div class="info-row">
                    <span class="info-label">Recipient Address</span>
                    <span class="info-value address-value">${transaction.recipientAddress}</span>
                </div>
                ` : ''}
                ${transaction.type === 'receive' && transaction.senderAddress ? `
                <div class="info-row">
                    <span class="info-label">Sender Address</span>
                    <span class="info-value address-value">${transaction.senderAddress}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Cryptocurrency</span>
                    <span class="info-value">${transaction.crypto} (${transaction.symbol})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Amount</span>
                    <span class="info-value">${transaction.amount} ${transaction.symbol}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Price per Unit</span>
                    <span class="info-value">${transaction.price}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Total Value</span>
                    <span class="info-value" style="font-size: 16px; color: #6B46C1; font-weight: bold;">${transaction.total}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Transaction Fee</span>
                    <span class="info-value">${transaction.fee}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Network</span>
                    <span class="info-value">${transaction.network}</span>
                </div>
            </div>
        </div>
        <div class="receipt-footer">
            <p>Thank you for using ChainCola!</p>
            <div class="logo">CHAINCOLA</div>
        </div>
    </div>
</body>
</html>
    `.trim();
  };

  const handleShare = async () => {
    try {
      // Generate PDF from HTML
      const htmlContent = await generateReceiptPDFHTML();
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Receipt - ${transaction.transactionId}`,
        });
      } else {
        // Fallback to text sharing if PDF sharing is not available
        const receiptText = generateReceiptText();
        await Share.share({
          message: receiptText,
          title: `Transaction Receipt - ${transaction.transactionId}`,
        });
      }
    } catch (error: any) {
      console.error('Error sharing receipt:', error);
      
      // Fallback to text sharing on error
      try {
        const receiptText = generateReceiptText();
        await Share.share({
          message: receiptText,
          title: `Transaction Receipt - ${transaction.transactionId}`,
        });
      } catch (fallbackError: any) {
        Alert.alert('Error', 'Failed to share receipt. Please try again.');
        console.error('Fallback share error:', fallbackError);
      }
    }
  };

  

  const handleCopy = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch (error: any) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy to clipboard. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Transaction Details</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Balance Card / Overview Card */}
        <LinearGradient
          colors={transaction.type === 'receive' 
            ? ['#ECFDF5', '#D1FAE5', '#BBF7D0'] // Light green gradient for receive
            : ['#6B46C1', '#9333EA', '#A855F7']} // Purple gradient for others
          style={styles.overviewCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.overviewContent}>
            <View style={styles.summaryLeft}>
              <View style={styles.cryptoIconContainer}>
                {transaction.logo ? (
                  <Image
                    source={transaction.logo}
                    style={styles.cryptoIcon}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.cryptoIcon, { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' }]}>
                    <MaterialIcons name="account-balance" size={20} color="#6B7280" />
                  </View>
                )}
              </View>
              <View style={styles.summaryTextContainer}>
                <ThemedText 
                  style={styles.transactionType}
                  numberOfLines={1}
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
                    ? transaction.symbol
                    : ''}
                </ThemedText>
                <ThemedText 
                  style={styles.transactionSubtext}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {getTransactionActionText()}
                </ThemedText>
              </View>
            </View>
            <View style={styles.summaryRight}>
              <ThemedText 
                style={styles.transactionAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {rawTransaction && rawTransaction.crypto_amount !== undefined && rawTransaction.crypto_amount !== null
                  ? `${Math.abs(rawTransaction.crypto_amount).toLocaleString('en-US', {
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} ${transaction.symbol}`
                  : rawTransaction && rawTransaction.fiat_amount
                  ? `₦${Math.abs(rawTransaction.fiat_amount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : `${transaction.amount} ${transaction.symbol}`}
              </ThemedText>
              {rawTransaction && rawTransaction.crypto_amount && rawTransaction.fiat_amount && (
                <View style={styles.fiatValuesInline}>
                  <ThemedText style={styles.fiatValueInline}>
                    = ₦{Math.abs(rawTransaction.fiat_amount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </ThemedText>
                  {approxValueUSD && (
                    <ThemedText style={styles.fiatValueInline}>
                      {approxValueUSD}
                    </ThemedText>
                  )}
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Transaction Details */}
        <View style={styles.detailsContainer}>
          {/* Transaction ID */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Transaction ID</ThemedText>
            <View style={styles.detailValueWithCopy}>
              <ThemedText style={styles.detailValue} numberOfLines={1}>
                {transaction.transactionId}
              </ThemedText>
              <TouchableOpacity
                onPress={() => handleCopy(transaction.transactionId, 'Transaction ID')}
                style={styles.copyButton}
              >
                <MaterialIcons name="content-copy" size={18} color="#6B46C1" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Type */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Type</ThemedText>
            <ThemedText style={styles.detailValue}>
              {transaction.type === 'receive' || transaction.type === 'send' ? 'External' : 
               transaction.type === 'buy' ? 'Buy' :
               transaction.type === 'sell' ? 'Sell' :
               transaction.type === 'fund' ? 'Deposit' :
               transaction.type === 'withdraw-bank' ? 'Bank Transfer' : 'Internal'}
            </ThemedText>
          </View>

          {/* Date/Time */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Date/Time</ThemedText>
            <ThemedText style={styles.detailValue}>
              {transaction.timestamp}
            </ThemedText>
          </View>

          {/* Amount */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Amount</ThemedText>
            <ThemedText style={[styles.detailValue, styles.amountValue]}>
              {rawTransaction && rawTransaction.crypto_amount !== undefined && rawTransaction.crypto_amount !== null
                ? `${Math.abs(rawTransaction.crypto_amount).toLocaleString('en-US', {
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} ${transaction.symbol}`
                : rawTransaction && rawTransaction.fiat_amount
                ? `₦${Math.abs(rawTransaction.fiat_amount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : `${transaction.amount} ${transaction.symbol}`}
            </ThemedText>
          </View>

          {/* Amount Sold (NGN) for sell transactions */}
          {transaction.type === 'sell' && rawTransaction && rawTransaction.fiat_amount && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Amount Sold (NGN)</ThemedText>
              <ThemedText style={[styles.detailValue, styles.amountValue]}>
                ₦{Math.abs(rawTransaction.fiat_amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </ThemedText>
            </View>
          )}

          {/* Price - Show for buy/sell transactions */}
          {rawTransaction && rawTransaction.crypto_amount && rawTransaction.fiat_amount && 
           rawTransaction.crypto_amount > 0 && 
           transaction.type !== 'fund' && 
           transaction.type !== 'withdraw-bank' && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Price</ThemedText>
              <ThemedText style={styles.detailValue}>
                ₦{(rawTransaction.fiat_amount / rawTransaction.crypto_amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} / {transaction.symbol}
              </ThemedText>
            </View>
          )}

          {/* Total Value */}
          {rawTransaction && rawTransaction.fiat_amount && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Total Value</ThemedText>
              <ThemedText style={[styles.detailValue, styles.totalValue]}>
                ₦{Math.abs(rawTransaction.fiat_amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </ThemedText>
            </View>
          )}

          {/* Destination - Show for send and receive transactions */}
          {(transaction.type === 'send' && transaction.recipientAddress) || 
           (transaction.type === 'receive' && (transaction.senderAddress || transaction.address)) ? (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Destination</ThemedText>
              <View style={styles.detailValueWithCopy}>
                <ThemedText 
                  style={[styles.detailValue, styles.addressValue]}
                  numberOfLines={2}
                >
                  {transaction.type === 'send' 
                    ? transaction.recipientAddress 
                    : (transaction.senderAddress || transaction.address)}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => handleCopy(
                    transaction.type === 'send' 
                      ? transaction.recipientAddress 
                      : (transaction.senderAddress || transaction.address),
                    'Destination'
                  )}
                  style={styles.copyButton}
                >
                  <MaterialIcons name="content-copy" size={18} color="#6B46C1" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Bank Account Details for Bank Withdrawals */}
          {transaction.type === 'withdraw-bank' && transaction.bankName && (
            <>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Bank Name</ThemedText>
                <ThemedText style={styles.detailValue}>
                  {transaction.bankName}
                </ThemedText>
              </View>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Account Number</ThemedText>
                <ThemedText style={styles.detailValue}>
                  {transaction.accountNumber || 'N/A'}
                </ThemedText>
              </View>
              {transaction.accountName && (
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Account Name</ThemedText>
                  <ThemedText style={styles.detailValue}>
                    {transaction.accountName}
                  </ThemedText>
                </View>
              )}
            </>
          )}

          {/* Hash - for receive and send transactions */}
          {(transaction.hash || transaction.crypto_hash) && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Hash</ThemedText>
              <TouchableOpacity
                onPress={() => handleCopy(transaction.hash || transaction.crypto_hash, 'Hash')}
                style={{ flex: 1 }}
                activeOpacity={0.7}
              >
                <ThemedText 
                  style={[styles.detailValue, styles.hashValue]}
                  numberOfLines={3}
                >
                  {transaction.hash || transaction.crypto_hash}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Network */}
          {transaction.network && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Network</ThemedText>
              <ThemedText style={styles.detailValue}>
                {transaction.network}
              </ThemedText>
            </View>
          )}

          {/* Confirmations - for receive transactions */}
          {transaction.type === 'receive' && transaction.confirmations && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Confirmations</ThemedText>
              <ThemedText style={styles.detailValue}>
                {transaction.confirmations}
              </ThemedText>
            </View>
          )}

          {/* Reference */}
          {transaction.reference && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Reference</ThemedText>
              <View style={styles.detailValueWithCopy}>
                <ThemedText style={[styles.detailValue, styles.referenceValue]} numberOfLines={1}>
                  {transaction.reference}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => handleCopy(transaction.reference, 'Reference')}
                  style={styles.copyButton}
                >
                  <MaterialIcons name="content-copy" size={18} color="#6B46C1" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Fee */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Fee</ThemedText>
            <ThemedText style={styles.detailValue}>
              {rawTransaction && rawTransaction.fee > 0
                ? `₦${rawTransaction.fee.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : `0 ${transaction.symbol}`}
            </ThemedText>
          </View>

          {/* Gift Card Code */}
          {transaction.giftCardCode && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Gift Card Code</ThemedText>
              <View style={styles.detailValueWithCopy}>
                <ThemedText style={[styles.detailValue, styles.giftCardCode]} numberOfLines={1}>
                  {transaction.giftCardCode}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => handleCopy(transaction.giftCardCode, 'Gift Card Code')}
                  style={styles.copyButton}
                >
                  <MaterialIcons name="content-copy" size={18} color="#6B46C1" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Recipient Email - for gift card purchases */}
          {transaction.type === 'gift-card-purchase' && transaction.recipientEmail && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Recipient Email</ThemedText>
              <ThemedText style={styles.detailValue}>
                {transaction.recipientEmail}
              </ThemedText>
            </View>
          )}

          {/* Recipient Name - for gift card purchases */}
          {transaction.type === 'gift-card-purchase' && transaction.recipientName && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Recipient Name</ThemedText>
              <ThemedText style={styles.detailValue}>
                {transaction.recipientName}
              </ThemedText>
            </View>
          )}

          {/* Status - Last */}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Status</ThemedText>
            <ThemedText 
              style={[
                styles.detailValue,
                (transaction.status === 'completed' || transaction.status === 'confirmed') 
                  ? styles.statusSuccess
                  : transaction.status === 'failed'
                  ? styles.statusFailed
                  : styles.statusPending
              ]}
            >
              {(transaction.status === 'completed' || transaction.status === 'confirmed') 
                ? 'Successful' 
                : transaction.status === 'failed'
                ? 'Failed'
                : 'Pending'}
            </ThemedText>
          </View>
        </View>

        {/* Share Receipt Button */}
        <TouchableOpacity
          style={styles.shareReceiptButton}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <View style={styles.shareReceiptButtonContent}>
            <MaterialIcons name="share" size={24} color="#6B46C1" />
            <ThemedText style={styles.shareReceiptButtonText}>Share Receipt</ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Help Button */}
        <TouchableOpacity
          style={styles.getHelpButton}
          onPress={() => router.push('/profile/chat-support')}
          activeOpacity={0.7}
        >
          <View style={styles.getHelpButtonContent}>
            <MaterialIcons name="help-outline" size={24} color="#6B46C1" />
            <ThemedText style={styles.getHelpText}>Get Help</ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Platform.OS === 'ios' ? 16 : 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 60,
    paddingBottom: Platform.OS === 'ios' ? 100 : 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
  overviewCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    minHeight: 160,
    width: '100%',
  },
  overviewContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buyIcon: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  sellIcon: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  cryptoLogo: {
    width: 56,
    height: 56,
    marginBottom: 12,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  pendingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Platform.OS === 'ios' ? 20 : 20,
    marginBottom: Platform.OS === 'ios' ? 16 : 20,
    width: '100%',
    ...(Platform.OS === 'ios' && {
      paddingHorizontal: 20,
      paddingVertical: 20,
    }),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: Platform.OS === 'ios' ? 'flex-start' : 'flex-start',
    marginBottom: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    borderBottomWidth: 0,
    minHeight: Platform.OS === 'ios' ? 36 : undefined,
    ...(Platform.OS === 'ios' && {
      paddingHorizontal: 0,
    }),
  },
  detailLabel: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    color: '#6B7280',
    flex: Platform.OS === 'ios' ? 0.35 : 0.4,
    paddingRight: Platform.OS === 'ios' ? 12 : 8,
    fontWeight: '400',
    ...(Platform.OS === 'ios' && {
      includeFontPadding: false,
    }),
  },
  detailValue: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontWeight: '400',
    flex: Platform.OS === 'ios' ? 0.65 : 0.6,
    textAlign: 'right',
    color: '#111827',
    includeFontPadding: false,
    ...(Platform.OS === 'ios' && {
      flexShrink: 1,
      paddingLeft: 8,
    }),
  },
  statusSuccess: {
    color: '#10B981',
    fontWeight: '400',
  },
  statusFailed: {
    color: '#EF4444',
    fontWeight: '600',
  },
  statusPending: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  addressValue: {
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: '400',
    color: '#111827',
  },
  amountValue: {
    fontSize: Platform.OS === 'ios' ? 20 : 19,
    fontWeight: '800',
    color: '#6B46C1',
  },
  totalValue: {
    fontSize: Platform.OS === 'ios' ? 20 : 19,
    fontWeight: '800',
    color: '#10B981',
  },
  referenceValue: {
    fontSize: Platform.OS === 'ios' ? 20 : 19,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
  },
  completedStatus: {
    color: '#10B981',
  },
  pendingStatus: {
    color: '#D97706',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  shareButton: {
    // Additional styles if needed
  },
  printButton: {
    // Additional styles if needed
  },
  actionButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  shareReceiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  shareReceiptButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  getHelpButton: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  getHelpButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  getHelpText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  shareReceiptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completedBadge: {
    backgroundColor: '#E9D5FF',
  },
  completedBadgeText: {
    color: '#6B46C1',
    fontSize: 13,
    fontWeight: '600',
  },
  completedBadgeGreen: {
    backgroundColor: '#D1FAE5',
  },
  completedBadgeTextGreen: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '600',
  },
  // Missing styles used for failed/pending/completed status badges
  failedBadgeStyle: {
    backgroundColor: '#FEE2E2',
  },
  failedBadgeTextStyle: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  pendingBadgeStyle: {
    backgroundColor: '#FEF3C7',
  },
  pendingBadgeTextStyle: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '600',
  },
  detailValueWithCopy: {
    flex: Platform.OS === 'ios' ? 0.6 : 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  copyButton: {
    padding: 4,
  },
  copyIcon: {
    color: '#6B46C1',
  },
  hashValue: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
    fontWeight: '400',
    textDecorationLine: 'underline',
    color: '#111827',
  },
  giftCardCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2,
    fontWeight: 'bold',
    color: '#6B46C1',
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  cryptoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cryptoIcon: {
    width: 28,
    height: 28,
  },
  summaryTextContainer: {
    flex: 1,
  },
  transactionSubtext: {
    fontSize: 12,
    color: '#E9D5FF',
    marginTop: 3,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  backButtonError: {
    backgroundColor: '#6B46C1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

