#!/usr/bin/env node

/**
 * Check Inventory Adjustments
 * 
 * This script checks audit logs for manual inventory adjustments,
 * especially SOL inventory adjustments that might explain the discrepancy.
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

async function checkInventoryAdjustments() {
  try {
    console.log('🔍 Checking Inventory Adjustments...\n');

    // 1. Check audit logs for TREASURY_ADJUSTMENT actions
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 TREASURY ADJUSTMENT LOGS');
    console.log('═══════════════════════════════════════════════════════\n');

    let auditLogs = [];
    let auditError = null;
    let solAdjustments = [];

    // Try audit_logs table first
    const { data: auditLogsData, error: auditLogsError } = await supabase
      .from('audit_logs')
      .select('id, action_type, performed_by, description, new_value, old_value, created_at')
      .eq('action_type', 'TREASURY_ADJUSTMENT')
      .order('created_at', { ascending: false })
      .limit(50);

    if (auditLogsError) {
      if (auditLogsError.code === 'PGRST205' || auditLogsError.message.includes('does not exist')) {
        console.log('⚠️  audit_logs table not found. Checking admin_action_logs...\n');
        
        // Try admin_action_logs as fallback
        const { data: adminLogsData, error: adminLogsError } = await supabase
          .from('admin_action_logs')
          .select('id, admin_user_id, action_type, action_details, created_at')
          .in('action_type', ['credit', 'debit', 'adjust'])
          .order('created_at', { ascending: false })
          .limit(50);

        if (adminLogsError) {
          console.error('❌ Error fetching admin_action_logs:', adminLogsError);
          auditError = adminLogsError;
        } else {
          // Transform admin_action_logs to match expected format
          auditLogs = (adminLogsData || []).map(log => {
            const details = log.action_details || {};
            return {
              id: log.id,
              action_type: 'ADMIN_ACTION',
              performed_by: log.admin_user_id,
              description: `${log.action_type} - ${JSON.stringify(details)}`,
              new_value: {
                ...details,
                asset: details.currency || details.asset, // Map currency to asset for consistency
                operation: log.action_type === 'credit' ? 'add' : log.action_type === 'debit' ? 'remove' : log.action_type
              },
              old_value: null,
              created_at: log.created_at
            };
          });
        }
      } else {
        console.error('❌ Error fetching audit_logs:', auditLogsError);
        auditError = auditLogsError;
      }
    } else {
      auditLogs = auditLogsData || [];
    }

    if (auditError && !auditLogs.length) {
      console.log('⚠️  Could not fetch audit logs. This might mean:');
      console.log('   1. The audit_logs table migration hasn\'t been run');
      console.log('   2. RLS policies are blocking access');
      console.log('   3. No adjustments have been logged yet\n');
    }

    if (!auditLogs || auditLogs.length === 0) {
      console.log('No treasury adjustment logs found.\n');
    } else if (auditLogs.length > 0) {
      console.log(`Found ${auditLogs.length} treasury adjustment logs:\n`);

      // Filter for SOL adjustments
      solAdjustments = auditLogs.filter(log => {
        const newValue = log.new_value || {};
        return newValue.asset === 'SOL' || newValue.currency === 'SOL' || (log.description && log.description.includes('SOL'));
      });

      if (solAdjustments.length > 0) {
        console.log(`📊 SOL Inventory Adjustments (${solAdjustments.length}):\n`);
        solAdjustments.forEach((log, index) => {
          const newValue = log.new_value || {};
          const oldValue = log.old_value || {};
          console.log(`[${index + 1}] ${new Date(log.created_at).toLocaleString()}`);
          console.log(`   Description: ${log.description}`);
          console.log(`   Asset: ${newValue.asset || 'N/A'}`);
          console.log(`   Amount: ${newValue.amount || 'N/A'}`);
          console.log(`   Operation: ${newValue.operation || 'N/A'}`);
          console.log(`   New Balance: ${newValue.new_balance || 'N/A'}`);
          if (oldValue.balance !== undefined) {
            console.log(`   Old Balance: ${oldValue.balance}`);
          }
          console.log(`   Reason: ${newValue.reason || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('No SOL-specific adjustments found.\n');
      }

      // Show all adjustments
      console.log('═══════════════════════════════════════════════════════');
      console.log('📋 ALL TREASURY ADJUSTMENTS (Recent 20)');
      console.log('═══════════════════════════════════════════════════════\n');
      auditLogs.slice(0, 20).forEach((log, index) => {
        const newValue = log.new_value || {};
        console.log(`[${index + 1}] ${new Date(log.created_at).toLocaleString()}`);
        console.log(`   ${log.description}`);
        if (newValue.asset) {
          console.log(`   Asset: ${newValue.asset}, Amount: ${newValue.amount}, Operation: ${newValue.operation}`);
        }
        console.log('');
      });
    }

    // 2. Check current system wallet state
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 CURRENT SYSTEM WALLET STATE');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (swError) {
      console.error('❌ Error fetching system wallet:', swError);
    } else {
      console.log(`SOL Inventory: ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
      console.log(`BTC Inventory: ${parseFloat(systemWallet.btc_inventory || 0).toFixed(8)} BTC`);
      console.log(`ETH Inventory: ${parseFloat(systemWallet.eth_inventory || 0).toFixed(8)} ETH`);
      console.log(`USDT Inventory: ${parseFloat(systemWallet.usdt_inventory || 0).toFixed(8)} USDT`);
      console.log(`USDC Inventory: ${parseFloat(systemWallet.usdc_inventory || 0).toFixed(8)} USDC`);
      console.log(`XRP Inventory: ${parseFloat(systemWallet.xrp_inventory || 0).toFixed(8)} XRP`);
      console.log(`NGN Float: ₦${parseFloat(systemWallet.ngn_float_balance || 0).toFixed(2)}`);
      console.log(`Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}\n`);
    }

    // 3. Check system_wallets update history via transactions
    console.log('═══════════════════════════════════════════════════════');
    console.log('📅 SYSTEM WALLET UPDATE HISTORY');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get all SOL transactions to see when inventory should have changed
    const { data: allSolTransactions, error: solTxError } = await supabase
      .from('transactions')
      .select('id, transaction_type, crypto_amount, created_at, status')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED'])
      .in('transaction_type', ['BUY', 'SELL'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (!solTxError && allSolTransactions && allSolTransactions.length > 0) {
      console.log('Recent SOL transactions that should have affected inventory:\n');
      allSolTransactions.slice(0, 20).forEach((tx, index) => {
        const sign = tx.transaction_type === 'SELL' ? '+' : '-';
        console.log(`  ${new Date(tx.created_at).toLocaleString()} | ${sign}${parseFloat(tx.crypto_amount || 0).toFixed(8)} SOL (${tx.transaction_type})`);
      });
      console.log('');
    }

    // 4. Check for any direct SQL updates (if there's a way to track this)
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    if (solAdjustments && solAdjustments.length > 0) {
      const recentAdjustment = solAdjustments[0];
      const newValue = recentAdjustment.new_value || {};
      console.log(`Most recent SOL adjustment: ${new Date(recentAdjustment.created_at).toLocaleString()}`);
      console.log(`Operation: ${newValue.operation || recentAdjustment.action_type || 'N/A'}`);
      console.log(`Amount: ${newValue.amount || 'N/A'} SOL`);
      console.log(`Reason: ${newValue.reason || 'N/A'}`);
      if (newValue.new_balance !== undefined) {
        console.log(`New Balance: ${newValue.new_balance} SOL`);
      }
      console.log('');
      
      console.log(`📊 Total SOL adjustments found: ${solAdjustments.length}`);
      const totalAdded = solAdjustments
        .filter(a => (a.new_value?.operation === 'add' || a.action_type === 'credit'))
        .reduce((sum, a) => sum + parseFloat(a.new_value?.amount || 0), 0);
      const totalRemoved = solAdjustments
        .filter(a => (a.new_value?.operation === 'remove' || a.action_type === 'debit'))
        .reduce((sum, a) => sum + parseFloat(a.new_value?.amount || 0), 0);
      console.log(`   Total Added: ${totalAdded.toFixed(8)} SOL`);
      console.log(`   Total Removed: ${totalRemoved.toFixed(8)} SOL`);
      console.log(`   Net Change: ${(totalAdded - totalRemoved).toFixed(8)} SOL\n`);
    } else {
      console.log('⚠️  No SOL inventory adjustments found in audit logs.');
      console.log('   This could mean:');
      console.log('   1. Inventory was adjusted via direct SQL (not logged)');
      console.log('   2. Inventory was set to 0 during system initialization');
      console.log('   3. Adjustments happened before audit logging was implemented');
      console.log('   4. The discrepancy is from transaction processing, not manual adjustments\n');
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

checkInventoryAdjustments()
  .then(() => {
    console.log('✅ Check Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
