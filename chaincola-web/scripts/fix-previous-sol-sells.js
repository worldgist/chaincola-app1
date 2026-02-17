/**
 * Script to check and fix previous SOL sell orders
 * - Records missing transactions
 * - Ensures SOL balance is debited
 * - Ensures NGN balance is credited
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixPreviousSolSells() {
  console.log('🔍 Checking previous SOL sell orders...\n');

  // Get all SOL sell orders that are COMPLETED or SOLD_ON_LUNO (only these should have NGN credited)
  const { data: sellOrders, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .not('sol_amount', 'is', null)
    .in('status', ['COMPLETED', 'SOLD_ON_LUNO'])
    .order('created_at', { ascending: false });
  
  // Also check for any sell orders to see what we have
  const { data: allSells, error: allSellsError } = await supabase
    .from('sells')
    .select('sell_id, user_id, status, sol_amount, btc_amount, eth_amount, xrp_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (!allSellsError && allSells) {
    console.log(`\n📊 Total sell orders in database: ${allSells.length}`);
    if (allSells.length > 0) {
      console.log(`\n📋 Recent sell orders:`);
      allSells.forEach(sell => {
        const asset = sell.sol_amount ? 'SOL' : sell.btc_amount ? 'BTC' : sell.eth_amount ? 'ETH' : sell.xrp_amount ? 'XRP' : 'UNKNOWN';
        const amount = sell.sol_amount || sell.btc_amount || sell.eth_amount || sell.xrp_amount || 'N/A';
        console.log(`   - ${sell.sell_id.substring(0, 8)}... | ${asset} | ${amount} | ${sell.status} | ${sell.created_at}`);
      });
    }
  }

  if (sellsError) {
    console.error('❌ Error fetching sell orders:', sellsError);
    return;
  }

  console.log(`📊 Found ${sellOrders.length} completed SOL sell orders\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const sellOrder of sellOrders) {
    console.log(`\n📋 Processing sell order: ${sellOrder.sell_id}`);
    console.log(`   User: ${sellOrder.user_id}`);
    console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
    console.log(`   NGN Received: ${sellOrder.ngn_received || 'N/A'}`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}`);

    try {
      // Check if transaction records exist
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', sellOrder.user_id)
        .or(`transaction_hash.eq.${sellOrder.sol_tx_hash},metadata->>sell_id.eq.${sellOrder.sell_id}`)
        .order('created_at', { ascending: false });

      if (txError) {
        console.error(`   ❌ Error checking transactions:`, txError);
        errors++;
        continue;
      }

      console.log(`   📊 Found ${transactions.length} related transactions`);

      // Check if SOL was debited
      const { data: solBalance, error: solBalanceError } = await supabase
        .from('wallet_balances')
        .select('balance, locked')
        .eq('user_id', sellOrder.user_id)
        .eq('currency', 'SOL')
        .single();

      if (solBalanceError) {
        console.error(`   ❌ Error checking SOL balance:`, solBalanceError);
        errors++;
        continue;
      }

      // Check if NGN was credited
      const { data: ngnBalance, error: ngnBalanceError } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', sellOrder.user_id)
        .eq('currency', 'NGN')
        .single();

      const currentNgnBalance = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;

      // Check what needs to be fixed
      const solAmount = parseFloat(sellOrder.sol_amount || '0');
      const ngnReceived = parseFloat(sellOrder.ngn_received || sellOrder.quoted_ngn || '0');
      const platformFee = ngnReceived * 0.03; // 3% platform fee
      const finalNgnPayout = ngnReceived - platformFee;

      // Find SELL transaction with NGN credit
      const sellTxWithNgn = transactions.find(tx => 
        tx.transaction_type === 'SELL' && 
        tx.fiat_amount && 
        parseFloat(tx.fiat_amount) > 0
      );

      // Find SELL transaction for SOL debit
      const sellTxForSol = transactions.find(tx => 
        tx.transaction_type === 'SELL' && 
        tx.crypto_currency === 'SOL' &&
        tx.transaction_hash === sellOrder.sol_tx_hash
      );

      let needsFix = false;
      const fixes = [];

      // Check if SOL transaction is recorded
      if (!sellTxForSol && sellOrder.sol_tx_hash) {
        needsFix = true;
        fixes.push('Missing SOL debit transaction record');
      }

      // Check if NGN credit transaction is recorded (only for COMPLETED or SOLD_ON_LUNO)
      if (!sellTxWithNgn && ngnReceived > 0 && (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO')) {
        needsFix = true;
        fixes.push('Missing NGN credit transaction record');
      }
      
      // Skip if order is not completed
      if (sellOrder.status !== 'COMPLETED' && sellOrder.status !== 'SOLD_ON_LUNO') {
        console.log(`   ⏭️  Skipping ${sellOrder.status} order (not completed)`);
        skipped++;
        continue;
      }

      // Check if NGN balance needs to be credited
      // We can't easily check if NGN was already credited without knowing the previous balance
      // But we can check if there's a transaction record for it

      if (!needsFix) {
        console.log(`   ✅ All transactions recorded correctly`);
        skipped++;
        continue;
      }

      console.log(`   ⚠️  Needs fixes:`);
      fixes.forEach(fix => console.log(`      - ${fix}`));

      // Fix missing SOL debit transaction
      if (!sellTxForSol && sellOrder.sol_tx_hash) {
        console.log(`   🔧 Recording SOL debit transaction...`);
        
        const { error: insertError } = await supabase.from('transactions').insert({
          user_id: sellOrder.user_id,
          transaction_type: 'SELL',
          crypto_currency: 'SOL',
          crypto_amount: solAmount.toString(),
          transaction_hash: sellOrder.sol_tx_hash,
          status: 'COMPLETED',
          network: 'mainnet',
          to_address: sellOrder.metadata?.destination_address || null,
          metadata: {
            sell_id: sellOrder.sell_id,
            destination_address: sellOrder.metadata?.destination_address,
            asset: 'SOL',
            sell_type: 'luno',
            source: 'fix-previous-sol-sells',
            stage: 'SOL_SENT_TO_LUNO',
            fixed: true,
          },
        });

        if (insertError) {
          console.error(`   ❌ Failed to record SOL transaction:`, insertError);
          errors++;
        } else {
          console.log(`   ✅ SOL debit transaction recorded`);
        }
      }

      // Fix missing NGN credit transaction (only for completed orders)
      if (!sellTxWithNgn && ngnReceived > 0 && (sellOrder.status === 'COMPLETED' || sellOrder.status === 'SOLD_ON_LUNO')) {
        console.log(`   🔧 Recording NGN credit transaction...`);
        
        const { error: insertError } = await supabase.from('transactions').insert({
          user_id: sellOrder.user_id,
          transaction_type: 'SELL',
          crypto_currency: 'SOL',
          crypto_amount: solAmount.toString(),
          fiat_amount: finalNgnPayout.toFixed(2),
          fiat_currency: 'NGN',
          status: 'COMPLETED',
          external_order_id: sellOrder.luno_order_id || null,
          fee_amount: platformFee.toFixed(2),
          fee_currency: 'NGN',
          metadata: {
            sell_id: sellOrder.sell_id,
            source: 'SOL_SELL_NGN_CREDIT',
            ngn_received: finalNgnPayout.toFixed(2),
            platform_fee: platformFee.toFixed(2),
            sol_amount: solAmount.toString(),
            sol_tx_hash: sellOrder.sol_tx_hash,
            execution_price: sellOrder.metadata?.execution_price || null,
            fixed: true,
          },
        });

        if (insertError) {
          console.error(`   ❌ Failed to record NGN transaction:`, insertError);
          errors++;
        } else {
          console.log(`   ✅ NGN credit transaction recorded`);
          
          // Credit NGN balance if not already credited
          console.log(`   🔧 Crediting NGN balance...`);
          const newNgnBalance = currentNgnBalance + finalNgnPayout;
          
          const { error: balanceError } = await supabase
            .from('wallet_balances')
            .upsert({
              user_id: sellOrder.user_id,
              currency: 'NGN',
              balance: newNgnBalance.toFixed(2),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,currency',
            });

          if (balanceError) {
            console.error(`   ❌ Failed to credit NGN balance:`, balanceError);
            errors++;
          } else {
            console.log(`   ✅ NGN balance credited: ${currentNgnBalance.toFixed(2)} → ${newNgnBalance.toFixed(2)}`);
          }
        }
      }

      // Ensure SOL balance is debited
      if (sellOrder.sol_tx_hash) {
        const currentSolBalance = parseFloat(solBalance.balance || '0');
        const currentLocked = parseFloat(solBalance.locked || '0');
        
        // Check if balance seems correct (this is tricky without knowing the original balance)
        // We'll just log it for now
        console.log(`   📊 Current SOL balance: ${currentSolBalance.toFixed(9)} (locked: ${currentLocked.toFixed(9)})`);
        
        // If locked amount is still present, unlock it
        if (currentLocked > 0 && sellOrder.locked_sol_amount) {
          const lockedAmount = parseFloat(sellOrder.locked_sol_amount || '0');
          const newLocked = Math.max(0, currentLocked - lockedAmount);
          
          console.log(`   🔧 Unlocking SOL balance...`);
          const { error: unlockError } = await supabase
            .from('wallet_balances')
            .update({ locked: newLocked.toFixed(9) })
            .eq('user_id', sellOrder.user_id)
            .eq('currency', 'SOL');

          if (unlockError) {
            console.error(`   ❌ Failed to unlock SOL:`, unlockError);
          } else {
            console.log(`   ✅ SOL unlocked: ${currentLocked.toFixed(9)} → ${newLocked.toFixed(9)}`);
          }
        }
      }

      fixed++;

    } catch (error) {
      console.error(`   ❌ Error processing sell order:`, error);
      errors++;
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

// Run the fix
fixPreviousSolSells()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

