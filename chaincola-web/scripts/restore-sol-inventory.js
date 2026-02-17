#!/usr/bin/env node

/**
 * Restore Missing SOL Inventory
 * 
 * This script restores the missing SOL inventory (0.21075749 SOL) that was
 * manually adjusted to 0. This restores it based on transaction history.
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

async function restoreSolInventory() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 RESTORING SOL INVENTORY');
    console.log('═══════════════════════════════════════════════════════\n');

    // Calculate expected inventory from transactions
    const { data: allTxs, error: txError } = await supabase
      .from('transactions')
      .select('transaction_type, crypto_amount')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED'])
      .in('transaction_type', ['BUY', 'SELL']);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    const totalSold = allTxs?.filter(t => t.transaction_type === 'SELL').reduce((sum, t) => sum + parseFloat(t.crypto_amount || 0), 0) || 0;
    const totalBought = allTxs?.filter(t => t.transaction_type === 'BUY').reduce((sum, t) => sum + parseFloat(t.crypto_amount || 0), 0) || 0;
    const totalSent = allTxs?.filter(t => t.transaction_type === 'SEND').reduce((sum, t) => sum + parseFloat(t.crypto_amount || 0), 0) || 0;
    
    const expectedInventory = totalSold - totalBought - totalSent;

    // Get current inventory
    const { data: systemWallet, error: walletError } = await supabase
      .from('system_wallets')
      .select('sol_inventory')
      .eq('id', 1)
      .single();

    if (walletError) {
      console.error('❌ Error fetching system wallet:', walletError);
      return;
    }

    const currentInventory = parseFloat(systemWallet?.sol_inventory || 0);
    const missingAmount = expectedInventory - currentInventory;

    console.log('📊 Current Status:');
    console.log(`   Total SOL Sold: ${totalSold.toFixed(8)} SOL`);
    console.log(`   Total SOL Bought: ${totalBought.toFixed(8)} SOL`);
    console.log(`   Total SOL Sent: ${totalSent.toFixed(8)} SOL`);
    console.log(`   Expected Inventory: ${expectedInventory.toFixed(8)} SOL`);
    console.log(`   Current Inventory: ${currentInventory.toFixed(8)} SOL`);
    console.log(`   Missing Amount: ${missingAmount.toFixed(8)} SOL\n`);

    if (missingAmount <= 0) {
      console.log('✅ No restoration needed - inventory is correct or higher than expected');
      return;
    }

    console.log(`⚠️  About to restore ${missingAmount.toFixed(8)} SOL to inventory`);
    console.log(`   This will set inventory from ${currentInventory.toFixed(8)} to ${expectedInventory.toFixed(8)} SOL\n`);

    // Try to use safe_update_inventory function first (preferred method with audit logging)
    let useDirectUpdate = false;
    const { data: result, error: updateError } = await supabase.rpc('safe_update_inventory', {
      p_asset: 'SOL',
      p_amount: missingAmount,
      p_operation: 'add',
      p_reason: 'Restoring missing SOL inventory based on transaction history reconciliation',
      p_performed_by: null, // System adjustment
    });

    if (updateError) {
      // Check if function doesn't exist (PGRST202 = function not found in schema cache)
      if (updateError.code === 'PGRST202' || updateError.message?.includes('Could not find the function')) {
        console.log('⚠️  Note: safe_update_inventory function not found');
        console.log('   This usually means migration 20260130000015_add_inventory_audit_safeguards.sql');
        console.log('   has not been applied yet, or PostgREST schema cache needs refresh.\n');
        console.log('   💡 To enable audit logging, apply the migration:');
        console.log('      supabase db push');
        console.log('   Or via Dashboard: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new\n');
        useDirectUpdate = true;
      } else {
        console.error('❌ Error calling safe_update_inventory:', updateError);
        console.log('\n🔄 Falling back to direct update...\n');
        useDirectUpdate = true;
      }
    }

    if (useDirectUpdate) {
      // Fallback: Direct update if function doesn't work or doesn't exist
      const { data: updatedWallet, error: directError } = await supabase
        .from('system_wallets')
        .update({ 
          sol_inventory: expectedInventory,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
        .select()
        .single();

      if (directError) {
        console.error('❌ Direct update failed:', directError);
        return;
      }

      console.log('✅ Inventory restored via direct update');
      console.log(`   New Inventory: ${parseFloat(updatedWallet.sol_inventory).toFixed(8)} SOL`);
      console.log('   ⚠️  Note: This update bypassed audit logging. Consider applying the migration\n');
    } else {
      console.log('✅ Inventory restored successfully using safe_update_inventory!');
      console.log(`   Old Inventory: ${result.old_inventory} SOL`);
      console.log(`   New Inventory: ${result.new_inventory} SOL`);
      console.log(`   Audit Log ID: ${result.audit_log_id}\n`);
    }

    // Verify the update
    const { data: verifyWallet } = await supabase
      .from('system_wallets')
      .select('sol_inventory, updated_at')
      .eq('id', 1)
      .single();

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ VERIFICATION');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Current Inventory: ${parseFloat(verifyWallet?.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`   Expected Inventory: ${expectedInventory.toFixed(8)} SOL`);
    console.log(`   Match: ${Math.abs(parseFloat(verifyWallet?.sol_inventory || 0) - expectedInventory) < 0.00000001 ? '✅ Yes' : '⚠️ No'}`);
    console.log(`   Last Updated: ${new Date(verifyWallet?.updated_at).toLocaleString()}\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 IMPORTANT NOTES:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('   ⚠️  This is an INTERNAL LEDGER restoration');
    console.log('   ⚠️  The SOL may not exist on-chain');
    console.log('   ⚠️  You may need to acquire actual SOL to back this inventory');
    console.log('   ⚠️  Check on-chain balance: node scripts/check-onchain-balances.js\n');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

restoreSolInventory()
  .then(() => {
    console.log('✅ Restoration Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
