import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '@/contexts/AuthContext';
import { saveBiometricPreference } from '@/lib/auth-utils';

export default function BiometricSetupScreen() {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        setBiometricAvailable(false);
        setChecking(false);
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        setBiometricAvailable(false);
        setChecking(false);
        return;
      }

      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (supportedTypes.length > 0) {
        setBiometricAvailable(true);
        // Determine biometric type
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Touch ID');
        } else {
          setBiometricType('Biometric');
        }
      } else {
        setBiometricAvailable(false);
      }
      setChecking(false);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
      setChecking(false);
    }
  };

  const handleSetupBiometric = async () => {
    if (!biometricAvailable) {
      Alert.alert(
        'Biometric Not Available',
        'Biometric authentication is not available on this device. Please ensure you have set up Face ID or Touch ID in your device settings.'
      );
      return;
    }

    setLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${biometricType || 'Biometric'} Authentication`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Store biometric preference
        const userId = user?.id || 'anonymous';
        const success = await saveBiometricPreference(userId, true, biometricType || undefined);
        
        if (success) {
          setBiometricEnabled(true);
          
          Alert.alert(
            'Success',
            `${biometricType || 'Biometric'} authentication has been enabled successfully.`,
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace('/(tabs)');
                },
              },
            ]
          );
        } else {
          Alert.alert('Error', 'Failed to save biometric preference. Please try again.');
        }
      } else {
        if (result.error !== 'user_cancel') {
          Alert.alert('Authentication Failed', 'Biometric authentication was not successful. Please try again.');
        }
      }
      setLoading(false);
    } catch (error: any) {
      console.error('Biometric setup error:', error);
      Alert.alert('Error', 'Failed to set up biometric authentication. Please try again.');
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Navigate to home page
    router.replace('/(tabs)');
  };

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
                <MaterialIcons name="fingerprint" size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                Set Up Biometric Authentication
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Enable biometric authentication for faster and more secure access to your ChainCola account
              </ThemedText>
            </View>

            <View style={styles.form}>
              <View style={styles.benefitsContainer}>
                <View style={styles.benefitItem}>
                  <MaterialIcons name="security" size={24} color="#6B46C1" />
                  <ThemedText style={styles.benefitText}>Enhanced Security</ThemedText>
                </View>
                <View style={styles.benefitItem}>
                  <MaterialIcons name="speed" size={24} color="#6B46C1" />
                  <ThemedText style={styles.benefitText}>Quick Access</ThemedText>
                </View>
                <View style={styles.benefitItem}>
                  <MaterialIcons name="lock" size={24} color="#6B46C1" />
                  <ThemedText style={styles.benefitText}>Secure Login</ThemedText>
                </View>
              </View>

              {checking ? (
                <View style={styles.checkingContainer}>
                  <ActivityIndicator size="large" color="#6B46C1" />
                  <ThemedText style={styles.checkingText}>
                    Checking biometric availability...
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.actionsContainer}>
                {biometricAvailable ? (
                  <>
                    <TouchableOpacity
                      style={[styles.setupButton, loading && styles.setupButtonDisabled]}
                      onPress={handleSetupBiometric}
                      activeOpacity={0.9}
                      disabled={loading}
                    >
                      <LinearGradient
                        colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                        style={styles.setupButtonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {loading ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <MaterialIcons 
                              name={biometricType === 'Face ID' ? 'face' : 'fingerprint'} 
                              size={20} 
                              color="#FFFFFF" 
                            />
                            <ThemedText 
                              style={styles.setupButtonText}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.8}
                            >
                              Set Up {biometricType}
                            </ThemedText>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={handleSkip}
                      activeOpacity={0.8}
                    >
                      <ThemedText 
                        style={styles.skipButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Skip for Now
                      </ThemedText>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <ThemedText 
                      style={styles.unavailableText}
                      numberOfLines={3}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Biometric authentication is not available on this device. Please ensure you have set up Face ID or Touch ID in your device settings.
                    </ThemedText>
                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={handleSkip}
                      activeOpacity={0.8}
                    >
                      <ThemedText 
                        style={styles.skipButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Continue
                      </ThemedText>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
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
  benefitsContainer: {
    width: '100%',
    marginBottom: 32,
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  benefitText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  setupButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  setupButtonGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  setupButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  skipButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
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
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
  },
  checkingContainer: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  checkingText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
  },
  unavailableText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    fontWeight: '400',
  },
  setupButtonDisabled: {
    opacity: 0.6,
  },
});


