#!/usr/bin/env node

/**
 * Investigate Missing SOL
 * 
 * This script investigates where the missing SOL inventory went by checking:
 * 1. SEND transactions (withdrawals)
 * 2. Manual inventory adjustments
 * 3. Transaction errors
 * 4. User wallet balances
 * 5. Exchange transfers
 * 6. Timeline analysis
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

async function investigateMissingSol() {
  try {
    console.log('🔍 Investigating Missing SOL Inventory...\n');
    console.log('Missing Amount: 0.21955749 SOL (~₦35,352.52)\n');

    // 1. Check SEND transactions (withdrawals)
    console.log('═══════════════════════════════════════════════════════');
    console.log('📤 SEND TRANSACTIONS (Withdrawals)');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: sendTransactions, error: sendError } = await supabase
      .from('transactions')
      .select('id, crypto_amount, to_address, from_address, transaction_hash, created_at, status, metadata, user_id')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SEND')
      .order('created_at', { ascending: false });

    if (sendError) {
      console.error('❌ Error fetching SEND transactions:', sendError);
    } else {
      const totalSent = sendTransactions?.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0) || 0;
      console.log(`Total SOL Sent: ${totalSent.toFixed(8)} SOL`);
      console.log(`Number of SEND transactions: ${sendTransactions?.length || 0}\n`);

      if (sendTransactions && sendTransactions.length > 0) {
        sendTransactions.forEach((tx, index) => {
          console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
          console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
          console.log(`   Status: ${tx.status}`);
          console.log(`   To: ${tx.to_address || 'N/A'}`);
          console.log(`   From: ${tx.from_address || 'N/A'}`);
          if (tx.transaction_hash) {
            console.log(`   Hash: ${tx.transaction_hash}`);
          }
          if (tx.metadata) {
            console.log(`   Metadata: ${JSON.stringify(tx.metadata)}`);
          }
          console.log('');
        });
      } else {
        console.log('No SEND transactions found.\n');
      }
    }

    // 2. Check manual inventory adjustments
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔧 MANUAL INVENTORY ADJUSTMENTS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check audit_logs
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .in('action_type', ['TREASURY_ADJUSTMENT', 'SYSTEM_WALLET_UPDATED', 'INVENTORY_AUTO_LOG'])
      .or('description.ilike.%SOL%,new_value->>asset.eq.SOL,changes->sol_inventory.not.is.null')
      .order('created_at', { ascending: false })
      .limit(50);

    if (auditError && auditError.code !== 'PGRST205') {
      console.error('❌ Error fetching audit_logs:', auditError);
    } else if (auditLogs && auditLogs.length > 0) {
      console.log(`Found ${auditLogs.length} SOL-related audit logs:\n`);
      auditLogs.forEach((log, index) => {
        const newValue = log.new_value || {};
        const changes = log.changes || {};
        console.log(`[${index + 1}] ${new Date(log.created_at).toLocaleString()}`);
        console.log(`   Type: ${log.action_type}`);
        console.log(`   Description: ${log.description}`);
        if (changes.sol_inventory) {
          const delta = changes.sol_inventory.delta || 0;
          console.log(`   SOL Change: ${delta > 0 ? '+' : ''}${delta.toFixed(8)} SOL`);
          console.log(`   Old: ${changes.sol_inventory.old} SOL`);
          console.log(`   New: ${changes.sol_inventory.new} SOL`);
        }
        console.log('');
      });
    } else {
      console.log('No SOL adjustments found in audit_logs.\n');
    }

    // Check admin_action_logs
    const { data: adminLogs, error: adminError } = await supabase
      .from('admin_action_logs')
      .select('*')
      .or('action_details->>currency.eq.SOL,action_details->>asset.eq.SOL')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!adminError && adminLogs && adminLogs.length > 0) {
      console.log(`Found ${adminLogs.length} SOL-related admin actions:\n`);
      adminLogs.forEach((log, index) => {
        const details = log.action_details || {};
        console.log(`[${index + 1}] ${new Date(log.created_at).toLocaleString()}`);
        console.log(`   Action: ${log.action_type}`);
        console.log(`   Currency: ${details.currency || details.asset || 'N/A'}`);
        console.log(`   Amount: ${details.amount || 'N/A'}`);
        console.log(`   Reason: ${details.reason || 'N/A'}`);
        if (details.balance_after !== undefined) {
          console.log(`   Balance After: ${details.balance_after}`);
        }
        if (details.balance_before !== undefined) {
          console.log(`   Balance Before: ${details.balance_before}`);
        }
        console.log('');
      });
    }

    // 3. Check failed or pending transactions
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  FAILED/PENDING TRANSACTIONS');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: failedTransactions, error: failedError } = await supabase
      .from('transactions')
      .select('id, transaction_type, crypto_amount, fiat_amount, status, created_at, external_reference, metadata')
      .eq('crypto_currency', 'SOL')
      .in('status', ['FAILED', 'PENDING', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (!failedError && failedTransactions && failedTransactions.length > 0) {
      console.log(`Found ${failedTransactions.length} failed/pending SOL transactions:\n`);
      failedTransactions.forEach((tx, index) => {
        console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   Type: ${tx.transaction_type}`);
        console.log(`   Amount: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Reference: ${tx.external_reference || 'N/A'}`);
        if (tx.metadata) {
          console.log(`   Metadata: ${JSON.stringify(tx.metadata)}`);
        }
        console.log('');
      });
    } else {
      console.log('No failed/pending SOL transactions found.\n');
    }

    // 4. Check user wallets with SOL balances
    console.log('═══════════════════════════════════════════════════════');
    console.log('👥 USER WALLETS WITH SOL BALANCES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: userWallets, error: walletError } = await supabase
      .from('user_wallets')
      .select('user_id, sol_balance')
      .gt('sol_balance', 0)
      .order('sol_balance', { ascending: false })
      .limit(20);

    if (!walletError && userWallets && userWallets.length > 0) {
      const totalUserSol = userWallets.reduce((sum, w) => sum + parseFloat(w.sol_balance || 0), 0);
      console.log(`Total SOL in user wallets: ${totalUserSol.toFixed(8)} SOL`);
      console.log(`Number of users with SOL: ${userWallets.length}\n`);
      
      userWallets.slice(0, 10).forEach((wallet, index) => {
        console.log(`[${index + 1}] User: ${wallet.user_id.substring(0, 8)}...`);
        console.log(`   Balance: ${parseFloat(wallet.sol_balance || 0).toFixed(8)} SOL`);
        console.log('');
      });
    } else {
      console.log('No user wallets with SOL balances found.\n');
    }

    // 5. Timeline analysis - when was inventory set to 0?
    console.log('═══════════════════════════════════════════════════════');
    console.log('📅 TIMELINE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get all SOL transactions chronologically
    const { data: allSolTx, error: allTxError } = await supabase
      .from('transactions')
      .select('id, transaction_type, crypto_amount, created_at, status')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED'])
      .in('transaction_type', ['BUY', 'SELL'])
      .order('created_at', { ascending: true });

    if (!allTxError && allSolTx && allSolTx.length > 0) {
      let runningInventory = 0;
      const inventoryHistory = [];

      allSolTx.forEach((tx) => {
        const amount = parseFloat(tx.crypto_amount || 0);
        if (tx.transaction_type === 'SELL') {
          runningInventory += amount;
        } else if (tx.transaction_type === 'BUY') {
          runningInventory -= amount;
        }
        inventoryHistory.push({
          date: new Date(tx.created_at),
          type: tx.transaction_type,
          amount: amount,
          inventory: runningInventory
        });
      });

      // Find when inventory should have been around 0.21955749
      const targetInventory = 0.21955749;
      const closestMatch = inventoryHistory.reduce((closest, entry) => {
        const currentDiff = Math.abs(entry.inventory - targetInventory);
        const closestDiff = Math.abs(closest.inventory - targetInventory);
        return currentDiff < closestDiff ? entry : closest;
      }, inventoryHistory[0]);

      console.log('Key timeline points:\n');
      console.log(`First transaction: ${inventoryHistory[0]?.date.toLocaleString()}`);
      console.log(`Last transaction: ${inventoryHistory[inventoryHistory.length - 1]?.date.toLocaleString()}`);
      console.log(`\nClosest to expected inventory (${targetInventory.toFixed(8)} SOL):`);
      console.log(`   Date: ${closestMatch.date.toLocaleString()}`);
      console.log(`   Inventory: ${closestMatch.inventory.toFixed(8)} SOL`);
      console.log(`   Transaction: ${closestMatch.type} ${closestMatch.amount.toFixed(8)} SOL\n`);

      // Show recent inventory changes
      console.log('Recent inventory changes (last 10):\n');
      inventoryHistory.slice(-10).forEach((entry, idx) => {
        const sign = entry.type === 'SELL' ? '+' : '-';
        console.log(`  ${entry.date.toLocaleString()} | ${sign}${entry.amount.toFixed(8)} SOL | Inventory: ${entry.inventory.toFixed(8)} SOL`);
      });
      console.log('');
    }

    // 6. Check system wallet update history
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 SYSTEM WALLET UPDATE HISTORY');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: systemWallet } = await supabase
      .from('system_wallets')
      .select('sol_inventory, updated_at, created_at')
      .eq('id', 1)
      .single();

    if (systemWallet) {
      console.log(`Current SOL Inventory: ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
      console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}`);
      console.log(`Created At: ${new Date(systemWallet.created_at).toLocaleString()}\n`);
    }

    // 7. Summary and recommendations
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 INVESTIGATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    const totalSent = sendTransactions?.reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0) || 0;
    const missingAmount = 0.21955749;

    console.log(`Missing SOL: ${missingAmount.toFixed(8)} SOL (~₦35,352.52)`);
    console.log(`Total SOL Sent: ${totalSent.toFixed(8)} SOL`);
    console.log(`\nPossible explanations:`);
    console.log(`1. Manual adjustment set inventory to 0 (most likely)`);
    console.log(`2. SOL was sent out via SEND transaction: ${totalSent > 0 ? 'YES' : 'NO'}`);
    console.log(`3. Transaction recording issue`);
    console.log(`4. Initial inventory existed before first transaction`);
    console.log(`\nNext steps:`);
    console.log(`1. Check physical wallet balance on Solscan`);
    console.log(`2. Review admin logs around ${systemWallet?.updated_at ? new Date(systemWallet.updated_at).toLocaleString() : 'N/A'}`);
    console.log(`3. Check if SOL was transferred to exchange`);
    console.log(`4. Verify all SEND transactions are accounted for\n`);

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

investigateMissingSol()
  .then(() => {
    console.log('✅ Investigation Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
