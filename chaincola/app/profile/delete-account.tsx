import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  createAccountDeletionRequest,
  fetchUserDeletionRequest,
  cancelAccountDeletionRequest,
  formatTimeRemaining,
  formatDate,
  getGracePeriodMeta,
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
  type AccountDeletion,
} from '@/lib/account-deletion-service';
import { getUserProfile, type UserProfile } from '@/lib/user-service';
import { supabase } from '@/lib/supabase';

export default function DeleteAccountScreen() {
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingRequest, setCheckingRequest] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletion | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [graceTick, setGraceTick] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [txCount, setTxCount] = useState<number | null>(null);
  const [walletCount, setWalletCount] = useState<number | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const requiredText = 'DELETE';

  const loadAccountSummary = useCallback(async () => {
    if (!user?.id) return;
    setSummaryLoading(true);
    try {
      const [profile, txRes, walletRes] = await Promise.all([
        getUserProfile(user.id),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase
          .from('crypto_wallets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true),
      ]);
      setUserProfile(profile);
      setTxCount(typeof txRes.count === 'number' ? txRes.count : null);
      setWalletCount(typeof walletRes.count === 'number' ? walletRes.count : null);
    } catch (e) {
      console.error('Failed to load account summary for delete screen:', e);
    } finally {
      setSummaryLoading(false);
    }
  }, [user?.id]);

  const checkExistingRequest = async (isRefresh = false) => {
    if (!user?.id) {
      setCheckingRequest(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setCheckingRequest(true);
    }
    setError(null);

    try {
      const [{ request, error: fetchErr }] = await Promise.all([
        fetchUserDeletionRequest(user.id),
        loadAccountSummary(),
      ]);

      if (fetchErr) {
        if (fetchErr.includes('permission') || fetchErr.includes('row-level')) {
          setError('Permission error. Please ensure you are signed in and try again.');
        } else {
          setError(`Failed to load deletion status: ${fetchErr}`);
        }
        setDeletionRequest(null);
        return;
      }

      setDeletionRequest(request);
      if (request) {
        setTimeRemaining(formatTimeRemaining(request.scheduled_deletion_at));
        setGraceTick((t) => t + 1);
      }
    } catch (err: unknown) {
      console.error('Error checking deletion request:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('42501') || msg.includes('row-level security')) {
        setError('Permission error. Please ensure you are signed in and try again.');
      } else {
        setError(`Failed to load deletion status: ${msg}`);
      }
    } finally {
      setCheckingRequest(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    checkExistingRequest(true);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      checkExistingRequest();
    }, [user?.id])
  );

  const graceMeta = useMemo(() => {
    if (!deletionRequest) return null;
    return getGracePeriodMeta(deletionRequest);
  }, [deletionRequest, graceTick]);

  useEffect(() => {
    if (!deletionRequest) return;

    const tick = () => {
      setTimeRemaining(formatTimeRemaining(deletionRequest.scheduled_deletion_at));
      setGraceTick((x) => x + 1);
    };

    tick();
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, [deletionRequest]);

  const handleDelete = () => {
    if (confirmText !== requiredText) {
      Alert.alert('Error', `Please type "${requiredText}" to confirm account deletion`);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleFinalDelete = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      const result = await createAccountDeletionRequest(user.id, reason.trim() || undefined);
      
      if (result.success && result.data) {
        setDeletionRequest(result.data);
        setShowConfirmModal(false);
        setConfirmText('');
        setReason('');
        setError(null);
        setTimeRemaining(formatTimeRemaining(result.data.scheduled_deletion_at));
        setGraceTick((x) => x + 1);
        Alert.alert(
          'Deletion Request Submitted',
          `Your account deletion request has been submitted. You have ${ACCOUNT_DELETION_GRACE_PERIOD_DAYS} days to cancel this request. After that, your account will be permanently deleted.`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Refresh the deletion request status
                checkExistingRequest();
              },
            },
          ]
        );
      } else {
        let errorMsg = result.error || 'Failed to submit deletion request. Please try again.';
        
        // Handle RLS policy errors specifically
        if (result.error?.includes('row-level security') || result.error?.includes('42501')) {
          errorMsg = 'Permission error. Please ensure you are signed in and try again. If the issue persists, contact support.';
        }
        
        setError(errorMsg);
        Alert.alert('Error', errorMsg);
      }
    } catch (error: any) {
      console.error('Error submitting deletion request:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!deletionRequest) return;

    setLoading(true);
    try {
      const result = await cancelAccountDeletionRequest(deletionRequest.id);
      
      if (result.success) {
        setDeletionRequest(null);
        setError(null);
        Alert.alert('Success', 'Your account deletion request has been cancelled.');
        // Refresh to ensure state is updated
        checkExistingRequest();
      } else {
        let errorMsg = result.error || 'Failed to cancel deletion request. Please try again.';
        
        // Handle RLS policy errors specifically
        if (result.error?.includes('row-level security') || result.error?.includes('42501')) {
          errorMsg = 'Permission error. Please ensure you are signed in and try again.';
        }
        
        setError(errorMsg);
        Alert.alert('Error', errorMsg);
      }
    } catch (error: any) {
      console.error('Error cancelling deletion request:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6B46C1"
            colors={['#6B46C1']}
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleCancel}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Delete Account</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {checkingRequest ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6B46C1" />
            <ThemedText style={styles.loadingText}>Checking deletion status...</ThemedText>
          </View>
        ) : error && !deletionRequest ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => checkExistingRequest()}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : deletionRequest && graceMeta ? (
          <View style={styles.pendingDeletionContainer}>
            <View style={styles.pendingIconContainer}>
              <MaterialIcons name="schedule" size={48} color="#F59E0B" />
            </View>
            <ThemedText style={styles.pendingTitle}>Deletion Request Pending</ThemedText>
            <ThemedText style={styles.pendingText}>
              Your account deletion request is scheduled for:
            </ThemedText>
            <ThemedText style={styles.scheduledDate}>
              {formatDate(deletionRequest.scheduled_deletion_at)}
            </ThemedText>
            
            {/* Progress from real requested_at → scheduled_deletion_at */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${graceMeta.progressPercent}%` }]}
                />
              </View>
              <View style={styles.progressLabels}>
                <ThemedText style={styles.progressLabel}>
                  {graceMeta.remainingDays}{' '}
                  {graceMeta.remainingDays === 1 ? 'day' : 'days'} remaining
                </ThemedText>
                <ThemedText style={styles.progressLabel}>
                  {Math.min(
                    graceMeta.totalDays,
                    Math.max(0, graceMeta.totalDays - graceMeta.remainingDays),
                  )}{' '}
                  of {graceMeta.totalDays} days elapsed
                </ThemedText>
              </View>
            </View>
            
            <ThemedText
              style={[
                styles.timeRemaining,
                graceMeta.remainingDays <= 7 && styles.timeRemainingUrgent,
              ]}
            >
              {timeRemaining || formatTimeRemaining(deletionRequest.scheduled_deletion_at)}
            </ThemedText>

            {graceMeta.remainingDays <= 7 && graceMeta.remainingDays > 0 && (
              <View style={styles.urgentWarning}>
                <MaterialIcons name="warning" size={20} color="#DC2626" />
                <ThemedText style={styles.urgentWarningText}>
                  {graceMeta.remainingDays === 1
                    ? 'Your account will be deleted tomorrow!'
                    : `Only ${graceMeta.remainingDays} ${
                        graceMeta.remainingDays === 1 ? 'day' : 'days'
                      } left to cancel.`}
                </ThemedText>
              </View>
            )}
            
            {deletionRequest.reason && (
              <View style={styles.reasonContainer}>
                <ThemedText style={styles.reasonLabel}>Reason:</ThemedText>
                <ThemedText style={styles.reasonText}>{deletionRequest.reason}</ThemedText>
              </View>
            )}
            
            {error && (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={20} color="#EF4444" />
                <ThemedText style={styles.errorBannerText}>{error}</ThemedText>
              </View>
            )}
            
            <TouchableOpacity
              style={styles.cancelDeletionButton}
              onPress={handleCancelDeletion}
              activeOpacity={0.8}
              disabled={loading}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.cancelDeletionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="cancel" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.cancelDeletionText}>Cancel Deletion Request</ThemedText>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.accountCard}>
              <ThemedText style={styles.accountCardTitle}>Your account</ThemedText>
              {summaryLoading ? (
                <ActivityIndicator size="small" color="#6B46C1" style={{ marginVertical: 8 }} />
              ) : null}
              <View style={styles.accountRow}>
                <ThemedText style={styles.accountLabel}>Name</ThemedText>
                <ThemedText style={styles.accountValue}>
                  {userProfile?.full_name ||
                    userProfile?.name ||
                    (user?.metadata?.full_name as string) ||
                    (user?.metadata?.name as string) ||
                    '—'}
                </ThemedText>
              </View>
              <View style={styles.accountRow}>
                <ThemedText style={styles.accountLabel}>Email</ThemedText>
                <ThemedText style={styles.accountValue}>{userProfile?.email || user?.email || '—'}</ThemedText>
              </View>
              <ThemedText style={styles.accountRowMuted} numberOfLines={1}>
                ID {user?.id ?? '—'}
              </ThemedText>
              <View style={styles.accountStatsRow}>
                <ThemedText style={styles.accountStat}>
                  Transactions:{' '}
                  {txCount === null ? '—' : String(txCount)}
                </ThemedText>
                <ThemedText style={styles.accountStat}>
                  Active wallets:{' '}
                  {walletCount === null ? '—' : String(walletCount)}
                </ThemedText>
              </View>
            </View>

        <View style={styles.warningContainer}>
          <View style={styles.warningIconContainer}>
            <MaterialIcons name="warning" size={48} color="#EF4444" />
          </View>
          <ThemedText style={styles.warningTitle}>Warning: This action cannot be undone</ThemedText>
          <ThemedText style={styles.warningText}>
            Deleting your account will permanently remove all your data, including:
          </ThemedText>
          <View style={styles.warningList}>
            <View style={styles.warningItem}>
              <MaterialIcons name="close" size={16} color="#EF4444" />
              <ThemedText style={styles.warningItemText}>All transaction history</ThemedText>
            </View>
            <View style={styles.warningItem}>
              <MaterialIcons name="close" size={16} color="#EF4444" />
              <ThemedText style={styles.warningItemText}>Wallet balances and assets</ThemedText>
            </View>
            <View style={styles.warningItem}>
              <MaterialIcons name="close" size={16} color="#EF4444" />
              <ThemedText style={styles.warningItemText}>Account settings and preferences</ThemedText>
            </View>
            <View style={styles.warningItem}>
              <MaterialIcons name="close" size={16} color="#EF4444" />
              <ThemedText style={styles.warningItemText}>Referral codes and earnings</ThemedText>
            </View>
          </View>
        </View>

            <View style={styles.confirmContainer}>
              <ThemedText style={styles.confirmTitle}>
                To confirm, please type <ThemedText style={styles.requiredText}>DELETE</ThemedText> in the box below:
              </ThemedText>
              <TextInput
                style={styles.confirmInput}
                placeholder="Type DELETE to confirm"
                placeholderTextColor="#9CA3AF"
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoComplete="off"
                editable={!loading}
              />
            </View>

            <View style={styles.reasonContainer}>
              <ThemedText style={styles.reasonLabel}>Reason (Optional)</ThemedText>
              <TextInput
                style={[styles.confirmInput, styles.reasonInput]}
                value={reason}
                onChangeText={setReason}
                placeholder="Tell us why you're deleting your account..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!loading}
              />
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                activeOpacity={0.8}
                disabled={loading}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  (confirmText !== requiredText || loading) && styles.deleteButtonDisabled,
                ]}
                onPress={handleDelete}
                activeOpacity={0.8}
                disabled={confirmText !== requiredText || loading}
              >
                <LinearGradient
                  colors={confirmText === requiredText && !loading ? ['#EF4444', '#DC2626'] : ['#D1D5DB', '#9CA3AF']}
                  style={styles.deleteButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="delete-outline" size={20} color="#FFFFFF" />
                      <ThemedText style={styles.deleteButtonText}>Delete Account</ThemedText>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Final Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            </View>
            <ThemedText style={styles.modalTitle}>Final Confirmation</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Delete account for{' '}
              <ThemedText style={{ fontWeight: '700' }}>
                {userProfile?.email || user?.email || 'this account'}
              </ThemedText>
              ? After the {ACCOUNT_DELETION_GRACE_PERIOD_DAYS}-day period, access and data linked to this account
              will be removed as described below. This cannot be reversed.
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, loading && styles.modalDeleteButtonDisabled]}
                onPress={handleFinalDelete}
                activeOpacity={0.8}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#EF4444', '#DC2626']}
                  style={styles.modalDeleteButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <ThemedText style={styles.modalDeleteText}>Yes, Delete Account</ThemedText>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
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
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  accountCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  accountCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: '#11181C',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 8,
  },
  accountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    width: 72,
  },
  accountValue: {
    flex: 1,
    fontSize: 14,
    color: '#11181C',
    minWidth: 0,
  },
  accountRowMuted: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
  },
  accountStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  accountStat: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
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
  warningContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    alignItems: 'center',
  },
  warningIconContainer: {
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 15,
    color: '#991B1B',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  warningList: {
    width: '100%',
    gap: 12,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  warningItemText: {
    fontSize: 14,
    color: '#991B1B',
    flex: 1,
    lineHeight: 20,
  },
  confirmContainer: {
    marginBottom: 24,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 22,
  },
  requiredText: {
    color: '#EF4444',
    fontWeight: 'bold',
  },
  confirmInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    color: '#11181C',
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: 12,
  },
  cancelButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  deleteButton: {
    borderRadius: 12,
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
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  demoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
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
    fontSize: 16,
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
  modalContent: {
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
  modalIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#EF4444',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  modalDeleteButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalDeleteButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalDeleteButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  pendingDeletionContainer: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  pendingIconContainer: {
    marginBottom: 16,
  },
  pendingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 12,
    textAlign: 'center',
  },
  pendingText: {
    fontSize: 15,
    color: '#78350F',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  scheduledDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 8,
  },
  timeRemaining: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 8,
    textAlign: 'center',
  },
  timeRemainingUrgent: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: 'bold',
  },
  urgentWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  urgentWarningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    lineHeight: 20,
  },
  cancelDeletionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    width: '100%',
  },
  cancelDeletionButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  cancelDeletionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  reasonContainer: {
    marginBottom: 24,
    width: '100%',
  },
  reasonLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 22,
  },
  reasonText: {
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
    marginTop: 8,
  },
  reasonInput: {
    minHeight: 100,
    paddingTop: 16,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#991B1B',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressContainer: {
    width: '100%',
    marginVertical: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#FDE68A',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  progressLabel: {
    fontSize: 12,
    color: '#78350F',
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
    width: '100%',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
});


