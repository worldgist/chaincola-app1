import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkBiometricAvailability } from '@/lib/biometric-service';
import { isBiometricEnabled } from '@/lib/auth-utils';

interface BiometricSetupPromptProps {
  userId: string;
  onDismiss?: () => void;
}

const BIOMETRIC_PROMPT_DISMISSED_KEY = (userId: string) => `biometric_prompt_dismissed_${userId}`;

export default function BiometricSetupPrompt({ userId, onDismiss }: BiometricSetupPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkIfShouldShowPrompt();
  }, [userId]);

  const checkIfShouldShowPrompt = async () => {
    if (!userId) {
      setChecking(false);
      return;
    }

    try {
      // Check if user has already dismissed the prompt
      const dismissed = await AsyncStorage.getItem(BIOMETRIC_PROMPT_DISMISSED_KEY(userId));
      if (dismissed === 'true') {
        setShowPrompt(false);
        setChecking(false);
        return;
      }

      // Check if biometric is already enabled
      const enabled = await isBiometricEnabled(userId);
      if (enabled) {
        setShowPrompt(false);
        setChecking(false);
        return;
      }

      // Check if biometric is available on device
      const availability = await checkBiometricAvailability();
      if (availability.available && availability.type) {
        setBiometricAvailable(true);
        setBiometricType(availability.type);
        setShowPrompt(true);
      } else {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('Error checking biometric prompt:', error);
      setShowPrompt(false);
    } finally {
      setChecking(false);
    }
  };

  const handleSetup = () => {
    setShowPrompt(false);
    // Mark as dismissed so it doesn't show again
    AsyncStorage.setItem(BIOMETRIC_PROMPT_DISMISSED_KEY(userId), 'true');
    router.push('/auth/biometric-setup');
    onDismiss?.();
  };

  const handleDismiss = async () => {
    setShowPrompt(false);
    // Mark as dismissed so it doesn't show again
    await AsyncStorage.setItem(BIOMETRIC_PROMPT_DISMISSED_KEY(userId), 'true');
    onDismiss?.();
  };

  const handleLater = async () => {
    setShowPrompt(false);
    // Don't mark as dismissed - user can see it again later
    onDismiss?.();
  };

  if (checking || !showPrompt) {
    return null;
  }

  return (
    <Modal
      visible={showPrompt}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#6B46C1', '#9333EA']}
              style={styles.iconGradient}
            >
              <MaterialIcons 
                name={biometricType === 'Face ID' ? 'face' : 'fingerprint'} 
                size={48} 
                color="#FFFFFF" 
              />
            </LinearGradient>
          </View>

          <ThemedText style={styles.title}>
            Enable {biometricType || 'Biometric'} Login?
          </ThemedText>

          <ThemedText style={styles.message}>
            Secure your account with {biometricType || 'biometric'} authentication. 
            You can log in quickly and securely without entering your password.
          </ThemedText>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.laterButton}
              onPress={handleLater}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.laterButtonText}>Maybe Later</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.setupButton}
              onPress={handleSetup}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.setupButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.setupButtonText}>Set Up Now</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.dismissButtonText}>Don't ask again</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
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
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
    color: '#6B7280',
    paddingHorizontal: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  laterButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  laterButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  setupButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  setupButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dismissButton: {
    padding: 12,
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
});




















