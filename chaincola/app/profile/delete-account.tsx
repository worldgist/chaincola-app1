import { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  createAccountDeletionRequest,
  getUserDeletionRequest,
  cancelAccountDeletionRequest,
  formatTimeRemaining,
  formatDate,
  type AccountDeletion,
} from '@/lib/account-deletion-service';
import { createDemoDeletionRequest } from '@/lib/demo-deletion-service';

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
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const requiredText = 'DELETE';

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
      const request = await getUserDeletionRequest(user.id);
      setDeletionRequest(request);
      
      // Update time remaining if request exists
      if (request) {
        updateTimeRemaining(request.scheduled_deletion_at);
      }
    } catch (error: any) {
      console.error('Error checking deletion request:', error);
      
      // Handle RLS policy errors specifically
      if (error?.code === '42501' || error?.message?.includes('row-level security')) {
        setError('Permission error. Please ensure you are signed in and try again.');
      } else if (error?.message) {
        setError(`Failed to load deletion status: ${error.message}`);
      } else {
        setError('Failed to load deletion status. Please pull to refresh.');
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

  // Update time remaining every minute if there's a pending deletion
  useEffect(() => {
    if (!deletionRequest) return;

    const updateTimer = () => {
      updateTimeRemaining(deletionRequest.scheduled_deletion_at);
    };

    // Update immediately
    updateTimer();

    // Update every minute
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [deletionRequest]);

  const updateTimeRemaining = (scheduledDeletionAt: string) => {
    const remaining = formatTimeRemaining(scheduledDeletionAt);
    setTimeRemaining(remaining);

    // Calculate days remaining for progress indicator
    try {
      const now = new Date();
      const deletionDate = new Date(scheduledDeletionAt);
      const diffInMs = deletionDate.getTime() - now.getTime();
      const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
      setDaysRemaining(Math.max(0, diffInDays));
    } catch (error) {
      console.error('Error calculating days remaining:', error);
      setDaysRemaining(0);
    }
  };

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
        updateTimeRemaining(result.data.scheduled_deletion_at);
        Alert.alert(
          'Deletion Request Submitted',
          'Your account deletion request has been submitted. You have 30 days to cancel this request. After 30 days, your account will be permanently deleted.',
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
        ) : deletionRequest ? (
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
            
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${Math.max(0, Math.min(100, ((30 - daysRemaining) / 30) * 100))}%` }
                  ]} 
                />
              </View>
              <View style={styles.progressLabels}>
                <ThemedText style={styles.progressLabel}>
                  {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
                </ThemedText>
                <ThemedText style={styles.progressLabel}>
                  {30 - daysRemaining} of 30 days elapsed
                </ThemedText>
              </View>
            </View>
            
            <ThemedText style={[
              styles.timeRemaining,
              daysRemaining <= 7 && styles.timeRemainingUrgent
            ]}>
              {timeRemaining || formatTimeRemaining(deletionRequest.scheduled_deletion_at)}
            </ThemedText>
            
            {daysRemaining <= 7 && daysRemaining > 0 && (
              <View style={styles.urgentWarning}>
                <MaterialIcons name="warning" size={20} color="#DC2626" />
                <ThemedText style={styles.urgentWarningText}>
                  {daysRemaining === 1 
                    ? 'Your account will be deleted tomorrow!'
                    : `Only ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left to cancel.`
                  }
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
              Are you absolutely sure you want to delete your account? This action is permanent and cannot be reversed.
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


