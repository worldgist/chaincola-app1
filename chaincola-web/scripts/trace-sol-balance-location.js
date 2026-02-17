#!/usr/bin/env node

/**
 * Trace Solana Balance Location
 * 
 * This script checks:
 * 1. On-chain balance vs database inventory
 * 2. Transaction history (BUY, SELL, SEND)
 * 3. System inventory changes
 * 4. User wallet balances
 * 5. Where missing SOL might have gone
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const solanaRpcUrl = process.env.SOLANA_RPC_URL || process.env.ALCHEMY_SOLANA_URL || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get on-chain Solana balance
 */
async function getOnChainBalance(address) {
  try {
    const response = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    });

    if (!response.ok) {
      return { balance: 0, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    if (result.error) {
      return { balance: 0, error: result.error.message };
    }

    const balanceLamports = result.result?.value || 0;
    const balanceSOL = balanceLamports / 1e9;
    return { balance: balanceSOL, error: null };
  } catch (error) {
    return { balance: 0, error: error.message };
  }
}

async function traceSolBalance() {
  try {
    console.log('🔍 Tracing Solana Balance Location...\n');

    // ============================================================
    // 1. GET SYSTEM WALLET INFO
    // ============================================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 SYSTEM WALLET INFORMATION');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, sol_main_address, ngn_float_balance, updated_at, created_at')
      .eq('id', 1)
      .single();

    if (swError || !systemWallet) {
      console.error('❌ Error fetching system wallet:', swError);
      return;
    }

    const dbInventory = parseFloat(systemWallet.sol_inventory || 0);
    const mainAddress = systemWallet.sol_main_address;

    console.log(`Database Inventory: ${dbInventory.toFixed(8)} SOL`);
    console.log(`Main Wallet Address: ${mainAddress || 'NOT SET'}`);
    console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}\n`);

    // ============================================================
    // 2. CHECK ON-CHAIN BALANCE
    // ============================================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔗 ON-CHAIN BALANCE CHECK');
    console.log('═══════════════════════════════════════════════════════\n');

    let onChainBalance = 0;
    if (mainAddress) {
      console.log(`Checking address: ${mainAddress}...`);
      const balanceResult = await getOnChainBalance(mainAddress);
      
      if (balanceResult.error) {
        console.log(`❌ Error: ${balanceResult.error}\n`);
      } else {
        onChainBalance = balanceResult.balance;
        console.log(`On-chain Balance: ${onChainBalance.toFixed(8)} SOL\n`);
        
        const discrepancy = onChainBalance - dbInventory;
        console.log(`📊 Discrepancy: ${discrepancy > 0 ? '+' : ''}${discrepancy.toFixed(8)} SOL`);
        
        if (Math.abs(discrepancy) > 0.000001) {
          console.log(`⚠️  MISMATCH DETECTED!\n`);
          if (onChainBalance < dbInventory) {
            console.log(`   Database shows MORE than on-chain`);
            console.log(`   Missing: ${Math.abs(discrepancy).toFixed(8)} SOL\n`);
          } else {
            console.log(`   On-chain shows MORE than database`);
            console.log(`   Extra: ${discrepancy.toFixed(8)} SOL\n`);
          }
        } else {
          console.log(`✅ Balances match\n`);
        }
      }
    } else {
      console.log('⚠️  Main wallet address not configured\n');
    }

    // ============================================================
    // 3. TRANSACTION HISTORY ANALYSIS
    // ============================================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('📜 TRANSACTION HISTORY ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get all SOL transactions
    const { data: allTransactions, error: txError } = await supabase
      .from('transactions')
      .select('id, transaction_type, crypto_amount, fiat_amount, status, created_at, to_address, from_address, transaction_hash, user_id')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED', 'PENDING', 'FAILED'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
    } else {
      const buyTxs = (allTransactions || []).filter(tx => tx.transaction_type === 'BUY');
      const sellTxs = (allTransactions || []).filter(tx => tx.transaction_type === 'SELL');
      const sendTxs = (allTransactions || []).filter(tx => tx.transaction_type === 'SEND');
      const receiveTxs = (allTransactions || []).filter(tx => tx.transaction_type === 'RECEIVE' || tx.transaction_type === 'DEPOSIT');

      const totalBought = buyTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
      const totalSold = sellTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
      const totalSent = sendTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
      const totalReceived = receiveTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);

      console.log(`Total BUY transactions: ${buyTxs.length}`);
      console.log(`Total SOL Bought: ${totalBought.toFixed(8)} SOL`);
      console.log(`\nTotal SELL transactions: ${sellTxs.length}`);
      console.log(`Total SOL Sold: ${totalSold.toFixed(8)} SOL`);
      console.log(`\nTotal SEND transactions: ${sendTxs.length}`);
      console.log(`Total SOL Sent: ${totalSent.toFixed(8)} SOL`);
      console.log(`\nTotal RECEIVE/DEPOSIT transactions: ${receiveTxs.length}`);
      console.log(`Total SOL Received: ${totalReceived.toFixed(8)} SOL\n`);

      // Calculate expected inventory
      // Inventory = Received + Sold - Bought - Sent
      const expectedInventory = totalReceived + totalSold - totalBought - totalSent;
      console.log(`\n📊 Expected Inventory Calculation:`);
      console.log(`   Received: +${totalReceived.toFixed(8)} SOL`);
      console.log(`   Sold:     +${totalSold.toFixed(8)} SOL (goes to inventory)`);
      console.log(`   Bought:   -${totalBought.toFixed(8)} SOL (from inventory)`);
      console.log(`   Sent:     -${totalSent.toFixed(8)} SOL (withdrawals)`);
      console.log(`   ─────────────────────────────`);
      console.log(`   Expected: ${expectedInventory.toFixed(8)} SOL`);
      console.log(`   Actual DB: ${dbInventory.toFixed(8)} SOL`);
      console.log(`   On-chain: ${onChainBalance.toFixed(8)} SOL`);
      
      const dbDiscrepancy = expectedInventory - dbInventory;
      const chainDiscrepancy = expectedInventory - onChainBalance;
      
      if (Math.abs(dbDiscrepancy) > 0.000001) {
        console.log(`\n⚠️  Database Discrepancy: ${dbDiscrepancy > 0 ? '+' : ''}${dbDiscrepancy.toFixed(8)} SOL`);
      }
      if (Math.abs(chainDiscrepancy) > 0.000001) {
        console.log(`⚠️  On-chain Discrepancy: ${chainDiscrepancy > 0 ? '+' : ''}${chainDiscrepancy.toFixed(8)} SOL`);
      }

      // Show recent SEND transactions (where SOL might have gone)
      if (sendTxs.length > 0) {
        console.log(`\n\n📤 RECENT SEND TRANSACTIONS (Where SOL went out):`);
        console.log('─────────────────────────────────────────────────────');
        sendTxs.slice(0, 10).forEach((tx, idx) => {
          console.log(`\n[${idx + 1}] ${new Date(tx.created_at).toLocaleString()}`);
          console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
          console.log(`   Status: ${tx.status}`);
          console.log(`   To: ${tx.to_address || 'N/A'}`);
          if (tx.transaction_hash) {
            console.log(`   Hash: ${tx.transaction_hash}`);
            console.log(`   🔗 View: https://solscan.io/tx/${tx.transaction_hash}`);
          }
        });
      }
    }

    // ============================================================
    // 4. USER WALLET BALANCES
    // ============================================================
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('👥 USER WALLET BALANCES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: userWallets, error: uwError } = await supabase
      .from('user_wallets')
      .select('user_id, sol_balance')
      .gt('sol_balance', 0)
      .order('sol_balance', { ascending: false })
      .limit(20);

    if (!uwError && userWallets && userWallets.length > 0) {
      const totalUserSol = userWallets.reduce((sum, w) => sum + parseFloat(w.sol_balance || 0), 0);
      console.log(`Total SOL in user wallets: ${totalUserSol.toFixed(8)} SOL`);
      console.log(`Number of users with SOL: ${userWallets.length}\n`);
      
      console.log('Top 10 users with SOL:');
      userWallets.slice(0, 10).forEach((wallet, idx) => {
        console.log(`   ${idx + 1}. User ${wallet.user_id.substring(0, 8)}...: ${parseFloat(wallet.sol_balance || 0).toFixed(8)} SOL`);
      });
    } else {
      console.log('No user wallets with SOL balances found.\n');
    }

    // ============================================================
    // 5. SUMMARY & WHERE BALANCE WENT
    // ============================================================
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('💡 SUMMARY: WHERE DID THE SOL GO?');
    console.log('═══════════════════════════════════════════════════════\n');

    if (onChainBalance < dbInventory) {
      const missing = dbInventory - onChainBalance;
      console.log(`⚠️  MISSING SOL: ${missing.toFixed(8)} SOL\n`);
      console.log('Possible locations:');
      console.log('1. ✅ Sent out via SEND transactions (check above)');
      console.log('2. ✅ Still in user wallets (check above)');
      console.log('3. ⚠️  Database inventory is incorrect (needs manual adjustment)');
      console.log('4. ⚠️  SOL was transferred to exchange or external wallet');
      console.log('5. ⚠️  Transaction recording issue\n');
    } else if (onChainBalance > dbInventory) {
      const extra = onChainBalance - dbInventory;
      console.log(`✅ EXTRA SOL ON-CHAIN: ${extra.toFixed(8)} SOL\n`);
      console.log('This means:');
      console.log('1. Database inventory is lower than actual on-chain balance');
      console.log('2. SOL was received but not recorded in database');
      console.log('3. Manual deposit to main wallet not recorded\n');
    } else {
      console.log('✅ Balances match - no discrepancy detected\n');
    }

    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

traceSolBalance()
  .then(() => {
    console.log('✅ Trace Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
