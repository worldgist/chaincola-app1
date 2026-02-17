/**
 * Script to record missing transactions for existing sell orders
 * This will create transaction records for sell orders so users can see them in their history
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function recordMissingTransactions(userEmail) {
  console.log(`\n🔍 Recording missing transactions for user: ${userEmail}\n`);

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

  // Get all SOL sell orders for this user
  const { data: sellOrders, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', userId)
    .not('sol_amount', 'is', null)
    .order('created_at', { ascending: false });

  if (sellsError) {
    console.error('❌ Error fetching sell orders:', sellsError);
    return;
  }

  console.log(`📊 Found ${sellOrders.length} SOL sell orders\n`);

  let recorded = 0;
  let skipped = 0;
  let errors = 0;

  for (const sellOrder of sellOrders) {
    console.log(`\n📋 Processing sell order: ${sellOrder.sell_id.substring(0, 8)}...`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
    console.log(`   Created: ${sellOrder.created_at}`);

    // Check if transaction already exists
    const { data: existingTxs, error: txCheckError } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .or(`metadata->>sell_id.eq.${sellOrder.sell_id},transaction_hash.eq.${sellOrder.sol_tx_hash || 'none'}`)
      .limit(1);

    if (txCheckError) {
      console.error(`   ❌ Error checking transactions:`, txCheckError);
      errors++;
      continue;
    }

    if (existingTxs && existingTxs.length > 0) {
      console.log(`   ⏭️  Transaction already exists, skipping`);
      skipped++;
      continue;
    }

    // Determine transaction status based on sell order status
    let txStatus = 'PENDING';
    let errorMessage = null;

    if (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO') {
      txStatus = 'COMPLETED';
    } else if (sellOrder.status === 'SELL_FAILED' || sellOrder.status === 'EXPIRED') {
      txStatus = 'FAILED';
      errorMessage = sellOrder.metadata?.error || `Sell ${sellOrder.status.toLowerCase()}`;
    } else if (sellOrder.status === 'SOL_SENT' || sellOrder.status === 'SOL_CREDITED_ON_LUNO') {
      txStatus = 'PENDING';
    } else if (sellOrder.status === 'QUOTED') {
      txStatus = 'PENDING';
    }

    // Record transaction
    try {
      const txData = {
        user_id: userId,
        transaction_type: 'SELL',
        crypto_currency: 'SOL',
        crypto_amount: parseFloat(sellOrder.sol_amount).toString(),
        status: txStatus,
        network: 'mainnet',
        transaction_hash: sellOrder.sol_tx_hash || null,
        to_address: sellOrder.metadata?.destination_address || null,
        external_order_id: sellOrder.luno_order_id || null,
        fiat_amount: sellOrder.ngn_received ? parseFloat(sellOrder.ngn_received).toString() : null,
        fiat_currency: sellOrder.ngn_received ? 'NGN' : null,
        error_message: errorMessage,
        metadata: {
          sell_id: sellOrder.sell_id,
          asset: 'SOL',
          sell_type: 'luno',
          source: 'record-missing-sell-transactions',
          stage: sellOrder.status,
          quoted_ngn: sellOrder.quoted_ngn || null,
          ngn_received: sellOrder.ngn_received || null,
        },
        created_at: sellOrder.created_at, // Use sell order creation time
      };

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(txData);

      if (insertError) {
        console.error(`   ❌ Failed to record transaction:`, insertError);
        errors++;
      } else {
        console.log(`   ✅ Transaction recorded (Status: ${txStatus})`);
        recorded++;
      }
    } catch (error) {
      console.error(`   ❌ Error recording transaction:`, error);
      errors++;
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Recorded: ${recorded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
recordMissingTransactions(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


