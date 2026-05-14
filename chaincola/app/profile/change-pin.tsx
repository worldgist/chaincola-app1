import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isPINSetup, savePIN, verifyPINInput } from '@/lib/pin-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';

function sanitizePin(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 4);
}

export default function ChangePinScreen() {
  const { user } = useAuth();
  const [checkingPin, setCheckingPin] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [wasSettingUp, setWasSettingUp] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWrongPinModal, setShowWrongPinModal] = useState(false);
  const [wrongPinMessage, setWrongPinMessage] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setCheckingPin(false);
        return;
      }
      try {
        const exists = await isPINSetup(user.id);
        setHasPin(exists);
        setIsSettingUp(!exists);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      } finally {
        setCheckingPin(false);
      }
    };
    void run();
  }, [user?.id]);

  const handleSave = async () => {
    setErrorMessage('');
    if (!user?.id) {
      setErrorMessage('User not found. Please sign in again.');
      return;
    }

    const cur = sanitizePin(currentPin);
    const next = sanitizePin(newPin);
    const conf = sanitizePin(confirmPin);

    if (!isSettingUp && cur.length !== 4) {
      setErrorMessage('Please enter your current 4-digit PIN.');
      return;
    }
    if (next.length !== 4) {
      setErrorMessage('Please enter a new 4-digit PIN.');
      return;
    }
    if (next !== conf) {
      setErrorMessage('PINs do not match.');
      return;
    }
    if (!isSettingUp && cur === next) {
      setErrorMessage('New PIN must be different from current PIN.');
      return;
    }
    if (next.split('').every((d) => d === next[0])) {
      setErrorMessage('PIN cannot be all the same digit. Please choose a different PIN.');
      return;
    }

    setLoading(true);
    try {
      if (!isSettingUp) {
        const verify = await verifyPINInput(user.id, cur);
        if (!verify.success) {
          const msg = verify.error || 'Current PIN is incorrect. Please try again.';
          setWrongPinMessage(msg);
          setShowWrongPinModal(true);
          setLoading(false);
          return;
        }
      }

      const result = await savePIN(user.id, next);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to save PIN. Please try again.');
        setLoading(false);
        return;
      }

      setWasSettingUp(isSettingUp);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      if (isSettingUp) {
        setHasPin(true);
        setIsSettingUp(false);
      }
      setShowSuccessModal(true);
    } catch (e: any) {
      setErrorMessage(e?.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const handleCloseWrongPinModal = () => {
    setShowWrongPinModal(false);
    setWrongPinMessage('');
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>{isSettingUp ? 'Set Up PIN' : 'Change PIN'}</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {checkingPin ? (
            <View style={styles.loadingContainer}>
              <AppLoadingIndicator size="large" />
              <ThemedText style={styles.loadingText}>Checking PIN status...</ThemedText>
            </View>
          ) : (
            <View style={styles.form}>
              {!isSettingUp && hasPin ? (
                <View style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Current PIN</ThemedText>
                  <View style={styles.pinInputContainer}>
                    <TextInput
                      style={styles.pinTextInput}
                      placeholder="Enter your current 4-digit PIN"
                      placeholderTextColor="#9CA3AF"
                      value={currentPin}
                      onChangeText={(t) => {
                        setCurrentPin(sanitizePin(t));
                        setErrorMessage('');
                      }}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry={!showCurrentPin}
                      editable={!loading}
                    />
                    <TouchableOpacity style={styles.eyeButton} onPress={() => setShowCurrentPin((v) => !v)}>
                      <MaterialIcons name={showCurrentPin ? 'visibility' : 'visibility-off'} size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <ThemedText style={styles.label}>{isSettingUp ? 'Create PIN' : 'New PIN'}</ThemedText>
                <View style={styles.pinInputContainer}>
                  <TextInput
                    style={styles.pinTextInput}
                    placeholder="Enter your new 4-digit PIN"
                    placeholderTextColor="#9CA3AF"
                    value={newPin}
                    onChangeText={(t) => {
                      setNewPin(sanitizePin(t));
                      setErrorMessage('');
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry={!showNewPin}
                    editable={!loading}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowNewPin((v) => !v)}>
                    <MaterialIcons name={showNewPin ? 'visibility' : 'visibility-off'} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <ThemedText style={styles.label}>{isSettingUp ? 'Confirm PIN' : 'Confirm New PIN'}</ThemedText>
                <View style={styles.pinInputContainer}>
                  <TextInput
                    style={styles.pinTextInput}
                    placeholder="Confirm your new 4-digit PIN"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPin}
                    onChangeText={(t) => {
                      setConfirmPin(sanitizePin(t));
                      setErrorMessage('');
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry={!showConfirmPin}
                    editable={!loading}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPin((v) => !v)}>
                    <MaterialIcons name={showConfirmPin ? 'visibility' : 'visibility-off'} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>

              {errorMessage ? (
                <View style={styles.errorContainerInline}>
                  <ThemedText style={styles.errorTextInline}>{errorMessage}</ThemedText>
                </View>
              ) : null}

              <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} activeOpacity={0.8} disabled={loading}>
                <LinearGradient colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']} style={styles.saveButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? <AppLoadingIndicator size="small" variant="onPrimary" /> : <ThemedText style={styles.saveButtonText}>{isSettingUp ? 'Save PIN' : 'Change PIN'}</ThemedText>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleCloseSuccessModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText style={styles.modalTitle}>{wasSettingUp ? 'PIN Set Up!' : 'PIN Changed!'}</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {wasSettingUp ? 'Your PIN has been set up successfully' : 'Your PIN has been updated successfully'}
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseSuccessModal} activeOpacity={0.8}>
              <LinearGradient colors={['#6B46C1', '#9333EA']} style={styles.modalButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <ThemedText style={styles.modalButtonText}>OK</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Wrong PIN Modal */}
      <Modal visible={showWrongPinModal} transparent animationType="fade" onRequestClose={handleCloseWrongPinModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.errorIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            </View>
            <ThemedText style={styles.modalTitle}>Wrong PIN</ThemedText>
            <ThemedText style={styles.modalMessage}>{wrongPinMessage || 'Incorrect PIN. Please try again.'}</ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseWrongPinModal} activeOpacity={0.8}>
              <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.modalButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
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
    marginBottom: 32,
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
  form: {
    gap: 18,
    width: '100%',
  },
  inputContainer: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#11181C',
  },
  pinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pinTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: 6,
  },
  eyeButton: {
    padding: 6,
    marginLeft: 8,
  },
  errorContainerInline: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorTextInline: {
    color: '#B91C1C',
    fontSize: 14,
    textAlign: 'center',
  },
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepContainer: {
    alignItems: 'center',
    width: '100%',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  pinInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minHeight: 60,
  },
  pinInputFilled: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6B46C1',
  },
  backStepButton: {
    marginTop: 16,
    padding: 12,
  },
  backStepText: {
    fontSize: 16,
    color: '#6B46C1',
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingContainer: {
    marginTop: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    marginTop: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  successIconContainer: {
    marginBottom: 16,
  },
  errorIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
  },
  modalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  modalButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

