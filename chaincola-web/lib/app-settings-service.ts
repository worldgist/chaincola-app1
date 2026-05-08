import { createClient } from '@/lib/supabase/client';

export type AppSettings = {
  support_email: string | null;
  support_phone: string | null;
  support_address: string | null;
  privacy_policy: string | null;
  terms_and_conditions: string | null;
  updated_at: string | null;
};

export async function getAppSettingsData(): Promise<{ settings: AppSettings | null; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('support_email, support_phone, support_address, privacy_policy, terms_and_conditions, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error) return { settings: null, error: error.message };
    if (!data) return { settings: null, error: null };
    return { settings: data as AppSettings, error: null };
  } catch (e: unknown) {
    return { settings: null, error: (e as Error)?.message || 'Failed to load app settings' };
  }
}

