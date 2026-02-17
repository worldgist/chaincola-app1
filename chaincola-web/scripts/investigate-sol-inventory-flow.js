#!/usr/bin/env node

/**
 * Investigate SOL Inventory Flow
 * 
 * This script traces the complete flow of SOL inventory by:
 * 1. Showing all SOL transactions chronologically
 * 2. Calculating inventory changes step by step
 * 3. Identifying discrepancies
 * 4. Checking for manual adjustments
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

async function investigateSolInventoryFlow() {
  try {
    console.log('🔍 Investigating SOL Inventory Flow\n');

    // 1. Get current system inventory
    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, sol_main_address, created_at, updated_at')
      .eq('id', 1)
      .single();

    if (swError) {
      console.error('❌ Error fetching system inventory:', swError);
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 CURRENT SYSTEM INVENTORY');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`Current SOL Inventory: ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`Physical Address: ${systemWallet.sol_main_address || 'N/A'}`);
    console.log(`Created: ${new Date(systemWallet.created_at).toLocaleString()}`);
    console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}\n`);

    // 2. Get ALL SOL transactions chronologically
    console.log('═══════════════════════════════════════════════════════');
    console.log('📜 ALL SOL TRANSACTIONS (Chronological)');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: allTransactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, transaction_type, crypto_amount, fiat_amount, status, created_at, external_reference, metadata')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED', 'CONFIRMED'])
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    // 3. Calculate inventory flow
    let runningInventory = 0; // Start with 0 (as per migration)
    const inventoryHistory = [];
    let totalSells = 0;
    let totalBuys = 0;
    let totalReceives = 0;
    let totalSends = 0;

    console.log('Calculating inventory changes step by step...\n');

    allTransactions.forEach((tx, index) => {
      const amount = parseFloat(tx.crypto_amount || 0);
      const type = tx.transaction_type;
      const date = new Date(tx.created_at).toLocaleString();

      let inventoryChange = 0;
      let changeType = '';

      switch (type) {
        case 'SELL':
          inventoryChange = amount; // SOL goes INTO inventory
          runningInventory += amount;
          totalSells += amount;
          changeType = '📈 +';
          break;
        case 'BUY':
          inventoryChange = -amount; // SOL comes OUT of inventory
          runningInventory -= amount;
          totalBuys += amount;
          changeType = '📉 -';
          break;
        case 'RECEIVE':
          // RECEIVE doesn't affect system inventory (user receives from external)
          totalReceives += amount;
          changeType = '📥';
          break;
        case 'SEND':
          // SEND doesn't affect system inventory (user sends to external)
          totalSends += amount;
          changeType = '📤';
          break;
        case 'DEPOSIT':
          // DEPOSIT doesn't affect system inventory
          changeType = '💰';
          break;
        default:
          changeType = '❓';
      }

      if (type === 'SELL' || type === 'BUY') {
        inventoryHistory.push({
          date: tx.created_at,
          type,
          amount,
          inventoryChange,
          runningInventory,
          tx
        });

        console.log(`[${index + 1}] ${date}`);
        console.log(`   ${changeType} ${type}: ${amount.toFixed(8)} SOL`);
        console.log(`   Inventory Change: ${inventoryChange >= 0 ? '+' : ''}${inventoryChange.toFixed(8)} SOL`);
        console.log(`   Running Inventory: ${runningInventory.toFixed(8)} SOL`);
        if (tx.external_reference) {
          console.log(`   Reference: ${tx.external_reference}`);
        }
        console.log('');
      }
    });

    // 4. Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 INVENTORY FLOW SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total SELL transactions: ${allTransactions.filter(t => t.transaction_type === 'SELL').length}`);
    console.log(`Total SOL Sold: ${totalSells.toFixed(8)} SOL`);
    console.log(`\nTotal BUY transactions: ${allTransactions.filter(t => t.transaction_type === 'BUY').length}`);
    console.log(`Total SOL Bought: ${totalBuys.toFixed(8)} SOL`);
    console.log(`\nTotal RECEIVE transactions: ${allTransactions.filter(t => t.transaction_type === 'RECEIVE').length}`);
    console.log(`Total SOL Received: ${totalReceives.toFixed(8)} SOL`);
    console.log(`\nTotal SEND transactions: ${allTransactions.filter(t => t.transaction_type === 'SEND').length}`);
    console.log(`Total SOL Sent: ${totalSends.toFixed(8)} SOL`);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🧮 INVENTORY CALCULATION');
    console.log('═══════════════════════════════════════════════════════\n');

    const calculatedInventory = totalSells - totalBuys;
    const actualInventory = parseFloat(systemWallet.sol_inventory || 0);
    const discrepancy = actualInventory - calculatedInventory;

    console.log(`Starting Inventory: 0.00000000 SOL (from migration)`);
    console.log(`+ Total SOL Sold: ${totalSells.toFixed(8)} SOL`);
    console.log(`- Total SOL Bought: ${totalBuys.toFixed(8)} SOL`);
    console.log(`= Calculated Inventory: ${calculatedInventory.toFixed(8)} SOL`);
    console.log(`\nActual Inventory: ${actualInventory.toFixed(8)} SOL`);
    console.log(`Discrepancy: ${discrepancy >= 0 ? '+' : ''}${discrepancy.toFixed(8)} SOL\n`);

    if (Math.abs(discrepancy) > 0.0001) {
      console.log('⚠️  DISCREPANCY DETECTED!\n');
      console.log('Possible explanations:');
      console.log(`1. ${discrepancy > 0 ? 'Extra SOL' : 'Missing SOL'} in inventory`);
      console.log(`2. Manual inventory adjustment by admin`);
      console.log(`3. SOL transferred in/out manually`);
      console.log(`4. Transaction recording issue`);
      console.log(`5. Initial inventory was not zero`);
      console.log(`\n💡 Check:`);
      console.log(`   - Physical wallet balance: https://solscan.io/account/${systemWallet.sol_main_address || 'N/A'}`);
      console.log(`   - Admin logs for manual adjustments`);
      console.log(`   - Transaction audit trail`);
    } else {
      console.log('✅ Inventory matches calculated value!\n');
    }

    // 5. Check for specific user's transactions
    console.log('═══════════════════════════════════════════════════════');
    console.log('👤 USER SPECIFIC ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');

    const userEmail = process.argv[2] || 'worldgistmedia14@gmail.com';
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === userEmail);
    
    if (authUser) {
      const userId = authUser.id;
      const userSells = allTransactions.filter(t => 
        t.user_id === userId && t.transaction_type === 'SELL'
      );
      const userBuys = allTransactions.filter(t => 
        t.user_id === userId && t.transaction_type === 'BUY'
      );

      const userTotalSold = userSells.reduce((sum, t) => sum + parseFloat(t.crypto_amount || 0), 0);
      const userTotalBought = userBuys.reduce((sum, t) => sum + parseFloat(t.crypto_amount || 0), 0);

      console.log(`User: ${userEmail}`);
      console.log(`User ID: ${userId.substring(0, 8)}...`);
      console.log(`\nSOL Sold: ${userTotalSold.toFixed(8)} SOL (${userSells.length} transactions)`);
      console.log(`SOL Bought: ${userTotalBought.toFixed(8)} SOL (${userBuys.length} transactions)`);
      console.log(`Net: ${(userTotalBought - userTotalSold).toFixed(8)} SOL\n`);

      // Find where user's sold SOL went in the inventory flow
      if (userSells.length > 0) {
        console.log('User\'s sold SOL was used for:');
        let remainingUserSold = userTotalSold;
        let usedForBuys = 0;
        
        for (const buyTx of allTransactions.filter(t => t.transaction_type === 'BUY').sort((a, b) => 
          new Date(a.created_at) - new Date(b.created_at)
        )) {
          if (remainingUserSold > 0) {
            const buyAmount = parseFloat(buyTx.crypto_amount || 0);
            const used = Math.min(remainingUserSold, buyAmount);
            usedForBuys += used;
            remainingUserSold -= used;
            
            if (used > 0.0001) {
              console.log(`   - ${used.toFixed(8)} SOL used for buy on ${new Date(buyTx.created_at).toLocaleString()}`);
              console.log(`     User: ${buyTx.user_id.substring(0, 8)}...`);
            }
          }
        }
        
        if (remainingUserSold > 0.0001) {
          console.log(`   - ${remainingUserSold.toFixed(8)} SOL still in inventory (or used for other purposes)`);
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

investigateSolInventoryFlow()
  .then(() => {
    console.log('✅ Investigation Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
