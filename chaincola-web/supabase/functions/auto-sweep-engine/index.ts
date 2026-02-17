// Auto-Sweep Engine Edge Function
// Automatically sweeps funds from user deposit addresses to central hot wallets
// Runs periodically via cron job to ensure funds are moved to secure storage

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCentralWalletAddress, getOnChainBalance, isDepositSwept, markDepositAsSwept } from "../_shared/auto-sweep-utility.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum balance threshold to trigger sweep (to avoid sweeping dust)
const MIN_SWEEP_AMOUNTS: Record<string, number> = {
  BTC: 0.0001,    // ~$5-10
  ETH: 0.001,     // ~$2-3
  SOL: 0.01,      // ~$1-2
  XRP: 1,         // ~$0.50-1
  USDT: 1,        // ~$1
  USDC: 1,        // ~$1
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Starting auto-sweep engine...');

    const results = {
      walletsChecked: 0,
      sweepsAttempted: 0,
      sweepsSuccessful: 0,
      sweepsFailed: 0,
      errors: [] as string[],
    };

    // Get all active crypto wallets with private keys (needed for sweeping)
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, asset, address, private_key_encrypted')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '');

    if (walletsError || !wallets) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${wallets.length} wallets to check for sweeping`);

    // Process each wallet
    for (const wallet of wallets) {
      try {
        results.walletsChecked++;
        
        const cryptoCurrency = wallet.asset.toUpperCase();
        const centralWalletAddress = getCentralWalletAddress(cryptoCurrency);
        
        if (!centralWalletAddress) {
          console.warn(`⚠️ No central wallet configured for ${cryptoCurrency}, skipping`);
          continue;
        }

        // Skip if this is already the central wallet
        if (wallet.address.toLowerCase() === centralWalletAddress.toLowerCase()) {
          continue;
        }

        // Get on-chain balance
        const onChainBalance = await getOnChainBalance(cryptoCurrency, wallet.address);
        const minSweepAmount = MIN_SWEEP_AMOUNTS[cryptoCurrency] || 0;

        if (onChainBalance < minSweepAmount) {
          console.log(`⏭️  Skipping ${wallet.address} (${cryptoCurrency}): Balance ${onChainBalance} below minimum ${minSweepAmount}`);
          continue;
        }

        // Check if there are confirmed deposits that haven't been swept
        const { data: deposits } = await supabase
          .from('transactions')
          .select('id, crypto_amount, metadata')
          .eq('user_id', wallet.user_id)
          .eq('crypto_currency', cryptoCurrency)
          .eq('transaction_type', 'RECEIVE')
          .eq('status', 'CONFIRMED')
          .eq('to_address', wallet.address)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!deposits || deposits.length === 0) {
          continue;
        }

        // Check which deposits need sweeping
        const depositsToSweep = [];
        for (const deposit of deposits) {
          const alreadySwept = await isDepositSwept(supabase, deposit.id);
          if (!alreadySwept) {
            depositsToSweep.push(deposit);
          }
        }

        if (depositsToSweep.length === 0) {
          continue;
        }

        console.log(`💰 Sweeping ${cryptoCurrency} from ${wallet.address} to ${centralWalletAddress}`);
        console.log(`   Balance: ${onChainBalance} ${cryptoCurrency}`);
        console.log(`   Deposits to sweep: ${depositsToSweep.length}`);

        // Call the appropriate send function to sweep funds
        const sweepResult = await sweepFunds(
          supabase,
          wallet,
          centralWalletAddress,
          cryptoCurrency,
          onChainBalance
        );

        if (sweepResult.success && sweepResult.transactionHash) {
          results.sweepsAttempted++;
          results.sweepsSuccessful++;

          // Mark deposits as swept
          for (const deposit of depositsToSweep) {
            await markDepositAsSwept(
              supabase,
              deposit.id,
              sweepResult.transactionHash!,
              onChainBalance
            );
          }

          // Create sweep transaction record
          await supabase
            .from('transactions')
            .insert({
              user_id: wallet.user_id,
              transaction_type: 'SWEEP',
              crypto_currency: cryptoCurrency,
              crypto_amount: onChainBalance,
              status: 'COMPLETED',
              from_address: wallet.address,
              to_address: centralWalletAddress,
              transaction_hash: sweepResult.transactionHash,
              metadata: {
                auto_sweep: true,
                swept_at: new Date().toISOString(),
                deposit_count: depositsToSweep.length,
                deposit_ids: depositsToSweep.map(d => d.id),
              },
            });

          console.log(`✅ Successfully swept ${onChainBalance} ${cryptoCurrency}`);
        } else {
          results.sweepsAttempted++;
          results.sweepsFailed++;
          const errorMsg = sweepResult.error || 'Unknown error';
          results.errors.push(`${cryptoCurrency} ${wallet.address}: ${errorMsg}`);
          console.error(`❌ Failed to sweep ${cryptoCurrency}:`, errorMsg);
        }
      } catch (error: any) {
        console.error(`Error processing wallet ${wallet.address}:`, error);
        results.errors.push(`Wallet ${wallet.address}: ${error.message}`);
      }
    }

    console.log(`✅ Auto-sweep completed: ${results.sweepsSuccessful}/${results.sweepsAttempted} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in auto-sweep engine:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Sweep funds from user wallet to central wallet
 * Uses internal sweep logic to avoid authentication issues
 */
async function sweepFunds(
  supabase: any,
  wallet: any,
  centralWalletAddress: string,
  cryptoCurrency: string,
  amount: number
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  const currency = cryptoCurrency.toUpperCase();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    // Get user's auth token for the send function
    // We need to create a service role session or use a different approach
    // For now, we'll call the function with service role and handle auth internally
    
    let functionName = '';
    let body: any = {
      destination_address: centralWalletAddress,
      send_all: true,
      skip_platform_fee: true,
      auto_sweep: true, // Flag to indicate this is an auto-sweep
    };

    if (currency === 'BTC') {
      functionName = 'send-bitcoin-transaction';
    } else if (currency === 'ETH') {
      functionName = 'send-ethereum-transaction';
    } else if (currency === 'SOL') {
      functionName = 'send-solana-transaction';
    } else if (currency === 'XRP') {
      functionName = 'send-xrp-transaction';
    } else if (currency === 'USDT') {
      functionName = 'send-usdt-transaction';
    } else if (currency === 'USDC') {
      functionName = 'send-usdc-transaction';
    } else {
      return { success: false, error: `Unsupported currency: ${currency}` };
    }

    // Call the send function
    // Note: The send functions require user auth, so we need to pass the user_id
    // and let the function handle it with service role privileges
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    
    // Create a service role token for the user
    // We'll pass user_id in metadata and use service role key
    body.user_id = wallet.user_id;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json',
        'x-user-id': wallet.user_id, // Pass user ID in header for internal calls
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Sweep function error (${currency}):`, errorText);
      return { success: false, error: `Send function error: ${response.status}` };
    }

    const result = await response.json();
    
    if (result.success && result.transaction_hash) {
      return { success: true, transactionHash: result.transaction_hash };
    } else {
      return { success: false, error: result.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error(`Error sweeping ${currency}:`, error);
    return { success: false, error: error.message || 'Failed to sweep funds' };
  }
}
