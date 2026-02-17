#!/usr/bin/env node

/**
 * Inventory Reconciliation Script
 * 
 * This script uses the reconcile_inventory() function to check for discrepancies
 * between expected inventory (based on transactions) and actual inventory.
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

async function reconcileInventory(asset = null) {
  try {
    console.log('🔍 Reconciling Inventory...\n');
    
    if (asset) {
      console.log(`Checking ${asset} inventory...\n`);
    } else {
      console.log('Checking all assets...\n');
    }

    // Call the reconciliation function
    const { data, error } = await supabase.rpc('reconcile_inventory', {
      p_asset: asset || null
    });

    if (error) {
      console.error('❌ Error calling reconcile_inventory:', error);
      
      // If function doesn't exist, provide helpful message
      if (error.code === '42883' || error.message.includes('does not exist')) {
        console.log('\n💡 The reconcile_inventory function may not exist yet.');
        console.log('   Please run the migration: 20260130000015_add_inventory_audit_safeguards.sql\n');
      }
      return;
    }

    if (!data || data.length === 0) {
      console.log('No reconciliation data returned.\n');
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 INVENTORY RECONCILIATION RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    let hasDiscrepancies = false;

    data.forEach((row) => {
      const statusIcon = row.status === 'OK' ? '✅' : '⚠️';
      const discrepancy = parseFloat(row.discrepancy || 0);
      
      console.log(`${statusIcon} ${row.asset}:`);
      console.log(`   Expected: ${parseFloat(row.expected_inventory || 0).toFixed(8)}`);
      console.log(`   Actual:   ${parseFloat(row.actual_inventory || 0).toFixed(8)}`);
      
      if (row.status === 'DISCREPANCY') {
        hasDiscrepancies = true;
        const sign = discrepancy >= 0 ? '+' : '';
        console.log(`   ⚠️  Discrepancy: ${sign}${discrepancy.toFixed(8)}`);
        
        if (discrepancy < 0) {
          console.log(`   ⚠️  Missing inventory! Expected ${Math.abs(discrepancy).toFixed(8)} more`);
        } else {
          console.log(`   ⚠️  Extra inventory! Have ${discrepancy.toFixed(8)} more than expected`);
        }
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    if (hasDiscrepancies) {
      console.log('⚠️  DISCREPANCIES DETECTED!');
      console.log('\nPossible causes:');
      console.log('1. Manual inventory adjustments not logged');
      console.log('2. Initial inventory existed before first transaction');
      console.log('3. Inventory was transferred out (check SEND transactions)');
      console.log('4. Transaction recording issues');
      console.log('5. Inventory adjustments via direct SQL (not through functions)\n');
      
      console.log('Next steps:');
      console.log('1. Run: node scripts/check-inventory-adjustments.js');
      console.log('2. Check audit logs for manual adjustments');
      console.log('3. Review transaction history');
      console.log('4. Use safe_update_inventory() function for future adjustments\n');
    } else {
      console.log('✅ All inventories match expected values!\n');
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const asset = args[0] || null; // e.g., 'SOL', 'BTC', etc.

reconcileInventory(asset)
  .then(() => {
    console.log('✅ Reconciliation Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
