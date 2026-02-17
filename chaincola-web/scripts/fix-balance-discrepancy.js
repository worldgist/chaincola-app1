/**
 * Fix balance discrepancy for chaincolawallet@gmail.com
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

const USER_EMAIL = 'chaincolawallet@gmail.com';
const CALCULATED_BALANCE = 393666.04; // From transaction history

async function findUser() {
  const { data: authUsers, error } = await supabase.auth.admin.listUsers();
  if (error || !authUsers?.users) {
    console.error('❌ Error fetching users:', error);
    return null;
  }
  
  const user = authUsers.users.find(u => u.email === USER_EMAIL);
  if (!user) {
    console.error(`❌ User ${USER_EMAIL} not found`);
    return null;
  }
  
  return user;
}

async function calculateBalanceFromTransactions(userId) {
  // Get all NGN-related transactions
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .or('fiat_currency.eq.NGN,crypto_currency.eq.NGN')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return null;
  }

  let balance = 0;
  const balanceHistory = [];

  transactions.forEach(tx => {
    const amount = parseFloat(tx.fiat_amount || '0');
    
    if (tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'SELL') {
      balance += amount;
    } else if (tx.transaction_type === 'BUY' || tx.transaction_type === 'WITHDRAW') {
      balance -= amount;
    }
    
    balanceHistory.push({
      id: tx.id,
      date: tx.created_at,
      type: tx.transaction_type,
      amount: amount,
      balance: balance,
    });
  });

  return { balance, transactions, balanceHistory };
}

async function investigate() {
  console.log('\n🔍 Investigating Balance Discrepancy\n');
  console.log('='.repeat(80));
  console.log(`User: ${USER_EMAIL}`);
  console.log(`Calculated Balance: ₦${CALCULATED_BALANCE.toLocaleString()}`);
  console.log('='.repeat(80) + '\n');

  const user = await findUser();
  if (!user) return null;

  const userId = user.id;
  console.log(`✅ Found user: ${user.email} (ID: ${userId})\n`);

  // Calculate balance from transactions
  const calcResult = await calculateBalanceFromTransactions(userId);
  if (!calcResult) {
    return null;
  }

  const calculatedBalance = calcResult.balance;
  console.log(`📊 Calculated balance from transactions: ₦${calculatedBalance.toFixed(2)}\n`);

  // Get current balances
  const { data: walletBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  const { data: wallet } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  const { data: userWallet } = await supabase
    .from('user_wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  const wbBalance = parseFloat(walletBalance?.balance || '0');
  const wBalance = parseFloat(wallet?.ngn_balance || '0');
  const uwBalance = parseFloat(userWallet?.ngn_balance || '0');

  console.log('Current Stored Balances:');
  console.log(`  wallet_balances: ₦${wbBalance.toLocaleString()}`);
  console.log(`  wallets: ₦${wBalance.toLocaleString()}`);
  console.log(`  user_wallets: ₦${uwBalance.toLocaleString()}\n`);

  const storedBalance = Math.max(wbBalance, wBalance, uwBalance);
  const discrepancy = storedBalance - calculatedBalance;

  console.log('='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80) + '\n');
  console.log(`Calculated Balance: ₦${calculatedBalance.toFixed(2)}`);
  console.log(`Stored Balance: ₦${storedBalance.toFixed(2)}`);
  console.log(`Discrepancy: ₦${discrepancy.toFixed(2)}\n`);

  // Check if we should use calculated balance or stored balance
  // If discrepancy is small (< 1000), we'll use calculated balance as source of truth
  if (Math.abs(discrepancy) < 1000) {
    console.log('✅ Discrepancy is small. Using calculated balance as source of truth.\n');
    return {
      user,
      userId,
      calculatedBalance,
      storedBalance,
      discrepancy,
      targetBalance: calculatedBalance,
    };
  } else {
    console.log('⚠️  Large discrepancy detected. Manual review may be needed.\n');
    return {
      user,
      userId,
      calculatedBalance,
      storedBalance,
      discrepancy,
      targetBalance: calculatedBalance, // Still use calculated as it's from transaction history
    };
  }
}

async function applyFix(analysis) {
  if (!analysis) {
    console.log('❌ Could not analyze the issue.\n');
    return false;
  }

  const { userId, targetBalance, storedBalance, discrepancy } = analysis;

  console.log('\n' + '='.repeat(80));
  console.log('APPLYING FIX');
  console.log('='.repeat(80) + '\n');

  console.log('Fix Details:');
  console.log(`  User ID: ${userId}`);
  console.log(`  Current Stored Balance: ₦${storedBalance.toFixed(2)}`);
  console.log(`  Target Balance: ₦${targetBalance.toFixed(2)}`);
  console.log(`  Adjustment: ₦${(targetBalance - storedBalance).toFixed(2)}\n`);

  if (Math.abs(discrepancy) > 10000) {
    console.log('⚠️  WARNING: Large correction amount detected!');
    console.log('   Please verify this is correct before proceeding.\n');
  }

  try {
    // Update wallet_balances
    console.log('📝 Updating wallet_balances...');
    const { error: wbError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: targetBalance.toFixed(2),
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
        user_id: userId,
        ngn_balance: targetBalance.toFixed(2),
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
        ngn_balance: targetBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

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
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();

    const { data: verifyW } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    const verifiedWB = parseFloat(verifyWB?.balance || '0');
    const verifiedW = parseFloat(verifyW?.ngn_balance || '0');

    console.log('Verified Balances:');
    console.log(`  wallet_balances: ₦${verifiedWB.toLocaleString()}`);
    console.log(`  wallets: ₦${verifiedW.toLocaleString()}\n`);

    if (Math.abs(verifiedWB - targetBalance) < 1 && 
        Math.abs(verifiedW - targetBalance) < 1) {
      console.log('✅ SUCCESS: Balance corrected successfully!');
      console.log(`   Balance updated from ₦${storedBalance.toFixed(2)} to ₦${targetBalance.toFixed(2)}\n`);
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
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply') || args.includes('-a');

  const analysis = await investigate();

  if (!analysis) {
    console.log('❌ Could not investigate the issue.\n');
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
    console.log(`   node scripts/fix-balance-discrepancy.js --apply\n`);
  }
}

main().catch(console.error);
