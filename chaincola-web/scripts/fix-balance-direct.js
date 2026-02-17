/**
 * Direct fix for balance discrepancy for chaincolawallet@gmail.com
 * User ID: f04afc9d-8cde-40dd-b78d-094369aab856
 * Calculated balance: ₦393,666.04
 * Stored balance: ₦394,340.49
 * Discrepancy: ₦674.45
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_ID = 'f04afc9d-8cde-40dd-b78d-094369aab856';
const USER_EMAIL = 'chaincolawallet@gmail.com';
const TARGET_BALANCE = 393666.04; // Calculated from transaction history

async function applyFix() {
  console.log('\n🔧 Fixing Balance Discrepancy\n');
  console.log('='.repeat(80));
  console.log(`User: ${USER_EMAIL}`);
  console.log(`User ID: ${USER_ID}`);
  console.log(`Target Balance: ₦${TARGET_BALANCE.toLocaleString()}`);
  console.log('='.repeat(80) + '\n');

  // Get current balances
  const { data: walletBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', USER_ID)
    .eq('currency', 'NGN')
    .single();

  const { data: wallet } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', USER_ID)
    .single();

  const { data: userWallet } = await supabase
    .from('user_wallets')
    .select('ngn_balance')
    .eq('user_id', USER_ID)
    .single();

  const currentWB = parseFloat(walletBalance?.balance || '0');
  const currentW = parseFloat(wallet?.ngn_balance || '0');
  const currentUW = parseFloat(userWallet?.ngn_balance || '0');

  console.log('Current Balances:');
  console.log(`  wallet_balances: ₦${currentWB.toLocaleString()}`);
  console.log(`  wallets: ₦${currentW.toLocaleString()}`);
  console.log(`  user_wallets: ₦${currentUW.toLocaleString()}\n`);

  const currentBalance = Math.max(currentWB, currentW, currentUW);
  const adjustment = TARGET_BALANCE - currentBalance;

  console.log(`Current Balance: ₦${currentBalance.toLocaleString()}`);
  console.log(`Target Balance: ₦${TARGET_BALANCE.toLocaleString()}`);
  console.log(`Adjustment: ₦${adjustment.toFixed(2)}\n`);

  if (Math.abs(adjustment) < 0.01) {
    console.log('✅ Balance is already correct. No fix needed.\n');
    return true;
  }

  try {
    // Update wallet_balances
    console.log('📝 Updating wallet_balances...');
    const { error: wbError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: USER_ID,
        currency: 'NGN',
        balance: TARGET_BALANCE.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (wbError) {
      console.error('❌ Failed to update wallet_balances:', wbError);
      return false;
    }
    console.log('✅ Updated wallet_balances\n');

    // Update wallets
    console.log('📝 Updating wallets...');
    const { error: wError } = await supabase
      .from('wallets')
      .upsert({
        user_id: USER_ID,
        ngn_balance: TARGET_BALANCE.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (wError) {
      console.error('❌ Failed to update wallets:', wError);
      return false;
    }
    console.log('✅ Updated wallets\n');

    // Update user_wallets
    console.log('📝 Updating user_wallets...');
    const { error: uwError } = await supabase
      .from('user_wallets')
      .update({
        ngn_balance: TARGET_BALANCE.toFixed(2),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', USER_ID);

    if (uwError) {
      console.warn('⚠️  Failed to update user_wallets (may not exist):', uwError);
    } else {
      console.log('✅ Updated user_wallets\n');
    }

    // Verify fix
    console.log('🔍 Verifying fix...\n');
    const { data: verifyWB } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', USER_ID)
      .eq('currency', 'NGN')
      .single();

    const { data: verifyW } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const { data: verifyUW } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const verifiedWB = parseFloat(verifyWB?.balance || '0');
    const verifiedW = parseFloat(verifyW?.ngn_balance || '0');
    const verifiedUW = parseFloat(verifyUW?.ngn_balance || '0');

    console.log('Verified Balances:');
    console.log(`  wallet_balances: ₦${verifiedWB.toLocaleString()}`);
    console.log(`  wallets: ₦${verifiedW.toLocaleString()}`);
    console.log(`  user_wallets: ₦${verifiedUW.toLocaleString()}\n`);

    if (Math.abs(verifiedWB - TARGET_BALANCE) < 1 && 
        Math.abs(verifiedW - TARGET_BALANCE) < 1 &&
        Math.abs(verifiedUW - TARGET_BALANCE) < 1) {
      console.log('✅ SUCCESS: Balance corrected successfully!');
      console.log(`   Balance updated from ₦${currentBalance.toFixed(2)} to ₦${TARGET_BALANCE.toFixed(2)}\n`);
      return true;
    } else {
      console.log('⚠️  WARNING: Balances may still be incorrect. Please verify manually.\n');
      return false;
    }

  } catch (error) {
    console.error('❌ Error applying fix:', error);
    return false;
  }
}

async function main() {
  const success = await applyFix();
  if (success) {
    console.log('✅ Fix completed!\n');
    process.exit(0);
  } else {
    console.log('❌ Fix failed.\n');
    process.exit(1);
  }
}

main().catch(console.error);
