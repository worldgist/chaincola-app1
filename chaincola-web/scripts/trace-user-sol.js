#!/usr/bin/env node

/**
 * Trace User's Solana Balance and Transactions
 * 
 * This script traces where a user's SOL went by checking:
 * 1. Current balance
 * 2. Transaction history
 * 3. Where funds were sent
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function traceUserSol(email) {
  try {
    console.log(`🔍 Tracing SOL for user: ${email}\n`);

    // 1. Find user by email
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError || !authUsers || !authUsers.users) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    const authUser = authUsers.users.find(u => u.email === email);
    if (!authUser) {
      console.error(`❌ User not found: ${email}`);
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);

    // 2. Get current SOL balance
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 CURRENT SOL BALANCE');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check wallet_balances table
    const { data: walletBalance, error: wbError } = await supabase
      .from('wallet_balances')
      .select('balance, locked')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();

    if (wbError && wbError.code !== 'PGRST116') {
      console.error('❌ Error fetching wallet balance:', wbError);
    } else if (walletBalance) {
      console.log(`Wallet Balance: ${parseFloat(walletBalance.balance || 0).toFixed(8)} SOL`);
      console.log(`Locked: ${parseFloat(walletBalance.locked || 0).toFixed(8)} SOL\n`);
    } else {
      console.log('Wallet Balance: 0.00000000 SOL\n');
    }

    // Check user_wallets table
    const { data: userWallet, error: uwError } = await supabase
      .from('user_wallets')
      .select('sol_balance')
      .eq('user_id', userId)
      .single();

    if (uwError && uwError.code !== 'PGRST116') {
      console.error('❌ Error fetching user wallet:', uwError);
    } else if (userWallet) {
      console.log(`User Wallet: ${parseFloat(userWallet.sol_balance || 0).toFixed(8)} SOL\n`);
    }

    // 3. Get SOL transactions
    console.log('═══════════════════════════════════════════════════════');
    console.log('📜 SOL TRANSACTION HISTORY');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, transaction_type, crypto_currency, crypto_amount, fiat_amount, fiat_currency, fee_amount, status, from_address, to_address, transaction_hash, external_reference, created_at, updated_at, completed_at')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false })
      .limit(50);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
    } else if (!transactions || transactions.length === 0) {
      console.log('ℹ️  No SOL transactions found\n');
    } else {
      console.log(`Found ${transactions.length} SOL transaction(s):\n`);

      let totalReceived = 0;
      let totalSent = 0;
      let totalSold = 0;
      let totalBought = 0;

      transactions.forEach((tx, index) => {
        const amount = parseFloat(tx.crypto_amount || 0);
        const type = tx.transaction_type;
        const status = tx.status;
        const date = new Date(tx.created_at).toLocaleString();

        console.log(`[${index + 1}] ${type} - ${status}`);
        console.log(`   Amount: ${amount.toFixed(8)} SOL`);
        console.log(`   Date: ${date}`);
        
        if (tx.fiat_amount) {
          console.log(`   Fiat Amount: ₦${parseFloat(tx.fiat_amount).toLocaleString()}`);
        }
        
        if (tx.external_reference) {
          console.log(`   Reference: ${tx.external_reference}`);
        }
        
        if (tx.to_address) {
          console.log(`   Destination: ${tx.to_address}`);
        }

        // Track totals
        if (type === 'DEPOSIT' || type === 'BUY') {
          totalReceived += amount;
          if (type === 'BUY') totalBought += amount;
        } else if (type === 'WITHDRAWAL' || type === 'SEND') {
          totalSent += amount;
        } else if (type === 'SELL') {
          totalSold += amount;
        }

        console.log('');
      });

      // Summary
      console.log('═══════════════════════════════════════════════════════');
      console.log('📊 TRANSACTION SUMMARY');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`Total Received (Deposits/Buys): ${totalReceived.toFixed(8)} SOL`);
      console.log(`Total Sold: ${totalSold.toFixed(8)} SOL`);
      console.log(`Total Sent: ${totalSent.toFixed(8)} SOL`);
      console.log(`Total Bought: ${totalBought.toFixed(8)} SOL`);
      console.log(`Net Change: ${(totalReceived - totalSent - totalSold).toFixed(8)} SOL\n`);
    }

    // 4. Check Solana wallet address
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔐 SOLANA WALLET ADDRESS');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: cryptoWallet, error: cwError } = await supabase
      .from('crypto_wallets')
      .select('address, created_at')
      .eq('user_id', userId)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .single();

    if (cwError && cwError.code !== 'PGRST116') {
      console.error('❌ Error fetching crypto wallet:', cwError);
    } else if (cryptoWallet) {
      console.log(`Address: ${cryptoWallet.address}`);
      console.log(`Created: ${new Date(cryptoWallet.created_at).toLocaleString()}\n`);
      console.log(`💡 Check on-chain balance at:`);
      console.log(`   https://solscan.io/account/${cryptoWallet.address}\n`);
    } else {
      console.log('ℹ️  No Solana wallet found for this user\n');
    }

    // 5. Check where SOL went (System Inventory)
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 WHERE DID THE SOL GO?');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, sol_main_address, updated_at')
      .eq('id', 1)
      .single();

    if (swError) {
      console.error('❌ Error fetching system inventory:', swError);
    } else if (systemWallet) {
      console.log(`System SOL Inventory: ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
      if (systemWallet.sol_main_address) {
        console.log(`Physical Wallet Address: ${systemWallet.sol_main_address}`);
        console.log(`   💡 Check on-chain: https://solscan.io/account/${systemWallet.sol_main_address}`);
      }
      console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}\n`);
    }

    // 6. Analysis
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');

    if (transactions && transactions.length > 0) {
      const sellTxs = transactions.filter(tx => tx.transaction_type === 'SELL');
      if (sellTxs.length > 0) {
        const totalSold = sellTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
        console.log(`⚠️  User sold ${sellTxs.length} time(s) - Total: ${totalSold.toFixed(8)} SOL`);
        console.log(`\n   📍 Where did it go?`);
        console.log(`   → System Inventory (system_wallets.sol_inventory)`);
        console.log(`   → Physical Location: System's main Solana wallet`);
        if (systemWallet && systemWallet.sol_main_address) {
          console.log(`   → Address: ${systemWallet.sol_main_address}`);
        }
        console.log(`\n   💡 When users sell SOL:`);
        console.log(`   1. SOL is debited from their wallet`);
        console.log(`   2. SOL goes to system inventory (for future buys)`);
        console.log(`   3. NGN is credited to their wallet`);
        console.log(`   4. System NGN float is debited`);
        console.log(`\n   ⚠️  Note: This is an internal ledger swap - no blockchain transaction occurred.\n`);
      }

      const sendTxs = transactions.filter(tx => tx.transaction_type === 'SEND');
      if (sendTxs.length > 0) {
        const totalSent = sendTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
        console.log(`📤 User sent SOL ${sendTxs.length} time(s) - Total: ${totalSent.toFixed(8)} SOL`);
        sendTxs.forEach(tx => {
          const amount = parseFloat(tx.crypto_amount || 0).toFixed(8);
          const dest = tx.to_address || 'Unknown address';
          console.log(`\n   - ${amount} SOL sent on ${new Date(tx.created_at).toLocaleString()}`);
          console.log(`     📍 Destination: ${dest}`);
          if (tx.to_address) {
            console.log(`     💡 Check on-chain: https://solscan.io/account/${tx.to_address}`);
          }
          if (tx.transaction_hash) {
            console.log(`     🔗 Transaction Hash: ${tx.transaction_hash}`);
            console.log(`     💡 View on Solscan: https://solscan.io/tx/${tx.transaction_hash}`);
          }
        });
        console.log('');
      }

      const receiveTxs = transactions.filter(tx => tx.transaction_type === 'RECEIVE');
      if (receiveTxs.length > 0) {
        const totalReceived = receiveTxs.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
        console.log(`📥 User received SOL ${receiveTxs.length} time(s) - Total: ${totalReceived.toFixed(8)} SOL`);
        console.log(`   📍 Source: External deposits to their wallet\n`);
      }
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const email = args[0] || 'worldgistmedia14@gmail.com';

traceUserSol(email)
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
