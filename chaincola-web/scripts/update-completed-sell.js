/**
 * Script to update sell order to completed based on Luno transaction receipt
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateCompletedSell() {
  const sellId = '5beecd8b-a4d0-47df-add3-301eab958cd9';
  const txHash = '4RXSDUvsZ2eWwtUfKLFff32cWeoRM5EnDZyw2vmfaK4Do6Gt4DBxGNsYQbMV1WPxcwZvYkyNa9ZoaXTz9SJ59Rrq';

  console.log(`\n🔍 Updating sell order: ${sellId}\n`);

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

  console.log(`Current Status: ${sellOrder.status}`);
  console.log(`SOL Amount: ${sellOrder.sol_amount}`);
  console.log(`SOL TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}`);

  // Update sell order to SOL_SENT since we have confirmation
  console.log(`\n🔧 Updating sell order to SOL_SENT...`);
  const { error: updateError } = await supabase
    .from('sells')
    .update({
      sol_tx_hash: txHash,
      status: 'SOL_SENT',
      updated_at: new Date().toISOString(),
    })
    .eq('sell_id', sellId);

  if (updateError) {
    console.error('❌ Failed to update sell order:', updateError);
    return;
  }

  console.log(`✅ Updated sell order to SOL_SENT`);

  // Update transaction
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', sellOrder.user_id)
    .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${txHash}`)
    .order('created_at', { ascending: false });

  if (transactions && transactions.length > 0) {
    console.log(`\n📊 Found ${transactions.length} transaction(s)`);
    
    for (const tx of transactions) {
      console.log(`\nUpdating transaction: ${tx.id}`);
      console.log(`Current Status: ${tx.status}`);

      const { error: txUpdateError } = await supabase
        .from('transactions')
        .update({
          transaction_hash: txHash,
          status: 'PENDING', // Will be updated to COMPLETED when sell executes on Luno
          to_address: 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe',
        })
        .eq('id', tx.id);

      if (txUpdateError) {
        console.error(`❌ Failed to update transaction:`, txUpdateError);
      } else {
        console.log(`✅ Updated transaction with TX hash and status PENDING`);
      }
    }
  }

  console.log(`\n\n✅ Done!`);
  console.log(`\n📝 Next Steps:`);
  console.log(`   The sell order is now marked as SOL_SENT.`);
  console.log(`   The verify-sol-sell cron job will check Luno balance and execute the sell.`);
  console.log(`   Once the sell executes on Luno, the transaction will be updated to COMPLETED.`);
}

updateCompletedSell()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


