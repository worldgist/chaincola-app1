#!/usr/bin/env node

/**
 * Investigate SOL Discrepancy
 * 
 * This script investigates where SOL went when a user sold it.
 * Checks:
 * 1. System inventory changes
 * 2. Buy transactions that might have used the SOL
 * 3. Manual transfers or adjustments
 * 4. Transaction audit trail
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

async function investigateSolDiscrepancy(email) {
  try {
    console.log(`🔍 Investigating SOL Discrepancy for: ${email}\n`);

    // 1. Find user
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

    // 2. Get all SOL sell transactions for this user
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 USER SOL SELL TRANSACTIONS');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: sellTransactions, error: sellError } = await supabase
      .from('transactions')
      .select('id, crypto_amount, fiat_amount, status, created_at, external_reference, metadata')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: true });

    if (sellError) {
      console.error('❌ Error fetching sell transactions:', sellError);
      return;
    }

    const totalSold = sellTransactions.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
    console.log(`Total SOL Sold (COMPLETED): ${totalSold.toFixed(8)} SOL`);
    console.log(`Number of completed sell transactions: ${sellTransactions.length}\n`);

    sellTransactions.forEach((tx, index) => {
      console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
      console.log(`   Reference: ${tx.external_reference || 'N/A'}`);
      console.log('');
    });

    // 3. Check system inventory current state
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 SYSTEM INVENTORY STATUS');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, sol_main_address, updated_at')
      .eq('id', 1)
      .single();

    if (swError) {
      console.error('❌ Error fetching system inventory:', swError);
    } else {
      console.log(`Current System SOL Inventory: ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
      console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}`);
      console.log(`Physical Address: ${systemWallet.sol_main_address || 'N/A'}\n`);
    }

    // 4. Check all SOL buy transactions (where inventory would be used)
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 ALL SOL BUY TRANSACTIONS (System Inventory Usage)');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: buyTransactions, error: buyError } = await supabase
      .from('transactions')
      .select('id, user_id, crypto_amount, fiat_amount, status, created_at, external_reference')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'BUY')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: true });

    if (buyError) {
      console.error('❌ Error fetching buy transactions:', buyError);
    } else {
      const totalBought = buyTransactions.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
      console.log(`Total SOL Bought (All Users): ${totalBought.toFixed(8)} SOL`);
      console.log(`Number of completed buy transactions: ${buyTransactions.length}\n`);

      // Show buys that happened after the first sell
      if (sellTransactions.length > 0) {
        const firstSellDate = new Date(sellTransactions[0].created_at);
        const buysAfterSells = buyTransactions.filter(tx => new Date(tx.created_at) >= firstSellDate);
        
        console.log(`Buy transactions after first sell (${firstSellDate.toLocaleString()}):`);
        const totalBoughtAfter = buysAfterSells.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);
        console.log(`Total: ${totalBoughtAfter.toFixed(8)} SOL`);
        console.log(`Count: ${buysAfterSells.length}\n`);

        if (buysAfterSells.length > 0) {
          console.log('Recent buy transactions:');
          buysAfterSells.slice(-10).forEach((tx, index) => {
            console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
            console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
            console.log(`   User: ${tx.user_id.substring(0, 8)}...`);
            console.log(`   Reference: ${tx.external_reference || 'N/A'}`);
            console.log('');
          });
        }
      }
    }

    // 5. Check for SEND transactions from system wallet
    console.log('═══════════════════════════════════════════════════════');
    console.log('📤 SYSTEM SOL SEND/WITHDRAWAL TRANSACTIONS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check if there are any admin/system initiated sends
    const { data: sendTransactions, error: sendError } = await supabase
      .from('transactions')
      .select('id, crypto_amount, to_address, from_address, transaction_hash, created_at, metadata')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SEND')
      .order('created_at', { ascending: false })
      .limit(20);

    if (sendError) {
      console.error('❌ Error fetching send transactions:', sendError);
    } else if (sendTransactions && sendTransactions.length > 0) {
      console.log(`Found ${sendTransactions.length} SEND transactions:\n`);
      sendTransactions.forEach((tx, index) => {
        console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
        console.log(`   From: ${tx.from_address || 'N/A'}`);
        console.log(`   To: ${tx.to_address || 'N/A'}`);
        if (tx.transaction_hash) {
          console.log(`   Hash: ${tx.transaction_hash}`);
        }
        console.log('');
      });
    } else {
      console.log('No SEND transactions found.\n');
    }

    // 6. Calculate expected vs actual inventory (chronologically)
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧮 INVENTORY CALCULATION');
    console.log('═══════════════════════════════════════════════════════\n');

    const currentInventory = parseFloat(systemWallet?.sol_inventory || 0);
    
    // Get ALL SOL transactions chronologically to track inventory changes
    const { data: allTransactions, error: allTxError } = await supabase
      .from('transactions')
      .select('id, transaction_type, crypto_amount, created_at, user_id, external_reference')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED'])
      .in('transaction_type', ['BUY', 'SELL'])
      .order('created_at', { ascending: true });

    let calculatedInventory = 0;
    let initialInventory = 0;
    
    if (!allTxError && allTransactions && allTransactions.length > 0) {
      // Find the earliest transaction to establish baseline
      const earliestTx = allTransactions[0];
      const earliestDate = new Date(earliestTx.created_at);
      
      // Check if there were any transactions before the earliest one
      // If the earliest is a BUY, we need initial inventory to cover it
      if (earliestTx.transaction_type === 'BUY') {
        const buyAmount = parseFloat(earliestTx.crypto_amount || 0);
        // We can't know initial inventory, so we'll track from first SELL or assume 0
        console.log(`⚠️  Earliest transaction is a BUY (${buyAmount.toFixed(8)} SOL)`);
        console.log(`   This suggests there was initial inventory or external funding.\n`);
      }
      
      // Track inventory changes chronologically
      // SELL adds to inventory, BUY subtracts from inventory
      let runningInventory = 0;
      const inventoryTimeline = [];
      
      allTransactions.forEach((tx) => {
        const amount = parseFloat(tx.crypto_amount || 0);
        if (tx.transaction_type === 'SELL') {
          runningInventory += amount;
        } else if (tx.transaction_type === 'BUY') {
          runningInventory -= amount;
        }
        
        // Track around user's sell transactions
        if (sellTransactions.length > 0) {
          const firstSellDate = new Date(sellTransactions[0].created_at);
          const txDate = new Date(tx.created_at);
          if (txDate >= firstSellDate) {
            inventoryTimeline.push({
              date: txDate,
              type: tx.transaction_type,
              amount: amount,
              inventory: runningInventory,
              user: tx.user_id === userId ? 'THIS_USER' : tx.user_id.substring(0, 8) + '...'
            });
          }
        }
      });
      
      calculatedInventory = runningInventory;
      
      // Show inventory timeline around user's transactions
      if (inventoryTimeline.length > 0) {
        console.log('📈 Inventory Timeline (from first user sell):\n');
        inventoryTimeline.slice(0, 20).forEach((entry, idx) => {
          const sign = entry.type === 'SELL' ? '+' : '-';
          console.log(`  ${entry.date.toLocaleString()} | ${sign}${entry.amount.toFixed(8)} SOL (${entry.type}) | Inventory: ${entry.inventory.toFixed(8)} SOL | User: ${entry.user}`);
        });
        if (inventoryTimeline.length > 20) {
          console.log(`  ... (${inventoryTimeline.length - 20} more transactions)`);
        }
        console.log('');
      }
    }
    
    // Calculate totals for all users
    const totalSoldAllUsers = allTransactions?.filter(tx => tx.transaction_type === 'SELL')
      .reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0) || 0;
    const totalBoughtAllUsers = allTransactions?.filter(tx => tx.transaction_type === 'BUY')
      .reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0) || 0;
    
    // If we assume inventory started at 0, then:
    // Expected = All Sells - All Buys
    const expectedFromZero = totalSoldAllUsers - totalBoughtAllUsers;
    
    // Show breakdown
    console.log(`📊 Transaction Totals:\n`);
    console.log(`   All Users' SOL Sold: ${totalSoldAllUsers.toFixed(8)} SOL`);
    console.log(`   All Users' SOL Bought: ${totalBoughtAllUsers.toFixed(8)} SOL`);
    console.log(`   This User's SOL Sold: ${totalSold.toFixed(8)} SOL\n`);

    console.log(`📊 Inventory Calculations:\n`);
    console.log(`   Current Actual Inventory: ${currentInventory.toFixed(8)} SOL`);
    console.log(`   Calculated from Timeline: ${calculatedInventory.toFixed(8)} SOL`);
    console.log(`   Expected (assuming started at 0): ${expectedFromZero.toFixed(8)} SOL\n`);

    const discrepancy = Math.abs(currentInventory - expectedFromZero);
    if (discrepancy > 0.0001) {
      console.log('⚠️  DISCREPANCY DETECTED!');
      console.log(`   Difference: ${(currentInventory - expectedFromZero).toFixed(8)} SOL\n`);
      console.log('Possible causes:');
      console.log('1. Initial inventory existed before first transaction');
      console.log('2. SOL was manually transferred out (check SEND transactions)');
      console.log('3. Inventory was manually adjusted by admin');
      console.log('4. Transaction recording issue or missing transactions');
      console.log('5. SOL was sent to exchange for liquidation');
      console.log('6. Some transactions may have failed but were marked COMPLETED\n');
    } else {
      console.log('✅ Inventory matches expected value!\n');
    }

    // 7. Check transaction metadata for clues
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 CHECKING TRANSACTION METADATA');
    console.log('═══════════════════════════════════════════════════════\n');

    const transactionsWithMetadata = sellTransactions.filter(tx => tx.metadata && Object.keys(tx.metadata).length > 0);
    if (transactionsWithMetadata.length > 0) {
      console.log(`Found ${transactionsWithMetadata.length} sell transactions with metadata:\n`);
      transactionsWithMetadata.slice(0, 5).forEach((tx, index) => {
        console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   Metadata: ${JSON.stringify(tx.metadata, null, 2)}`);
        console.log('');
      });
    } else {
      console.log('No metadata found in sell transactions.\n');
    }

    // 8. Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 INVESTIGATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`User: ${email}`);
    console.log(`User ID: ${userId}`);
    console.log(`This User's SOL Sold: ${totalSold.toFixed(8)} SOL`);
    console.log(`All Users' SOL Sold: ${totalSoldAllUsers.toFixed(8)} SOL`);
    console.log(`All Users' SOL Bought: ${totalBoughtAllUsers.toFixed(8)} SOL`);
    console.log(`Current System Inventory: ${currentInventory.toFixed(8)} SOL`);
    console.log(`Expected Inventory (from 0): ${expectedFromZero.toFixed(8)} SOL`);
    console.log(`Calculated Inventory (timeline): ${calculatedInventory.toFixed(8)} SOL`);
    console.log(`Discrepancy: ${(currentInventory - expectedFromZero).toFixed(8)} SOL`);
    console.log(`\n💡 Next Steps:`);
    console.log(`1. Check physical wallet balance: ${systemWallet?.sol_main_address ? `https://solscan.io/account/${systemWallet.sol_main_address}` : 'N/A'}`);
    console.log(`2. Review buy transactions that consumed inventory`);
    console.log(`3. Check admin logs for manual adjustments`);
    console.log(`4. Verify transaction hashes on blockchain`);
    console.log(`5. Check if initial inventory existed before first transaction\n`);

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const email = args[0] || 'worldgistmedia14@gmail.com';

investigateSolDiscrepancy(email)
  .then(() => {
    console.log('✅ Investigation Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
