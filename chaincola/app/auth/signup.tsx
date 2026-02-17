import { useState, useEffect, useRef } from 'react';
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
import { validateReferralCode } from '@/lib/referral-service';
import { checkDuplicateUser } from '@/lib/user-service';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [referralStatus, setReferralStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [referralError, setReferralError] = useState<string>('');
  const referralValidationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { signUp } = useAuth();

  // Validate referral code as user types (with debounce)
  useEffect(() => {
    if (referralCode.trim().length === 0) {
      setReferralStatus('idle');
      setReferralError('');
      return;
    }

    // Clear previous timeout
    if (referralValidationTimeout.current) {
      clearTimeout(referralValidationTimeout.current);
    }

    // Set status to validating
    setReferralStatus('idle');
    setReferralError('');

    // Debounce validation
    referralValidationTimeout.current = setTimeout(async () => {
      if (referralCode.trim().length > 0) {
        setValidatingReferral(true);
        const validation = await validateReferralCode(referralCode.trim());
        setValidatingReferral(false);

        if (validation.isValid) {
          setReferralStatus('valid');
          setReferralError('');
        } else {
          setReferralStatus('invalid');
          setReferralError(validation.error || 'Invalid referral code');
        }
      }
    }, 500); // 500ms debounce

    return () => {
      if (referralValidationTimeout.current) {
        clearTimeout(referralValidationTimeout.current);
      }
    };
  }, [referralCode]);

  const handleSignUp = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    // Check for duplicate email and phone number before signup
    setLoading(true);
    try {
      const duplicateCheck = await checkDuplicateUser(email.trim(), phoneNumber.trim());
      
      if (duplicateCheck.emailExists) {
        Alert.alert(
          'Email Already Exists',
          'An account with this email address already exists. Please sign in instead or use a different email.'
        );
        setLoading(false);
        return;
      }

      if (duplicateCheck.phoneExists) {
        Alert.alert(
          'Phone Number Already Exists',
          'An account with this phone number already exists. Please use a different phone number or sign in instead.'
        );
        setLoading(false);
        return;
      }
    } catch (error: any) {
      console.error('Error checking for duplicates:', error);
      // Continue with signup - Supabase will catch duplicates if check fails
      // This prevents blocking signup due to network issues
    }

    // Validate referral code if provided
    if (referralCode.trim().length > 0) {
      if (referralStatus === 'invalid') {
        Alert.alert('Invalid Referral Code', referralError || 'Please enter a valid referral code or leave it empty.');
        return;
      }

      // If still validating, wait a bit
      if (validatingReferral) {
        Alert.alert('Please wait', 'Validating referral code...');
        return;
      }

      // Final validation check
      const validation = await validateReferralCode(referralCode.trim());
      if (!validation.isValid) {
        Alert.alert('Invalid Referral Code', validation.error || 'Please enter a valid referral code or leave it empty.');
        return;
      }
    }

    setLoading(true);
    try {
      const { error } = await signUp(email.trim(), password, {
        fullName: name.trim(),
        phoneNumber: phoneNumber.trim(),
        referralCode: referralCode.trim() || undefined,
      });

      if (error) {
        let errorMessage = 'Sign up failed. Please try again.';
        
        // Log the full error for debugging
        console.error('Signup error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          code: error.code,
        });
        
        if (error.message?.includes('User already registered') || error.message?.includes('already registered')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (error.message?.includes('Password') || error.message?.includes('password')) {
          errorMessage = 'Password does not meet requirements. Please use a stronger password.';
        } else if (error.message?.includes('maximum call stack') || error.message?.includes('stack')) {
          errorMessage = 'An error occurred during signup. Please try again in a moment.';
          console.error('Stack overflow detected - this should not happen');
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        Alert.alert('Sign Up Failed', errorMessage);
        setLoading(false);
        return;
      }

      // Success - show success modal
      setShowSuccessModal(true);
      setLoading(false);
    } catch (error: any) {
      console.error('Sign up error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    // Navigate to email verification with email parameter
    router.push(`/auth/verify-email?flow=signup&email=${encodeURIComponent(email.trim())}`);
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
                <MaterialIcons name="person-add" size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                Create Account
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Sign up to get started with ChainCola
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
                  Full Name
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="person" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                    numberOfLines={1}
                  />
                </View>
              </View>

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

              <View style={styles.inputContainer}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Phone Number
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="phone" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#9CA3AF"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    numberOfLines={1}
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.referralLabelContainer}>
                  <ThemedText 
                    style={styles.label}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Referral Code
                  </ThemedText>
                  <ThemedText 
                    style={styles.optionalLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    (Optional)
                  </ThemedText>
                </View>
                <View style={styles.referralInputWrapper}>
                  <View style={[
                    styles.inputWrapper,
                    referralStatus === 'valid' && styles.inputWrapperValid,
                    referralStatus === 'invalid' && styles.inputWrapperInvalid,
                  ]}>
                    <MaterialIcons name="card-giftcard" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter referral code (optional)"
                      placeholderTextColor="#9CA3AF"
                      value={referralCode}
                      onChangeText={(text) => setReferralCode(text.toUpperCase())}
                      autoCapitalize="characters"
                      autoComplete="off"
                      numberOfLines={1}
                      maxLength={7}
                    />
                  </View>
                  {validatingReferral && (
                    <View style={styles.validationIndicator}>
                      <ActivityIndicator size="small" color="#6B46C1" />
                    </View>
                  )}
                  {referralStatus === 'valid' && !validatingReferral && (
                    <View style={styles.validationIndicator}>
                      <MaterialIcons name="check-circle" size={20} color="#10B981" />
                    </View>
                  )}
                  {referralStatus === 'invalid' && !validatingReferral && (
                    <View style={styles.validationIndicator}>
                      <MaterialIcons name="error" size={20} color="#EF4444" />
                    </View>
                  )}
                </View>
                {referralStatus === 'invalid' && referralError && (
                  <ThemedText 
                    style={styles.errorText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {referralError}
                  </ThemedText>
                )}
                {referralStatus === 'valid' && (
                  <ThemedText 
                    style={styles.successText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Valid referral code
                  </ThemedText>
                )}
              </View>

              <View style={styles.inputContainer}>
                <ThemedText 
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Password
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Create a password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    numberOfLines={1}
                  />
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
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="lock-outline" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm your password"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    numberOfLines={1}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.signUpButton, loading && styles.signUpButtonDisabled]} 
                onPress={handleSignUp}
                disabled={loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                  style={styles.signUpButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="person-add" size={20} color="#FFFFFF" />
                      <ThemedText 
                        style={styles.signUpButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Create Account
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
                  Already have an account?{' '}
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
            <ThemedText 
              style={styles.modalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Success!
            </ThemedText>
            <ThemedText 
              style={styles.modalMessage}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              You have successfully signed up for ChainCola
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
    paddingVertical: 40,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
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
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  referralLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optionalLabel: {
    fontSize: 12,
    color: '#6B7280',
    opacity: 0.7,
    fontStyle: 'italic',
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
  inputWrapperValid: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: '#F0FDF4',
  },
  inputWrapperInvalid: {
    borderColor: '#EF4444',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
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
  referralInputWrapper: {
    position: 'relative',
  },
  validationIndicator: {
    position: 'absolute',
    right: 16,
    top: 15,
    zIndex: 1,
  },
  errorText: {
    fontSize: 12,
    color: '#FCA5A5',
    marginTop: 6,
    marginLeft: 4,
  },
  successText: {
    fontSize: 12,
    color: '#6EE7B7',
    marginTop: 6,
    marginLeft: 4,
  },
  signUpButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
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
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  signUpButtonText: {
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

