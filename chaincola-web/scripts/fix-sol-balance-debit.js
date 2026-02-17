const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixBalanceDebit() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    
    console.log(`🔧 Fixing SOL balance debit for: ${email}\n`);
    
    // Get auth user ID
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError || !authUsers || !authUsers.users) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    const authUser = authUsers.users.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // Get Solana wallet address
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .limit(1);
    
    if (walletsError || !wallets || wallets.length === 0) {
      console.error('❌ Error fetching wallet:', walletsError);
      return;
    }
    
    const solAddress = wallets[0].address;
    console.log(`📍 Solana Address: ${solAddress}\n`);
    
    // Check on-chain balance
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                         process.env.ALCHEMY_SOLANA_URL ||
                         'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const balanceResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [solAddress],
      }),
    });
    
    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      console.error(`❌ Failed to check balance: ${errorText}`);
      return;
    }
    
    const balanceData = await balanceResponse.json();
    const balanceLamports = balanceData.result?.value || 0;
    const onChainBalance = balanceLamports / 1e9;
    
    console.log(`💰 On-chain Balance: ${onChainBalance} SOL\n`);
    
    // Get database balance
    const { data: dbBalance, error: dbError } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();
    
    if (dbError || !dbBalance) {
      console.error('❌ Error fetching database balance:', dbError);
      return;
    }
    
    const dbBalanceSOL = parseFloat(dbBalance.balance || '0');
    console.log(`💾 Database Balance: ${dbBalanceSOL} SOL\n`);
    
    const difference = dbBalanceSOL - onChainBalance;
    console.log(`📊 Difference: ${difference} SOL (database has ${difference > 0 ? 'more' : 'less'} than on-chain)\n`);
    
    if (Math.abs(difference) < 0.0001) {
      console.log(`✅ Balances match - no fix needed`);
      return;
    }
    
    // Get recent transactions to find the missing debit
    const txResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [solAddress, { limit: 10 }],
      }),
    });
    
    if (!txResponse.ok) {
      const errorText = await txResponse.text();
      console.error('❌ Error fetching transactions:', errorText);
      return;
    }
    
    const recentTxs = await txResponse.json();
    
    if (recentTxs.error) {
      console.error('❌ Error fetching transactions:', recentTxs.error);
      return;
    }
    
    const signatures = recentTxs.result || [];
    console.log(`📋 Found ${signatures.length} recent transactions\n`);
    
    // Find sell orders that might match
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    console.log(`📋 Found ${sells.length} sell orders\n`);
    
    // Match sell orders with transactions
    for (const sell of sells) {
      const solAmount = parseFloat(sell.sol_amount || '0');
      const networkFee = 0.0001;
      const expectedDebit = solAmount + networkFee;
      
      console.log(`\n🔍 Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${solAmount}`);
      console.log(`   Expected Debit: ${expectedDebit} SOL`);
      console.log(`   TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      
      // If this sell order matches the difference and has no TX hash, it might be the one
      if (Math.abs(expectedDebit - difference) < 0.001 && !sell.sol_tx_hash) {
        console.log(`   ⚠️ This sell order matches the missing debit amount!`);
        
        // Find matching transaction signature
        // We'll need to check each signature to see if it matches
        for (const sig of signatures.slice(0, 3)) { // Check first 3 transactions
          try {
            const txResponse = await fetch(solanaRpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
              }),
            });
            
            const txData = await txResponse.json();
            const tx = txData.result;
            
            if (tx) {
              // Check if this transaction sent SOL matching the sell amount
              const transfers = (tx.transaction?.message?.instructions || []).filter(
                (ix) => ix.program === 'system' && ix.parsed?.type === 'transfer'
              );
              
              for (const transfer of transfers) {
                const transferAmount = transfer.parsed?.info?.lamports / 1e9;
                if (Math.abs(transferAmount - solAmount) < 0.0001) {
                  console.log(`   ✅ Found matching transaction: ${sig.signature}`);
                  console.log(`   Transfer amount: ${transferAmount} SOL`);
                  
                  // Update sell order
                  console.log(`\n🔧 Updating sell order...`);
                  const { error: updateError } = await supabase
                    .from('sells')
                    .update({
                      sol_tx_hash: sig.signature,
                      status: 'SOL_SENT',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('sell_id', sell.sell_id);
                  
                  if (updateError) {
                    console.error(`   ❌ Failed to update sell order:`, updateError);
                  } else {
                    console.log(`   ✅ Updated sell order to SOL_SENT`);
                  }
                  
                  // Debit balance
                  console.log(`\n🔧 Debiting balance...`);
                  const newBalance = Math.max(0, dbBalanceSOL - expectedDebit);
                  const { error: debitError } = await supabase
                    .from('wallet_balances')
                    .update({
                      balance: newBalance.toFixed(9),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', userId)
                    .eq('currency', 'SOL');
                  
                  if (debitError) {
                    console.error(`   ❌ Failed to debit balance:`, debitError);
                  } else {
                    console.log(`   ✅ Debited ${expectedDebit} SOL`);
                    console.log(`   New balance: ${newBalance} SOL`);
                  }
                  
                  // Record SEND transaction
                  console.log(`\n🔧 Recording SEND transaction...`);
                  const { data: existingTx } = await supabase
                    .from('transactions')
                    .select('id')
                    .eq('transaction_hash', sig.signature)
                    .limit(1);
                  
                  if (!existingTx || existingTx.length === 0) {
                    const { error: txInsertError } = await supabase
                      .from('transactions')
                      .insert({
                        user_id: userId,
                        transaction_type: 'SEND',
                        crypto_currency: 'SOL',
                        crypto_amount: solAmount.toString(),
                        transaction_hash: sig.signature,
                        status: 'COMPLETED',
                        network: 'mainnet',
                        fee_amount: networkFee.toString(),
                        fee_currency: 'SOL',
                        metadata: {
                          sell_id: sell.sell_id,
                          source: 'fix-sol-balance-debit',
                        },
                      });
                    
                    if (txInsertError) {
                      console.error(`   ❌ Failed to record transaction:`, txInsertError);
                    } else {
                      console.log(`   ✅ Recorded SEND transaction`);
                    }
                  } else {
                    console.log(`   ⚠️ Transaction already exists`);
                  }
                  
                  // Unlock locked amount if any
                  const currentLocked = parseFloat(dbBalance.locked || '0');
                  const lockedAmount = parseFloat(sell.locked_sol_amount || '0');
                  if (currentLocked > 0 && lockedAmount > 0) {
                    console.log(`\n🔧 Unlocking SOL...`);
                    const newLocked = Math.max(0, currentLocked - lockedAmount);
                    const { error: unlockError } = await supabase
                      .from('wallet_balances')
                      .update({
                        locked: newLocked.toFixed(9),
                      })
                      .eq('user_id', userId)
                      .eq('currency', 'SOL');
                    
                    if (unlockError) {
                      console.error(`   ❌ Failed to unlock:`, unlockError);
                    } else {
                      console.log(`   ✅ Unlocked ${lockedAmount} SOL`);
                    }
                  }
                  
                  console.log(`\n✅ Fix complete!`);
                  return;
                }
              }
            }
          } catch (err) {
            // Skip errors for individual transaction checks
            continue;
          }
        }
      }
    }
    
    // If no match found, just sync the balance
    console.log(`\n⚠️ No matching sell order found. Syncing balance to match on-chain...`);
    const { error: syncError } = await supabase
      .from('wallet_balances')
      .update({
        balance: onChainBalance.toFixed(9),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('currency', 'SOL');
    
    if (syncError) {
      console.error(`❌ Failed to sync balance:`, syncError);
    } else {
      console.log(`✅ Synced balance to ${onChainBalance} SOL`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

fixBalanceDebit();

