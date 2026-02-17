import { useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { Link, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSendResetCode = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const { error } = await resetPassword(email.trim());

      if (error) {
        let errorMessage = 'Failed to send reset email. Please try again.';
        
        if (error.message.includes('not found')) {
          errorMessage = 'No account found with this email address.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        Alert.alert('Error', errorMessage);
        setLoading(false);
        return;
      }

      // Success - show success modal
      setShowSuccessModal(true);
      setLoading(false);
    } catch (error: any) {
      console.error('Reset password error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    // Navigate to verify email screen with recovery flow
    router.push(`/auth/verify-email?flow=recovery&email=${encodeURIComponent(email.trim())}`);
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
                <MaterialIcons name="lock-reset" size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                Forgot Password?
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Enter your email address and we'll send you a verification code to reset your password
              </ThemedText>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Email Address
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="email" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    numberOfLines={1}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.sendButton, loading && styles.sendButtonDisabled]} 
                onPress={handleSendResetCode}
                disabled={loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                  style={styles.sendButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="send" size={20} color="#FFFFFF" />
                      <ThemedText 
                        style={styles.sendButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Send Verification Code
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.signInContainer}>
                <ThemedText 
                  style={styles.signInText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Remember your password?{' '}
                </ThemedText>
                <Link href="/auth/signin" asChild>
                  <TouchableOpacity>
                    <ThemedText 
                      style={styles.signInLink}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Sign In
                    </ThemedText>
                  </TouchableOpacity>
                </Link>
              </View>
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
            <ThemedText style={styles.modalTitle}>Success!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              We've successfully sent the code to your email
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
                <ThemedText style={styles.modalButtonText}>OK</ThemedText>
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
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    minHeight: 56,
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
    paddingVertical: 16,
    paddingRight: 16,
    fontWeight: '400',
  },
  sendButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signInText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '400',
  },
  signInLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B46C1',
    marginLeft: 4,
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
});

