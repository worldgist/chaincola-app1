/**
 * Script to credit NGN for a completed sell order
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function creditNgnForSell() {
  const sellId = '5beecd8b-a4d0-47df-add3-301eab958cd9';
  const userId = '108ff41d-42a0-41ca-97c9-c22d701dd280'; // jetway463@gmail.com

  console.log(`\n🔍 Checking sell order: ${sellId}\n`);

  // Get sell order
  const { data: sellOrder, error: sellError } = await supabase
    .from('sells')
    .select('*')
    .eq('sell_id', sellId)
    .single();

  if (sellError || !sellOrder) {
    console.error('❌ Error fetching sell order:', sellError);
    return;
  }

  console.log(`Sell Order Status: ${sellOrder.status}`);
  console.log(`SOL Amount: ${sellOrder.sol_amount}`);
  console.log(`NGN Received: ${sellOrder.ngn_received || 'N/A'}`);
  console.log(`Quoted NGN: ${sellOrder.quoted_ngn || 'N/A'}`);
  console.log(`Luno Order ID: ${sellOrder.luno_order_id || 'N/A'}`);

  // Get current NGN balance
  const { data: ngnBalance, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  const currentNgnBalance = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
  console.log(`\n💰 Current NGN Balance: ${currentNgnBalance.toFixed(2)}`);

  // Calculate NGN to credit
  // If sell is completed, use ngn_received, otherwise use quoted_ngn
  let ngnReceived = 0;
  if (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO') {
    ngnReceived = parseFloat(sellOrder.ngn_received || '0');
  } else {
    // Use quoted amount as estimate
    ngnReceived = parseFloat(sellOrder.quoted_ngn || '0');
  }

  if (ngnReceived <= 0) {
    console.log(`\n⚠️  No NGN amount found. Using quoted amount as estimate...`);
    ngnReceived = parseFloat(sellOrder.quoted_ngn || '0');
  }

  if (ngnReceived <= 0) {
    console.error(`\n❌ Cannot determine NGN amount to credit`);
    console.log(`   Please provide the NGN amount received from Luno`);
    return;
  }

  // Calculate platform fee (3%)
  const platformFee = ngnReceived * 0.03;
  const finalNgnPayout = ngnReceived - platformFee;

  console.log(`\n📊 NGN Calculation:`);
  console.log(`   Total Received: ₦${ngnReceived.toFixed(2)}`);
  console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
  console.log(`   Final Payout: ₦${finalNgnPayout.toFixed(2)}`);

  // Credit NGN balance
  const newNgnBalance = currentNgnBalance + finalNgnPayout;
  console.log(`\n🔧 Crediting NGN balance...`);
  console.log(`   Current: ₦${currentNgnBalance.toFixed(2)}`);
  console.log(`   Adding: ₦${finalNgnPayout.toFixed(2)}`);
  console.log(`   New Balance: ₦${newNgnBalance.toFixed(2)}`);

  const { error: creditError } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: userId,
      currency: 'NGN',
      balance: newNgnBalance.toFixed(2),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });

  if (creditError) {
    console.error(`❌ Failed to credit NGN:`, creditError);
    return;
  }

  console.log(`✅ NGN balance credited successfully`);

  // Update sell order to COMPLETED if not already
  if (sellOrder.status !== 'COMPLETED') {
    console.log(`\n🔧 Updating sell order to COMPLETED...`);
    const { error: updateError } = await supabase
      .from('sells')
      .update({
        status: 'COMPLETED',
        ngn_received: ngnReceived.toFixed(2),
        completed_at: new Date().toISOString(),
        profit: (finalNgnPayout - parseFloat(sellOrder.quoted_ngn || '0')).toFixed(2),
      })
      .eq('sell_id', sellId);

    if (updateError) {
      console.error(`⚠️  Failed to update sell order:`, updateError);
    } else {
      console.log(`✅ Sell order updated to COMPLETED`);
    }
  }

  // Update transaction to COMPLETED
  console.log(`\n🔧 Updating transaction to COMPLETED...`);
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${sellOrder.sol_tx_hash || 'none'}`)
    .order('created_at', { ascending: false });

  if (transactions && transactions.length > 0) {
    for (const tx of transactions) {
      if (tx.status !== 'COMPLETED') {
        const { error: txUpdateError } = await supabase
          .from('transactions')
          .update({
            status: 'COMPLETED',
            fiat_amount: finalNgnPayout.toFixed(2),
            fiat_currency: 'NGN',
            fee_amount: platformFee.toFixed(2),
            fee_currency: 'NGN',
            external_order_id: sellOrder.luno_order_id || null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', tx.id);

        if (txUpdateError) {
          console.error(`⚠️  Failed to update transaction:`, txUpdateError);
        } else {
          console.log(`✅ Transaction ${tx.id.substring(0, 8)}... updated to COMPLETED`);
        }
      }
    }
  }

  // Create NGN credit transaction record
  console.log(`\n🔧 Creating NGN credit transaction record...`);
  const { error: ngnTxError } = await supabase.from('transactions').insert({
    user_id: userId,
    transaction_type: 'SELL',
    crypto_currency: 'SOL',
    crypto_amount: sellOrder.sol_amount,
    fiat_amount: finalNgnPayout.toFixed(2),
    fiat_currency: 'NGN',
    status: 'COMPLETED',
    external_order_id: sellOrder.luno_order_id || null,
    fee_amount: platformFee.toFixed(2),
    fee_currency: 'NGN',
    completed_at: new Date().toISOString(),
    metadata: {
      sell_id: sellId,
      source: 'SOL_SELL_NGN_CREDIT_MANUAL',
      ngn_received: finalNgnPayout.toFixed(2),
      platform_fee: platformFee.toFixed(2),
      sol_amount: sellOrder.sol_amount,
      sol_tx_hash: sellOrder.sol_tx_hash,
    },
  });

  if (ngnTxError) {
    console.error(`⚠️  Failed to create NGN credit transaction:`, ngnTxError);
  } else {
    console.log(`✅ NGN credit transaction recorded`);
  }

  console.log(`\n\n✅ Done!`);
  console.log(`\n📊 Summary:`);
  console.log(`   NGN Credited: ₦${finalNgnPayout.toFixed(2)}`);
  console.log(`   Platform Fee: ₦${platformFee.toFixed(2)}`);
  console.log(`   New Balance: ₦${newNgnBalance.toFixed(2)}`);
}

creditNgnForSell()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


