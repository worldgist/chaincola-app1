/**
 * Script to reverse incorrect NGN credits for failed sell orders
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function reverseIncorrectCredits() {
  console.log('🔍 Finding incorrect NGN credits for failed sell orders...\n');

  // Get transactions that were created by the fix script for failed orders
  const { data: incorrectTxs, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_type', 'SELL')
    .not('fiat_amount', 'is', null)
    .like('metadata->>source', '%SELL_NGN_CREDIT%')
    .eq('metadata->>fixed', 'true')
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }

  console.log(`📊 Found ${incorrectTxs.length} transactions to check\n`);

  let reversed = 0;
  let skipped = 0;

  for (const tx of incorrectTxs) {
    const sellId = tx.metadata?.sell_id;
    if (!sellId) {
      console.log(`⚠️  Transaction ${tx.id} has no sell_id, skipping`);
      skipped++;
      continue;
    }

    // Check sell order status
    const { data: sellOrder, error: sellError } = await supabase
      .from('sells')
      .select('status, sol_amount, ngn_received')
      .eq('sell_id', sellId)
      .single();

    if (sellError || !sellOrder) {
      console.log(`⚠️  Could not find sell order ${sellId}, skipping`);
      skipped++;
      continue;
    }

    // Only reverse if order is not COMPLETED or SOLD_ON_LUNO
    if (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO') {
      console.log(`✅ Transaction ${tx.id} is for completed order, keeping`);
      skipped++;
      continue;
    }

    console.log(`\n📋 Reversing transaction for sell order: ${sellId}`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   NGN Amount: ${tx.fiat_amount}`);

    // Get current NGN balance
    const { data: ngnBalance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', tx.user_id)
      .eq('currency', 'NGN')
      .single();

    if (balanceError) {
      console.error(`   ❌ Error getting balance:`, balanceError);
      continue;
    }

    const currentBalance = parseFloat(ngnBalance.balance || '0');
    const creditAmount = parseFloat(tx.fiat_amount || '0');
    const newBalance = Math.max(0, currentBalance - creditAmount);

    console.log(`   Current balance: ${currentBalance.toFixed(2)}`);
    console.log(`   Reversing: -${creditAmount.toFixed(2)}`);
    console.log(`   New balance: ${newBalance.toFixed(2)}`);

    // Reverse the balance
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .update({ balance: newBalance.toFixed(2) })
      .eq('user_id', tx.user_id)
      .eq('currency', 'NGN');

    if (updateError) {
      console.error(`   ❌ Failed to reverse balance:`, updateError);
      continue;
    }

    // Delete the incorrect transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', tx.id);

    if (deleteError) {
      console.error(`   ❌ Failed to delete transaction:`, deleteError);
    } else {
      console.log(`   ✅ Transaction deleted`);
    }

    reversed++;
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Reversed: ${reversed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
}

reverseIncorrectCredits()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


