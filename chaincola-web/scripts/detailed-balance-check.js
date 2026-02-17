/**
 * Detailed balance check for chaincolawallet@gmail.com
 * Check all balance sources and transaction history
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

async function detailedCheck() {
  console.log('\n🔍 Detailed Balance Investigation\n');
  console.log('='.repeat(80));

  // Get user
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users?.find(u => u.email === USER_EMAIL);
  if (!user) {
    console.error('❌ User not found');
    return;
  }

  const userId = user.id;
  console.log(`User: ${USER_EMAIL} (${userId})\n`);

  // Check ALL balance sources
  console.log('📊 Checking all balance sources:\n');

  const { data: wb } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();

  const { data: w } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: uw } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  console.log('wallet_balances:');
  console.log(`  Balance: ₦${parseFloat(wb?.balance || '0').toLocaleString()}`);
  console.log(`  Updated: ${wb?.updated_at || 'N/A'}`);
  console.log(`  Created: ${wb?.created_at || 'N/A'}\n`);

  console.log('wallets:');
  console.log(`  NGN Balance: ₦${parseFloat(w?.ngn_balance || '0').toLocaleString()}`);
  console.log(`  Updated: ${w?.updated_at || 'N/A'}`);
  console.log(`  Created: ${w?.created_at || 'N/A'}\n`);

  if (uw) {
    console.log('user_wallets:');
    console.log(`  NGN Balance: ₦${parseFloat(uw?.ngn_balance || '0').toLocaleString()}`);
    console.log(`  Updated: ${uw?.updated_at || 'N/A'}`);
    console.log(`  Created: ${uw?.created_at || 'N/A'}\n`);
  } else {
    console.log('user_wallets: Not found\n');
  }

  // Get ALL transactions (not just SOL sells)
  console.log('📋 Transaction History:\n');
  
  const { data: allTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  console.log(`Total transactions: ${allTx?.length || 0}\n`);

  // Calculate balance from transactions
  let calculatedBalance = 0;
  const ngnTransactions = allTx?.filter(tx => 
    tx.fiat_currency === 'NGN' && 
    (tx.transaction_type === 'SELL' || tx.transaction_type === 'BUY' || tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'WITHDRAW')
  ) || [];

  console.log(`NGN-related transactions: ${ngnTransactions.length}\n`);

  ngnTransactions.forEach((tx, index) => {
    const amount = parseFloat(tx.fiat_amount || '0');
    const type = tx.transaction_type;
    const isCredit = type === 'SELL' || type === 'DEPOSIT';
    const isDebit = type === 'BUY' || type === 'WITHDRAW';
    
    if (isCredit) {
      calculatedBalance += amount;
    } else if (isDebit) {
      calculatedBalance -= amount;
    }

    console.log(`${index + 1}. ${new Date(tx.created_at).toLocaleString()}`);
    console.log(`   Type: ${type}`);
    console.log(`   Amount: ${isCredit ? '+' : '-'}₦${amount.toLocaleString()}`);
    console.log(`   Balance after: ₦${calculatedBalance.toLocaleString()}`);
    if (tx.crypto_currency) {
      console.log(`   Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
    }
    console.log(`   ID: ${tx.id}\n`);
  });

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80) + '\n');

  const wbBalance = parseFloat(wb?.balance || '0');
  const wBalance = parseFloat(w?.ngn_balance || '0');
  const uwBalance = parseFloat(uw?.ngn_balance || '0');
  const maxBalance = Math.max(wbBalance, wBalance, uwBalance);

  console.log(`wallet_balances: ₦${wbBalance.toLocaleString()}`);
  console.log(`wallets: ₦${wBalance.toLocaleString()}`);
  if (uw) console.log(`user_wallets: ₦${uwBalance.toLocaleString()}`);
  console.log(`Calculated from transactions: ₦${calculatedBalance.toLocaleString()}`);
  console.log(`User reported: ₦${REPORTED_BALANCE.toLocaleString()}\n`);

  if (Math.abs(maxBalance - REPORTED_BALANCE) > 1) {
    console.log(`⚠️  DISCREPANCY: Current balance (₦${maxBalance.toLocaleString()}) does not match reported (₦${REPORTED_BALANCE.toLocaleString()})`);
    console.log(`   Difference: ₦${Math.abs(maxBalance - REPORTED_BALANCE).toLocaleString()}\n`);
  } else {
    console.log(`✅ Balance matches reported amount\n`);
  }

  if (Math.abs(calculatedBalance - maxBalance) > 1) {
    console.log(`⚠️  WARNING: Calculated balance (₦${calculatedBalance.toLocaleString()}) does not match stored balance (₦${maxBalance.toLocaleString()})`);
    console.log(`   Difference: ₦${Math.abs(calculatedBalance - maxBalance).toLocaleString()}\n`);
  } else {
    console.log(`✅ Calculated balance matches stored balance\n`);
  }

  // Check the specific problematic transaction
  const problemTx = allTx?.find(tx => 
    tx.crypto_currency === 'SOL' && 
    parseFloat(tx.crypto_amount || '0') === 0.01412716
  );

  if (problemTx) {
    console.log('='.repeat(80));
    console.log('PROBLEMATIC TRANSACTION DETAILS');
    console.log('='.repeat(80) + '\n');
    console.log(`Transaction ID: ${problemTx.id}`);
    console.log(`Date: ${new Date(problemTx.created_at).toLocaleString()}`);
    console.log(`SOL Amount: ${problemTx.crypto_amount}`);
    console.log(`NGN Amount: ₦${parseFloat(problemTx.fiat_amount || '0').toLocaleString()}`);
    console.log(`Status: ${problemTx.status}`);
    console.log(`Metadata:`, JSON.stringify(problemTx.metadata, null, 2));
    console.log('');
  }
}

detailedCheck().catch(console.error);
