import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useFocusEffect, Link, router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { getUserVerificationStatus } from '@/lib/verification-service';
// Supabase removed
import { 
  checkBiometricAvailability as checkBiometricService,
  hasBiometricCredentials,
  signInWithBiometric,
  saveBiometricCredentials,
  deleteBiometricCredentials,
} from '@/lib/biometric-service';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showBiometricSetupModal, setShowBiometricSetupModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const { signIn, user } = useAuth();

  useEffect(() => {
    const initializeBiometric = async () => {
      await checkBiometricAvailability();
      await checkStoredCredentials();
    };

    initializeBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh credentials check when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (!user) {
        checkStoredCredentials();
      }
    }, [user, checkStoredCredentials])
  );

  // Auto-navigate when user is logged in (but not during initial load)
  useEffect(() => {
    if (user && !biometricLoading && !loading) {
      // Small delay to ensure everything is ready
      const timer = setTimeout(() => {
        console.log('✅ User logged in, navigating to home...');
        router.replace('/(tabs)');
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [user, biometricLoading, loading]);

  const checkStoredCredentials = React.useCallback(async () => {
    // Add a small delay to ensure SecureStore is ready
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if user has stored credentials for biometric login
    const hasCredentials = await hasBiometricCredentials();
    setHasStoredCredentials(hasCredentials);
    
    if (hasCredentials && biometricAvailable) {
      // User can use biometric login
      console.log('✅ Biometric credentials available');
    } else if (!hasCredentials) {
      console.log('ℹ️ No biometric credentials stored');
    } else if (!biometricAvailable) {
      console.log('ℹ️ Biometric not available on device');
    }
  }, [biometricAvailable]);

  const handleEnableBiometric = async () => {
    try {
      setBiometricLoading(true);
      
      // Save credentials (this function now has built-in retry and verification)
      const result = await saveBiometricCredentials(pendingEmail, pendingPassword);
      
      if (result.success) {
        // Additional verification after save
        await new Promise(resolve => setTimeout(resolve, 500));
        const hasCredentials = await hasBiometricCredentials();
        
        if (hasCredentials) {
          // Update state immediately
          setHasStoredCredentials(true);
          console.log('✅ Biometric enabled successfully');
          setShowBiometricSetupModal(false);
          
          // Refresh credentials check to ensure state is updated
          await checkStoredCredentials();
          
          Alert.alert(
            'Biometric Enabled',
            `You can now sign in with ${biometricType || 'Biometric'} on your next visit.`,
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
          console.error('❌ Credentials not found after saving');
          setShowBiometricSetupModal(false);
          Alert.alert(
            'Setup Failed',
            'Failed to verify biometric credentials. You can set this up later in settings.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace('/(tabs)');
                },
              },
            ]
          );
        }
      } else {
        setShowBiometricSetupModal(false);
        Alert.alert(
          'Setup Failed',
          result.error || 'Failed to enable biometric authentication. You can set this up later in settings.',
          [
            {
              text: 'OK',
              onPress: () => {
                router.replace('/(tabs)');
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error enabling biometric:', error);
      setShowBiometricSetupModal(false);
      Alert.alert(
        'Setup Failed',
        'An error occurred while setting up biometric authentication. You can set this up later in settings.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/(tabs)');
            },
          },
        ]
      );
    } finally {
      setBiometricLoading(false);
      setPendingEmail('');
      setPendingPassword('');
    }
  };

  const handleSkipBiometric = () => {
    setShowBiometricSetupModal(false);
    setPendingEmail('');
    setPendingPassword('');
    router.replace('/(tabs)');
  };

  const checkBiometricAvailability = async () => {
    try {
      const availability = await checkBiometricService();
      setBiometricAvailable(availability.available);
      setBiometricType(availability.type);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
      setBiometricType(null);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      // Check if user is already logged in
      if (user) {
        console.log('User already logged in, navigating to home...');
        router.replace('/(tabs)');
        return;
      }

      // Check if credentials exist before starting
      const hasCredentials = await hasBiometricCredentials();
      if (!hasCredentials) {
        Alert.alert(
          'No Stored Credentials',
          'Please sign in with your email and password first to enable biometric authentication.'
        );
        return;
      }

      // Check biometric availability
      const availability = await checkBiometricService();
      if (!availability.available) {
        Alert.alert(
          'Biometric Not Available',
          'Biometric authentication is not available on this device. Please sign in with your email and password.'
        );
        return;
      }

      setBiometricLoading(true);
      setErrorMessage('');

      console.log('🔐 Starting biometric authentication...');

      // Use the biometric service for complete sign-in flow
      const result = await signInWithBiometric(async (email: string, password: string) => {
        console.log('📧 Signing in with stored credentials...');
        const signInResult = await signIn(email, password);
        
        if (signInResult.error) {
          console.error('❌ Sign in error:', signInResult.error);
          return signInResult;
        }
        
        // Wait a bit for session to be established
        console.log('⏳ Waiting for session to be established...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Session verification removed (Supabase removed)
        console.log('✅ Sign in completed');
        return signInResult;
      });
      
      setBiometricLoading(false);

      if (result.success) {
        // Success - check if user is already set
        console.log('✅ Biometric sign in successful');
        
        // Wait a moment for auth state to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check verification status before navigating
        try {
          if (user?.id) {
            const verificationStatus = await getUserVerificationStatus(user.id);
            
            // If user is not verified, redirect to verification page
            if (verificationStatus !== 'approved') {
              router.push('/profile/verify-account?prompt=true');
              return;
            }
          }
        } catch (error) {
          console.error('Error checking verification status:', error);
          // Continue even if check fails
        }
        
        // Check if user state is updated
        if (user) {
          console.log('✅ User state already updated, navigating...');
          router.replace('/(tabs)');
        } else {
          // User state will update via useEffect
          console.log('✅ Sign in successful, navigating (user state will update via useEffect)...');
          router.replace('/(tabs)');
        }
      } else {
        // Handle errors
        console.error('❌ Biometric sign in failed:', result.error);
        
        if (result.error?.includes('No stored credentials') || 
            result.error?.includes('Stored credentials not found')) {
          Alert.alert(
            'No Stored Credentials',
            'Please sign in with your email and password first to enable biometric authentication.',
            [
              {
                text: 'OK',
                onPress: () => {
                  // Clear invalid credentials
                  deleteBiometricCredentials().catch(() => {});
                },
              },
            ]
          );
        } else if (result.error?.includes('Authentication cancelled') || 
                   result.error?.includes('user_cancel')) {
          // User cancelled - do nothing, just log
          console.log('User cancelled biometric authentication');
          return;
        } else if (result.error?.includes('Invalid login credentials') ||
                   result.error?.includes('Stored credentials are invalid')) {
          // Clear invalid credentials and show error
          await deleteBiometricCredentials();
          setErrorMessage('Stored credentials are invalid. Please sign in with your email and password again.');
          setShowErrorModal(true);
        } else {
          setErrorMessage(result.error || 'Biometric sign in failed. Please try again.');
          setShowErrorModal(true);
        }
      }
    } catch (error: any) {
      console.error('❌ Biometric authentication exception:', error);
      setBiometricLoading(false);
      setErrorMessage(error?.message || 'An unexpected error occurred. Please try again.');
      setShowErrorModal(true);
    }
  };

  const handleSignIn = async () => {
    // Basic validation
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
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
      // Add timeout wrapper for sign-in (30 seconds)
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<{ error: any }>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Request timeout. Please check your connection and try again.'));
        }, 30000);
      });
      
      const signInPromise = signIn(email.trim(), password);
      
      let result: { error: any };
      try {
        result = await Promise.race([signInPromise, timeoutPromise]);
        clearTimeout(timeoutId!);
      } catch (timeoutError: any) {
        clearTimeout(timeoutId!);
        setErrorMessage(timeoutError.message || 'Request timeout. Please check your connection and try again.');
        setShowErrorModal(true);
        setLoading(false);
        return;
      }
      
      const { error } = result;
      
      if (error) {
        // Handle "Email not confirmed" error - navigate to verify email and resend code
        if (error.message?.includes('Email not confirmed') || 
            error.message?.includes('email not confirmed') ||
            error.message?.includes('Email not verified')) {
          setLoading(false);
          
          // Navigate to verify email screen with email parameter
          // The verify email screen will automatically resend the code
          router.push(`/auth/verify-email?flow=signup&email=${encodeURIComponent(email.trim())}&autoResend=true`);
          return;
        }
        
        let errorMsg = 'Sign in failed. Please try again.';
        
        // Handle network errors
        if (error.message?.includes('Network request failed') || 
            error.message?.includes('Network connection failed') ||
            error.message?.includes('Failed to fetch') ||
            error.name === 'AuthRetryableFetchError' ||
            error.message?.includes('timeout')) {
          errorMsg = 'Network connection failed. Please check your internet connection and try again.';
        } else if (error.message?.includes('Invalid login credentials') || 
                   error.message?.includes('Invalid login') ||
                   error.status === 400 ||
                   error.name === 'AuthApiError') {
          // Don't log invalid credentials as error - it's expected user behavior
          errorMsg = 'Invalid email or password. Please check your credentials and try again.';
        } else if (error.message) {
          errorMsg = error.message;
        }
        
        // Suppress error logging for UI development
        // Error will still be shown to user via errorMessage
        
        setErrorMessage(errorMsg);
        setShowErrorModal(true);
        setLoading(false);
        return;
      }

      // Success - check verification status before proceeding
      try {
        // Wait a moment for user to be set in context
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check verification status
        if (user?.id) {
          const verificationStatus = await getUserVerificationStatus(user.id);
          
          // If user is not verified, redirect to verification page
          if (verificationStatus !== 'approved') {
            setLoading(false);
            router.push('/profile/verify-account?prompt=true');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking verification status:', error);
        // Continue even if check fails
      }

      // Success - check if user wants to enable biometric
      if (biometricAvailable) {
        // Wait a moment for SecureStore to be ready
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if user already has biometric credentials
        const hasCredentials = await hasBiometricCredentials();
        
        console.log('🔍 Checking biometric credentials after sign in:', {
          hasCredentials,
          biometricAvailable,
        });
        
        if (!hasCredentials) {
          // Offer to set up biometric
          console.log('📱 Showing biometric setup modal');
          setPendingEmail(email.trim());
          setPendingPassword(password);
          setShowBiometricSetupModal(true);
        } else {
          // User already has biometric set up, just navigate
          console.log('✅ User already has biometric enabled, navigating...');
          setHasStoredCredentials(true);
          router.replace('/(tabs)');
        }
      } else {
        // Biometric not available, just navigate
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
      setShowErrorModal(true);
      setLoading(false);
    }
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
                <MaterialIcons name="account-circle" size={64} color="#6B46C1" />
              </View>
              <ThemedText 
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                Welcome Back
              </ThemedText>
              <ThemedText 
                style={styles.subtitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Sign in to continue to ChainCola
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
                    placeholder="Enter your password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password"
                    numberOfLines={1}
                  />
                </View>
              </View>

              <Link href="/auth/forgot-password" asChild>
                <TouchableOpacity style={styles.forgotPassword}>
                  <ThemedText 
                    style={styles.forgotPasswordText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Forgot Password?
                  </ThemedText>
                </TouchableOpacity>
              </Link>

              <TouchableOpacity 
                style={[styles.signInButton, loading && styles.signInButtonDisabled]} 
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={loading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                  style={styles.signInButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="login" size={20} color="#FFFFFF" />
                      <ThemedText 
                        style={styles.signInButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Sign In
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {biometricAvailable && hasStoredCredentials && (
                <View style={styles.biometricContainer}>
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <ThemedText style={styles.dividerText}>OR</ThemedText>
                    <View style={styles.dividerLine} />
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.biometricButton, (loading || biometricLoading) && styles.biometricButtonDisabled]}
                    onPress={handleBiometricAuth}
                    activeOpacity={0.8}
                    disabled={loading || biometricLoading}
                  >
                    <View style={styles.biometricButtonContent}>
                      {biometricLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                      <MaterialIcons
                        name={biometricType === 'Face ID' ? 'face' : 'fingerprint'}
                        size={24}
                        color="#6B46C1"
                      />
                      )}
                      <ThemedText style={styles.biometricButtonText}>
                        {biometricLoading ? 'Authenticating...' : `Sign in with ${biometricType || 'Biometric'}`}
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.signUpContainer}>
                <ThemedText 
                  style={styles.signUpText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  No account yet?
                </ThemedText>
                <Link href="/auth/signup" asChild>
                  <TouchableOpacity>
                    <ThemedText 
                      style={styles.signUpLink}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Sign Up
                    </ThemedText>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>

      {/* Biometric Setup Modal */}
      <Modal
        visible={showBiometricSetupModal}
        transparent
        animationType="fade"
        onRequestClose={handleSkipBiometric}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.biometricIconContainer}>
              <MaterialIcons
                name={biometricType === 'Face ID' ? 'face' : 'fingerprint'}
                size={64}
                color="#6B46C1"
              />
            </View>
            <ThemedText style={styles.modalTitle}>
              Enable {biometricType || 'Biometric'} Login?
            </ThemedText>
            <ThemedText style={styles.modalMessage}>
              You can use {biometricType || 'biometric authentication'} to sign in quickly on your next visit. Your credentials will be stored securely on this device.
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSkipButton}
                onPress={handleSkipBiometric}
                activeOpacity={0.8}
                disabled={biometricLoading}
              >
                <ThemedText style={styles.modalSkipText}>Skip</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, biometricLoading && styles.modalButtonDisabled]}
                onPress={handleEnableBiometric}
                activeOpacity={0.8}
                disabled={biometricLoading}
              >
                <LinearGradient
                  colors={biometricLoading ? ['#9CA3AF', '#9CA3AF'] : ['#6B46C1', '#9333EA']}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {biometricLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <ThemedText style={styles.modalButtonText}>Enable</ThemedText>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.errorIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            </View>
            <ThemedText 
              style={styles.modalTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Sign In Failed
            </ThemedText>
            <ThemedText 
              style={styles.modalMessage}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {errorMessage}
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowErrorModal(false);
                setErrorMessage('');
              }}
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
  inputContainer: {
    marginBottom: 20,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 28,
    marginTop: -4,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#6B46C1',
    fontWeight: '600',
  },
  signInButton: {
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
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInButtonGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  signInButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  demoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B46C1',
  },
  biometricContainer: {
    marginBottom: 24,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 14,
    color: '#6B7280',
    marginHorizontal: 12,
  },
  biometricButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  biometricButtonDisabled: {
    opacity: 0.6,
  },
  biometricButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signUpText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '400',
  },
  signUpLink: {
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
  errorIconContainer: {
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
  modalButtonDisabled: {
    opacity: 0.6,
  },
  biometricIconContainer: {
    marginBottom: 16,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  modalSkipButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalSkipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
});

