const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDuplicateFailedTransactions() {
  try {
    const userId = '2fbdf270-d641-403b-86e2-81a285d82e4a'; // worldgistmedia14@gmail.com
    
    console.log(`🔍 Checking for duplicate failed transactions...\n`);
    
    // Get all failed SELL transactions
    const { data: failedTxs, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'SELL')
      .eq('status', 'FAILED')
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false });
    
    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }
    
    if (!failedTxs || failedTxs.length === 0) {
      console.log('✅ No failed transactions found');
      return;
    }
    
    console.log(`📋 Found ${failedTxs.length} failed SELL transactions:\n`);
    
    // Group by sell_id
    const groupedBySellId = {};
    for (const tx of failedTxs) {
      const sellId = tx.metadata?.sell_id;
      if (sellId) {
        if (!groupedBySellId[sellId]) {
          groupedBySellId[sellId] = [];
        }
        groupedBySellId[sellId].push(tx);
      }
    }
    
    for (const [sellId, txs] of Object.entries(groupedBySellId)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Sell ID: ${sellId}`);
      console.log(`Failed Transactions: ${txs.length}`);
      
      if (txs.length > 1) {
        console.log(`⚠️ Found ${txs.length} failed transactions for the same sell!`);
        console.log(`   Keeping the first one, deleting duplicates...`);
        
        // Keep the first one, delete the rest
        for (let i = 1; i < txs.length; i++) {
          await supabase.from('transactions').delete().eq('id', txs[i].id);
          console.log(`   ✅ Deleted duplicate transaction: ${txs[i].id}`);
        }
      }
      
      // Get sell order
      const { data: sellOrder } = await supabase
        .from('sells')
        .select('*')
        .eq('sell_id', sellId)
        .single();
      
      if (!sellOrder) {
        console.log(`   ⚠️ Sell order not found`);
        continue;
      }
      
      console.log(`   Sell Status: ${sellOrder.status}`);
      console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
      
      // Check if there's a successful SEND transaction
      const { data: sendTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_type', 'SEND')
        .eq('crypto_currency', 'SOL')
        .eq('status', 'COMPLETED')
        .eq('crypto_amount', sellOrder.sol_amount)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (sendTx && sendTx.length > 0) {
        console.log(`\n   ✅ Found successful SEND transaction!`);
        console.log(`   Hash: ${sendTx[0].transaction_hash}`);
        console.log(`   Amount: ${sendTx[0].crypto_amount} SOL`);
        
        // Update sell order
        await supabase.from('sells').update({
          sol_tx_hash: sendTx[0].transaction_hash,
          status: 'SOL_SENT',
          metadata: {
            ...(sellOrder.metadata || {}),
            destination_address: sendTx[0].to_address,
          },
          updated_at: new Date().toISOString(),
        }).eq('sell_id', sellId);
        
        console.log(`   ✅ Updated sell order to SOL_SENT`);
        
        // Update failed transaction to PENDING
        if (txs.length > 0) {
          await supabase.from('transactions').update({
            status: 'PENDING',
            transaction_hash: sendTx[0].transaction_hash,
          }).eq('id', txs[0].id);
          console.log(`   ✅ Updated failed transaction to PENDING`);
        }
        
        // Try to execute the sell
        console.log(`\n   📡 Executing sell on Luno...`);
        const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
        
        const executeResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sell_id: sellId,
          }),
        });
        
        if (!executeResponse.ok) {
          const errorText = await executeResponse.text();
          console.error(`   ❌ Error executing sell: ${executeResponse.status}`, errorText);
          
          // Manual credit
          console.log(`\n   🔄 Attempting manual NGN credit...`);
          await manualCreditNGN(sellOrder, parseFloat(sellOrder.sol_amount), sendTx[0].transaction_hash);
        } else {
          const result = await executeResponse.json();
          console.log(`   ✅ Execute result:`, JSON.stringify(result, null, 2));
        }
      } else {
        console.log(`   ⚠️ No matching SEND transaction found`);
        console.log(`   This sell may have actually failed`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

async function manualCreditNGN(sellOrder, solAmount, txHash) {
  try {
    console.log(`\n💰 Manually crediting NGN...`);
    
    // Get SOL price
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=ngn');
    let solPriceNGN = 0;
    
    if (priceResponse.ok) {
      const priceData = await priceResponse.json();
      solPriceNGN = priceData.solana?.ngn || 0;
    }
    
    if (!solPriceNGN || solPriceNGN <= 0) {
      solPriceNGN = 0; // Use pricing engine
    }
    
    console.log(`   SOL Price: ₦${solPriceNGN.toFixed(2)}`);
    
    // Calculate NGN
    const totalNGN = solAmount * solPriceNGN;
    const platformFee = totalNGN * 0.03;
    const finalNGNPayout = totalNGN - platformFee;
    
    console.log(`   Total NGN: ₦${totalNGN.toFixed(2)}`);
    console.log(`   Platform Fee: ₦${platformFee.toFixed(2)}`);
    console.log(`   Final Payout: ₦${finalNGNPayout.toFixed(2)}\n`);
    
    // Use the shared credit function logic
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', sellOrder.user_id)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', sellOrder.user_id)
      .single();
    
    const balanceFromWalletBalances = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
    const balanceFromWallets = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
    const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
    const newNgnBalance = currentNgnBalance + finalNGNPayout;
    
    console.log(`   Current balance: ₦${currentNgnBalance.toFixed(2)}`);
    console.log(`   New balance: ₦${newNgnBalance.toFixed(2)}\n`);
    
    // Update wallet_balances
    await supabase
      .from('wallet_balances')
      .upsert({
        user_id: sellOrder.user_id,
        currency: 'NGN',
        balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });
    
    // Update wallets
    if (!wallet) {
      await supabase.from('wallets').insert({
        user_id: sellOrder.user_id,
        ngn_balance: newNgnBalance.toFixed(2),
        usd_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase.from('wallets').update({
        ngn_balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }).eq('user_id', sellOrder.user_id);
    }
    
    // Update sell order
    await supabase.from('sells').update({
      status: 'COMPLETED',
      sol_tx_hash: txHash,
      ngn_received: totalNGN.toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: solPriceNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        final_payout: finalNGNPayout.toFixed(2),
        source: 'manual-credit-fix',
      },
    }).eq('sell_id', sellOrder.sell_id);
    
    // Update existing transaction or create new one
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', sellOrder.user_id)
      .or(`metadata->>sell_id.eq.${sellOrder.sell_id},transaction_hash.eq.${txHash}`)
      .eq('transaction_type', 'SELL')
      .limit(1);
    
    if (existingTx && existingTx.length > 0) {
      await supabase.from('transactions').update({
        status: 'COMPLETED',
        fiat_amount: finalNGNPayout.toFixed(2),
        fiat_currency: 'NGN',
        fee_amount: platformFee.toFixed(2),
        fee_currency: 'NGN',
        transaction_hash: txHash,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(sellOrder.metadata || {}),
          sell_id: sellOrder.sell_id,
          ngn_received: finalNGNPayout.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          execution_price: solPriceNGN.toFixed(2),
          source: 'manual-credit-fix',
        },
      }).eq('id', existingTx[0].id);
    } else {
      await supabase.from('transactions').insert({
        user_id: sellOrder.user_id,
        transaction_type: 'SELL',
        crypto_currency: 'SOL',
        crypto_amount: solAmount.toString(),
        fiat_amount: finalNGNPayout.toFixed(2),
        fiat_currency: 'NGN',
        status: 'COMPLETED',
        fee_amount: platformFee.toFixed(2),
        fee_currency: 'NGN',
        transaction_hash: txHash,
        metadata: {
          sell_id: sellOrder.sell_id,
          total_ngn: totalNGN.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          execution_price: solPriceNGN.toFixed(2),
          source: 'manual-credit-fix',
        },
      });
    }
    
    console.log(`✅ NGN credited successfully!`);
    
  } catch (error) {
    console.error('❌ Error crediting NGN:', error);
  }
}

fixDuplicateFailedTransactions();

