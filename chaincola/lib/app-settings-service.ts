import { supabase } from './supabase';

export interface AppSetting {
  key: string;
  value: string;
  category?: string;
  description?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AppSettings {
  app_name?: string;
  app_version?: string;
  maintenance_mode?: boolean;
  registration_enabled?: boolean;
  kyc_required?: boolean;
  min_withdrawal_amount?: number;
  max_withdrawal_amount?: number;
  withdrawal_fee?: number;
  transaction_fee?: number;
  transaction_fee_percentage?: number;
  support_email?: string;
  support_phone?: string;
  support_address?: string;
  privacy_policy?: string;
  terms_and_conditions?: string;
  updated_at?: string;
}

/**
 * Gets app settings from the new table structure
 * This fetches from the single-row app_settings table
 */
export async function getAppSettingsData(): Promise<AppSettings | null> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      // If no row exists, return null (table might not be initialized yet)
      if (error.code === 'PGRST116') {
        console.log('App settings not found. Table may need to be initialized.');
        return null;
      }
      console.error('Error fetching app settings:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Map database fields to AppSettings interface
    return {
      app_name: data.app_name,
      app_version: data.app_version,
      maintenance_mode: data.maintenance_mode,
      registration_enabled: data.registration_enabled,
      kyc_required: data.kyc_required,
      min_withdrawal_amount: data.min_withdrawal_amount ? parseFloat(data.min_withdrawal_amount) : undefined,
      max_withdrawal_amount: data.max_withdrawal_amount ? parseFloat(data.max_withdrawal_amount) : undefined,
      withdrawal_fee: data.withdrawal_fee ? parseFloat(data.withdrawal_fee) : undefined,
      transaction_fee: data.transaction_fee ? parseFloat(data.transaction_fee) : undefined,
      transaction_fee_percentage: data.transaction_fee_percentage ? parseFloat(data.transaction_fee_percentage) : undefined,
      support_email: data.support_email,
      support_phone: data.support_phone,
      support_address: data.support_address,
      privacy_policy: data.privacy_policy,
      terms_and_conditions: data.terms_and_conditions,
      updated_at: data.updated_at,
    };
  } catch (error: any) {
    console.error('Exception fetching app settings:', error);
    return null;
  }
}

/**
 * Gets a single app setting by key (for backward compatibility)
 * Tries new structure first, then falls back to old structure
 */
export async function getAppSetting(key: string): Promise<string | null> {
  try {
    // First try the new table structure
    const settings = await getAppSettingsData();
    if (settings) {
      // Map common keys to new structure
      const keyMap: Record<string, keyof AppSettings> = {
        'support_email': 'support_email',
        'support_phone': 'support_phone',
        'support_address': 'support_address',
        'privacy_policy': 'privacy_policy',
        'terms_and_conditions': 'terms_and_conditions',
        'app_name': 'app_name',
        'app_version': 'app_version',
      };

      const mappedKey = keyMap[key];
      if (mappedKey && settings[mappedKey]) {
        return String(settings[mappedKey]);
      }
    }

    // TODO: Replace with your API to fetch app setting by key
    // For now, return null to allow UI testing
    return null;
  } catch (error: any) {
    console.error(`Exception fetching app setting "${key}":`, error);
    return null;
  }
}

/**
 * Gets multiple app settings by keys (for backward compatibility)
 * Returns an object with keys as properties and values as strings
 */
export async function getAppSettings(keys: string[]): Promise<Record<string, string>> {
  try {
    if (!keys || keys.length === 0) {
      return {};
    }

    // First try the new table structure
    const settings = await getAppSettingsData();
    if (settings) {
      const result: Record<string, string> = {};
      const keyMap: Record<string, keyof AppSettings> = {
        'support_email': 'support_email',
        'support_phone': 'support_phone',
        'support_address': 'support_address',
        'privacy_policy': 'privacy_policy',
        'terms_and_conditions': 'terms_and_conditions',
        'app_name': 'app_name',
        'app_version': 'app_version',
      };

      keys.forEach((key) => {
        const mappedKey = keyMap[key];
        if (mappedKey && settings[mappedKey]) {
          result[key] = String(settings[mappedKey]);
        }
      });

      // If we got some results, return them
      if (Object.keys(result).length > 0) {
        return result;
      }
    }

    // TODO: Replace with your API to fetch app settings by keys
    // For now, return empty object to allow UI testing
    return {};
  } catch (error: any) {
    console.error('Exception fetching app settings:', error);
    return {};
  }
}

/**
 * Gets all public app settings (for backward compatibility)
 */
export async function getPublicAppSettings(): Promise<Record<string, string>> {
  try {
    // Try new structure first
    const settings = await getAppSettingsData();
    if (settings) {
      const result: Record<string, string> = {};
      if (settings.support_email) result['support_email'] = settings.support_email;
      if (settings.support_phone) result['support_phone'] = settings.support_phone;
      if (settings.support_address) result['support_address'] = settings.support_address;
      if (settings.privacy_policy) result['privacy_policy'] = settings.privacy_policy;
      if (settings.terms_and_conditions) result['terms_and_conditions'] = settings.terms_and_conditions;
      if (settings.app_name) result['app_name'] = settings.app_name;
      if (settings.app_version) result['app_version'] = settings.app_version;
      return result;
    }

    // TODO: Replace with your API to fetch public app settings
    // For now, return empty object to allow UI testing
    return {};
  } catch (error: any) {
    console.error('Exception fetching public app settings:', error);
    return {};
  }
}

/**
 * Gets all app settings by category (for backward compatibility)
 */
export async function getAppSettingsByCategory(category: string): Promise<Record<string, string>> {
  try {
    // TODO: Replace with your API to fetch app settings by category
    // For now, return empty object to allow UI testing
    return {};
  } catch (error: any) {
    console.error(`Exception fetching app settings for category "${category}":`, error);
    return {};
  }
}





