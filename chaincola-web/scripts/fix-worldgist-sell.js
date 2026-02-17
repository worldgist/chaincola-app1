const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixWorldgistSell() {
  try {
    const userEmail = 'worldgistmedia14@gmail.com';
    
    console.log(`🔍 Fixing sells for user: ${userEmail}\n`);
    
    // Get user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === userEmail);
    
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    console.log(`✅ User ID: ${authUser.id}\n`);
    
    // Get recent SOL sell orders (last 3)
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', authUser.id)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    console.log(`📋 Found ${sells.length} recent sell orders:\n`);
    
    for (const sell of sells) {
      console.log(`\n🔍 Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`   Created: ${sell.created_at}`);
      
      // Check transactions for this sell
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', authUser.id)
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .order('created_at', { ascending: false });
      
      const failedTxs = transactions?.filter(tx => tx.status === 'FAILED' && tx.transaction_type === 'SELL') || [];
      const completedTxs = transactions?.filter(tx => tx.status === 'COMPLETED' && tx.transaction_type === 'SELL') || [];
      
      console.log(`   📋 Transactions:`);
      console.log(`      Failed: ${failedTxs.length}`);
      console.log(`      Completed: ${completedTxs.length}`);
      
      // If there are multiple failed transactions, remove duplicates
      if (failedTxs.length > 1) {
        console.log(`\n   🗑️ Removing ${failedTxs.length - 1} duplicate failed transactions...`);
        const txIdsToDelete = failedTxs.slice(1).map(tx => tx.id);
        const { error: deleteError } = await supabase.from('transactions').delete().in('id', txIdsToDelete);
        
        if (deleteError) {
          console.error(`   ❌ Error deleting duplicates:`, deleteError);
        } else {
          console.log(`   ✅ Removed ${txIdsToDelete.length} duplicate transactions`);
        }
      }
      
      // If sell is COMPLETED or SOL_SENT but no NGN credit, credit it
      if ((sell.status === 'COMPLETED' || sell.status === 'SOL_SENT' || sell.status === 'SOLD_ON_LUNO') && completedTxs.length === 0) {
        console.log(`\n   💰 Crediting NGN for completed sell...`);
        await creditNGNForSell(sell, parseFloat(sell.sol_amount));
      }
    }
    
    // Check if there's a successful on-chain transaction that wasn't recorded
    console.log(`\n🔍 Checking for successful on-chain transactions...`);
    
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', authUser.id)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .single();
    
    if (wallet) {
      const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                           process.env.ALCHEMY_SOLANA_URL ||
                           'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
      
      const txResponse = await fetch(solanaRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [wallet.address, { limit: 5 }],
        }),
      });
      
      if (txResponse.ok) {
        const txData = await txResponse.json();
        const signatures = txData.result || [];
        
        console.log(`   Found ${signatures.length} recent on-chain transactions`);
        
        // Check if any sell order matches these transactions
        for (const sell of sells) {
          if (!sell.sol_tx_hash && sell.status !== 'QUOTED') {
            const lunoAddress = sell.metadata?.destination_address;
            const solAmount = parseFloat(sell.sol_amount || '0');
            
            if (lunoAddress) {
              for (const sig of signatures.slice(0, 3)) {
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
                  
                  const instructions = tx.transaction?.message?.instructions || [];
                  for (const ix of instructions) {
                    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
                      const transfer = ix.parsed?.info;
                      if (transfer && transfer.destination === lunoAddress) {
                        const transferAmount = transfer.lamports / 1e9;
                        
                        if (Math.abs(transferAmount - solAmount) < 0.0001) {
                          console.log(`\n   ✅ Found successful transaction for sell ${sell.sell_id}`);
                          console.log(`      Hash: ${sig.signature}`);
                          
                          // Update sell order
                          await supabase.from('sells').update({
                            sol_tx_hash: sig.signature,
                            status: 'SOL_SENT',
                            updated_at: new Date().toISOString(),
                          }).eq('sell_id', sell.sell_id);
                          
                          // Try to execute sell
                          console.log(`   📡 Executing sell...`);
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
                              await creditNGNForSell(sell, solAmount);
                            } else {
                              const result = await response.json();
                              console.log(`   ✅ Executed successfully`);
                            }
                          } catch (error) {
                            console.error(`   ❌ Error:`, error.message);
                            await creditNGNForSell(sell, solAmount);
                          }
                          
                          break;
                        }
                      }
                    }
                  }
                } catch (err) {
                  continue;
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`\n✅ Done!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

async function creditNGNForSell(sellOrder, solAmount) {
  try {
    console.log(`\n💰 Crediting NGN...`);
    
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

fixWorldgistSell();


