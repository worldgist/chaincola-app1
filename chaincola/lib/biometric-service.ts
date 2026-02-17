import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateBiometricPreference, getBiometricPreference } from './pin-service';

/**
 * Biometric Service
 * Handles all biometric authentication operations
 */

const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';
const BIOMETRIC_ENABLED_KEY = (userId: string) => `biometric_enabled_${userId}`;
const BIOMETRIC_TYPE_KEY = 'biometric_type';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface BiometricAvailability {
  available: boolean;
  type: 'Face ID' | 'Touch ID' | 'Biometric' | null;
  enrolled: boolean;
  hardwareSupported: boolean;
}

/**
 * Checks if biometric authentication is available on the device
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const hardwareSupported = await LocalAuthentication.hasHardwareAsync();
    
    if (!hardwareSupported) {
      return {
        available: false,
        type: null,
        enrolled: false,
        hardwareSupported: false,
      };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!enrolled) {
      return {
        available: false,
        type: null,
        enrolled: false,
        hardwareSupported: true,
      };
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    let biometricType: 'Face ID' | 'Touch ID' | 'Biometric' | null = null;
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'Face ID';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'Touch ID';
    } else if (supportedTypes.length > 0) {
      biometricType = 'Biometric';
    }

    return {
      available: enrolled && supportedTypes.length > 0,
      type: biometricType,
      enrolled,
      hardwareSupported: true,
    };
  } catch (error: any) {
    console.error('Error checking biometric availability:', error);
    return {
      available: false,
      type: null,
      enrolled: false,
      hardwareSupported: false,
    };
  }
}

/**
 * Authenticates user with biometric (Face ID/Touch ID)
 */
