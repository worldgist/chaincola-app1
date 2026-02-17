/**
 * Script to check and update sell order based on Luno transaction receipt
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLunoTransaction(txHash, solAmount) {
  console.log(`\n🔍 Checking transaction: ${txHash}\n`);
  console.log(`   SOL Amount: ${solAmount}\n`);

  // Search for sell orders with this transaction hash or amount
  const { data: sellOrders, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', '108ff41d-42a0-41ca-97c9-c22d701dd280') // jetway463@gmail.com
    .or(`sol_tx_hash.eq.${txHash},sol_amount.eq.${solAmount}`)
    .order('created_at', { ascending: false });

  if (sellsError) {
    console.error('❌ Error fetching sell orders:', sellsError);
    return;
  }

  console.log(`📊 Found ${sellOrders.length} matching sell order(s)\n`);

  if (sellOrders.length === 0) {
    // Try searching by amount only (with tolerance)
    const amountFloat = parseFloat(solAmount);
    const { data: allSells } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', '108ff41d-42a0-41ca-97c9-c22d701dd280')
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false });

    if (allSells) {
      console.log(`\n🔍 Searching by amount (${solAmount})...\n`);
      const matchingSells = allSells.filter(sell => {
        const sellAmount = parseFloat(sell.sol_amount);
        return Math.abs(sellAmount - amountFloat) < 0.0001; // Small tolerance
      });

      if (matchingSells.length > 0) {
        console.log(`📊 Found ${matchingSells.length} sell order(s) with matching amount:\n`);
        for (const sell of matchingSells) {
          console.log(`   Sell ID: ${sell.sell_id}`);
          console.log(`   Status: ${sell.status}`);
          console.log(`   SOL Amount: ${sell.sol_amount}`);
          console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
          console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
          console.log(`   Created: ${sell.created_at}\n`);

          // Update if not completed
          if (sell.status !== 'COMPLETED' && sell.status !== 'SOLD_ON_LUNO') {
            console.log(`   🔧 Updating sell order...`);
            
            // Update sell order with transaction hash
            supabase.from('sells').update({
              sol_tx_hash: txHash,
              status: 'SOL_SENT', // Mark as sent since we have the TX hash
              updated_at: new Date().toISOString(),
            }).eq('sell_id', sell.sell_id).then(({ error }) => {
              if (error) {
                console.error(`   ❌ Failed to update sell order:`, error);
              } else {
                console.log(`   ✅ Updated sell order to SOL_SENT`);
              }
            });

            // Update or create transaction
            const { data: existingTx } = await supabase
              .from('transactions')
              .select('id')
              .eq('user_id', sell.user_id)
              .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${txHash}`)
              .limit(1);

            if (existingTx && existingTx.length > 0) {
              // Update existing transaction
              const { error: updateTxError } = await supabase.from('transactions').update({
                transaction_hash: txHash,
                status: 'PENDING', // Will be updated to COMPLETED when sell executes
                to_address: 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe', // Luno address
              }).eq('id', existingTx[0].id);

              if (updateTxError) {
                console.error(`   ❌ Failed to update transaction:`, updateTxError);
              } else {
                console.log(`   ✅ Updated transaction with TX hash`);
              }
            } else {
              // Create new transaction
              const { error: insertTxError } = await supabase.from('transactions').insert({
                user_id: sell.user_id,
                transaction_type: 'SELL',
                crypto_currency: 'SOL',
                crypto_amount: sell.sol_amount,
                transaction_hash: txHash,
                status: 'PENDING',
                network: 'mainnet',
                to_address: 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe',
                metadata: {
                  sell_id: sell.sell_id,
                  asset: 'SOL',
                  sell_type: 'luno',
                  source: 'luno-transaction-receipt',
                },
              });

              if (insertTxError) {
                console.error(`   ❌ Failed to create transaction:`, insertTxError);
              } else {
                console.log(`   ✅ Created transaction record`);
              }
            }
          }
        }
      } else {
        console.log(`❌ No matching sell orders found`);
      }
    }
    return;
  }

  // Process matching sell orders
  for (const sell of sellOrders) {
    console.log(`📋 Sell Order: ${sell.sell_id}`);
    console.log(`   Status: ${sell.status}`);
    console.log(`   SOL Amount: ${sell.sol_amount}`);
    console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
    console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);

    // Update sell order with transaction hash if missing
    if (!sell.sol_tx_hash) {
      console.log(`   🔧 Adding transaction hash to sell order...`);
      const { error: updateError } = await supabase
        .from('sells')
        .update({
          sol_tx_hash: txHash,
          updated_at: new Date().toISOString(),
        })
        .eq('sell_id', sell.sell_id);

      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError);
      } else {
        console.log(`   ✅ Updated sell order with TX hash`);
      }
    }

    // Update transaction status
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', sell.user_id)
      .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${txHash}`)
      .order('created_at', { ascending: false });

    if (transactions && transactions.length > 0) {
      console.log(`   📊 Found ${transactions.length} related transaction(s)`);
      
      transactions.forEach(tx => {
        if (tx.status === 'PENDING' && (sell.status === 'COMPLETED' || sell.status === 'SOLD_ON_LUNO')) {
          console.log(`   🔧 Updating transaction ${tx.id} to COMPLETED...`);
          
          const platformFee = parseFloat(sell.ngn_received || '0') * 0.03;
          const finalNgnPayout = parseFloat(sell.ngn_received || '0') - platformFee;

          supabase.from('transactions').update({
            status: 'COMPLETED',
            fiat_amount: finalNgnPayout > 0 ? finalNgnPayout.toFixed(2) : null,
            fiat_currency: finalNgnPayout > 0 ? 'NGN' : null,
            fee_amount: finalNgnPayout > 0 ? platformFee.toFixed(2) : null,
            fee_currency: finalNgnPayout > 0 ? 'NGN' : null,
            external_order_id: sell.luno_order_id || null,
            completed_at: sell.completed_at || new Date().toISOString(),
            transaction_hash: txHash,
          }).eq('id', tx.id).then(({ error }) => {
            if (error) {
              console.error(`   ❌ Failed to update:`, error);
            } else {
              console.log(`   ✅ Updated transaction to COMPLETED`);
            }
          });
        }
      });
    }
  }
}

// Transaction details from the receipt
const txHash = '4RXSDUvsZ2eWwtUfKLFff32cWeoRM5EnDZyw2vmfaK4Do6Gt4DBxGNsYQbMV1WPxcwZvYkyNa9ZoaXTz9SJ59Rrq';
const solAmount = '0.00940000';

checkLunoTransaction(txHash, solAmount)
  .then(() => {
    console.log('\n✅ Done!');
    setTimeout(() => process.exit(0), 3000);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

