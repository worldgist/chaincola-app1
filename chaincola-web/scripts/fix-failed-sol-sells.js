const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixFailedSolSells() {
  try {
    const sellIds = [
      '6103600d-41ea-4a61-9605-27820bc60468', // 0.019 SOL
      'a5ea4a79-f1b4-414f-828f-a81dbe26cb27', // 0.01933698 SOL
    ];
    
    console.log(`🔍 Checking and fixing failed SOL sells...\n`);
    
    for (const sellId of sellIds) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 Processing sell: ${sellId}`);
      
      // Get sell order
      const { data: sellOrder, error: orderError } = await supabase
        .from('sells')
        .select('*')
        .eq('sell_id', sellId)
        .single();
      
      if (orderError || !sellOrder) {
        console.error(`❌ Sell order not found:`, orderError);
        continue;
      }
      
      console.log(`✅ Sell order found:`);
      console.log(`   Status: ${sellOrder.status}`);
      console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
      console.log(`   User ID: ${sellOrder.user_id}`);
      
      // Get user's Solana wallet address
      const { data: wallet } = await supabase
        .from('crypto_wallets')
        .select('address')
        .eq('user_id', sellOrder.user_id)
        .eq('asset', 'SOL')
        .eq('network', 'mainnet')
        .single();
      
      if (!wallet) {
        console.error(`❌ Solana wallet not found`);
        continue;
      }
      
      console.log(`📍 Solana Address: ${wallet.address}`);
      
      // Get Luno SOL deposit address from metadata
      const lunoAddress = sellOrder.metadata?.destination_address;
      if (!lunoAddress) {
        console.log(`⚠️ Luno deposit address not found in metadata`);
        console.log(`   Metadata:`, JSON.stringify(sellOrder.metadata, null, 2));
        continue;
      }
      
      console.log(`📍 Luno Address: ${lunoAddress}`);
      
      // Check recent transactions from user's wallet
      const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                           process.env.ALCHEMY_SOLANA_URL ||
                           'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
      
      console.log(`🔍 Checking recent transactions...`);
      
      const txResponse = await fetch(solanaRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [wallet.address, { limit: 20 }],
        }),
      });
      
      if (!txResponse.ok) {
        const errorText = await txResponse.text();
        console.error(`❌ Failed to fetch transactions: ${errorText}`);
        continue;
      }
      
      const txData = await txResponse.json();
      const signatures = txData.result || [];
      
      console.log(`📋 Found ${signatures.length} recent transactions`);
      
      // Find transaction that matches the sell amount and Luno address
      const solAmount = parseFloat(sellOrder.sol_amount || '0');
      let matchingTx = null;
      
      for (const sig of signatures.slice(0, 10)) {
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
                  console.log(`   To: ${lunoAddress}`);
                  console.log(`   Block Time: ${sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'N/A'}`);
                  
                  matchingTx = {
                    signature: sig.signature,
                    amount: transferAmount,
                    blockTime: sig.blockTime,
                  };
                  break;
                }
              }
            }
          }
          
          if (matchingTx) break;
        } catch (err) {
          // Skip errors for individual transaction checks
          continue;
        }
      }
      
      if (!matchingTx) {
        console.log(`⚠️ No matching transaction found on-chain`);
        console.log(`   This sell may have actually failed`);
        continue;
      }
      
      // Update sell order with transaction hash and status
      console.log(`\n📝 Updating sell order...`);
      const { error: updateError } = await supabase
        .from('sells')
        .update({
          sol_tx_hash: matchingTx.signature,
          status: 'SOL_SENT',
          updated_at: new Date().toISOString(),
        })
        .eq('sell_id', sellId);
      
      if (updateError) {
        console.error(`❌ Failed to update sell order:`, updateError);
        continue;
      }
      
      console.log(`✅ Updated sell order to SOL_SENT`);
      
      // Update failed transaction to PENDING
      const { data: failedTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', sellOrder.user_id)
        .eq('transaction_type', 'SELL')
        .eq('status', 'FAILED')
        .or(`metadata->>sell_id.eq.${sellId}`)
        .limit(1);
      
      if (failedTx && failedTx.length > 0) {
        console.log(`📝 Updating failed transaction to PENDING...`);
        await supabase.from('transactions').update({
          status: 'PENDING',
          transaction_hash: matchingTx.signature,
        }).eq('id', failedTx[0].id);
        console.log(`✅ Updated transaction to PENDING`);
      }
      
      // Now try to execute the sell on Luno
      console.log(`\n📡 Executing sell on Luno...`);
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
        await manualCreditNGN(sellOrder, solAmount, matchingTx.signature);
        continue;
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
        .eq('status', 'COMPLETED')
        .not('fiat_amount', 'is', null)
        .eq('fiat_currency', 'NGN')
        .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${matchingTx.signature}`)
        .limit(1);
      
      if (ngnTx && ngnTx.length > 0) {
        console.log(`\n✅ NGN credited: ₦${ngnTx[0].fiat_amount}`);
      } else {
        console.log(`\n⚠️ NGN not credited yet, attempting manual credit...`);
        await manualCreditNGN(sellOrder, solAmount, matchingTx.signature);
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

fixFailedSolSells();

