/**
 * Script to check system inventory balances
 * Shows all crypto inventory and NGN float balance
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

async function checkSystemInventory() {
  try {
    console.log('📊 Fetching system inventory...\n');

    // Get system wallet
    const { data: systemWallet, error } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('❌ Error fetching system wallet:', error);
      return;
    }

    if (!systemWallet) {
      console.error('❌ System wallet not found');
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 SYSTEM INVENTORY BALANCES');
    console.log('═══════════════════════════════════════════════════════\n');

    // Crypto Inventory
    console.log('📈 CRYPTO INVENTORY:');
    console.log(`   BTC:  ${parseFloat(systemWallet.btc_inventory || 0).toFixed(8)} BTC`);
    console.log(`   ETH:  ${parseFloat(systemWallet.eth_inventory || 0).toFixed(8)} ETH`);
    console.log(`   SOL:  ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`   USDT: ${parseFloat(systemWallet.usdt_inventory || 0).toFixed(8)} USDT`);
    console.log(`   USDC: ${parseFloat(systemWallet.usdc_inventory || 0).toFixed(8)} USDC`);
    console.log(`   XRP:  ${parseFloat(systemWallet.xrp_inventory || 0).toFixed(8)} XRP`);

    console.log('\n💵 NGN FLOAT BALANCE:');
    console.log(`   ₦${parseFloat(systemWallet.ngn_float_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    console.log('\n📅 LAST UPDATED:');
    console.log(`   ${new Date(systemWallet.updated_at).toLocaleString()}`);

    // Calculate total value (optional - would need current prices)
    console.log('\n═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

checkSystemInventory()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
