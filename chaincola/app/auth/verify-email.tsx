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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams();
  const flow = params.flow as string;
  const email = params.email as string;
  const autoResend = params.autoResend === 'true';
  // OTP length - configured to match Supabase's 8-digit codes
  const OTP_LENGTH = 8;
  const [code, setCode] = useState(Array(OTP_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { verifyOTP, resendVerificationEmail, user } = useAuth();

  useEffect(() => {
    // Check if user is already verified
    if ((user as any)?.email_confirmed_at) {
      // User is already verified, proceed to PIN setup for signup flow
      // IMPORTANT: For signup flow, PIN creation is mandatory after email verification
      if (flow === 'signup' || !flow) {
        // Navigate to PIN creation - this is mandatory for signup (use replace to prevent going back)
        router.replace('/auth/create-pin?flow=signup');
      } else if (flow === 'recovery') {
        router.replace('/auth/reset-password');
      } else {
        // Default: go to PIN setup for signup flows
        router.replace('/auth/create-pin?flow=signup');
      }
    }
  }, [user, flow]);

  useEffect(() => {
    // Resend cooldown timer
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Auto-resend verification email if autoResend param is true
  useEffect(() => {
    if (autoResend && email) {
      const autoResendCode = async () => {
        const userEmail = email || user?.email || '';
        if (userEmail) {
          try {
            // Determine the type based on flow
            const resendType = flow === 'recovery' ? 'recovery' : 'signup';
            const { error } = await resendVerificationEmail(userEmail, resendType);
            if (!error) {
              // Set cooldown to prevent immediate resend
              setResendCooldown(60);
              Alert.alert(
                'Verification Code Sent',
                'A new verification code has been sent to your email. Please check your inbox.'
              );
            } else {
              console.error('Auto-resend error:', error);
              // Don't show error alert for auto-resend, let user manually resend if needed
            }
          } catch (error) {
            console.error('Auto-resend exception:', error);
            // Don't show error alert for auto-resend, let user manually resend if needed
          }
        }
      };
      
      // Small delay to ensure screen is mounted
      const timer = setTimeout(() => {
        autoResendCode();
      }, 500);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResend, email]);

  const handleCodeChange = (text: string, index: number) => {
    // Only allow digits
    const numericText = text.replace(/[^0-9]/g, '');
    
    if (numericText.length > 1) {
      // Handle paste - only accept up to OTP_LENGTH digits
      const pastedCode = numericText.slice(0, OTP_LENGTH).split('');
      const newCode = [...code];
      pastedCode.forEach((digit, i) => {
        if (index + i < OTP_LENGTH) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);
      
      // Focus on the last filled input or next empty
      const nextIndex = Math.min(index + pastedCode.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    } else {
      const newCode = [...code];
      newCode[index] = numericText;
      setCode(newCode);

      // Auto-focus next input
      if (numericText && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const verificationCode = code.join('');
    if (verificationCode.length !== OTP_LENGTH) {
      Alert.alert('Error', `Please enter the complete ${OTP_LENGTH}-digit code`);
      return;
    }

    if (!email && !user?.email) {
      Alert.alert('Error', 'Email address not found. Please try signing up again.');
      return;
    }

    const userEmail = email || user?.email || '';
    setLoading(true);

    try {
      const type = flow === 'signup' ? 'signup' : 'recovery';
      const { error } = await verifyOTP(userEmail, verificationCode, type);

      if (error) {
        let errorMessage = 'Verification failed. Please check the code and try again.';
        
        if (error.message.includes('expired')) {
          errorMessage = 'This verification code has expired. Please request a new one.';
        } else if (error.message.includes('invalid')) {
          errorMessage = 'Invalid verification code. Please check and try again.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        Alert.alert('Verification Failed', errorMessage);
        setLoading(false);
        // Clear the code on error
        setCode(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }

      // Success - show success modal
      setShowSuccessModal(true);
      setLoading(false);
    } catch (error: any) {
      console.error('Verification error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    // After email verification, always navigate to PIN setup for new signups
    // Check if user doesn't have PIN set up yet
    if (flow === 'signup' || !flow) {
      // Navigate to create PIN screen for signup flow (use replace to prevent going back)
      router.replace('/auth/create-pin?flow=signup');
    } else if (flow === 'recovery') {
      // For password recovery, go to reset password
      router.replace('/auth/reset-password');
    } else {
      // Default: go to PIN setup if user doesn't have one, otherwise home
      router.replace('/auth/create-pin?flow=signup');
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) {
      return;
    }

    if (!email && !user?.email) {
      Alert.alert('Error', 'Email address not found. Please try signing up again.');
      return;
    }

    const userEmail = email || user?.email || '';
    setResending(true);

    try {
      // Determine the type based on flow
      const resendType = flow === 'recovery' ? 'recovery' : 'signup';
      const { error } = await resendVerificationEmail(userEmail, resendType);

      if (error) {
        let errorMessage = 'Failed to resend verification email. Please try again.';
        
        if (error.message) {
          errorMessage = error.message;
        }
        
        Alert.alert('Error', errorMessage);
        setResending(false);
        return;
      }

      // Success - set cooldown
      setResendCooldown(60); // 60 seconds cooldown
      Alert.alert('Success', 'Verification email has been resent. Please check your inbox.');
      setResending(false);
    } catch (error: any) {
      console.error('Resend error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setResending(false);
    }
  };

  const isCodeComplete = code.every(digit => digit !== '');

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
                <MaterialIcons name="mark-email-read" size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                Verify Email
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {flow === 'signup' 
                  ? `We've sent a verification email to your inbox. Enter the ${OTP_LENGTH}-digit code from the email, or click the verification link.`
                  : `Enter the ${OTP_LENGTH}-digit verification code sent to your email`}
              </ThemedText>
            </View>

            <View style={styles.form}>
              <View style={styles.codeContainer}>
                {code.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => { inputRefs.current[index] = ref; }}
                    style={[
                      styles.codeInput,
                      digit !== '' && styles.codeInputFilled,
                    ]}
                    value={digit}
                    onChangeText={(text) => handleCodeChange(text, index)}
                    onKeyPress={({ nativeEvent }) =>
                      handleKeyPress(nativeEvent.key, index)
                    }
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (!isCodeComplete || loading) && styles.verifyButtonDisabled,
                ]}
                onPress={handleVerify}
                disabled={!isCodeComplete || loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={(!isCodeComplete || loading) ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                  style={styles.verifyButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="verified" size={20} color="#FFFFFF" />
                      <ThemedText
                        style={styles.verifyButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Verify
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.resendContainer}>
                <ThemedText 
                  style={styles.resendText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Didn't receive the code?{' '}
                </ThemedText>
                <TouchableOpacity 
                  onPress={handleResend}
                  disabled={resending || resendCooldown > 0}
                >
                  {resending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <ThemedText 
                      style={[
                        styles.resendLink,
                        (resending || resendCooldown > 0) && styles.resendLinkDisabled,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend'}
                    </ThemedText>
                  )}
                </TouchableOpacity>
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
            <ThemedText style={styles.modalTitle}>Email Verified!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {flow === 'signup'
                ? "Your email has been verified successfully. Next, you'll create a 4-digit PIN to secure your account."
                : 'Your email has been verified successfully. You can now reset your password.'}
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
    paddingVertical: 40,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6B46C1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    color: '#E9D5FF',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 8,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minHeight: 64,
    aspectRatio: 0.85,
  },
  codeInputFilled: {
    backgroundColor: '#EDE9FE',
    borderColor: '#6B46C1',
  },
  verifyButton: {
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
  verifyButtonDisabled: {
    opacity: 0.7,
  },
  verifyButtonGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  verifyButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  verifyButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  resendText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '400',
  },
  resendLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B46C1',
    marginLeft: 4,
  },
  resendLinkDisabled: {
    opacity: 0.5,
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

