import { useState, useEffect, useRef } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getNgnBalance, formatBalance } from '@/lib/wallet-service';
import {
  verifyBankAccount,
  submitWithdrawal,
  getBanks,
  Bank,
  withdrawalFeeAndTotal,
  clampWithdrawalPayoutToBalance,
  maxWithdrawalPayoutWithinBalance,
} from '@/lib/withdrawal-service';
import { demoWithdraw } from '@/lib/demo-withdrawal-service';
import { getAppSettingsData } from '@/lib/app-settings-service';
import InsufficientBalanceModal from '@/components/insufficient-balance-modal';
import MinimumWithdrawLimitModal from '@/components/minimum-withdraw-limit-modal';
import AppLoadingIndicator from '@/components/app-loading-indicator';


export default function WithdrawScreen() {
  const { user } = useAuth();
  /** When true, ignore withdrawal result (user dismissed confirm while request was in flight). */
  const withdrawalCancelledRef = useRef(false);
  /** Increments so stale verify responses never update UI after account/bank changes. */
  const verifySessionRef = useRef(0);
  /** Set after a successful verify; cleared when account or bank no longer matches. */
  const lastVerifiedKeyRef = useRef<string | null>(null);
  const [amount, setAmount] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showWrongAccountModal, setShowWrongAccountModal] = useState(false);
  const [wrongAccountDetail, setWrongAccountDetail] = useState<string | null>(null);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [proceedLoading, setProceedLoading] = useState(false);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [insufficientRequiredAmount, setInsufficientRequiredAmount] = useState<string | undefined>(undefined);
  const [showMinimumLimitModal, setShowMinimumLimitModal] = useState(false);
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState(100);
  /** Snapshot when opening confirm (fee-aware payout vs raw input). */
  const [confirmRequested, setConfirmRequested] = useState(0);
  const [confirmPayout, setConfirmPayout] = useState(0);
  const [confirmFee, setConfirmFee] = useState(0);
  const [confirmTotal, setConfirmTotal] = useState(0);
  const [confirmAdjusted, setConfirmAdjusted] = useState(false);

  const fmtNgn = (n: number) =>
    `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Fetch balance, banks, and app settings on mount
  useEffect(() => {
    if (user?.id) {
      fetchBalance();
      fetchBanks();
      getAppSettingsData().then((settings) => {
        if (settings?.min_withdrawal_amount != null && settings.min_withdrawal_amount > 0) {
          setMinWithdrawalAmount(settings.min_withdrawal_amount);
        }
      });
    }
  }, [user?.id]);

  const fetchBanks = async () => {
    try {
      setBanksLoading(true);
      setBanksError(null);
      const result = await getBanks('NG'); // Fetch Nigerian banks
      if (result.success && result.data) {
        // Sort banks alphabetically by name
        const sortedBanks = result.data.sort((a, b) => a.name.localeCompare(b.name));
        setBanks(sortedBanks);
      } else {
        setBanksError(result.error || 'Failed to fetch banks');
        // Fallback to empty array - user can still manually enter bank code
        setBanks([]);
      }
    } catch (error: any) {
      console.error('Error fetching banks:', error);
      setBanksError(error.message || 'Failed to fetch banks');
      setBanks([]);
    } finally {
      setBanksLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!user?.id) return;
    
    try {
      setBalanceLoading(true);
      const balance = await getNgnBalance(user.id);
      setAvailableBalance(balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setAvailableBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleBankSelect = (bankName: string, bankCode: string) => {
    setSelectedBank(bankName);
    setSelectedBankCode(bankCode);
    setShowBankPicker(false);
    setBankSearchQuery(''); // Clear search when bank is selected
    lastVerifiedKeyRef.current = null;
    setAccountName('');
    setShowWrongAccountModal(false);
    setWrongAccountDetail(null);
  };

  // Filter banks based on search query
  const filteredBanks = banks.filter((bank) => {
    const query = bankSearchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      bank.name.toLowerCase().includes(query) ||
      bank.code.toLowerCase().includes(query)
    );
  });

  const verifyAccountFor = async (acct: string, bankCode: string) => {
    if (acct.length !== 10 || !bankCode) {
      return;
    }

    const session = ++verifySessionRef.current;

    try {
      setVerifyingAccount(true);
      const result = await verifyBankAccount(acct, bankCode);

      if (session !== verifySessionRef.current) {
        return;
      }
      if (accountNumber !== acct || selectedBankCode !== bankCode) {
        return;
      }

      if (result.success && result.data) {
        lastVerifiedKeyRef.current = `${acct}|${bankCode}`;
        setAccountName(result.data.account_name);
        setShowWrongAccountModal(false);
        setWrongAccountDetail(null);
        return;
      }

      lastVerifiedKeyRef.current = null;
      setAccountName('');
      const err = (result.error || '').trim();
      const errLower = err.toLowerCase();
      if (errLower.includes('not authenticated')) {
        Alert.alert('Session expired', 'Please sign in again to verify your account.');
        return;
      }
      setWrongAccountDetail(
        err && !errLower.includes('must be exactly 10 digits')
          ? err
          : 'This account could not be verified for the selected bank.',
      );
      setShowWrongAccountModal(true);
    } catch (error: any) {
      console.error('Error verifying account:', error);
      if (session !== verifySessionRef.current) {
        return;
      }
      if (accountNumber !== acct || selectedBankCode !== bankCode) {
        return;
      }
      lastVerifiedKeyRef.current = null;
      setAccountName('');
      setWrongAccountDetail(error?.message || 'Network error. Please check your connection and try again.');
      setShowWrongAccountModal(true);
    } finally {
      if (session === verifySessionRef.current) {
        setVerifyingAccount(false);
      }
    }
  };

  // Clear resolved name when account or bank no longer matches last successful verify
  useEffect(() => {
    if (accountNumber.length < 10) {
      lastVerifiedKeyRef.current = null;
      setAccountName('');
      setShowWrongAccountModal(false);
      setWrongAccountDetail(null);
      return;
    }
    if (!selectedBankCode) {
      lastVerifiedKeyRef.current = null;
      setAccountName('');
      return;
    }
    const key = `${accountNumber}|${selectedBankCode}`;
    if (lastVerifiedKeyRef.current !== key) {
      setAccountName('');
    }
  }, [accountNumber, selectedBankCode, selectedBank]);

  // Debounced verify when 10 digits + bank (re-runs after any digit edit)
  useEffect(() => {
    if (accountNumber.length !== 10 || !selectedBank || !selectedBankCode) {
      return;
    }
    const acct = accountNumber;
    const bank = selectedBankCode;
    const t = setTimeout(() => {
      void verifyAccountFor(acct, bank);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, selectedBank, selectedBankCode]);

  const handleProceed = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    const requested = parseFloat(amount);
    if (requested < minWithdrawalAmount) {
      setShowMinimumLimitModal(true);
      return;
    }
    const maxAffordablePayout = maxWithdrawalPayoutWithinBalance(availableBalance);
    if (maxAffordablePayout < minWithdrawalAmount) {
      const minTotal = withdrawalFeeAndTotal(minWithdrawalAmount).total;
      setInsufficientRequiredAmount(
        minTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
      setShowInsufficientBalanceModal(true);
      return;
    }
    const payout = clampWithdrawalPayoutToBalance(requested, availableBalance);
    if (payout < minWithdrawalAmount) {
      const triedTotal = withdrawalFeeAndTotal(requested).total;
      setInsufficientRequiredAmount(
        triedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
      setShowInsufficientBalanceModal(true);
      return;
    }
    if (!accountNumber || accountNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid account number');
      return;
    }
    if (!selectedBank) {
      Alert.alert('Error', 'Please select a bank');
      return;
    }
    if (!accountName) {
      Alert.alert('Error', 'Please verify your account number');
      return;
    }

    const { fee, total } = withdrawalFeeAndTotal(payout);
    setConfirmRequested(requested);
    setConfirmPayout(payout);
    setConfirmFee(fee);
    setConfirmTotal(total);
    setConfirmAdjusted(Math.abs(payout - requested) > 0.009);

    setProceedLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    setShowConfirmModal(true);
    setProceedLoading(false);
  };

  /** Close confirm modal; if a withdrawal is submitting, mark it cancelled so completion is ignored. */
  const handleCancelWithdrawConfirm = () => {
    if (submittingWithdrawal) {
      withdrawalCancelledRef.current = true;
      setSubmittingWithdrawal(false);
    }
    setShowConfirmModal(false);
  };

  const handleConfirmWithdraw = async () => {
    if (submittingWithdrawal) return; // Prevent double submission
    withdrawalCancelledRef.current = false;

    try {
      setSubmittingWithdrawal(true);

      const payout = clampWithdrawalPayoutToBalance(confirmRequested, availableBalance);
      const { fee: feeSnap, total: totalSnap } = withdrawalFeeAndTotal(payout);

      // Validate inputs before closing modal
      if (!payout || payout <= 0) {
        Alert.alert('Error', 'Please enter a valid amount');
        setSubmittingWithdrawal(false);
        return;
      }
      
      if (!accountNumber || accountNumber.length < 10) {
        Alert.alert('Error', 'Please enter a valid account number');
        setSubmittingWithdrawal(false);
        return;
      }
      
      if (!selectedBank || !selectedBankCode) {
        Alert.alert('Error', 'Please select a bank');
        setSubmittingWithdrawal(false);
        return;
      }
      
      if (!accountName) {
        Alert.alert('Error', 'Please verify your account number');
        setSubmittingWithdrawal(false);
        return;
      }
      
      if (payout < minWithdrawalAmount) {
        setShowConfirmModal(false);
        setShowMinimumLimitModal(true);
        setSubmittingWithdrawal(false);
        return;
      }
      if (totalSnap > availableBalance) {
        setShowConfirmModal(false);
        setInsufficientRequiredAmount(
          totalSnap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        );
        setShowInsufficientBalanceModal(true);
        setSubmittingWithdrawal(false);
        return;
      }

      // NOTE: keep the confirm modal open while the network call is in-flight
      // so the Confirm button can render its loading animation. We only close
      // it once we have a final result (success or specific error case).
      console.log('💰 Submitting withdrawal request:', {
        account_name: accountName,
        account_number: accountNumber,
        amount: payout,
        fee: feeSnap,
        total_debit: totalSnap,
        bank_code: selectedBankCode,
        bank_name: selectedBank,
      });

      const result = await submitWithdrawal({
        amount: payout,
        bank_name: selectedBank,
        account_number: accountNumber,
        account_name: accountName,
        bank_code: selectedBankCode,
      });

      if (withdrawalCancelledRef.current) {
        return;
      }

      if (result.success) {
        setShowConfirmModal(false);
        setShowSuccessModal(true);
        setAmount('');
        setAccountNumber('');
        setSelectedBank('');
        setSelectedBankCode('');
        setAccountName('');
        if (user?.id) {
          fetchBalance();
        }
      } else {
        const errorMessage = result.error || 'Failed to process withdrawal. Please try again.';
        console.error('Withdrawal failed:', errorMessage);
        const errLower = errorMessage.toLowerCase();
        setShowConfirmModal(false);
        if (errLower.includes('insufficient')) {
          await fetchBalance();
          setInsufficientRequiredAmount(
            totalSnap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          );
          setShowInsufficientBalanceModal(true);
        } else if (errLower.includes('minimum') || errLower.includes('below') || errLower.includes('limit')) {
          setShowMinimumLimitModal(true);
        } else {
          Alert.alert(
            'Withdrawal Failed',
            errorMessage,
            [{ text: 'OK', style: 'default' }]
          );
        }
      }
    } catch (error: any) {
      if (withdrawalCancelledRef.current) {
        return;
      }
      console.error('Error processing withdrawal:', error);
      const errorMessage = error.message || error.toString() || 'Failed to process withdrawal. Please try again.';
      const errLower = errorMessage.toLowerCase();
      setShowConfirmModal(false);
      if (errLower.includes('insufficient')) {
        fetchBalance().then(() => {
          const p = clampWithdrawalPayoutToBalance(confirmRequested, availableBalance);
          const t = withdrawalFeeAndTotal(p).total;
          setInsufficientRequiredAmount(
            t.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          );
          setShowInsufficientBalanceModal(true);
        });
      } else if (errLower.includes('minimum') || errLower.includes('below') || errLower.includes('limit')) {
        setShowMinimumLimitModal(true);
      } else {
        Alert.alert(
          'Error',
          errorMessage,
          [{ text: 'OK', style: 'default' }]
        );
      }
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    router.back();
  };

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
            <ThemedText style={styles.headerTitle}>Withdraw</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            {/* Available Balance */}
            <View style={styles.balanceCard}>
              <ThemedText 
                style={styles.balanceLabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Available Balance
              </ThemedText>
              {balanceLoading ? (
                <AppLoadingIndicator size="small" variant="onPrimary" style={{ marginTop: 8 }} />
              ) : (
                <ThemedText 
                  style={styles.balanceAmount}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  ₦{formatBalance(availableBalance, 'NGN')}
                </ThemedText>
              )}
            </View>

            {/* Amount Input */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Withdrawal Amount
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
              {amount &&
                (() => {
                  const a = parseFloat(amount);
                  if (!Number.isFinite(a) || a <= 0) return null;
                  const { total } = withdrawalFeeAndTotal(a);
                  return total > availableBalance ? (
                    <ThemedText style={styles.errorText}>
                      Insufficient balance (amount + 3% fee exceeds available)
                    </ThemedText>
                  ) : null;
                })()}
            </View>

            {/* Bank Selection */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Select Bank
              </ThemedText>
              <TouchableOpacity
                style={styles.bankSelector}
                onPress={() => setShowBankPicker(true)}
                activeOpacity={0.7}
              >
                <ThemedText 
                  style={[styles.bankSelectorText, !selectedBank && styles.bankSelectorPlaceholder]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {selectedBank || 'Select a bank'}
                </ThemedText>
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B46C1" />
              </TouchableOpacity>
            </View>

            {/* Account Number */}
            <View style={styles.section}>
              <ThemedText 
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Account Number
              </ThemedText>
              <View style={styles.accountNumberContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter account number"
                  placeholderTextColor="#9CA3AF"
                  value={accountNumber}
                  onChangeText={(text) =>
                    setAccountNumber(text.replace(/\D/g, '').slice(0, 10))
                  }
                  keyboardType="number-pad"
                  maxLength={10}
                  numberOfLines={1}
                />
                {verifyingAccount && (
                  <View style={styles.verifyingIndicator}>
                    <AppLoadingIndicator size="small" />
                  </View>
                )}
                {accountName && !verifyingAccount && (
                  <View style={styles.verifiedIndicator}>
                    <MaterialIcons name="check-circle" size={20} color="#10B981" />
                  </View>
                )}
              </View>
            </View>

            {/* Account Name (Display only after verification) */}
            {accountName && (
              <View style={styles.section}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Account Name
                </ThemedText>
                <View style={styles.accountNameContainer}>
                  <MaterialIcons name="person" size={20} color="#10B981" />
                  <ThemedText 
                    style={styles.accountNameText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {accountName}
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Proceed Button */}
            <TouchableOpacity
              style={[
                styles.proceedButton,
                (!amount || !accountNumber || !selectedBank || !accountName) &&
                  styles.proceedButtonDisabled,
                proceedLoading && styles.proceedButtonLoading,
              ]}
              onPress={handleProceed}
              disabled={!amount || !accountNumber || !selectedBank || !accountName || proceedLoading}
              activeOpacity={proceedLoading ? 1 : 0.8}
            >
              <LinearGradient
                colors={
                  !amount || !accountNumber || !selectedBank || !accountName
                    ? ['#D1D5DB', '#9CA3AF']
                    : proceedLoading
                      ? ['#7C3AED', '#6B46C1']
                      : ['#6B46C1', '#9333EA']
                }
                style={styles.proceedButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {proceedLoading ? (
                  <View style={styles.proceedLoadingContainer}>
                    <AppLoadingIndicator variant="onPrimary" size="medium" />
                    <ThemedText
                      style={styles.proceedLoadingText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Proceeding...
                    </ThemedText>
                  </View>
                ) : (
                  <>
                    <MaterialIcons name="send" size={20} color="#FFFFFF" />
                    <ThemedText 
                      style={styles.proceedButtonText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Proceed to Withdraw
                    </ThemedText>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Demo Withdraw Button - Only visible for demo users */}
            {user?.email?.toLowerCase() === 'demo@chaincola.com' && (
              <TouchableOpacity
                style={[
                  styles.demoButton,
                  (!amount || !accountNumber || !selectedBank || !accountName || submittingWithdrawal) &&
                    styles.demoButtonDisabled,
                ]}
                onPress={async () => {
                if (!amount || parseFloat(amount) <= 0) {
                  Alert.alert('Error', 'Please enter a valid amount');
                  return;
                }
                const amt = parseFloat(amount);
                if (amt < minWithdrawalAmount) {
                  setShowMinimumLimitModal(true);
                  return;
                }
                const maxAffordablePayout = maxWithdrawalPayoutWithinBalance(availableBalance);
                if (maxAffordablePayout < minWithdrawalAmount) {
                  const minTotal = withdrawalFeeAndTotal(minWithdrawalAmount).total;
                  setInsufficientRequiredAmount(
                    minTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  );
                  setShowInsufficientBalanceModal(true);
                  return;
                }
                const payout = clampWithdrawalPayoutToBalance(amt, availableBalance);
                if (payout < minWithdrawalAmount) {
                  const triedTotal = withdrawalFeeAndTotal(amt).total;
                  setInsufficientRequiredAmount(
                    triedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  );
                  setShowInsufficientBalanceModal(true);
                  return;
                }
                if (!accountNumber || accountNumber.length < 10) {
                  Alert.alert('Error', 'Please enter a valid account number');
                  return;
                }
                if (!selectedBank || !selectedBankCode) {
                  Alert.alert('Error', 'Please select a bank');
                  return;
                }
                if (!accountName) {
                  Alert.alert('Error', 'Please verify your account number');
                  return;
                }

                setSubmittingWithdrawal(true);

                try {
                  const withdrawalAmount = payout;
                  const result = await demoWithdraw({
                    amount: withdrawalAmount,
                    bank_name: selectedBank,
                    account_number: accountNumber,
                    account_name: accountName,
                    bank_code: selectedBankCode,
                  });

                  if (result.success) {
                    // Show success modal
                    setShowSuccessModal(true);
                    // Reset form
                    setAmount('');
                    setAccountNumber('');
                    setSelectedBank('');
                    setSelectedBankCode('');
                    setAccountName('');
                    // Refresh balance
                    if (user?.id) {
                      fetchBalance();
                    }
                  } else {
                    Alert.alert('Demo Withdrawal Failed', result.error || 'Failed to process demo withdrawal. Please try again.');
                  }
                } catch (error: any) {
                  console.error('Error processing demo withdrawal:', error);
                  Alert.alert('Error', error.message || 'Failed to process demo withdrawal. Please try again.');
                } finally {
                  setSubmittingWithdrawal(false);
                }
              }}
              disabled={!amount || !accountNumber || !selectedBank || !accountName || submittingWithdrawal}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  amount && accountNumber && selectedBank && accountName && !submittingWithdrawal
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
                  {submittingWithdrawal ? 'Processing...' : 'Demo: Withdraw Instantly'}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bank Picker Modal */}
      <Modal
        visible={showBankPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bankPickerModal}>
            <View style={styles.bankPickerHeader}>
              <ThemedText style={styles.bankPickerTitle}>Select Bank</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowBankPicker(false);
                  setBankSearchQuery(''); // Clear search when modal closes
                }}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            {/* Search Input */}
            {!banksLoading && !banksError && banks.length > 0 && (
              <View style={styles.bankSearchContainer}>
                <MaterialIcons name="search" size={20} color="#9CA3AF" style={styles.bankSearchIcon} />
                <TextInput
                  style={styles.bankSearchInput}
                  placeholder="Search banks..."
                  placeholderTextColor="#9CA3AF"
                  value={bankSearchQuery}
                  onChangeText={setBankSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {bankSearchQuery.length > 0 && (
                  <TouchableOpacity
                    style={styles.bankSearchClear}
                    onPress={() => setBankSearchQuery('')}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="close" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <ScrollView style={styles.bankList}>
              {banksLoading ? (
                <View style={styles.bankListLoading}>
                  <AppLoadingIndicator size="large" />
                  <ThemedText style={styles.bankListLoadingText}>
                    Loading banks...
                  </ThemedText>
                </View>
              ) : banksError ? (
                <View style={styles.bankListError}>
                  <MaterialIcons name="error-outline" size={48} color="#EF4444" />
                  <ThemedText style={styles.bankListErrorText}>
                    {banksError}
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={fetchBanks}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : banks.length === 0 ? (
                <View style={styles.bankListEmpty}>
                  <MaterialIcons name="account-balance" size={48} color="#9CA3AF" />
                  <ThemedText style={styles.bankListEmptyText}>
                    No banks available
                  </ThemedText>
                </View>
              ) : filteredBanks.length === 0 ? (
                <View style={styles.bankListEmpty}>
                  <MaterialIcons name="search-off" size={48} color="#9CA3AF" />
                  <ThemedText style={styles.bankListEmptyText}>
                    No banks found matching "{bankSearchQuery}"
                  </ThemedText>
                </View>
              ) : (
                filteredBanks.map((bank, index) => (
                  <TouchableOpacity
                    key={bank.id ? `${bank.id}-${bank.code}` : `${bank.code}-${bank.name}-${index}`}
                    style={[
                      styles.bankItem,
                      selectedBank === bank.name && styles.bankItemSelected,
                    ]}
                    onPress={() => handleBankSelect(bank.name, bank.code)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.bankItemText,
                        selectedBank === bank.name && styles.bankItemTextSelected,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {bank.name}
                    </ThemedText>
                    {selectedBank === bank.name && (
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelWithdrawConfirm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmIconContainer, submittingWithdrawal && styles.confirmIconContainerProcessing]}>
              <MaterialIcons name="account-balance" size={64} color="#6B46C1" />
            </View>
            <ThemedText 
              style={styles.confirmModalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {submittingWithdrawal ? 'Processing withdrawal' : 'Confirm Withdrawal'}
            </ThemedText>
            <View style={styles.confirmSummaryCard}>
              {submittingWithdrawal ? (
                <View style={styles.confirmProcessingInCard}>
                  <AppLoadingIndicator size="large" variant="onLight" />
                  <ThemedText style={styles.confirmProcessingCardTitle}>Processing…</ThemedText>
                  <ThemedText style={styles.confirmProcessingCardSub}>
                    Submitting your withdrawal. Please keep this screen open.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.confirmDetails}>
                  {confirmAdjusted && (
                    <ThemedText style={styles.confirmAdjustedNote} numberOfLines={4}>
                      Your balance covers a lower bank payout after the 3% fee. Amount below is what you will receive; total is what leaves your wallet.
                    </ThemedText>
                  )}
                  <View style={styles.confirmDetailRow}>
                    <ThemedText style={styles.confirmDetailLabel}>You receive</ThemedText>
                    <ThemedText style={styles.confirmDetailValue}>{fmtNgn(confirmPayout)}</ThemedText>
                  </View>
                  {confirmAdjusted && (
                    <View style={styles.confirmDetailRow}>
                      <ThemedText style={styles.confirmDetailLabel}>You entered</ThemedText>
                      <ThemedText style={styles.confirmDetailValueMuted}>
                        {fmtNgn(confirmRequested)}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.confirmDetailRow}>
                    <ThemedText style={styles.confirmDetailLabel}>Fee (3%)</ThemedText>
                    <ThemedText style={styles.confirmDetailValueMuted}>{fmtNgn(confirmFee)}</ThemedText>
                  </View>
                  <View style={[styles.confirmDetailRow, styles.confirmTotalRow]}>
                    <ThemedText style={styles.confirmDetailLabelStrong}>Total from wallet</ThemedText>
                    <ThemedText style={styles.confirmDetailValueStrong}>{fmtNgn(confirmTotal)}</ThemedText>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <ThemedText style={styles.confirmDetailLabel}>Bank:</ThemedText>
                    <ThemedText style={styles.confirmDetailValue}>{selectedBank}</ThemedText>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <ThemedText style={styles.confirmDetailLabel}>Account:</ThemedText>
                    <ThemedText style={styles.confirmDetailValue}>{accountNumber}</ThemedText>
                  </View>
                  <View style={[styles.confirmDetailRow, styles.confirmDetailRowLast]}>
                    <ThemedText style={styles.confirmDetailLabel}>Account Name:</ThemedText>
                    <ThemedText style={styles.confirmDetailValue}>{accountName}</ThemedText>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={[
                  styles.confirmCancelButton,
                  submittingWithdrawal && styles.confirmCancelButtonProcessing,
                ]}
                onPress={handleCancelWithdrawConfirm}
                activeOpacity={0.8}
              >
                <ThemedText 
                  style={[
                    styles.confirmCancelText,
                    submittingWithdrawal && styles.confirmCancelTextProcessing,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmProceedButton,
                  submittingWithdrawal && styles.confirmProceedButtonLoading,
                ]}
                onPress={handleConfirmWithdraw}
                activeOpacity={submittingWithdrawal ? 1 : 0.8}
                disabled={submittingWithdrawal}
              >
                <LinearGradient
                  colors={
                    submittingWithdrawal
                      ? ['#7C3AED', '#6B46C1']
                      : ['#6B46C1', '#9333EA']
                  }
                  style={styles.confirmProceedButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <ThemedText 
                    style={submittingWithdrawal ? styles.confirmProceedLoadingText : styles.confirmProceedText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {submittingWithdrawal ? 'Please wait' : 'Confirm'}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Wrong Account Number Modal */}
      <Modal
        visible={showWrongAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowWrongAccountModal(false);
          setWrongAccountDetail(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.wrongAccountModalContent}>
            <View style={styles.wrongAccountIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            </View>
            <ThemedText 
              style={styles.wrongAccountModalTitle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Invalid account
            </ThemedText>
            <ThemedText 
              style={styles.wrongAccountModalMessage}
              numberOfLines={8}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {wrongAccountDetail?.trim()
                ? wrongAccountDetail.trim()
                : 'The account number could not be verified for this bank. Check the number and bank, then try again.'}
            </ThemedText>
            <TouchableOpacity
              style={styles.wrongAccountModalButton}
              onPress={() => {
                setShowWrongAccountModal(false);
                setWrongAccountDetail(null);
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.wrongAccountModalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText 
                  style={styles.wrongAccountModalButtonText}
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
              Transfer successful!
            </ThemedText>
            <ThemedText 
              style={styles.successModalMessage}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Your bank transfer was successful. Funds are on their way to your account.
            </ThemedText>
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

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalanceModal}
        onClose={() => {
          setShowInsufficientBalanceModal(false);
          setInsufficientRequiredAmount(undefined);
        }}
        availableBalance={availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        requiredAmount={insufficientRequiredAmount ?? amount}
        currency="fiat"
      />

      {/* Minimum Withdraw Limit Modal */}
      <MinimumWithdrawLimitModal
        visible={showMinimumLimitModal}
        onClose={() => setShowMinimumLimitModal(false)}
        minimumAmount={minWithdrawalAmount}
        enteredAmount={amount}
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
  balanceCard: {
    backgroundColor: '#6B46C1',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#E9D5FF',
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
    lineHeight: 20,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    lineHeight: 36,
    paddingHorizontal: 8,
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
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 0,
    color: '#11181C',
    flex: 1,
    minHeight: 50,
  },
  accountNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 50,
  },
  verifyingIndicator: {
    paddingRight: 16,
  },
  verifiedIndicator: {
    paddingRight: 16,
  },
  bankSelector: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  bankSelectorText: {
    fontSize: 16,
    color: '#11181C',
    flex: 1,
  },
  bankSelectorPlaceholder: {
    color: '#9CA3AF',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  accountNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  accountNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    flex: 1,
  },
  proceedButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
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
  proceedButtonLoading: {
    opacity: 0.8,
  },
  proceedButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  proceedLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  proceedLoadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EDE9FE',
  },
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  demoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  bankPickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  bankPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  bankPickerTitle: {
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
  bankSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 48,
  },
  bankSearchIcon: {
    marginRight: 12,
  },
  bankSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
    paddingVertical: 12,
  },
  bankSearchClear: {
    padding: 4,
    marginLeft: 8,
  },
  bankList: {
    maxHeight: 400,
  },
  bankListLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  bankListLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  bankListError: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  bankListErrorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 24,
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
  bankListEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  bankListEmptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  bankItemSelected: {
    backgroundColor: '#EDE9FE',
  },
  bankItemText: {
    fontSize: 16,
    color: '#11181C',
    flex: 1,
  },
  bankItemTextSelected: {
    color: '#6B46C1',
    fontWeight: '600',
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
  confirmIconContainerProcessing: {
    opacity: 0.35,
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#11181C',
  },
  confirmSummaryCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
    overflow: 'hidden',
  },
  confirmProcessingInCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 14,
  },
  confirmProcessingCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5B21B6',
    textAlign: 'center',
  },
  confirmProcessingCardSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  confirmDetails: {
    width: '100%',
    paddingHorizontal: 4,
    gap: 0,
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
  confirmAdjustedNote: {
    fontSize: 13,
    color: '#047857',
    lineHeight: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  confirmDetailValueMuted: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmDetailLabelStrong: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  confirmDetailValueStrong: {
    fontSize: 17,
    fontWeight: '700',
    color: '#5B21B6',
  },
  confirmTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 4,
    paddingTop: 14,
  },
  confirmDetailRowLast: {
    borderBottomWidth: 0,
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    alignItems: 'stretch',
  },
  confirmCancelButton: {
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
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  confirmCancelButtonProcessing: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
    borderWidth: 2,
  },
  confirmCancelTextProcessing: {
    color: '#5B21B6',
    fontWeight: '700',
  },
  confirmProceedButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmProceedButtonLoading: {
    opacity: 0.8,
  },
  confirmProceedButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmProceedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  confirmProceedLoadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EDE9FE',
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
  wrongAccountModalContent: {
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
  wrongAccountIconContainer: {
    marginBottom: 16,
  },
  wrongAccountModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
  },
  wrongAccountModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
    color: '#11181C',
  },
  wrongAccountModalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  wrongAccountModalButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrongAccountModalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

