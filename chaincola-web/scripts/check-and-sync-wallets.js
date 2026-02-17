/**
 * Script to check and sync wallets table with wallet_balances table
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndSyncWallets() {
  const userId = '108ff41d-42a0-41ca-97c9-c22d701dd280'; // jetway463@gmail.com

  console.log(`\n🔍 Checking wallets for user: ${userId}\n`);

  // Check wallet_balances table
  const { data: walletBalance, error: wbError } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  if (wbError && wbError.code !== 'PGRST116') {
    console.error('❌ Error fetching wallet_balances:', wbError);
    return;
  }

  const ngnBalance = walletBalance ? parseFloat(walletBalance.balance || '0') : 0;
  console.log(`💰 wallet_balances.NGN: ₦${ngnBalance.toFixed(2)}`);

  // Check wallets table
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (walletError && walletError.code !== 'PGRST116') {
    console.error('❌ Error fetching wallets:', walletError);
    return;
  }

  const walletNgnBalance = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
  console.log(`💰 wallets.ngn_balance: ₦${walletNgnBalance.toFixed(2)}`);

  // Sync wallets table with wallet_balances
  if (Math.abs(ngnBalance - walletNgnBalance) > 0.01) {
    console.log(`\n⚠️  Balance mismatch detected!`);
    console.log(`   wallet_balances: ₦${ngnBalance.toFixed(2)}`);
    console.log(`   wallets: ₦${walletNgnBalance.toFixed(2)}`);
    console.log(`   Difference: ₦${Math.abs(ngnBalance - walletNgnBalance).toFixed(2)}`);

    console.log(`\n🔧 Syncing wallets table with wallet_balances...`);

    if (wallet) {
      // Update existing wallet
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          ngn_balance: ngnBalance.toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error(`❌ Failed to update wallets table:`, updateError);
      } else {
        console.log(`✅ Updated wallets.ngn_balance to ₦${ngnBalance.toFixed(2)}`);
      }
    } else {
      // Create new wallet record
      const { error: insertError } = await supabase
        .from('wallets')
        .insert({
          user_id: userId,
          usd_balance: 0,
          ngn_balance: ngnBalance.toFixed(2),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error(`❌ Failed to create wallet record:`, insertError);
      } else {
        console.log(`✅ Created wallet record with ₦${ngnBalance.toFixed(2)}`);
      }
    }
  } else {
    console.log(`\n✅ Balances are in sync`);
  }

  // Verify final state
  console.log(`\n📊 Final State:`);
  const { data: finalWallet } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  const { data: finalBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  console.log(`   wallets.ngn_balance: ₦${finalWallet ? parseFloat(finalWallet.ngn_balance || '0').toFixed(2) : '0.00'}`);
  console.log(`   wallet_balances.NGN: ₦${finalBalance ? parseFloat(finalBalance.balance || '0').toFixed(2) : '0.00'}`);
}

checkAndSyncWallets()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


