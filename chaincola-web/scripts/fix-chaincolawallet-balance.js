/**
 * Fix balance for user chaincolawallet@gmail.com
 * User ID: f04afc9d-8cde-40dd-b78d-094369aab856
 * Issue: wallet_balances and wallets tables show ₦85,399,670.3 instead of ₦399,670.3
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

async function analyzeIssue() {
  console.log('\n🔍 Analyzing balance issue for user...\n');
  console.log(`User: ${USER_EMAIL}`);
  console.log(`User ID: ${USER_ID}\n`);
  console.log('='.repeat(80));

  try {
    // Get current balances
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', USER_ID)
      .single();

    const { data: walletBalances } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', USER_ID);

    const { data: walletTable } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', USER_ID)
      .single();

    const balanceUserWallets = parseFloat(userWallet?.ngn_balance || '0');
    const ngnWalletBalance = walletBalances?.find(wb => wb.currency === 'NGN');
    const balanceWalletBalances = parseFloat(ngnWalletBalance?.balance || '0');
    const balanceWallets = parseFloat(walletTable?.ngn_balance || '0');

    console.log('Current Balances:\n');
    console.log(`  user_wallets.ngn_balance: ₦${balanceUserWallets.toLocaleString()}`);
    console.log(`  wallet_balances.balance (NGN): ₦${balanceWalletBalances.toLocaleString()}`);
    console.log(`  wallets.ngn_balance: ₦${balanceWallets.toLocaleString()}\n`);

    // Determine correct balance (use user_wallets as source of truth)
    const correctBalance = balanceUserWallets;
    const overCreditWalletBalances = balanceWalletBalances - correctBalance;
    const overCreditWallets = balanceWallets - correctBalance;

    console.log('Issue Analysis:\n');
    console.log(`  Correct balance (from user_wallets): ₦${correctBalance.toLocaleString()}`);
    console.log(`  wallet_balances over-credit: ₦${overCreditWalletBalances.toLocaleString()}`);
    console.log(`  wallets over-credit: ₦${overCreditWallets.toLocaleString()}\n`);

    if (overCreditWalletBalances > 1000 || overCreditWallets > 1000) {
      console.log('⚠️  Significant discrepancy detected!\n');
      return {
        correctBalance,
        balanceUserWallets,
        balanceWalletBalances,
        balanceWallets,
        overCreditWalletBalances,
        overCreditWallets,
        needsFix: true
      };
    } else {
      console.log('✅ Balances appear to be in sync.\n');
      return {
        correctBalance,
        balanceUserWallets,
        balanceWalletBalances,
        balanceWallets,
        overCreditWalletBalances,
        overCreditWallets,
        needsFix: false
      };
    }

  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function applyFix(analysis) {
  if (!analysis || !analysis.needsFix) {
    console.log('No fix needed.\n');
    return false;
  }

  console.log('\n' + '='.repeat(80));
  console.log('APPLYING FIX');
  console.log('='.repeat(80) + '\n');

  const { correctBalance, overCreditWalletBalances, overCreditWallets } = analysis;

  console.log('Fix Details:');
  console.log(`  User ID: ${USER_ID}`);
  console.log(`  Correct Balance: ₦${correctBalance.toLocaleString()}`);
  console.log(`  wallet_balances adjustment: -₦${overCreditWalletBalances.toLocaleString()}`);
  console.log(`  wallets adjustment: -₦${overCreditWallets.toLocaleString()}\n`);

  // Safety check
  if (overCreditWalletBalances > 10000000 || overCreditWallets > 10000000) {
    console.log('⚠️  WARNING: Very large correction amount detected!');
    console.log('   Please verify this is correct before proceeding.\n');
  }

  if (correctBalance < 0) {
    console.log('❌ ERROR: Correct balance would be negative. Cannot proceed.\n');
    return false;
  }

  try {
    // Fix wallet_balances
    console.log('📝 Fixing wallet_balances table...');
    const { error: wbError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: USER_ID,
        currency: 'NGN',
        balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,currency'
      });

    if (wbError) {
      console.error('❌ Failed to update wallet_balances:', wbError);
      return false;
    }
    console.log('✅ Updated wallet_balances.balance\n');

    // Fix wallets
    console.log('📝 Fixing wallets table...');
    const { error: wError } = await supabase
      .from('wallets')
      .upsert({
        user_id: USER_ID,
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (wError) {
      console.error('❌ Failed to update wallets:', wError);
      return false;
    }
    console.log('✅ Updated wallets.ngn_balance\n');

    // Verify fix
    console.log('🔍 Verifying fix...\n');
    const { data: verifyWallets } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

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

    const verifiedUW = parseFloat(verifyWallets?.ngn_balance || '0');
    const verifiedWB = parseFloat(verifyWB?.balance || '0');
    const verifiedW = parseFloat(verifyW?.ngn_balance || '0');

    console.log('Verified Balances:');
    console.log(`  user_wallets: ₦${verifiedUW.toLocaleString()}`);
    console.log(`  wallet_balances: ₦${verifiedWB.toLocaleString()}`);
    console.log(`  wallets: ₦${verifiedW.toLocaleString()}\n`);

    if (Math.abs(verifiedUW - verifiedWB) < 1 && Math.abs(verifiedUW - verifiedW) < 1) {
      console.log('✅ SUCCESS: All balances are now synchronized!\n');
      return true;
    } else {
      console.log('⚠️  WARNING: Balances may still be out of sync. Please verify manually.\n');
      return false;
    }

  } catch (error) {
    console.error('❌ Error applying fix:', error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply') || args.includes('-a');

  console.log('🔧 Fix Balance for chaincolawallet@gmail.com\n');

  const analysis = await analyzeIssue();

  if (!analysis) {
    console.log('❌ Could not analyze the issue.\n');
    process.exit(1);
  }

  if (shouldApply) {
    const success = await applyFix(analysis);
    if (success) {
      console.log('✅ Fix applied successfully!\n');
      process.exit(0);
    } else {
      console.log('❌ Failed to apply fix.\n');
      process.exit(1);
    }
  } else {
    console.log('\n⚠️  To apply the fix, run:');
    console.log(`   node scripts/fix-chaincolawallet-balance.js --apply\n`);
  }
}

main().catch(console.error);
