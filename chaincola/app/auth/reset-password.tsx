import { useState, useEffect } from 'react';
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
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import AppLoadingIndicator from '@/components/app-loading-indicator';
import { AUTH_EMAIL_OTP_LENGTH } from '@/lib/auth-email-otp-length';

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { user, session, updatePassword } = useAuth();

  useEffect(() => {
    // Check if user has a valid session (from OTP verification)
    // If not, redirect to forgot password
    if (!session && !user) {
      Alert.alert(
        'Session Expired',
        `Please request a new reset link and enter the ${AUTH_EMAIL_OTP_LENGTH}-digit code from your email to continue.`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/auth/forgot-password'),
          },
        ]
      );
    }
  }, [session, user]);

  const handleResetPassword = async () => {
    // Validation
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long');
      return;
    }

    // Check for common weak passwords
    if (newPassword === '123456' || newPassword === 'password' || newPassword === '12345678') {
      setErrorMessage('Please choose a stronger password');
      return;
    }

    if (!session) {
      Alert.alert(
        'Session Expired',
        `Please request a new reset link and enter the ${AUTH_EMAIL_OTP_LENGTH}-digit code from your email to continue.`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/auth/forgot-password'),
          },
        ]
      );
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const { error } = await updatePassword(newPassword);

      if (error) {
        setErrorMessage(error.message || 'Failed to reset password. Please try again.');
        setLoading(false);
        return;
      }

      // Success - show success modal
      setShowSuccessModal(true);
      setLoading(false);
    } catch (error: any) {
      console.error('Reset password error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    // Navigate to signin screen
    router.replace('/auth/signin');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#6B46C1', '#9333EA', '#A855F7']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <ThemedText
              lightColor="#4C1D95"
              darkColor="#4C1D95"
              style={styles.title}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              Reset Password
            </ThemedText>
            <ThemedText
              lightColor="#5B21B6"
              darkColor="#5B21B6"
              style={styles.subtitle}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Enter your new password to reset your account password
            </ThemedText>

            {errorMessage ? (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
              </View>
            ) : null}

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  New Password
                </ThemedText>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter your new password"
                    placeholderTextColor="#A78BFA"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password-new"
                    numberOfLines={1}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility' : 'visibility-off'}
                      size={24}
                      color="#E9D5FF"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Confirm Password
                </ThemedText>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm your new password"
                    placeholderTextColor="#A78BFA"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoComplete="password-new"
                    numberOfLines={1}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <MaterialIcons
                      name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                      size={24}
                      color="#E9D5FF"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.resetButton,
                  (newPassword !== confirmPassword || newPassword.length < 6 || loading) &&
                    styles.resetButtonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={newPassword !== confirmPassword || newPassword.length < 6 || loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    newPassword === confirmPassword && newPassword.length >= 6
                      ? ['#FFFFFF', '#FFFFFF']
                      : ['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.5)']
                  }
                  style={styles.resetButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <AppLoadingIndicator size="small" />
                  ) : (
                    <ThemedText
                      style={[
                        styles.resetButtonText,
                        (newPassword !== confirmPassword || newPassword.length < 6) &&
                          styles.resetButtonTextDisabled,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Reset Password
                    </ThemedText>
                  )}
                </LinearGradient>
              </TouchableOpacity>
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
            <ThemedText style={styles.modalTitle}>Password Reset Successful!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your password has been reset successfully. Please sign in with your new password.
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
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#4C1D95',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 38,
    textShadowColor: 'rgba(255, 255, 255, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5B21B6',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    minHeight: 50,
  },
  eyeButton: {
    padding: 16,
    paddingLeft: 8,
  },
  resetButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  resetButtonDisabled: {
    shadowOpacity: 0.1,
  },
  resetButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B46C1',
  },
  resetButtonTextDisabled: {
    color: 'rgba(107, 70, 193, 0.5)',
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
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  errorText: {
    fontSize: 14,
    color: '#FEE2E2',
    textAlign: 'center',
  },
});


