// Script to force credit missing deposits found by check-uncredited-deposits.js
// This will trigger the detect-ethereum-deposits function which will credit missing deposits

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

async function forceCreditMissingDeposits() {
  console.log('🔄 Forcing detection and crediting of missing deposits...\n');

  try {
    // Trigger the detect-ethereum-deposits function
    console.log('📞 Calling detect-ethereum-deposits function...');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-ethereum-deposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function call failed:', response.status, errorText);
      return;
    }

    const result = await response.json();
    
    console.log('\n✅ Detection function completed:\n');
    console.log(`   Wallets checked: ${result.data?.checked || 0}`);
    console.log(`   Deposits found: ${result.data?.depositsFound || 0}`);
    console.log(`   Deposits credited: ${result.data?.depositsCredited || 0}`);
    
    if (result.data?.errors && result.data.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${result.data.errors.length}`);
      result.data.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    if (result.data?.balanceReconciliation && result.data.balanceReconciliation.length > 0) {
      console.log(`\n📊 Balance Reconciliation:`);
      result.data.balanceReconciliation.forEach((recon, index) => {
        const sign = recon.discrepancy > 0 ? '+' : '';
        console.log(`   ${index + 1}. ${recon.address.substring(0, 20)}...`);
        console.log(`      On-chain: ${recon.onChainBalance.toFixed(8)} ETH`);
        console.log(`      Database: ${recon.databaseBalance.toFixed(8)} ETH`);
        console.log(`      Difference: ${sign}${recon.discrepancy.toFixed(8)} ETH`);
      });
    }

    // For each wallet with positive discrepancy, trigger force-sync
    if (result.data?.balanceReconciliation) {
      const walletsNeedingSync = result.data.balanceReconciliation.filter(
        recon => recon.discrepancy > 0.000001
      );

      if (walletsNeedingSync.length > 0) {
        console.log(`\n🔄 Found ${walletsNeedingSync.length} wallet(s) with missing deposits.`);
        console.log('   The detect-ethereum-deposits function should have credited them.');
        console.log('   If deposits are still missing, check the function logs for details.');
      }
    }

    console.log('\n✅ Process completed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Check the function logs in Supabase Dashboard');
    console.log('   2. Verify balances were updated in the database');
    console.log('   3. Check user notifications were sent');

  } catch (error) {
    console.error('❌ Error forcing credit:', error);
  }
}

// Run the force credit
forceCreditMissingDeposits()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

