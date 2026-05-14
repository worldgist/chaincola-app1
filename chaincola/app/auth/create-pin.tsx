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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { savePIN } from '@/lib/pin-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';

export default function CreatePinScreen() {
  const params = useLocalSearchParams();
  const flow = params.flow as string;
  // PIN length - 4 digits
  const PIN_LENGTH = 4;
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState(Array(PIN_LENGTH).fill(''));
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(true);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const confirmInputRefs = useRef<(TextInput | null)[]>([]);
  const { user } = useAuth();

  // Ensure email is verified before allowing PIN creation (for signup flow)
  useEffect(() => {
    const checkEmailVerification = async () => {
      if (flow === 'signup') {
        // For signup flow, email must be verified
        if (!user?.email_confirmed_at) {
          Alert.alert(
            'Email Verification Required',
            'Please verify your email address before creating your PIN. You will be redirected to the verification screen.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace(`/auth/verify-email?flow=signup&email=${encodeURIComponent(user?.email || '')}`);
                },
              },
            ]
          );
          return;
        }
      }
      setCheckingEmail(false);
    };

    if (user) {
      checkEmailVerification();
    } else {
      // Wait a bit for user to load
      const timer = setTimeout(() => {
        if (!user) {
          Alert.alert('Error', 'Please sign in to continue.');
          router.replace('/auth/signin');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [user, flow]);

  const handlePinChange = async (text: string, index: number, isConfirm: boolean = false) => {
    // Only allow digits
    const numericText = text.replace(/[^0-9]/g, '');
    
    if (numericText.length > 1) {
      // Handle paste - only accept up to PIN_LENGTH digits
      const pastedPin = numericText.slice(0, PIN_LENGTH).split('');
      if (isConfirm) {
        const newConfirmPin = [...confirmPin];
        pastedPin.forEach((digit, i) => {
          if (index + i < PIN_LENGTH) {
            newConfirmPin[index + i] = digit;
          }
        });
        setConfirmPin(newConfirmPin);
        
        const nextIndex = Math.min(index + pastedPin.length, PIN_LENGTH - 1);
        confirmInputRefs.current[nextIndex]?.focus();
      } else {
        const newPin = [...pin];
        pastedPin.forEach((digit, i) => {
          if (index + i < PIN_LENGTH) {
            newPin[index + i] = digit;
          }
        });
        setPin(newPin);
        
        const nextIndex = Math.min(index + pastedPin.length, PIN_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
      }
    } else {
      if (isConfirm) {
        const newConfirmPin = [...confirmPin];
        newConfirmPin[index] = numericText;
        setConfirmPin(newConfirmPin);

        // Auto-focus next input
        if (numericText && index < PIN_LENGTH - 1) {
          confirmInputRefs.current[index + 1]?.focus();
        } else if (numericText && index === PIN_LENGTH - 1) {
          // All inputs filled, check if PINs match
          const finalPin = newConfirmPin.join('');
          const originalPin = pin.join('');
          if (finalPin === originalPin) {
            await handleCreatePin(finalPin);
          } else {
            // PINs don't match, show error
            setConfirmPin(Array(PIN_LENGTH).fill(''));
            confirmInputRefs.current[0]?.focus();
            Alert.alert('PIN Mismatch', 'The PINs do not match. Please try again.');
          }
        }
      } else {
        const newPin = [...pin];
        newPin[index] = numericText;
        setPin(newPin);

        // Auto-focus next input
        if (numericText && index < PIN_LENGTH - 1) {
          inputRefs.current[index + 1]?.focus();
        } else if (numericText && index === PIN_LENGTH - 1) {
          // All inputs filled, move to confirm
          setIsConfirming(true);
          setTimeout(() => {
            confirmInputRefs.current[0]?.focus();
          }, 100);
        }
      }
    }
  };

  const handleKeyPress = (key: string, index: number, isConfirm: boolean = false) => {
    if (key === 'Backspace') {
      if (isConfirm) {
        if (!confirmPin[index] && index > 0) {
          confirmInputRefs.current[index - 1]?.focus();
        }
      } else {
        if (!pin[index] && index > 0) {
          inputRefs.current[index - 1]?.focus();
        }
      }
    }
  };

  const handleCreatePin = async (finalPin: string) => {
    if (finalPin.length !== PIN_LENGTH) {
      Alert.alert('Error', `PIN must be ${PIN_LENGTH} digits`);
      return;
    }

    try {
      const userId = user?.id;
      if (!userId) {
        Alert.alert('Error', 'User not authenticated. Please sign in again.');
        return;
      }

      const result = await savePIN(userId, finalPin);
      
      if (result.success) {
        // Show success modal
        setShowSuccessModal(true);
      } else {
        Alert.alert('Error', result.error || 'Failed to save PIN. Please try again.');
      }
    } catch (error: any) {
      console.error('Error saving PIN:', error);
      Alert.alert('Error', error.message || 'Failed to save PIN. Please try again.');
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    if (flow === 'signup') {
      // After PIN creation in signup flow, navigate to biometric setup
      // User can either set up biometric authentication or skip to home
      router.replace('/auth/biometric-setup');
    } else {
      // Navigate to home or dashboard
      router.replace('/(tabs)');
    }
  };

  const isPinComplete = pin.every(digit => digit !== '');
  const isConfirmPinComplete = confirmPin.every(digit => digit !== '');
  const pinsMatch = pin.join('') === confirmPin.join('') && isConfirmPinComplete;

  // Show loading while checking email verification
  if (checkingEmail) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <LinearGradient
          colors={['#F8F9FA', '#FFFFFF', '#F8F9FA']}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Verifying email...</ThemedText>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#F8F9FA', '#FFFFFF', '#F8F9FA']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.headerContainer}>
              <View style={styles.logoContainer}>
                <MaterialIcons name={isConfirming ? "lock-outline" : "lock"} size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {isConfirming ? 'Confirm PIN' : 'Create PIN'}
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {isConfirming
                  ? `Re-enter your ${PIN_LENGTH}-digit PIN to confirm`
                  : `Create a ${PIN_LENGTH}-digit PIN to secure your account`}
              </ThemedText>
            </View>

            <View style={styles.form}>
              {!isConfirming ? (
                <View style={styles.pinContainer}>
                  {pin.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => { inputRefs.current[index] = ref; }}
                      style={[
                        styles.pinInput,
                        digit !== '' && styles.pinInputFilled,
                      ]}
                      value={digit}
                      onChangeText={(text) => handlePinChange(text, index, false)}
                      onKeyPress={({ nativeEvent }) =>
                        handleKeyPress(nativeEvent.key, index, false)
                      }
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      secureTextEntry
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.pinContainer}>
                  {confirmPin.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => { confirmInputRefs.current[index] = ref; }}
                      style={[
                        styles.pinInput,
                        digit !== '' && styles.pinInputFilled,
                        pinsMatch && styles.pinInputMatched,
                      ]}
                      value={digit}
                      onChangeText={(text) => handlePinChange(text, index, true)}
                      onKeyPress={({ nativeEvent }) =>
                        handleKeyPress(nativeEvent.key, index, true)
                      }
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      secureTextEntry
                    />
                  ))}
                </View>
              )}

              {isConfirming && isConfirmPinComplete && !pinsMatch && (
                <ThemedText 
                  style={styles.errorText}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  PINs don't match. Please try again.
                </ThemedText>
              )}

              {isConfirming && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    setIsConfirming(false);
                    setConfirmPin(Array(PIN_LENGTH).fill(''));
                    inputRefs.current[PIN_LENGTH - 1]?.focus();
                  }}
                >
                  <ThemedText 
                    style={styles.backButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Back
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText 
              style={styles.modalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              PIN Set Up Successfully!
            </ThemedText>
            <ThemedText 
              style={styles.modalMessage}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Your PIN has been set up successfully. Next, you can set up biometric authentication for faster and more secure access, or skip to continue.
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleModalOk}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.modalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText 
                  style={styles.modalButtonText}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingVertical: 60,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  form: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 12,
  },
  pinInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    fontSize: 28,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
    borderWidth: 2.5,
    borderColor: '#E5E7EB',
    minHeight: 80,
    aspectRatio: 0.85,
  },
  pinInputFilled: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6B46C1',
  },
  pinInputMatched: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
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
  successIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
    color: '#11181C',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});

