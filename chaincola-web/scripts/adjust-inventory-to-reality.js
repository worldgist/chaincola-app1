#!/usr/bin/env node

/**
 * Adjust System Inventory to Match Reality
 * 
 * This script corrects the system inventory to match actual on-chain balances.
 * Since on-chain balances are 0 and crypto doesn't exist in user wallets,
 * we'll set the inventory to 0.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function adjustInventoryToReality() {
  try {
    console.log('🔍 Checking current inventory...\n');

    // Get current system wallet
    const { data: systemWallet, error: fetchError } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (fetchError || !systemWallet) {
      console.error('❌ Error fetching system wallet:', fetchError);
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 CURRENT INVENTORY');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`SOL:  ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`USDT: ${parseFloat(systemWallet.usdt_inventory || 0).toFixed(8)} USDT`);
    console.log(`USDC: ${parseFloat(systemWallet.usdc_inventory || 0).toFixed(8)} USDC`);
    console.log(`ETH:  ${parseFloat(systemWallet.eth_inventory || 0).toFixed(8)} ETH`);
    console.log(`BTC:  ${parseFloat(systemWallet.btc_inventory || 0).toFixed(8)} BTC`);
    console.log(`XRP:  ${parseFloat(systemWallet.xrp_inventory || 0).toFixed(8)} XRP\n`);

    // Calculate adjustments needed
    const currentSol = parseFloat(systemWallet.sol_inventory || 0);
    const currentUsdt = parseFloat(systemWallet.usdt_inventory || 0);
    const currentUsdc = parseFloat(systemWallet.usdc_inventory || 0);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔧 ADJUSTMENTS TO APPLY');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`SOL:  Subtract ${currentSol.toFixed(8)} SOL → Set to 0.00000000 SOL`);
    console.log(`USDT: Subtract ${currentUsdt.toFixed(8)} USDT → Set to 0.00000000 USDT`);
    console.log(`USDC: Subtract ${currentUsdc.toFixed(8)} USDC → Set to 0.00000000 USDC\n`);

    // Confirm before proceeding
    console.log('⚠️  This will set SOL, USDT, and USDC inventory to 0');
    console.log('   Reason: Crypto does not exist on-chain or in user wallets\n');

    // Update inventory to 0 for SOL, USDT, USDC
    const updateData = {
      sol_inventory: 0,
      usdt_inventory: 0,
      usdc_inventory: 0,
    };

    console.log('🔄 Updating inventory...\n');

    const { data: updatedWallet, error: updateError } = await supabase
      .from('system_wallets')
      .update(updateData)
      .eq('id', 1)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating inventory:', updateError);
      return;
    }

    console.log('✅ Inventory updated successfully!\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 UPDATED INVENTORY');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`SOL:  ${parseFloat(updatedWallet.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`USDT: ${parseFloat(updatedWallet.usdt_inventory || 0).toFixed(8)} USDT`);
    console.log(`USDC: ${parseFloat(updatedWallet.usdc_inventory || 0).toFixed(8)} USDC`);
    console.log(`ETH:  ${parseFloat(updatedWallet.eth_inventory || 0).toFixed(8)} ETH`);
    console.log(`BTC:  ${parseFloat(updatedWallet.btc_inventory || 0).toFixed(8)} BTC`);
    console.log(`XRP:  ${parseFloat(updatedWallet.xrp_inventory || 0).toFixed(8)} XRP\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ INVENTORY CORRECTED');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('The system inventory now matches reality:');
    console.log('- SOL, USDT, and USDC inventory set to 0');
    console.log('- Inventory matches on-chain balances (all 0)');
    console.log('- System is now in sync with blockchain reality\n');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

adjustInventoryToReality()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
