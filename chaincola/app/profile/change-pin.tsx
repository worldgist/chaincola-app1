import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { verifyPINInput, savePIN, isPINSetup } from '@/lib/pin-service';

export default function ChangePinScreen() {
  const { user } = useAuth();
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingPin, setCheckingPin] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [wasSettingUp, setWasSettingUp] = useState(false);
  
  const currentPinRefs = useRef<(TextInput | null)[]>([]);
  const newPinRefs = useRef<(TextInput | null)[]>([]);
  const confirmPinRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const checkPinExists = async () => {
      if (!user?.id) {
        setCheckingPin(false);
        return;
      }

      try {
        const pinExists = await isPINSetup(user.id);
        setHasPin(pinExists);
        setIsSettingUp(!pinExists);
        // If no PIN exists, start with 'new' step instead of 'current'
        if (!pinExists) {
          setStep('new');
          // Auto-focus on the first PIN input after a short delay
          setTimeout(() => {
            newPinRefs.current[0]?.focus();
          }, 300);
        }
      } catch (error) {
        console.error('Error checking PIN:', error);
      } finally {
        setCheckingPin(false);
      }
    };

    checkPinExists();
  }, [user?.id]);

  const handlePinChange = async (text: string, index: number, type: 'current' | 'new' | 'confirm') => {
    const numericText = text.replace(/[^0-9]/g, '');
    setErrorMessage('');
    
    if (type === 'current') {
      const newPin = [...currentPin];
      newPin[index] = numericText;
      setCurrentPin(newPin);
      if (numericText && index < 3) {
        currentPinRefs.current[index + 1]?.focus();
      } else if (numericText && index === 3) {
        // All digits entered, verify current PIN
        const enteredPin = newPin.join('');
        if (!user?.id) {
          setErrorMessage('User not found. Please sign in again.');
          setCurrentPin(['', '', '', '']);
          currentPinRefs.current[0]?.focus();
          return;
        }
        
        setLoading(true);
        const verifyResult = await verifyPINInput(user.id, enteredPin);
        if (verifyResult.success) {
          setStep('new');
          setTimeout(() => newPinRefs.current[0]?.focus(), 100);
        } else {
          setErrorMessage(verifyResult.error || 'Incorrect PIN. Please try again.');
          setCurrentPin(['', '', '', '']);
          currentPinRefs.current[0]?.focus();
        }
        setLoading(false);
      }
    } else if (type === 'new') {
      const newPinArray = [...newPin];
      newPinArray[index] = numericText;
      setNewPin(newPinArray);
      if (numericText && index < 3) {
        newPinRefs.current[index + 1]?.focus();
      } else if (numericText && index === 3) {
        setStep('confirm');
        setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
      }
    } else {
      const newConfirmPin = [...confirmPin];
      newConfirmPin[index] = numericText;
      setConfirmPin(newConfirmPin);
      if (numericText && index < 3) {
        confirmPinRefs.current[index + 1]?.focus();
      } else if (numericText && index === 3) {
        // Check if PINs match
        const finalNewPin = newPin.join('');
        const finalConfirmPin = newConfirmPin.join('');
        if (finalNewPin === finalConfirmPin) {
          await handleSave();
        } else {
          // PINs don't match, reset
          setErrorMessage('PINs do not match. Please try again.');
          setConfirmPin(['', '', '', '']);
          confirmPinRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      setErrorMessage('User not found. Please sign in again.');
      return;
    }

    const finalNewPin = newPin.join('');
    if (finalNewPin.length !== 4) {
      setErrorMessage('PIN must be 4 digits.');
      return;
    }

    // Validate PIN is not all the same digit
    if (finalNewPin.split('').every(digit => digit === finalNewPin[0])) {
      setErrorMessage('PIN cannot be all the same digit. Please choose a different PIN.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    
    try {
      const result = await savePIN(user.id, finalNewPin);
      if (result.success) {
        // Store whether we were setting up for the modal
        setWasSettingUp(isSettingUp);
        
        // Clear all PIN inputs
        setCurrentPin(['', '', '', '']);
        setNewPin(['', '', '', '']);
        setConfirmPin(['', '', '', '']);
        setStep(isSettingUp ? 'new' : 'current');
        // Update hasPin state if we just set up a PIN
        if (isSettingUp) {
          setHasPin(true);
          setIsSettingUp(false);
        }
        setShowSuccessModal(true);
      } else {
        setErrorMessage(result.error || 'Failed to save PIN. Please try again.');
      }
    } catch (error: any) {
      console.error('Error saving PIN:', error);
      setErrorMessage(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const renderPinInputs = (pin: string[], refs: any[], type: 'current' | 'new' | 'confirm') => {
    return (
      <View style={styles.pinContainer}>
        {pin.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { refs[index] = ref; }}
            style={[styles.pinInput, digit !== '' && styles.pinInputFilled]}
            value={digit}
            onChangeText={(text) => handlePinChange(text, index, type)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            secureTextEntry
          />
        ))}
      </View>
    );
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
            <ThemedText style={styles.headerTitle}>
              {isSettingUp ? 'Set Up PIN' : 'Change PIN'}
            </ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            {checkingPin ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6B46C1" />
                <ThemedText style={styles.loadingText}>Checking PIN status...</ThemedText>
              </View>
            ) : (
              <>
                {step === 'current' && hasPin && (
                  <View style={styles.stepContainer}>
                    <ThemedText style={styles.stepTitle}>Enter Current PIN</ThemedText>
                    <ThemedText style={styles.stepSubtitle}>
                      Enter your current 4-digit PIN to continue
                    </ThemedText>
                    {renderPinInputs(currentPin, currentPinRefs.current, 'current')}
                    {loading && (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#6B46C1" />
                      </View>
                    )}
                    {errorMessage ? (
                      <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
                    ) : null}
                  </View>
                )}

                {step === 'new' && (
                  <View style={styles.stepContainer}>
                    <ThemedText style={styles.stepTitle}>
                      {isSettingUp ? 'Create PIN' : 'Create New PIN'}
                    </ThemedText>
                    <ThemedText style={styles.stepSubtitle}>
                      {isSettingUp 
                        ? 'Enter a 4-digit PIN to secure your account'
                        : 'Enter a new 4-digit PIN'
                      }
                    </ThemedText>
                    {renderPinInputs(newPin, newPinRefs.current, 'new')}
                    {hasPin && (
                      <TouchableOpacity
                        style={styles.backStepButton}
                        onPress={() => {
                          setStep('current');
                          setNewPin(['', '', '', '']);
                        }}
                      >
                        <ThemedText style={styles.backStepText}>Back</ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {step === 'confirm' && (
                  <View style={styles.stepContainer}>
                    <ThemedText style={styles.stepTitle}>
                      {isSettingUp ? 'Confirm PIN' : 'Confirm New PIN'}
                    </ThemedText>
                    <ThemedText style={styles.stepSubtitle}>
                      {isSettingUp
                        ? 'Re-enter your 4-digit PIN to confirm'
                        : 'Re-enter your new 4-digit PIN to confirm'
                      }
                    </ThemedText>
                    {renderPinInputs(confirmPin, confirmPinRefs.current, 'confirm')}
                    {loading && (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#6B46C1" />
                      </View>
                    )}
                    {errorMessage ? (
                      <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
                    ) : null}
                    <TouchableOpacity
                      style={styles.backStepButton}
                      onPress={() => {
                        setStep('new');
                        setConfirmPin(['', '', '', '']);
                        setErrorMessage('');
                        newPinRefs.current[3]?.focus();
                      }}
                    >
                      <ThemedText style={styles.backStepText}>Back</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText style={styles.modalTitle}>
              {wasSettingUp ? 'PIN Set Up!' : 'PIN Changed!'}
            </ThemedText>
            <ThemedText style={styles.modalMessage}>
              {wasSettingUp
                ? 'Your PIN has been set up successfully'
                : 'Your PIN has been updated successfully'
              }
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleCloseModal}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.modalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.modalButtonText}>OK</ThemedText>
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


