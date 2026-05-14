// Fetch Main Wallet On-Chain Balances Edge Function
// Fetches real-time balances from blockchain for main treasury wallet addresses
// Updates on_chain_balances table and reconciliation status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOnChainBalance } from "../_shared/auto-sweep-utility.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssetConfig {
  asset: string;
  addressField: string;
  network?: string;
}

const ASSET_CONFIGS: AssetConfig[] = [
  { asset: 'BTC', addressField: 'btc_main_address' },
  { asset: 'ETH', addressField: 'eth_main_address' },
  { asset: 'SOL', addressField: 'sol_main_address' },
  { asset: 'XRP', addressField: 'xrp_main_address' },
  { asset: 'USDT', addressField: 'usdt_eth_main_address', network: 'ethereum' },
  { asset: 'USDC', addressField: 'usdc_eth_main_address', network: 'ethereum' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (!authError && user) {
        // Check if user is admin
        const { data: adminCheck } = await supabase.rpc('is_user_admin', { check_user_id: user.id });
        if (!adminCheck) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('🔍 Fetching main wallet on-chain balances...');

    // Get system wallet with addresses
    const { data: systemWallet, error: walletError } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (walletError || !systemWallet) {
      console.error('Error fetching system wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch system wallet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];
    const errors: any[] = [];

    // Fetch balances for each asset
    for (const config of ASSET_CONFIGS) {
      const address = systemWallet[config.addressField];
      
      if (!address) {
        console.warn(`⚠️ No address configured for ${config.asset}`);
        errors.push({
          asset: config.asset,
          error: 'No wallet address configured',
        });
        continue;
      }

      try {
        console.log(`📡 Fetching ${config.asset} balance for ${address.substring(0, 10)}...`);
        
        // Get on-chain balance
        const onChainBalance = await getOnChainBalance(config.asset, address);
        
        console.log(`✅ ${config.asset} on-chain balance: ${onChainBalance}`);

        // Get ledger inventory
        const ledgerField = `${config.asset.toLowerCase()}_inventory`;
        const ledgerInventory = parseFloat(systemWallet[ledgerField] || '0');

        // Update on-chain balance record
        const { data: updateResult, error: updateError } = await supabase.rpc(
          'update_on_chain_balance',
          {
            p_asset: config.asset,
            p_wallet_address: address,
            p_on_chain_balance: onChainBalance,
            p_ledger_inventory: ledgerInventory,
            p_fetch_error: null,
          }
        );

        if (updateError) {
          console.error(`❌ Error updating ${config.asset} balance:`, updateError);
          errors.push({
            asset: config.asset,
            error: updateError.message,
          });
        } else {
          results.push({
            asset: config.asset,
            address: address,
            on_chain_balance: onChainBalance,
            ledger_inventory: ledgerInventory,
            difference: onChainBalance - ledgerInventory,
            status: updateResult?.status || 'UNKNOWN',
          });
        }
      } catch (error: any) {
        console.error(`❌ Error fetching ${config.asset} balance:`, error);
        
        // Update with error
        await supabase.rpc('update_on_chain_balance', {
          p_asset: config.asset,
          p_wallet_address: address,
          p_on_chain_balance: 0,
          p_ledger_inventory: null,
          p_fetch_error: error.message,
        });

        errors.push({
          asset: config.asset,
          error: error.message,
        });
      }
    }

    // Update NGN reconciliation status (no on-chain balance, just check ledger)
    await supabase.rpc('update_reconciliation_status', {
      p_asset: 'NGN',
      p_ledger_balance: parseFloat(systemWallet.ngn_float_balance || '0'),
      p_on_chain_balance: null,
    });

    console.log(`✅ Completed fetching balances. ${results.length} successful, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        errors,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error fetching main wallet balances:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
