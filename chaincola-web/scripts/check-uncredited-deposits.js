// Script to check for uncredited crypto deposits
// Compares on-chain balances with database balances and identifies missing deposits

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Alchemy API configuration
const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkUncreditedDeposits() {
  console.log('🔍 Checking for uncredited crypto deposits...\n');

  try {
    // Get all active crypto wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .eq('is_active', true)
      .in('asset', ['ETH', 'BTC', 'XRP', 'SOL']);

    if (walletsError) {
      console.error('❌ Error fetching wallets:', walletsError);
      return;
    }

    console.log(`📋 Found ${wallets.length} active wallets to check\n`);

    const discrepancies = [];
    const uncreditedDeposits = [];

    for (const wallet of wallets) {
      try {
        let onChainBalance = 0;
        let dbBalance = 0;

        // Get database balance
        const { data: balanceData } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', wallet.user_id)
          .eq('currency', wallet.asset)
          .single();

        dbBalance = balanceData ? parseFloat(balanceData.balance || '0') : 0;

        // Get on-chain balance based on asset type
        if (wallet.asset === 'ETH' && wallet.network === 'mainnet') {
          // Check ETH balance via Alchemy
          const balanceResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: [wallet.address, 'latest'],
              id: 1,
            }),
          });

          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            const balanceWei = BigInt(balanceData.result || '0');
            onChainBalance = Number(balanceWei) / 1e18;
          }
        } else if (wallet.asset === 'BTC' && wallet.network === 'mainnet') {
          // For BTC, we'd need to use a Bitcoin API
          // For now, skip BTC or use a different method
          console.log(`⏭️ Skipping BTC wallet ${wallet.address} (Bitcoin API not configured)`);
          continue;
        } else {
          // Skip other assets for now
          continue;
        }

        const difference = onChainBalance - dbBalance;

        if (Math.abs(difference) > 0.000001) {
          discrepancies.push({
            wallet: wallet,
            onChainBalance: onChainBalance,
            dbBalance: dbBalance,
            difference: difference,
          });

          if (difference > 0.000001) {
            // On-chain balance is higher - missing deposit!
            uncreditedDeposits.push({
              wallet: wallet,
              missingAmount: difference,
              onChainBalance: onChainBalance,
              dbBalance: dbBalance,
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error checking wallet ${wallet.address}:`, error.message);
      }
    }

    // Display results
    console.log('\n📊 Balance Reconciliation Results:\n');
    console.log(`Total wallets checked: ${wallets.length}`);
    console.log(`Wallets with discrepancies: ${discrepancies.length}`);
    console.log(`Wallets with uncredited deposits: ${uncreditedDeposits.length}\n`);

    if (uncreditedDeposits.length > 0) {
      console.log('⚠️  UNCREDITED DEPOSITS FOUND:\n');
      uncreditedDeposits.forEach((deposit, index) => {
        console.log(`${index + 1}. Wallet: ${deposit.wallet.address}`);
        console.log(`   Asset: ${deposit.wallet.asset}`);
        console.log(`   User ID: ${deposit.wallet.user_id}`);
        console.log(`   On-chain balance: ${deposit.onChainBalance.toFixed(8)} ${deposit.wallet.asset}`);
        console.log(`   Database balance: ${deposit.dbBalance.toFixed(8)} ${deposit.wallet.asset}`);
        console.log(`   Missing amount: ${deposit.missingAmount.toFixed(8)} ${deposit.wallet.asset}`);
        console.log('');
      });

      console.log('\n💡 To credit these deposits, run:');
      console.log('   node force-credit-missing-deposits.js');
    } else {
      console.log('✅ No uncredited deposits found. All balances are in sync!\n');
    }

    // Show all discrepancies (including negative ones)
    if (discrepancies.length > 0 && uncreditedDeposits.length < discrepancies.length) {
      console.log('\n📋 All Balance Discrepancies:\n');
      discrepancies.forEach((disc, index) => {
        const sign = disc.difference > 0 ? '+' : '';
        console.log(`${index + 1}. ${disc.wallet.address} (${disc.wallet.asset}):`);
        console.log(`   On-chain: ${disc.onChainBalance.toFixed(8)}, DB: ${disc.dbBalance.toFixed(8)}, Diff: ${sign}${disc.difference.toFixed(8)}`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking deposits:', error);
  }
}

// Run the check
checkUncreditedDeposits()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

