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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFlutterwaveWalletFundingRedirectUrl,
  initializePayment,
  pollPaymentStatus,
} from '@/lib/payment-service';
import { getUserProfile } from '@/lib/user-service';
import { demoAddMoney } from '@/lib/demo-payment-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';

const HOME_AFTER_FUNDING = '/(tabs)/index' as const;

/** True when this URL is our post-checkout return (deeplink or https with tx_ref + status). */
function isWalletFundingReturnUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('chaincola://')) {
    return (
      url.includes('payment=') ||
      url.includes('status=') ||
      url.includes('tx_ref=') ||
      url.includes('/home')
    );
  }
  if (url.includes('payment-callback')) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const q = `${u.search}&${u.hash.replace(/^#/, '')}`;
    return /[?&]tx_ref=/.test(q) && /[?&](status|payment)=/i.test(q);
  } catch {
    return false;
  }
}

export default function FundWalletScreen() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [showWebView, setShowWebView] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [txRef, setTxRef] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Predefined amount options
  const quickAmounts = [
    { label: '₦5,000', value: '5000' },
    { label: '₦10,000', value: '10000' },
    { label: '₦25,000', value: '25000' },
    { label: '₦50,000', value: '50000' },
    { label: '₦100,000', value: '100000' },
  ];

  // Fetch user profile on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.id) {
        try {
          const profile = await getUserProfile(user.id);
          if (profile) {
            setUserProfile(profile);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  const handleQuickAmount = (value: string) => {
    setAmount(value);
  };

  const handleProceedToPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'Please sign in to continue');
      router.push('/auth/signin');
      return;
    }

    setLoading(true);

    try {
      const depositAmount = parseFloat(amount);
      const feeAmount = depositAmount * 0.03; // 3% fee
      const totalPayment = depositAmount + feeAmount; // Total amount to charge user
      
      console.log('💳 Initializing Flutterwave payment...', { 
        depositAmount, 
        feeAmount, 
        totalPayment, 
        currency 
      });

      // Initialize payment via Supabase Edge Function
      // Pass deposit amount and fee separately, charge total payment amount
      // The redirect URL will be intercepted by WebView for automatic verification
      const result = await initializePayment({
        amount: totalPayment, // Charge total payment (deposit + fee)
        currency: currency,
        redirectUrl: getFlutterwaveWalletFundingRedirectUrl(),
        purpose: 'wallet-funding',
        metadata: {
          deposit_amount: depositAmount,
          fee_amount: feeAmount,
          fee_percentage: 3,
        },
      });

      if (!result.success || !result.checkout_link) {
        console.error('❌ Payment initialization failed:', result);
        Alert.alert(
          'Payment Error',
          result.details || result.error || 'Failed to initialize payment. Please try again.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      console.log('✅ Payment initialized:', result.tx_ref);
      setTxRef(result.tx_ref || null);
      setPaymentUrl(result.checkout_link);
      setShowWebView(true);
      setLoading(false);
    } catch (error: any) {
      console.error('❌ Payment initialization error:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to initialize payment. Please try again.',
        [{ text: 'OK' }]
      );
      setLoading(false);
    }
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    const { url } = navState;

    console.log('🔍 WebView navigation:', url);

    if (!isWalletFundingReturnUrl(url)) {
      return;
    }

    // Extract URL parameters (handle both deeplink and web URL formats)
    const urlToParse = url.includes('chaincola://') ? url.replace('chaincola://', 'https://') : url;
    const queryPart = urlToParse.includes('?') ? urlToParse.split('?').slice(1).join('?') : '';
    const urlParams = new URLSearchParams(queryPart.split('#')[0] || '');
    const rawStatus = urlParams.get('status') || urlParams.get('payment');
    const status = (rawStatus || '').toLowerCase();
    const txRefFromUrl = urlParams.get('tx_ref') || txRef;

    console.log('🔍 Payment callback detected:', { url, status, txRef: txRefFromUrl });

    // Handle successful payment (Flutterwave uses status=successful)
    if (status === 'successful' || status === 'success') {
        setShowWebView(false);
        setLoading(true);

        // Verify payment status automatically with Flutterwave API
        if (txRefFromUrl) {
          console.log('🔍 Auto-verifying payment with Flutterwave...', txRefFromUrl);
          
          try {
            // Poll for payment verification (calls Flutterwave API to verify and automatically credits wallet)
            const verificationResult = await pollPaymentStatus(txRefFromUrl, 15, 2000);

            setLoading(false);

            if (verificationResult.success && verificationResult.verified) {
              // Payment verified successfully - automatically redirect to home
              console.log('✅ Payment verified successfully, redirecting to home...');
              
              // Small delay to show success state
              setTimeout(() => {
                router.replace(HOME_AFTER_FUNDING);
              }, 500);
              
              // Show brief success message
              const depositAmount = parseFloat(amount);
              const feeAmount = depositAmount * 0.03;
              Alert.alert(
                'Payment Successful! ✅',
                `Your wallet has been funded with ₦${depositAmount.toLocaleString()}${feeAmount > 0 ? ` (Fee: ₦${feeAmount.toLocaleString()})` : ''}`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      router.replace(HOME_AFTER_FUNDING);
                    },
                  },
                ]
              );
            } else if (verificationResult.status === 'FAILED' || verificationResult.status === 'CANCELLED') {
              Alert.alert(
                'Payment Failed',
                verificationResult.error || 'Payment was not successful. Please try again.',
                [{ text: 'OK' }]
              );
            } else {
              // Payment may still be processing - redirect anyway and let webhook handle it
              console.log('⏳ Payment still processing, redirecting to home...');
              setTimeout(() => {
                router.replace(HOME_AFTER_FUNDING);
              }, 500);

              Alert.alert(
                'Payment Processing',
                'Your payment is being processed. Your wallet will be credited shortly. You can check your transaction history.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      router.replace(HOME_AFTER_FUNDING);
                    },
                  },
                ]
              );
            }
          } catch (error: any) {
            console.error('❌ Error verifying payment:', error);
            setLoading(false);

            // Even if verification fails, redirect to home (webhook will handle it)
            setTimeout(() => {
              router.replace(HOME_AFTER_FUNDING);
            }, 500);

            Alert.alert(
              'Payment Processing',
              'Your payment is being processed. Your wallet will be credited shortly. You can check your transaction history.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    router.replace(HOME_AFTER_FUNDING);
                  },
                },
              ]
            );
          }
        } else {
          setLoading(false);

          // Redirect to home even without tx_ref (webhook will handle verification)
          setTimeout(() => {
            router.replace(HOME_AFTER_FUNDING);
          }, 500);

          Alert.alert(
            'Payment Processing',
            'Your payment is being processed. Your wallet will be credited shortly. You can check your transaction history.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace(HOME_AFTER_FUNDING);
                },
              },
            ]
          );
        }
    } else if (status === 'cancelled' || status === 'cancel') {
      setShowWebView(false);
      setLoading(false);
      Alert.alert('Payment Cancelled', 'Payment was cancelled. You can try again.');
    } else if (status === 'failed') {
      setShowWebView(false);
      setLoading(false);
      Alert.alert('Payment Failed', 'Payment was not successful. Please try again.');
    }
  };

  if (showWebView) {
    // Validate payment URL before showing WebView
    if (!paymentUrl || !paymentUrl.startsWith('http')) {
      return (
        <ThemedView style={styles.container}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowWebView(false);
                setPaymentUrl('');
              }}
            >
              <MaterialIcons name="close" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.webViewHeaderTitle}>Payment Error</ThemedText>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <ThemedText style={styles.errorTitle}>Payment URL Invalid</ThemedText>
            <ThemedText style={styles.errorText}>
              Unable to load payment page. Please try again.
            </ThemedText>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setShowWebView(false);
                setPaymentUrl('');
              }}
            >
              <ThemedText style={styles.retryButtonText}>Go Back</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.container}>
        <View style={styles.webViewHeader}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              setShowWebView(false);
              setPaymentUrl('');
            }}
          >
            <MaterialIcons name="close" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.webViewHeaderTitle}>Complete Payment</ThemedText>
          <View style={styles.placeholder} />
        </View>
        {loading && (
          <View style={styles.loadingOverlay}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Verifying payment...</ThemedText>
          </View>
        )}
        <WebView
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          onShouldStartLoadWithRequest={(request) => {
            const requestUrl = request.url;
            console.log('🔍 WebView should start load:', requestUrl);

            if (requestUrl.startsWith('chaincola://')) {
              console.log('🔗 Intercepted deeplink:', requestUrl);
              handleWebViewNavigationStateChange({ url: requestUrl });
              return false;
            }

            if (isWalletFundingReturnUrl(requestUrl)) {
              handleWebViewNavigationStateChange({ url: requestUrl });
              return false;
            }

            if (requestUrl.startsWith('http') || requestUrl.startsWith('https')) {
              return true;
            }

            if (requestUrl.startsWith('about:') || requestUrl === 'about:srcdoc') {
              console.warn('Blocked invalid URL:', requestUrl);
              return false;
            }

            return true;
          }}
          style={styles.webView}
          startInLoadingState={true}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            Alert.alert(
              'Error',
              'Failed to load payment page. Please check your internet connection and try again.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    setShowWebView(false);
                    setPaymentUrl('');
                  },
                },
              ]
            );
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent);
            if (nativeEvent.statusCode >= 400) {
              Alert.alert(
                'Connection Error',
                'Unable to connect to payment gateway. Please try again.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setShowWebView(false);
                      setPaymentUrl('');
                    },
                  },
                ]
              );
            }
          }}
        />
      </ThemedView>
    );
  }

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
            <ThemedText style={styles.headerTitle}>Fund Wallet</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            <View style={styles.amountSection}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Enter Amount
              </ThemedText>
              <View style={styles.amountInputContainer}>
                <ThemedText style={styles.currencySymbol}>₦</ThemedText>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  numberOfLines={1}
                />
              </View>
            </View>

            {/* Fee Breakdown Section */}
            {amount && parseFloat(amount) > 0 && (() => {
              const depositAmount = parseFloat(amount);
              const feeAmount = depositAmount * 0.03; // 3% fee
              const totalPayment = depositAmount + feeAmount;
              
              return (
                <View style={styles.feeBreakdownSection}>
                  <View style={styles.feeBreakdownRow}>
                    <ThemedText style={styles.feeBreakdownLabel}>Deposit Amount:</ThemedText>
                    <ThemedText style={styles.feeBreakdownValue}>
                      ₦{depositAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                  <View style={styles.feeBreakdownRow}>
                    <ThemedText style={styles.feeBreakdownLabel}>Processing Fee (3%):</ThemedText>
                    <ThemedText style={[styles.feeBreakdownValue, styles.feeBreakdownFee]}>
                      +₦{feeAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                  <View style={[styles.feeBreakdownRow, styles.feeBreakdownTotal]}>
                    <ThemedText style={styles.feeBreakdownTotalLabel}>Total Payment:</ThemedText>
                    <ThemedText style={styles.feeBreakdownTotalValue}>
                      ₦{totalPayment.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                  <View style={styles.feeBreakdownRow}>
                    <ThemedText style={styles.feeBreakdownLabel}>Amount Credited to Wallet:</ThemedText>
                    <ThemedText style={styles.feeBreakdownValue}>
                      ₦{depositAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                </View>
              );
            })()}

            <View style={styles.quickAmountsSection}>
              <ThemedText 
                style={styles.quickAmountsLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Quick Amounts
              </ThemedText>
              <View style={styles.quickAmountsContainer}>
                {quickAmounts.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.quickAmountButton,
                      amount === item.value && styles.quickAmountButtonActive,
                    ]}
                    onPress={() => handleQuickAmount(item.value)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.quickAmountText,
                        amount === item.value && styles.quickAmountTextActive,
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

            <View style={styles.paymentMethodsSection}>
              <ThemedText 
                style={styles.paymentMethodsLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Payment Methods
              </ThemedText>
              <View style={styles.paymentMethodsList}>
                <View style={styles.paymentMethodItem}>
                  <MaterialIcons name="credit-card" size={24} color="#6B46C1" />
                  <ThemedText style={styles.paymentMethodText}>Card</ThemedText>
                </View>
                <View style={styles.paymentMethodItem}>
                  <MaterialIcons name="account-balance" size={24} color="#6B46C1" />
                  <ThemedText style={styles.paymentMethodText}>Bank Transfer</ThemedText>
                </View>
                <View style={styles.paymentMethodItem}>
                  <MaterialIcons name="phone-android" size={24} color="#6B46C1" />
                  <ThemedText style={styles.paymentMethodText}>USSD</ThemedText>
                </View>
                <View style={styles.paymentMethodItem}>
                  <MaterialIcons name="account-balance-wallet" size={24} color="#6B46C1" />
                  <ThemedText style={styles.paymentMethodText}>Mobile Money</ThemedText>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.proceedButton, (!amount || loading) && styles.proceedButtonDisabled]}
              onPress={handleProceedToPayment}
              disabled={!amount || loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={amount && !loading ? ['#6B46C1', '#9333EA'] : ['#D1D5DB', '#9CA3AF']}
                style={styles.proceedButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <AppLoadingIndicator size="small" variant="onPrimary" />
                ) : (
                  <MaterialIcons name="payment" size={20} color="#FFFFFF" />
                )}
                <ThemedText 
                  style={styles.proceedButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {loading ? 'Processing...' : 'Proceed to Payment'}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>

            {/* Demo Add Money Button - Only visible for demo users */}
            {user?.email?.toLowerCase() === 'demo@chaincola.com' && (
              <TouchableOpacity
                style={[
                  styles.demoButton,
                  (!amount || loading) && styles.demoButtonDisabled,
                ]}
                onPress={async () => {
                  if (!amount || parseFloat(amount) <= 0) {
                    Alert.alert('Error', 'Please enter a valid amount');
                    return;
                  }

                  setLoading(true);

                  try {
                    const depositAmount = parseFloat(amount);
                    const result = await demoAddMoney({
                      amount: depositAmount,
                      currency: currency,
                    });

                    if (result.success) {
                      Alert.alert(
                        'Success',
                        `₦${depositAmount.toLocaleString()} has been added to your wallet!`,
                        [
                          {
                            text: 'OK',
                            onPress: () => {
                              setAmount('');
                              router.replace('/(tabs)');
                            },
                          },
                        ]
                      );
                    } else {
                      Alert.alert('Demo Add Money Failed', result.error || 'Failed to add money. Please try again.');
                    }
                  } catch (error: any) {
                    console.error('Error processing demo add money:', error);
                    Alert.alert('Error', error.message || 'Failed to add money. Please try again.');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={!amount || loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    amount && !loading
                      ? ['#F59E0B', '#F97316']
                      : ['#D1D5DB', '#9CA3AF']
                  }
                  style={styles.demoButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <MaterialIcons name="science" size={20} color="#FFFFFF" />
                  <ThemedText 
                    style={styles.demoButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {loading ? 'Processing...' : 'Demo: Add Money Instantly'}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={styles.infoSection}>
              <MaterialIcons name="info" size={20} color="#6B46C1" />
              <ThemedText style={styles.infoText}>
                Your payment is secured by Flutterwave. All transactions are encrypted and secure.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  amountSection: {
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
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
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
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
  feeBreakdownSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  feeBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  feeBreakdownTotal: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginBottom: 0,
  },
  feeBreakdownLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  feeBreakdownValue: {
    fontSize: 14,
    color: '#11181C',
    fontWeight: '600',
  },
  feeBreakdownFee: {
    color: '#EF4444',
  },
  feeBreakdownTotalLabel: {
    fontSize: 16,
    color: '#11181C',
    fontWeight: '600',
  },
  feeBreakdownTotalValue: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: 'bold',
  },
  quickAmountsSection: {
    marginBottom: 32,
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
  paymentMethodsSection: {
    marginBottom: 32,
  },
  paymentMethodsLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  paymentMethodsList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  paymentMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentMethodText: {
    fontSize: 16,
    fontWeight: '500',
  },
  proceedButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  proceedButtonDisabled: {
    opacity: 0.6,
  },
  proceedButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  webViewHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.8,
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
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#6B46C1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  demoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  demoButtonDisabled: {
    opacity: 0.6,
  },
  demoButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  demoButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});


