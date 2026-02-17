/**
 * Script to manually sync wallets table with wallet_balances
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncWallets() {
  const userId = '108ff41d-42a0-41ca-97c9-c22d701dd280';

  console.log(`\n🔍 Syncing wallets table for user: ${userId}\n`);

  // Get NGN balance from wallet_balances
  const { data: wbData, error: wbError } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  if (wbError) {
    console.error('❌ Error fetching wallet_balances:', wbError);
    return;
  }

  const ngnBalance = parseFloat(wbData.balance || '0');
  console.log(`💰 NGN Balance from wallet_balances: ₦${ngnBalance.toFixed(2)}`);

  // Check if wallet exists
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (walletError && walletError.code === 'PGRST116') {
    // Create wallet
    console.log(`\n🔧 Creating wallet record...`);
    const { error: createError } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        usd_balance: 0,
        ngn_balance: ngnBalance.toFixed(2),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (createError) {
      console.error(`❌ Failed to create wallet:`, createError);
    } else {
      console.log(`✅ Created wallet with NGN balance: ₦${ngnBalance.toFixed(2)}`);
    }
  } else if (!walletError && wallet) {
    // Update wallet
    console.log(`\n🔧 Updating wallet record...`);
    console.log(`   Current balance: ₦${parseFloat(wallet.ngn_balance || '0').toFixed(2)}`);
    console.log(`   New balance: ₦${ngnBalance.toFixed(2)}`);

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        ngn_balance: ngnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error(`❌ Failed to update wallet:`, updateError);
    } else {
      console.log(`✅ Updated wallet.ngn_balance to: ₦${ngnBalance.toFixed(2)}`);
    }
  } else {
    console.error(`❌ Error checking wallet:`, walletError);
  }

  // Verify
  const { data: finalWallet } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  console.log(`\n✅ Final wallet.ngn_balance: ₦${finalWallet ? parseFloat(finalWallet.ngn_balance || '0').toFixed(2) : '0.00'}`);
}

syncWallets()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


