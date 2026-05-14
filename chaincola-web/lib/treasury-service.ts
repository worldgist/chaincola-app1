/**
 * Treasury Service
 * Helper service for accessing main wallet addresses and treasury operations
 */

import { createClient } from '@/lib/supabase/server';

export type SupportedAsset = 'BTC' | 'ETH' | 'SOL' | 'XRP' | 'USDT' | 'USDC';

export class TreasuryService {
  /**
   * Get main wallet address for a specific asset
   * @param asset - The cryptocurrency asset (BTC, ETH, SOL, XRP)
   * @returns The main wallet address or null if not configured
   */
  static async getMainWalletAddress(asset: 'BTC' | 'ETH' | 'SOL' | 'XRP'): Promise<string | null> {
    try {
      const supabase = await createClient();
      
      // Get the address column name
      const addressColumn = `${asset.toLowerCase()}_main_address` as 
        'btc_main_address' | 'eth_main_address' | 'sol_main_address' | 'xrp_main_address';
      
      const { data, error } = await supabase
        .from('system_wallets')
        .select(addressColumn)
        .eq('id', 1)
        .single();

      if (error) {
        console.error(`Error fetching ${asset} main wallet address:`, error);
        return null;
      }

      return (data as Record<string, string | null> | null)?.[addressColumn] ?? null;
    } catch (error) {
      console.error(`Error in getMainWalletAddress for ${asset}:`, error);
      return null;
    }
  }

  /**
   * Get all main wallet addresses
   * @returns Object with all main wallet addresses
   */
  static async getAllMainWalletAddresses(): Promise<{
    btc_main_address: string | null;
    eth_main_address: string | null;
    sol_main_address: string | null;
    xrp_main_address: string | null;
  }> {
    try {
      const supabase = await createClient();
      
      const { data, error } = await supabase
        .from('system_wallets')
        .select('btc_main_address, eth_main_address, sol_main_address, xrp_main_address')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Error fetching main wallet addresses:', error);
        return {
          btc_main_address: null,
          eth_main_address: null,
          sol_main_address: null,
          xrp_main_address: null,
        };
      }

      return {
        btc_main_address: data?.btc_main_address || null,
        eth_main_address: data?.eth_main_address || null,
        sol_main_address: data?.sol_main_address || null,
        xrp_main_address: data?.xrp_main_address || null,
      };
    } catch (error) {
      console.error('Error in getAllMainWalletAddresses:', error);
      return {
        btc_main_address: null,
        eth_main_address: null,
        sol_main_address: null,
        xrp_main_address: null,
      };
    }
  }

  /**
   * Get main wallet address for USDT/USDC (uses ETH address)
   * @param asset - USDT or USDC
   * @returns The ETH main wallet address (since USDT/USDC use ETH addresses)
   */
  static async getStablecoinMainAddress(asset: 'USDT' | 'USDC'): Promise<string | null> {
    return this.getMainWalletAddress('ETH');
  }

  /**
   * Get deposit address for user (for display in UI)
   * This returns the main wallet address where users should send crypto
   * @param asset - The cryptocurrency asset
   * @returns The deposit address or null if not configured
   */
  static async getDepositAddress(asset: SupportedAsset): Promise<string | null> {
    if (asset === 'USDT' || asset === 'USDC') {
      return this.getStablecoinMainAddress(asset);
    }
    return this.getMainWalletAddress(asset as 'BTC' | 'ETH' | 'SOL' | 'XRP');
  }
}
