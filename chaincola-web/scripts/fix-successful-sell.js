const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSuccessfulSell() {
  try {
    const userEmail = 'worldgistmedia14@gmail.com'; // User who reported the issue
    
    console.log(`🔍 Checking sells for user: ${userEmail}\n`);
    
    // Get user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === userEmail);
    
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    console.log(`✅ User ID: ${authUser.id}\n`);
    
    // Get recent SOL sell orders for this user
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', authUser.id)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No sell orders found');
      return;
    }
    
    console.log(`📋 Found ${sells.length} recent sell orders:\n`);
    
    // Get user's Solana wallet address
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', authUser.id)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .single();
    
    if (!wallet) {
      console.error('❌ Solana wallet not found');
      return;
    }
    
    console.log(`📍 Solana Address: ${wallet.address}\n`);
    
    // Check recent transactions on-chain
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                         process.env.ALCHEMY_SOLANA_URL ||
                         'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    console.log(`🔍 Checking recent on-chain transactions...\n`);
    
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
    
    console.log(`📋 Found ${signatures.length} recent on-chain transactions\n`);
    
    // Process each sell order
    for (const sell of sells) {
      console.log(`\n🔍 Processing Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`   Created: ${sell.created_at}`);
      
      // Check if this sell has a transaction hash
      let txHash = sell.sol_tx_hash;
      
      // If no hash, try to find matching transaction on-chain
      if (!txHash && sell.status !== 'QUOTED') {
        const solAmount = parseFloat(sell.sol_amount || '0');
        const lunoAddress = sell.metadata?.destination_address;
        
        if (lunoAddress) {
          console.log(`   🔍 Searching for transaction to ${lunoAddress}...`);
          
          // Check recent signatures for matching transaction
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
                      console.log(`   ✅ Found matching transaction!`);
                      console.log(`      Signature: ${sig.signature}`);
                      console.log(`      Amount: ${transferAmount} SOL`);
                      txHash = sig.signature;
                      break;
                    }
                  }
                }
              }
              
              if (txHash) break;
            } catch (err) {
              continue;
            }
          }
        }
      }
      
      // Check transactions in database
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', authUser.id)
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${txHash || 'none'}`)
        .order('created_at', { ascending: false });
      
      const failedTxs = transactions?.filter(tx => tx.status === 'FAILED' && tx.transaction_type === 'SELL') || [];
      const completedTxs = transactions?.filter(tx => tx.status === 'COMPLETED' && tx.transaction_type === 'SELL') || [];
      
      console.log(`   📋 Database transactions:`);
      console.log(`      Failed: ${failedTxs.length}`);
      console.log(`      Completed: ${completedTxs.length}`);
      
      // If we found a transaction hash and sell is not COMPLETED, update it
      if (txHash && sell.status !== 'COMPLETED' && sell.status !== 'SOLD_ON_LUNO') {
        console.log(`\n   🔧 Updating sell order to SOL_SENT...`);
        
        await supabase.from('sells').update({
          sol_tx_hash: txHash,
          status: 'SOL_SENT',
          updated_at: new Date().toISOString(),
        }).eq('sell_id', sell.sell_id);
        
        console.log(`   ✅ Updated sell order`);
        
        // Delete duplicate failed transactions (keep only one)
        if (failedTxs.length > 1) {
          console.log(`\n   🗑️ Removing ${failedTxs.length - 1} duplicate failed transactions...`);
          const txIdsToDelete = failedTxs.slice(1).map(tx => tx.id);
          await supabase.from('transactions').delete().in('id', txIdsToDelete);
          console.log(`   ✅ Removed duplicate transactions`);
        }
        
        // Try to execute the sell
        console.log(`\n   📡 Attempting to execute sell on Luno...`);
        const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
        
        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sell_id: sell.sell_id,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`   ❌ Error executing sell: ${response.status}`, errorText);
            
            // If execute fails, manually credit NGN
            console.log(`\n   💰 Manually crediting NGN...`);
            await manualCreditNGN(sell, parseFloat(sell.sol_amount));
          } else {
            const result = await response.json();
            console.log(`   ✅ Execute result:`, JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.error(`   ❌ Error calling execute-luno-sell:`, error.message);
          
          // Manually credit NGN
          console.log(`\n   💰 Manually crediting NGN...`);
          await manualCreditNGN(sell, parseFloat(sell.sol_amount));
        }
      } else if (completedTxs.length === 0 && sell.status === 'SOL_SENT') {
        // Sell is SOL_SENT but no completed transaction - try to execute
        console.log(`\n   📡 Sell is SOL_SENT but no completed transaction. Executing...`);
        const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
        
        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sell_id: sell.sell_id,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`   ❌ Error: ${response.status}`, errorText);
            await manualCreditNGN(sell, parseFloat(sell.sol_amount));
          } else {
            const result = await response.json();
            console.log(`   ✅ Result:`, JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.error(`   ❌ Error:`, error.message);
          await manualCreditNGN(sell, parseFloat(sell.sol_amount));
        }
      }
    }
    
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
    
    // Check if already credited
    const { data: existingNGNTx } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', sellOrder.user_id)
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .or(`metadata->>sell_id.eq.${sellOrder.sell_id},transaction_hash.eq.${sellOrder.sol_tx_hash || 'none'}`)
      .limit(1);
    
    if (existingNGNTx && existingNGNTx.length > 0) {
      console.log(`   ✅ NGN already credited: ₦${existingNGNTx[0].fiat_amount}`);
      return;
    }
    
    // Get current NGN balance
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
      transaction_hash: sellOrder.sol_tx_hash || null,
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
    
    console.log(`   ✅ NGN credited successfully!`);
    
  } catch (error) {
    console.error('❌ Error crediting NGN:', error);
  }
}

fixSuccessfulSell();


