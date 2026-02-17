/**
 * Script to fix pending sell transactions that should be completed
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixPendingTransactions(userEmail) {
  console.log(`\n🔍 Checking pending sell transactions for user: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError || !authUsers || !authUsers.users) {
    console.error('❌ Error listing users:', listError);
    return;
  }

  const authUser = authUsers.users.find(u => u.email === userEmail);
  if (!authUser) {
    console.error('❌ User not found in auth.users');
    return;
  }

  const userId = authUser.id;
  console.log(`✅ Found auth user: ${userEmail} (ID: ${userId})\n`);

  // Get all pending SELL transactions for SOL
  const { data: pendingTxs, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('transaction_type', 'SELL')
    .eq('crypto_currency', 'SOL')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }

  console.log(`📊 Found ${pendingTxs.length} pending SELL transactions:\n`);

  if (pendingTxs.length === 0) {
    console.log('✅ No pending transactions found');
    return;
  }

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const tx of pendingTxs) {
    const sellId = tx.metadata?.sell_id;
    if (!sellId) {
      console.log(`⚠️  Transaction ${tx.id} has no sell_id, skipping`);
      skipped++;
      continue;
    }

    console.log(`\n📋 Checking transaction: ${tx.id}`);
    console.log(`   Sell ID: ${sellId}`);
    console.log(`   SOL Amount: ${tx.crypto_amount}`);
    console.log(`   Status: ${tx.status}`);

    // Get the sell order
    const { data: sellOrder, error: sellError } = await supabase
      .from('sells')
      .select('*')
      .eq('sell_id', sellId)
      .single();

    if (sellError || !sellOrder) {
      console.log(`   ⚠️  Could not find sell order, skipping`);
      skipped++;
      continue;
    }

    console.log(`   Sell Order Status: ${sellOrder.status}`);
    console.log(`   NGN Received: ${sellOrder.ngn_received || 'N/A'}`);
    console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}`);

    // Determine correct status
    let newStatus = tx.status;
    let shouldUpdate = false;

    if (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO') {
      newStatus = 'COMPLETED';
      shouldUpdate = true;
      console.log(`   ✅ Should be COMPLETED`);
    } else if (sellOrder.status === 'SELL_FAILED' || sellOrder.status === 'EXPIRED') {
      newStatus = 'FAILED';
      shouldUpdate = true;
      console.log(`   ❌ Should be FAILED`);
    } else if (sellOrder.status === 'SOL_SENT' || sellOrder.status === 'SOL_CREDITED_ON_LUNO') {
      // Keep as PENDING if SOL is sent but not yet sold
      console.log(`   ⏳ Still pending (SOL sent but not sold yet)`);
      skipped++;
      continue;
    } else {
      console.log(`   ⏭️  Status matches sell order, no update needed`);
      skipped++;
      continue;
    }

    if (shouldUpdate) {
      // Update transaction status
      const updateData = {
        status: newStatus,
      };

      // Add fiat_amount if sell is completed
      if (newStatus === 'COMPLETED' && sellOrder.ngn_received) {
        const platformFee = parseFloat(sellOrder.ngn_received) * 0.03;
        const finalNgnPayout = parseFloat(sellOrder.ngn_received) - platformFee;
        updateData.fiat_amount = finalNgnPayout.toFixed(2);
        updateData.fiat_currency = 'NGN';
        updateData.fee_amount = platformFee.toFixed(2);
        updateData.fee_currency = 'NGN';
        updateData.external_order_id = sellOrder.luno_order_id || null;
        updateData.completed_at = sellOrder.completed_at || new Date().toISOString();
      }

      // Add error message if failed
      if (newStatus === 'FAILED') {
        updateData.error_message = sellOrder.metadata?.error || `Sell ${sellOrder.status.toLowerCase()}`;
      }

      // Update transaction hash if available
      if (sellOrder.sol_tx_hash && !tx.transaction_hash) {
        updateData.transaction_hash = sellOrder.sol_tx_hash;
      }

      const { error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', tx.id);

      if (updateError) {
        console.error(`   ❌ Failed to update transaction:`, updateError);
        errors++;
      } else {
        console.log(`   ✅ Updated to ${newStatus}`);
        fixed++;
      }
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
fixPendingTransactions(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


