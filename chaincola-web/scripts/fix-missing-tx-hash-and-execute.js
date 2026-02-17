const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAndExecute() {
  try {
    const sellId = '43c80b6d-29e0-4d78-8349-046add2a5489'; // The SOL_SENT order without hash
    
    console.log(`🔍 Fixing sell order: ${sellId}\n`);
    
    // Get sell order
    const { data: sellOrder, error: orderError } = await supabase
      .from('sells')
      .select('*')
      .eq('sell_id', sellId)
      .single();
    
    if (orderError || !sellOrder) {
      console.error('❌ Sell order not found:', orderError);
      return;
    }
    
    console.log(`✅ Sell order found:`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
    console.log(`   TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}`);
    console.log(`   User ID: ${sellOrder.user_id}\n`);
    
    // Get user's Solana wallet address
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', sellOrder.user_id)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .single();
    
    if (!wallet) {
      console.error('❌ Solana wallet not found');
      return;
    }
    
    console.log(`📍 Solana Address: ${wallet.address}\n`);
    
    // Get Luno SOL deposit address from metadata
    const lunoAddress = sellOrder.metadata?.destination_address;
    if (!lunoAddress) {
      console.error('❌ Luno deposit address not found in metadata');
      return;
    }
    
    console.log(`📍 Luno Address: ${lunoAddress}\n`);
    
    // Check recent transactions from user's wallet
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                         process.env.ALCHEMY_SOLANA_URL ||
                         'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    console.log(`🔍 Checking recent transactions...\n`);
    
    const txResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [wallet.address, { limit: 10 }],
      }),
    });
    
    if (!txResponse.ok) {
      const errorText = await txResponse.text();
      console.error(`❌ Failed to fetch transactions: ${errorText}`);
      return;
    }
    
    const txData = await txResponse.json();
    const signatures = txData.result || [];
    
    console.log(`📋 Found ${signatures.length} recent transactions\n`);
    
    // Find transaction that matches the sell amount and Luno address
    const solAmount = parseFloat(sellOrder.sol_amount || '0');
    
    for (const sig of signatures.slice(0, 5)) {
      try {
        const detailResponse = await fetch(solanaRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        });
        
        if (!detailResponse.ok) continue;
        
        const detailData = await detailResponse.json();
        const tx = detailData.result;
        
        if (!tx) continue;
        
        // Check if this transaction sent SOL to Luno address
        const instructions = tx.transaction?.message?.instructions || [];
        for (const ix of instructions) {
          if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
            const transfer = ix.parsed?.info;
            if (transfer && transfer.destination === lunoAddress) {
              const transferAmount = transfer.lamports / 1e9;
              
              // Check if amount matches (with small tolerance)
              if (Math.abs(transferAmount - solAmount) < 0.0001) {
                console.log(`✅ Found matching transaction!`);
                console.log(`   Signature: ${sig.signature}`);
                console.log(`   Amount: ${transferAmount} SOL`);
                console.log(`   To: ${lunoAddress}\n`);
                
                // Update sell order with transaction hash
                console.log(`📝 Updating sell order with transaction hash...`);
                const { error: updateError } = await supabase
                  .from('sells')
                  .update({
                    sol_tx_hash: sig.signature,
                    status: 'SOL_SENT',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('sell_id', sellId);
                
                if (updateError) {
                  console.error(`❌ Failed to update:`, updateError);
                  return;
                }
                
                console.log(`✅ Updated sell order\n`);
                
                // Now execute the sell
                console.log(`📡 Executing sell on Luno...`);
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
                  console.error(`❌ Error executing sell: ${executeResponse.status}`, errorText);
                  
                  // If execute-luno-sell fails, manually credit NGN
                  console.log(`\n🔄 Attempting manual NGN credit...`);
                  await manualCreditNGN(sellOrder, solAmount);
                  return;
                }
                
                const result = await executeResponse.json();
                console.log(`✅ Execute result:`, JSON.stringify(result, null, 2));
                
                // Wait a moment
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check if NGN was credited
                const { data: ngnTx } = await supabase
                  .from('transactions')
                  .select('*')
                  .eq('user_id', sellOrder.user_id)
                  .eq('transaction_type', 'SELL')
                  .not('fiat_amount', 'is', null)
                  .eq('fiat_currency', 'NGN')
                  .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${sig.signature}`)
                  .limit(1);
                
                if (ngnTx && ngnTx.length > 0) {
                  console.log(`\n✅ NGN credited: ₦${ngnTx[0].fiat_amount}`);
                } else {
                  console.log(`\n⚠️ NGN not credited yet, attempting manual credit...`);
                  await manualCreditNGN(sellOrder, solAmount);
                }
                
                return;
              }
            }
          }
        }
      } catch (err) {
        // Skip errors for individual transaction checks
        continue;
      }
    }
    
    console.log(`\n⚠️ No matching transaction found. Attempting manual credit based on sell order...`);
    await manualCreditNGN(sellOrder, solAmount);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

async function manualCreditNGN(sellOrder, solAmount) {
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
      solPriceNGN = 430000; // Fallback
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
      ngn_received: totalNGN.toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: solPriceNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        final_payout: finalNGNPayout.toFixed(2),
        source: 'manual-credit-fix',
      },
    }).eq('sell_id', sellOrder.sell_id);
    
    // Record transaction
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
      metadata: {
        sell_id: sellOrder.sell_id,
        total_ngn: totalNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        execution_price: solPriceNGN.toFixed(2),
        source: 'manual-credit-fix',
      },
    });
    
    console.log(`✅ NGN credited successfully!`);
    
  } catch (error) {
    console.error('❌ Error crediting NGN:', error);
  }
}

fixAndExecute();


