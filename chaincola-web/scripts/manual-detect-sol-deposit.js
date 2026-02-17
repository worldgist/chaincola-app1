/**
 * Manual script to trigger Solana deposit detection
 * Usage: node manual-detect-sol-deposit.js [wallet_address]
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function triggerDetection(walletAddress) {
  console.log(`\n🔍 Triggering Solana deposit detection...\n`);

  if (walletAddress) {
    console.log(`   Checking specific wallet: ${walletAddress}\n`);
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-solana-deposits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
      return;
    }

    const result = await response.json();
    console.log('✅ Detection result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.data) {
      console.log(`\n📊 Summary:`);
      console.log(`   Wallets checked: ${result.data.checked}`);
      console.log(`   Deposits found: ${result.data.depositsFound}`);
      console.log(`   Deposits credited: ${result.data.depositsCredited}`);
      
      if (result.data.errors && result.data.errors.length > 0) {
        console.log(`\n⚠️ Errors:`);
        result.data.errors.forEach((err, i) => {
          console.log(`   ${i + 1}. ${err}`);
        });
      }

      if (result.data.balanceReconciliation && result.data.balanceReconciliation.length > 0) {
        console.log(`\n💰 Balance discrepancies:`);
        result.data.balanceReconciliation.forEach((item, i) => {
          console.log(`   ${i + 1}. Address: ${item.address}`);
          console.log(`      On-chain: ${item.onChainBalance} SOL`);
          console.log(`      Database: ${item.databaseBalance} SOL`);
          console.log(`      Difference: ${item.discrepancy} SOL`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

const walletAddress = process.argv[2];
triggerDetection(walletAddress).catch(console.error);



