/**
 * Check ALL transactions for chaincolawallet@gmail.com to find balance discrepancy
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_EMAIL = 'chaincolawallet@gmail.com';
const REPORTED_BALANCE = 399670.30;

async function main() {
  console.log('\n🔍 Checking ALL transactions for balance discrepancy\n');
  console.log('='.repeat(80));

  // Get user
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users?.find(u => u.email === USER_EMAIL);
  
  if (!user) {
    console.error(`❌ User ${USER_EMAIL} not found`);
    return;
  }

  const userId = user.id;
  console.log(`User: ${USER_EMAIL} (ID: ${userId})\n`);

  // Get ALL transactions
  const { data: allTx, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`📊 Total transactions: ${allTx.length}\n`);

  // Group by type
  const byType = {};
  allTx.forEach(tx => {
    const type = tx.transaction_type || 'UNKNOWN';
    if (!byType[type]) byType[type] = [];
    byType[type].push(tx);
  });

  console.log('Transactions by type:');
  Object.keys(byType).forEach(type => {
    console.log(`  ${type}: ${byType[type].length}`);
  });
  console.log('');

  // Calculate NGN balance from transactions
  let calculatedBalance = 0;
  const ngnTransactions = allTx.filter(tx => 
    tx.fiat_currency === 'NGN' && 
    tx.status === 'COMPLETED' &&
    parseFloat(tx.fiat_amount || '0') !== 0
  );

  console.log('NGN Transactions (affecting balance):\n');
  ngnTransactions.forEach((tx, idx) => {
    const amount = parseFloat(tx.fiat_amount || '0');
    const isCredit = tx.transaction_type === 'SELL' || tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'RECEIVE';
    const isDebit = tx.transaction_type === 'BUY' || tx.transaction_type === 'WITHDRAW' || tx.transaction_type === 'SEND';
    
    if (isCredit) {
      calculatedBalance += amount;
      console.log(`${idx + 1}. +₦${amount.toLocaleString()} (${tx.transaction_type}) - ${new Date(tx.created_at).toLocaleString()}`);
    } else if (isDebit) {
      calculatedBalance -= amount;
      console.log(`${idx + 1}. -₦${amount.toLocaleString()} (${tx.transaction_type}) - ${new Date(tx.created_at).toLocaleString()}`);
    } else {
      console.log(`${idx + 1}. ₦${amount.toLocaleString()} (${tx.transaction_type}) - ${new Date(tx.created_at).toLocaleString()}`);
    }
  });

  console.log(`\n💰 Calculated balance from transactions: ₦${calculatedBalance.toFixed(2)}`);

  // Get current balances
  const { data: wb } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  const { data: w } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  const { data: uw } = await supabase
    .from('user_wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();

  const wbBalance = parseFloat(wb?.balance || '0');
  const wBalance = parseFloat(w?.ngn_balance || '0');
  const uwBalance = parseFloat(uw?.ngn_balance || '0');

  console.log(`\nCurrent balances:`);
  console.log(`  wallet_balances: ₦${wbBalance.toLocaleString()}`);
  console.log(`  wallets: ₦${wBalance.toLocaleString()}`);
  console.log(`  user_wallets: ₦${uwBalance.toLocaleString()}`);
  console.log(`\nReported balance: ₦${REPORTED_BALANCE.toLocaleString()}`);

  const diff = REPORTED_BALANCE - wbBalance;
  console.log(`\nDifference: ₦${diff.toLocaleString()}`);

  // Check for transactions around the reported amount
  console.log('\n🔍 Checking for suspicious transactions...\n');
  const suspiciousTx = allTx.filter(tx => {
    const amount = parseFloat(tx.fiat_amount || '0');
    return Math.abs(amount - REPORTED_BALANCE) < 100 || 
           Math.abs(amount - diff) < 100 ||
           amount > 300000;
  });

  if (suspiciousTx.length > 0) {
    console.log('Suspicious transactions found:');
    suspiciousTx.forEach(tx => {
      console.log(`  ID: ${tx.id}`);
      console.log(`  Type: ${tx.transaction_type}`);
      console.log(`  Amount: ₦${parseFloat(tx.fiat_amount || '0').toLocaleString()}`);
      console.log(`  Date: ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`  Metadata: ${JSON.stringify(tx.metadata, null, 2)}\n`);
    });
  }
}

main().catch(console.error);
