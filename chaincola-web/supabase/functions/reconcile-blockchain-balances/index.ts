// Reconcile Blockchain Balances
// Checks actual blockchain balances for ETH and SOL and updates the database with real balances
// This ensures user balances in the app match what's actually on the blockchain

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WalletBalance {
  address: string;
  userId: string;
  currency: 'ETH' | 'SOL';
  onChainBalance: number;
  databaseBalance: number;
  discrepancy: number;
  updated: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting blockchain balance reconciliation...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Alchemy API configurations
    const alchemyEthUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    let solanaRpcUrl = Deno.env.get('SOLANA_RPC_URL') || 
                       Deno.env.get('ALCHEMY_SOLANA_URL') ||
                       Deno.env.get('QUICKNODE_SOLANA_URL') ||
                       Deno.env.get('HELIUS_SOLANA_URL');
    
    if (!solanaRpcUrl) {
      solanaRpcUrl = Deno.env.get('ALCHEMY_SOLANA_URL') || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    }
    
    if (!solanaRpcUrl) {
      solanaRpcUrl = 'https://api.mainnet-beta.solana.com';
    }

    const results: WalletBalance[] = [];
    let totalUpdated = 0;

    // ===========================
    // ETHEREUM BALANCE RECONCILIATION
    // ===========================
    console.log('\n📊 Checking Ethereum balances...');
    
    const { data: ethWallets, error: ethWalletsError } = await supabase
      .from('crypto_wallets')
      .select('address, user_id, asset')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('address', 'is', null);

    if (ethWalletsError) {
      throw new Error(`Failed to fetch ETH wallets: ${ethWalletsError.message}`);
    }

    console.log(`Found ${ethWallets?.length || 0} ETH wallets to check`);

    for (const wallet of ethWallets || []) {
      try {
        // Get on-chain balance
        const balanceResponse = await fetch(alchemyEthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [wallet.address, 'latest'],
            id: 1,
          }),
        });

        if (!balanceResponse.ok) {
          console.error(`❌ Failed to get ETH balance for ${wallet.address}`);
          continue;
        }

        const balanceData = await balanceResponse.json();
        const onChainBalance = parseFloat(balanceData.result || '0') / 1e18; // Convert wei to ETH

        // Get database balance
        const { data: dbBalance } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', wallet.user_id)
          .eq('currency', 'ETH')
          .maybeSingle();

        const databaseBalance = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;
        const discrepancy = onChainBalance - databaseBalance;

        console.log(`   ${wallet.address.substring(0, 10)}... - Chain: ${onChainBalance.toFixed(8)} ETH, DB: ${databaseBalance.toFixed(8)} ETH`);

        // Update if there's a discrepancy greater than 0.000001 ETH (dust threshold)
        let updated = false;
        if (Math.abs(discrepancy) > 0.000001) {
          console.log(`   ⚠️  Discrepancy: ${discrepancy > 0 ? '+' : ''}${discrepancy.toFixed(8)} ETH - Updating...`);
          
          // Upsert wallet_balances
          const { error: updateError } = await supabase
            .from('wallet_balances')
            .upsert({
              user_id: wallet.user_id,
              currency: 'ETH',
              balance: onChainBalance.toString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,currency',
            });

          if (updateError) {
            console.error(`   ❌ Failed to update balance: ${updateError.message}`);
          } else {
            console.log(`   ✅ Updated ETH balance for user ${wallet.user_id}`);
            updated = true;
            totalUpdated++;
          }
        }

        results.push({
          address: wallet.address,
          userId: wallet.user_id,
          currency: 'ETH',
          onChainBalance,
          databaseBalance,
          discrepancy,
          updated,
        });
      } catch (error: any) {
        console.error(`❌ Error checking ETH wallet ${wallet.address}:`, error.message);
      }
    }

    // ===========================
    // SOLANA BALANCE RECONCILIATION
    // ===========================
    console.log('\n📊 Checking Solana balances...');
    
    const { data: solWallets, error: solWalletsError } = await supabase
      .from('crypto_wallets')
      .select('address, user_id, asset')
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('address', 'is', null);

    if (solWalletsError) {
      throw new Error(`Failed to fetch SOL wallets: ${solWalletsError.message}`);
    }

    console.log(`Found ${solWallets?.length || 0} SOL wallets to check`);

    for (const wallet of solWallets || []) {
      try {
        // Get on-chain balance
        const balanceResponse = await fetch(solanaRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [wallet.address],
          }),
        });

        if (!balanceResponse.ok) {
          console.error(`❌ Failed to get SOL balance for ${wallet.address}`);
          continue;
        }

        const balanceData = await balanceResponse.json();
        const balanceLamports = balanceData.result?.value || 0;
        const onChainBalance = balanceLamports / 1e9; // Convert lamports to SOL

        // Get database balance
        const { data: dbBalance } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', wallet.user_id)
          .eq('currency', 'SOL')
          .maybeSingle();

        const databaseBalance = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;
        const discrepancy = onChainBalance - databaseBalance;

        console.log(`   ${wallet.address.substring(0, 10)}... - Chain: ${onChainBalance.toFixed(8)} SOL, DB: ${databaseBalance.toFixed(8)} SOL`);

        // Update if there's a discrepancy greater than 0.000001 SOL (dust threshold)
        let updated = false;
        if (Math.abs(discrepancy) > 0.000001) {
          console.log(`   ⚠️  Discrepancy: ${discrepancy > 0 ? '+' : ''}${discrepancy.toFixed(8)} SOL - Updating...`);
          
          // Upsert wallet_balances
          const { error: updateError } = await supabase
            .from('wallet_balances')
            .upsert({
              user_id: wallet.user_id,
              currency: 'SOL',
              balance: onChainBalance.toString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,currency',
            });

          if (updateError) {
            console.error(`   ❌ Failed to update balance: ${updateError.message}`);
          } else {
            console.log(`   ✅ Updated SOL balance for user ${wallet.user_id}`);
            updated = true;
            totalUpdated++;
          }
        }

        results.push({
          address: wallet.address,
          userId: wallet.user_id,
          currency: 'SOL',
          onChainBalance,
          databaseBalance,
          discrepancy,
          updated,
        });
      } catch (error: any) {
        console.error(`❌ Error checking SOL wallet ${wallet.address}:`, error.message);
      }
    }

    // Summary
    const ethCount = results.filter(r => r.currency === 'ETH').length;
    const solCount = results.filter(r => r.currency === 'SOL').length;
    const discrepancyCount = results.filter(r => Math.abs(r.discrepancy) > 0.000001).length;

    console.log('\n✅ Balance reconciliation complete!');
    console.log(`   Checked: ${ethCount} ETH wallets, ${solCount} SOL wallets`);
    console.log(`   Discrepancies found: ${discrepancyCount}`);
    console.log(`   Balances updated: ${totalUpdated}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalWallets: results.length,
          ethWallets: ethCount,
          solWallets: solCount,
          discrepanciesFound: discrepancyCount,
          balancesUpdated: totalUpdated,
        },
        details: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in balance reconciliation:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
