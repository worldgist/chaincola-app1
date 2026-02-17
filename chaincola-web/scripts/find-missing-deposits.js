// Find all wallets with missing deposits and fix them

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function findAndFixMissingDeposits() {
  console.log('🔍 Finding wallets with missing ETH deposits...\n');

  try {
    // Get all active ETH wallets
    const { data: wallets } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    console.log(`📋 Checking ${wallets.length} wallets...\n`);

    const walletsWithMissingDeposits = [];

    for (const wallet of wallets) {
      // Get balances
      const { data: dbBalance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', wallet.user_id)
        .eq('currency', 'ETH')
        .single();

      const dbBalanceAmount = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;

      // Get on-chain balance
      const normalizedAddress = wallet.address.toLowerCase().startsWith('0x') 
        ? wallet.address.toLowerCase() 
        : '0x' + wallet.address.toLowerCase();

      const balanceResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [normalizedAddress, 'latest'],
          id: 999,
        }),
      });

      const balanceData = await balanceResponse.json();
      const balanceWei = BigInt(balanceData.result || '0');
      const onChainBalance = Number(balanceWei) / 1e18;

      const difference = onChainBalance - dbBalanceAmount;

      if (difference > 0.000001) {
        console.log(`⚠️  Missing deposit found:`);
        console.log(`   Wallet: ${wallet.address.substring(0, 20)}...`);
        console.log(`   User ID: ${wallet.user_id}`);
        console.log(`   On-chain: ${onChainBalance.toFixed(8)} ETH`);
        console.log(`   Database: ${dbBalanceAmount.toFixed(8)} ETH`);
        console.log(`   Missing: ${difference.toFixed(8)} ETH\n`);

        walletsWithMissingDeposits.push({
          wallet: wallet,
          missingAmount: difference,
          onChainBalance: onChainBalance,
          dbBalance: dbBalanceAmount,
        });
      }
    }

    if (walletsWithMissingDeposits.length === 0) {
      console.log('✅ No missing deposits found!\n');
      return;
    }

    console.log(`\n📊 Found ${walletsWithMissingDeposits.length} wallet(s) with missing deposits\n`);

    // Trigger detection function to fix them
    console.log('🔄 Triggering deposit detection function...\n');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-ethereum-deposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Detection function completed:');
      console.log(`   Wallets checked: ${result.data?.checked || 0}`);
      console.log(`   Deposits found: ${result.data?.depositsFound || 0}`);
      console.log(`   Deposits credited: ${result.data?.depositsCredited || 0}\n`);

      if (result.data?.depositsCredited > 0) {
        console.log('✅ Missing deposits have been credited!\n');
      } else {
        console.log('⚠️  No deposits were credited. Checking function logs for details...\n');
      }
    } else {
      console.error('❌ Detection function failed:', result.error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findAndFixMissingDeposits()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



