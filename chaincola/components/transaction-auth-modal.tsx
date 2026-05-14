import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { verifyPINInput, getBiometricPreference, isPINSetup } from '@/lib/pin-service';
import { authenticateWithBiometric, checkBiometricAvailability } from '@/lib/biometric-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


interface TransactionAuthModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  userId: string;
  transactionType: 'buy' | 'sell' | 'send';
}

export default function TransactionAuthModal({
  visible,
  onSuccess,
  onCancel,
  userId,
  transactionType,
}: TransactionAuthModalProps) {
  const [pin, setPin] = useState(Array(4).fill(''));
  const [showPIN, setShowPIN] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'Face ID' | 'Touch ID' | 'Biometric' | null>(null);
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'biometric' | 'pin' | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const PIN_LENGTH = 4;

  useEffect(() => {
    if (visible) {
      checkAuthMethods();
      // Try biometric first if available
      if (biometricEnabled && biometricAvailable) {
        handleBiometricAuth();
      } else {
        setShowPIN(true);
        setAuthMethod('pin');
      }
    } else {
      // Reset state when modal closes
      setPin(Array(4).fill(''));
      setShowPIN(false);
      setLoading(false);
      setAuthMethod(null);
    }
  }, [visible]);

  const checkAuthMethods = async () => {
    try {
      const [hasPIN, biometricPref, biometricAvail] = await Promise.all([
        isPINSetup(userId),
        getBiometricPreference(userId),
        checkBiometricAvailability(),
      ]);

      setBiometricEnabled(biometricPref && biometricAvail.available);
      setBiometricAvailable(biometricAvail.available);
      setBiometricType(biometricAvail.type);

      if (!hasPIN) {
        Alert.alert(
          'PIN Not Set',
          'Please set up a PIN in Settings to secure your transactions.',
          [{ text: 'OK', onPress: onCancel }]
        );
        return;
      }
    } catch (error) {
      console.error('Error checking auth methods:', error);
    }
  };

  const handleBiometricAuth = async () => {
    setLoading(true);
    setAuthMethod('biometric');

    try {
      const result = await authenticateWithBiometric(
        `Authenticate to ${transactionType === 'buy' ? 'buy' : transactionType === 'sell' ? 'sell' : 'send'} crypto`
      );

      if (result.success) {
        setLoading(false);
        onSuccess();
      } else {
        setLoading(false);
        // If biometric fails, fall back to PIN
        if (result.errorCode === 'user_cancel') {
          onCancel();
        } else {
          setShowPIN(true);
          setAuthMethod('pin');
        }
      }
    } catch (error: any) {
      console.error('Biometric auth error:', error);
      setLoading(false);
      setShowPIN(true);
      setAuthMethod('pin');
    }
  };

  const handlePINChange = async (text: string, index: number) => {
    const numericText = text.replace(/[^0-9]/g, '');

    if (numericText.length > 1) {
      // Handle paste
      const pastedPin = numericText.slice(0, PIN_LENGTH).split('');
      const newPin = [...pin];
      pastedPin.forEach((digit, i) => {
        if (index + i < PIN_LENGTH) {
          newPin[index + i] = digit;
        }
      });
      setPin(newPin);

      const nextIndex = Math.min(index + pastedPin.length, PIN_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();

      // Check if PIN is complete
      if (newPin.every(d => d !== '')) {
        await verifyPIN(newPin.join(''));
      }
      return;
    }

    const newPin = [...pin];
    newPin[index] = numericText;
    setPin(newPin);

    // Auto-focus next input
    if (numericText && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (numericText && index === PIN_LENGTH - 1) {
      // All inputs filled, verify PIN
      await verifyPIN(newPin.join(''));
    }

    // Handle backspace
    if (!numericText && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyPIN = async (pinValue: string) => {
    if (pinValue.length !== PIN_LENGTH) {
      return;
    }

    setLoading(true);

    try {
      const result = await verifyPINInput(userId, pinValue);

      if (result.success) {
        setLoading(false);
        onSuccess();
      } else {
        setLoading(false);
        Alert.alert('Invalid PIN', result.error || 'Please try again.');
        setPin(Array(4).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error.message || 'Failed to verify PIN. Please try again.');
      setPin(Array(4).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const getTransactionTypeText = () => {
    switch (transactionType) {
      case 'buy':
        return 'Buy Crypto';
      case 'sell':
        return 'Sell Crypto';
      case 'send':
        return 'Send Crypto';
      default:
        return 'Transaction';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <ThemedView style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ThemedView style={styles.modalContent}>
            <View style={styles.header}>
              <MaterialIcons
                name={authMethod === 'biometric' ? 'fingerprint' : 'lock'}
                size={32}
                color="#6B46C1"
              />
              <ThemedText style={styles.title}>
                {authMethod === 'biometric'
                  ? `Authenticate to ${getTransactionTypeText()}`
                  : `Enter PIN to ${getTransactionTypeText()}`}
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                {authMethod === 'biometric'
                  ? `Use ${biometricType || 'biometric'} to confirm this transaction`
                  : 'Enter your 4-digit PIN to proceed'}
              </ThemedText>
            </View>

            {authMethod === 'biometric' && loading && (
              <View style={styles.loadingContainer}>
                <AppLoadingIndicator size="large" />
                <ThemedText style={styles.loadingText}>
                  Authenticating...
                </ThemedText>
              </View>
            )}

            {showPIN && (
              <View style={styles.pinContainer}>
                {pin.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.pinInput,
                      digit !== '' && styles.pinInputFilled,
                    ]}
                    value={digit}
                    onChangeText={(text) => handlePINChange(text, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    secureTextEntry
                    autoFocus={index === 0}
                    editable={!loading}
                  />
                ))}
              </View>
            )}

            {showPIN && biometricEnabled && biometricAvailable && (
              <View style={styles.biometricFallback}>
                <MaterialIcons
                  name="fingerprint"
                  size={24}
                  color="#6B46C1"
                />
                <ThemedText
                  style={styles.biometricText}
                  onPress={handleBiometricAuth}
                >
                  Use {biometricType || 'Biometric'} instead
                </ThemedText>
              </View>
            )}

            <View style={styles.buttonContainer}>
              <ThemedText style={styles.cancelButton} onPress={onCancel}>
                Cancel
              </ThemedText>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: 24,
    paddingHorizontal: 20,
  },
  pinInput: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    borderColor: '#E5E7EB',
  },
  pinInputFilled: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3F4F6',
  },
  biometricFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  biometricText: {
    color: '#6B46C1',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    width: '100%',
    marginTop: 24,
  },
  cancelButton: {
    textAlign: 'center',
    color: '#6B46C1',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 12,
  },
});













