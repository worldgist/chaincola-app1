import { createClient } from './supabase/client';

const supabase = createClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface CryptoWallet {
  id: string;
  user_id: string;
  asset: string;
  network: string;
  address: string;
  public_key?: string;
  destination_tag?: string;
  is_active: boolean;
}

export interface GenerateWalletResponse {
  success: boolean;
  address?: string;
  asset?: string;
  network?: string;
  destination_tag?: string;
  error?: string;
}

/**
 * Get wallet address for a specific asset and network
 */
export async function getWalletAddress(
  asset: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ address: string | null; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { address: null, error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', session.user.id)
      .eq('asset', asset)
      .eq('network', network)
      .eq('is_active', true)
      .single();

    if (error) {
      return { address: null, error };
    }

    return { address: data?.address || null, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { address: null, error: msg || 'Failed to fetch wallet address' };
  }
}

/**
 * Generate wallet for a specific asset
 */
export async function generateWallet(
  asset: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
  forceNew: boolean = false
): Promise<GenerateWalletResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, error: 'Supabase not configured' };
    }

    const functionUrl = `${SUPABASE_URL}/functions/v1/generate-wallet`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset,
        network,
        force_new: forceNew,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        address: result.address,
        asset: result.asset,
        network: result.network,
        destination_tag: result.destination_tag,
      };
    }

    return { success: false, error: result.error || 'Failed to generate wallet' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg || 'Failed to generate wallet' };
  }
}

/**
 * Regenerate wallet (delete old and create new)
 */
export async function regenerateWallet(
  asset: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<GenerateWalletResponse> {
  return generateWallet(asset, network, true);
}

/**
 * Get wallet by asset
 */
export async function getWalletByAsset(
  asset: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ wallet: CryptoWallet | null; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { wallet: null, error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('asset', asset)
      .eq('network', network)
      .eq('is_active', true)
      .single();

    if (error) {
      return { wallet: null, error };
    }

    return { wallet: data as CryptoWallet, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { wallet: null, error: msg || 'Failed to fetch wallet' };
  }
}

