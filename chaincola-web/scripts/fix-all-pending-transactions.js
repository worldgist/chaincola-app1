/**
 * Script to fix ALL pending transactions by checking their sell order status
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAllPending(userEmail) {
  console.log(`\n🔍 Fixing all pending transactions for: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const authUser = authUsers.users.find(u => u.email === userEmail);
  if (!authUser) {
    console.error('❌ User not found');
    return;
  }

  const userId = authUser.id;

  // Get ALL pending transactions
  const { data: pendingTxs, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('❌ Error:', txError);
    return;
  }

  console.log(`📊 Found ${pendingTxs.length} pending transactions\n`);

  let fixed = 0;
  let skipped = 0;

  for (const tx of pendingTxs) {
    console.log(`\n📋 Transaction: ${tx.id.substring(0, 8)}...`);
    console.log(`   Type: ${tx.transaction_type}`);
    console.log(`   Currency: ${tx.crypto_currency}`);
    console.log(`   Amount: ${tx.crypto_amount}`);
    
    // Only process SELL transactions
    if (tx.transaction_type !== 'SELL' || tx.crypto_currency !== 'SOL') {
      console.log(`   ⏭️  Skipping (not a SOL SELL transaction)`);
      skipped++;
      continue;
    }

    const sellId = tx.metadata?.sell_id;
    if (!sellId) {
      console.log(`   ⚠️  No sell_id in metadata`);
      skipped++;
      continue;
    }

    // Get sell order
    const { data: sellOrder, error: sellError } = await supabase
      .from('sells')
      .select('*')
      .eq('sell_id', sellId)
      .single();

    if (sellError || !sellOrder) {
      console.log(`   ⚠️  Sell order not found`);
      skipped++;
      continue;
    }

    console.log(`   Sell Status: ${sellOrder.status}`);
    console.log(`   NGN Received: ${sellOrder.ngn_received || 'N/A'}`);

    // Update based on sell order status
    if (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO') {
      const platformFee = parseFloat(sellOrder.ngn_received || '0') * 0.03;
      const finalNgnPayout = parseFloat(sellOrder.ngn_received || '0') - platformFee;

      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          fiat_amount: finalNgnPayout > 0 ? finalNgnPayout.toFixed(2) : null,
          fiat_currency: finalNgnPayout > 0 ? 'NGN' : null,
          fee_amount: finalNgnPayout > 0 ? platformFee.toFixed(2) : null,
          fee_currency: finalNgnPayout > 0 ? 'NGN' : null,
          external_order_id: sellOrder.luno_order_id || null,
          completed_at: sellOrder.completed_at || new Date().toISOString(),
          transaction_hash: sellOrder.sol_tx_hash || tx.transaction_hash || null,
        })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError);
      } else {
        console.log(`   ✅ Updated to COMPLETED`);
        fixed++;
      }
    } else if (sellOrder.status === 'SELL_FAILED' || sellOrder.status === 'EXPIRED') {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'FAILED',
          error_message: sellOrder.metadata?.error || `Sell ${sellOrder.status.toLowerCase()}`,
        })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError);
      } else {
        console.log(`   ✅ Updated to FAILED`);
        fixed++;
      }
    } else {
      console.log(`   ⏭️  Status matches (${sellOrder.status}), keeping as PENDING`);
      skipped++;
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
fixAllPending(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