export async function authenticateWithBiometric(
  promptMessage?: string
): Promise<BiometricAuthResult> {
  try {
    const availability = await checkBiometricAvailability();
    
    if (!availability.available) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device.',
        errorCode: 'not_available',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || `Authenticate with ${availability.type || 'Biometric'}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use Password',
    });

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error === 'user_cancel' 
          ? 'Authentication cancelled by user'
          : 'Biometric authentication failed',
        errorCode: result.error || 'unknown',
      };
    }
  } catch (error: any) {
    console.error('Error during biometric authentication:', error);
    return {
      success: false,
      error: error.message || 'An error occurred during biometric authentication',
      errorCode: 'exception',
    };
  }
}

/**
 * Stores user credentials securely for biometric login
 */
export async function saveBiometricCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !password) {
      console.error('❌ Cannot save empty credentials');
      return {
        success: false,
        error: 'Email and password are required',
      };
    }
    
    console.log('💾 Saving biometric credentials...');
    
    // Save credentials with retry mechanism
    let saved = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!saved && attempts < maxAttempts) {
      try {
        await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
        await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
        
        // Wait a moment for SecureStore to persist
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify they were saved (with retry)
        let verified = false;
        let verifyAttempts = 0;
        const maxVerifyAttempts = 5;
        
        while (!verified && verifyAttempts < maxVerifyAttempts) {
          const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
          const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
          
          if (savedEmail === email && savedPassword === password) {
            verified = true;
            saved = true;
            console.log('✅ Biometric credentials saved and verified successfully');
          } else {
            verifyAttempts++;
            if (verifyAttempts < maxVerifyAttempts) {
              console.log(`⏳ Verification attempt ${verifyAttempts + 1}/${maxVerifyAttempts}...`);
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }
        
        if (!verified) {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`⏳ Retry attempt ${attempts + 1}/${maxAttempts}...`);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      } catch (saveError: any) {
        console.error(`❌ Error saving credentials (attempt ${attempts + 1}):`, saveError);
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    if (saved) {
      return { success: true };
    } else {
      console.error('❌ Failed to save and verify credentials after multiple attempts');
      return {
        success: false,
        error: 'Failed to save biometric credentials. Please try again.',
      };
    }
  } catch (error: any) {
    console.error('❌ Error saving biometric credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to save biometric credentials',
    };
  }
}

/**
 * Retrieves stored biometric credentials
 */
export async function getBiometricCredentials(): Promise<{
  email: string | null;
  password: string | null;
}> {
  try {
    const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
    const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
    return { email, password };
  } catch (error: any) {
    console.error('Error getting biometric credentials:', error);
    return { email: null, password: null };
  }
}

/**
 * Checks if biometric credentials are stored
 */
export async function hasBiometricCredentials(): Promise<boolean> {
  try {
    // Try multiple times in case SecureStore is slow
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
      const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
      const hasBoth = email !== null && email.length > 0 && password !== null && password.length > 0;
      
      if (hasBoth) {
        console.log('✅ Biometric credentials found in storage');
        return true;
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log('ℹ️ Biometric credentials not found after checking');
    return false;
  } catch (error: any) {
    console.error('❌ Error checking biometric credentials:', error);
    return false;
  }
}

/**
 * Deletes stored biometric credentials
 */
export async function deleteBiometricCredentials(): Promise<{ success: boolean; error?: string }> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting biometric credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete biometric credentials',
    };
  }
}

/**
 * Saves user's biometric preference (enabled/disabled)
 */
export async function saveBiometricPreference(
  userId: string,
  enabled: boolean,
  type?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY(userId), enabled ? 'true' : 'false');
    
    if (type) {
      await AsyncStorage.setItem(BIOMETRIC_TYPE_KEY, type);
    }

    // Also update in Supabase using the new pin-service
    try {
      const result = await updateBiometricPreference(userId, enabled);
      if (!result.success) {
        console.error('Error updating biometric preference in Supabase:', result.error);
        // Don't fail if Supabase update fails - local storage is primary
      }
    } catch (dbError) {
      console.error('Exception updating biometric preference in Supabase:', dbError);
      // Continue - local storage is primary
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving biometric preference:', error);
    return {
      success: false,
      error: error.message || 'Failed to save biometric preference',
    };
  }
}

/**
 * Gets user's biometric preference
 */
export async function isBiometricEnabled(userId: string): Promise<boolean> {
  try {
    // First check local storage
    const localEnabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY(userId));
    if (localEnabled === 'true') {
      return true;
    }

    // Fallback to Supabase if available
    try {
      const supabaseEnabled = await getBiometricPreference(userId);
      if (supabaseEnabled) {
        // Sync local storage with Supabase
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY(userId), 'true');
        return true;
      }
    } catch (dbError) {
      // Ignore database errors
    }

    return false;
  } catch (error) {
    console.error('Error checking biometric preference:', error);
    return false;
  }
}

/**
 * Gets the biometric type (Face ID, Touch ID, etc.)
 */
export async function getBiometricType(): Promise<string | null> {
  try {
    // First check local storage
    const localType = await AsyncStorage.getItem(BIOMETRIC_TYPE_KEY);
    if (localType) {
      return localType;
    }

    // Check device capabilities
    const availability = await checkBiometricAvailability();
    if (availability.type) {
      await AsyncStorage.setItem(BIOMETRIC_TYPE_KEY, availability.type);
      return availability.type;
    }

    return null;
  } catch (error) {
    console.error('Error getting biometric type:', error);
    return null;
  }
}

/**
 * Deletes biometric preference
 */
export async function deleteBiometricPreference(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY(userId));
    await AsyncStorage.removeItem(BIOMETRIC_TYPE_KEY);
    
    // Also update Supabase
    try {
      await updateBiometricPreference(userId, false);
    } catch (dbError) {
      // Ignore database errors
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting biometric preference:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete biometric preference',
    };
  }
}

/**
 * Complete biometric sign-in flow
 * Authenticates with biometric, retrieves credentials, and signs in with Supabase
 */
export async function signInWithBiometric(
  signInFunction: (email: string, password: string) => Promise<{ error: any }>
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔍 Checking for stored credentials...');
    
    // Check if credentials are stored
    const hasCredentials = await hasBiometricCredentials();
    if (!hasCredentials) {
      console.log('❌ No stored credentials found');
      return {
        success: false,
        error: 'No stored credentials found. Please sign in with email and password first.',
      };
    }

    console.log('✅ Stored credentials found, requesting biometric authentication...');

    // Authenticate with biometric
    const authResult = await authenticateWithBiometric('Sign in to ChainCola');
    
    if (!authResult.success) {
      console.log('❌ Biometric authentication failed:', authResult.error);
      return {
        success: false,
        error: authResult.error || 'Biometric authentication failed',
      };
    }

    console.log('✅ Biometric authentication successful, retrieving credentials...');

    // Get stored credentials
    const credentials = await getBiometricCredentials();
    
    console.log('🔑 Retrieved credentials:', {
      hasEmail: !!credentials.email,
      hasPassword: !!credentials.password,
      emailLength: credentials.email?.length || 0,
      passwordLength: credentials.password?.length || 0,
    });
    
    if (!credentials.email || !credentials.password) {
      console.log('❌ Stored credentials are empty or invalid');
      console.log('Email:', credentials.email ? 'exists' : 'missing');
      console.log('Password:', credentials.password ? 'exists' : 'missing');
      return {
        success: false,
        error: 'Stored credentials not found. Please sign in with your email and password.',
      };
    }

    console.log('📧 Signing in with Supabase using stored credentials...');

    // Sign in with Supabase
    const { error } = await signInFunction(credentials.email, credentials.password);
    
    if (error) {
      console.error('❌ Supabase sign in error:', error);
      
      // Clear invalid credentials
      if (error.message?.includes('Invalid login credentials') || 
          error.message?.includes('Invalid login') ||
          error.status === 400) {
        console.log('🧹 Clearing invalid credentials...');
        await deleteBiometricCredentials();
        return {
          success: false,
          error: 'Stored credentials are invalid. Please sign in with your email and password again.',
        };
      }
      
      return {
        success: false,
        error: error.message || 'Sign in failed',
      };
    }

    console.log('✅ Biometric sign-in flow completed successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception in biometric sign-in flow:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

