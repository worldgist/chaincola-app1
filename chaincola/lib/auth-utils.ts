import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { getBiometricPreference, updateBiometricPreference } from '@/lib/pin-service';

/**
 * PIN Management Utilities
 */
export const PIN_STORAGE_KEY = (userId: string) => `user_pin_${userId}`;
export const PIN_SETUP_KEY = 'pin_setup_complete';

export async function savePIN(userId: string, pin: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PIN_STORAGE_KEY(userId), pin);
    await AsyncStorage.setItem(PIN_SETUP_KEY, 'true');
    return true;
  } catch (error) {
    console.error('Error saving PIN:', error);
    return false;
  }
}

export async function getPIN(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PIN_STORAGE_KEY(userId));
  } catch (error) {
    console.error('Error getting PIN:', error);
    return null;
  }
}

export async function deletePIN(userId: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(PIN_STORAGE_KEY(userId));
    await AsyncStorage.removeItem(PIN_SETUP_KEY);
    return true;
  } catch (error) {
    console.error('Error deleting PIN:', error);
    return false;
  }
}

export async function isPINSetup(): Promise<boolean> {
  try {
    const setup = await AsyncStorage.getItem(PIN_SETUP_KEY);
    return setup === 'true';
  } catch (error) {
    console.error('Error checking PIN setup:', error);
    return false;
  }
}

/**
 * Biometric Management Utilities
 */
export const BIOMETRIC_ENABLED_KEY = (userId: string) => `biometric_enabled_${userId}`;
export const BIOMETRIC_TYPE_KEY = 'biometric_type';
export const BIOMETRIC_LOGIN_ENABLED_KEY = 'biometric_login_enabled';

export async function saveBiometricPreference(userId: string, enabled: boolean, type?: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY(userId), enabled ? 'true' : 'false');
    // Also gate biometric sign-in on the login screen
    await AsyncStorage.setItem(BIOMETRIC_LOGIN_ENABLED_KEY, enabled ? 'true' : 'false');
    if (type) {
      await AsyncStorage.setItem(BIOMETRIC_TYPE_KEY, type);
    }
    // Keep Supabase in sync so other screens (and backend) see the same value
    try {
      await updateBiometricPreference(userId, enabled);
    } catch (e) {
      // Don't fail the UI if the network is down; local storage is still updated
      console.warn('biometric: failed to sync preference to Supabase', (e as Error)?.message);
    }
    return true;
  } catch (error) {
    console.error('Error saving biometric preference:', error);
    return false;
  }
}

export async function isBiometricEnabled(userId: string): Promise<boolean> {
  try {
    const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY(userId));
    if (enabled === 'true') return true;

    // Fallback to Supabase (helps after reinstall / storage clear)
    try {
      const dbEnabled = await getBiometricPreference(userId);
      if (dbEnabled) {
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY(userId), 'true');
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  } catch (error) {
    console.error('Error checking biometric preference:', error);
    return false;
  }
}

export async function getBiometricType(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(BIOMETRIC_TYPE_KEY);
    if (cached) return cached;

    // Detect supported biometric type on device
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let t: string | null = null;
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) t = 'Face ID';
    else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) t = 'Touch ID';
    else if (supportedTypes.length > 0) t = 'Biometric';

    if (t) await AsyncStorage.setItem(BIOMETRIC_TYPE_KEY, t);
    return t;
  } catch (error) {
    console.error('Error getting biometric type:', error);
    return null;
  }
}

export async function deleteBiometricPreference(userId: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY(userId));
    await AsyncStorage.removeItem(BIOMETRIC_TYPE_KEY);
    await AsyncStorage.setItem(BIOMETRIC_LOGIN_ENABLED_KEY, 'false');
    try {
      await updateBiometricPreference(userId, false);
    } catch {
      // ignore
    }
    return true;
  } catch (error) {
    console.error('Error deleting biometric preference:', error);
    return false;
  }
}

/**
 * Biometric Credential Storage (Secure)
 */
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';

export async function saveBiometricCredentials(email: string, password: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
    await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
    return true;
  } catch (error) {
    console.error('Error saving biometric credentials:', error);
    return false;
  }
}

export async function getBiometricCredentials(): Promise<{ email: string | null; password: string | null }> {
  try {
    const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
    const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
    return { email, password };
  } catch (error) {
    console.error('Error getting biometric credentials:', error);
    return { email: null, password: null };
  }
}

export async function deleteBiometricCredentials(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
    return true;
  } catch (error) {
    console.error('Error deleting biometric credentials:', error);
    return false;
  }
}

export async function hasBiometricCredentials(): Promise<boolean> {
  try {
    const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
    return email !== null;
  } catch (error) {
    return false;
  }
}

