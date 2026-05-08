import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/**
 * Secure PIN Service
 * Handles PIN storage, hashing, and synchronization with Supabase
 */

const PIN_STORAGE_KEY = (userId: string) => `secure_pin_${userId}`;
const PIN_HASH_STORAGE_KEY = (userId: string) => `pin_hash_${userId}`;
const PIN_SETUP_KEY = (userId: string) => `pin_setup_${userId}`;

/**
 * Hash a PIN using SHA-256
 * In production, consider using bcrypt or Argon2 for better security
 */
async function hashPIN(pin: string): Promise<string> {
  try {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pin
    );
    return digest;
  } catch (error) {
    console.error('Error hashing PIN:', error);
    throw error;
  }
}

/**
 * Verify a PIN against a stored hash
 */
async function verifyPIN(pin: string, hash: string): Promise<boolean> {
  try {
    const pinHash = await hashPIN(pin);
    return pinHash === hash;
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
}

/**
 * Save PIN securely in SecureStore and sync hash to Supabase
 */
export async function savePIN(userId: string, pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    // Hash the PIN
    const pinHash = await hashPIN(pin);

    // Store hash in SecureStore (local secure storage)
    await SecureStore.setItemAsync(PIN_HASH_STORAGE_KEY(userId), pinHash);
    await SecureStore.setItemAsync(PIN_SETUP_KEY(userId), 'true');

    // Sync hash to Supabase user_profiles table
    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          hash_pin: pinHash,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error syncing PIN hash to Supabase:', updateError);
        // Don't fail if Supabase sync fails - local storage is still secure
        // The hash will be synced on next successful operation
      } else {
        console.log('✅ PIN hash synced to Supabase');
      }
    } catch (supabaseError) {
      console.error('Exception syncing PIN to Supabase:', supabaseError);
      // Continue - local storage is still secure
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving PIN:', error);
    return { success: false, error: error.message || 'Failed to save PIN' };
  }
}

/**
 * Verify a PIN against stored hash
 */
export async function verifyPINInput(userId: string, pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    // First try to get hash from SecureStore (local)
    let storedHash = await SecureStore.getItemAsync(PIN_HASH_STORAGE_KEY(userId));

    // If not found locally, try to get from Supabase
    if (!storedHash) {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('hash_pin')
          .eq('user_id', userId)
          .single();

        if (!error && data?.hash_pin) {
          storedHash = data.hash_pin;
          // Cache it locally for faster future access
          await SecureStore.setItemAsync(PIN_HASH_STORAGE_KEY(userId), storedHash);
        }
      } catch (supabaseError) {
        console.error('Error fetching PIN hash from Supabase:', supabaseError);
      }
    }

    if (!storedHash) {
      return { success: false, error: 'No PIN found. Please set up your PIN first.' };
    }

    // Verify the PIN
    const isValid = await verifyPIN(pin, storedHash);

    if (isValid) {
      return { success: true };
    } else {
      return { success: false, error: 'Invalid PIN' };
    }
  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    return { success: false, error: error.message || 'Failed to verify PIN' };
  }
}

/**
 * Check if PIN is set up for user
 */
export async function isPINSetup(userId: string): Promise<boolean> {
  try {
    if (!userId) return false;

    // Hash in SecureStore is authoritative (setup flag can be missing after restore/cache quirks)
    const localHash = await SecureStore.getItemAsync(PIN_HASH_STORAGE_KEY(userId));
    if (localHash) {
      await SecureStore.setItemAsync(PIN_SETUP_KEY(userId), 'true');
      return true;
    }

    // Check Supabase
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('hash_pin')
        .eq('user_id', userId)
        .single();

      if (!error && data?.hash_pin) {
        // Cache locally
        await SecureStore.setItemAsync(PIN_HASH_STORAGE_KEY(userId), data.hash_pin);
        await SecureStore.setItemAsync(PIN_SETUP_KEY(userId), 'true');
        return true;
      }
    } catch (supabaseError) {
      console.error('Error checking PIN setup in Supabase:', supabaseError);
    }

    return false;
  } catch (error) {
    console.error('Error checking PIN setup:', error);
    return false;
  }
}

/**
 * Delete PIN (for account deletion or PIN reset)
 */
export async function deletePIN(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    // Delete from SecureStore
    await SecureStore.deleteItemAsync(PIN_HASH_STORAGE_KEY(userId));
    await SecureStore.deleteItemAsync(PIN_SETUP_KEY(userId));
    await SecureStore.deleteItemAsync(PIN_STORAGE_KEY(userId)); // Legacy key cleanup

    // Delete from Supabase
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ 
          hash_pin: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting PIN from Supabase:', error);
      }
    } catch (supabaseError) {
      console.error('Exception deleting PIN from Supabase:', supabaseError);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting PIN:', error);
    return { success: false, error: error.message || 'Failed to delete PIN' };
  }
}

/**
 * Update biometric preference in Supabase
 */
export async function updateBiometricPreference(
  userId: string, 
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ 
        enable_biometric: enabled,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating biometric preference:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception updating biometric preference:', error);
    return { success: false, error: error.message || 'Failed to update biometric preference' };
  }
}

/**
 * Get biometric preference from Supabase
 */
export async function getBiometricPreference(userId: string): Promise<boolean> {
  try {
    if (!userId) return false;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('enable_biometric')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.enable_biometric ?? false;
  } catch (error) {
    console.error('Error getting biometric preference:', error);
    return false;
  }
}



















