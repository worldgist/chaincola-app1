/**
 * Check specific user's balance and transactions
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

async function checkUser(email) {
  console.log(`\n🔍 Checking user: ${email}\n`);
  
  // Find user by email
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  
  if (userError) {
    console.error('❌ Error fetching users:', userError);
    return;
  }
  
  const user = users.users.find(u => u.email === email);
  
  if (!user) {
    console.log(`❌ User not found: ${email}`);
    return;
  }
  
  console.log(`✅ User found:`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Created: ${user.created_at}\n`);
  
  // Get balances from all tables
  const { data: userWallet } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  const { data: walletBalances } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', user.id);
  
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  console.log(`💰 Balances:`);
  console.log(`   user_wallets.ngn_balance: ₦${parseFloat(userWallet?.ngn_balance || 0).toFixed(2)}`);
  
  if (walletBalances && walletBalances.length > 0) {
    console.log(`   wallet_balances:`);
    walletBalances.forEach(wb => {
      console.log(`     ${wb.currency}: ${parseFloat(wb.balance || 0).toFixed(8)}`);
    });
  }
  
  if (wallet) {
    console.log(`   wallets.ngn_balance: ₦${parseFloat(wallet.ngn_balance || 0).toFixed(2)}`);
  }
  
  // Get recent SELL transactions
  const { data: sellTransactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('transaction_type', 'SELL')
    .eq('status', 'COMPLETED')
    .not('fiat_amount', 'is', null)
    .eq('fiat_currency', 'NGN')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }
  
  console.log(`\n📋 Recent SELL Transactions (${sellTransactions?.length || 0}):\n`);
  
  if (!sellTransactions || sellTransactions.length === 0) {
    console.log('   No sell transactions found');
    return;
  }
  
  let totalOverCredit = 0;
  const affectedTxs = [];
  
  for (const tx of sellTransactions) {
    const cryptoCurrency = tx.crypto_currency;
    const cryptoAmount = parseFloat(tx.crypto_amount || '0');
    const creditedNgn = parseFloat(tx.fiat_amount || '0');
    const rate = parseFloat(tx.metadata?.rate || '0');
    
    if (!cryptoAmount || !creditedNgn || !rate) {
      continue;
    }
    
    // Calculate correct amount
    const totalNgnBeforeFee = cryptoAmount * rate;
    const platformFee = totalNgnBeforeFee * 0.01;
    const correctNgnAmount = totalNgnBeforeFee - platformFee;
    const difference = creditedNgn - correctNgnAmount;
    
    const isAffected = difference > 1 && creditedNgn > correctNgnAmount * 1.5;
    
    console.log(`   Transaction ${tx.id.substring(0, 8)}...`);
    console.log(`     Date: ${new Date(tx.created_at).toLocaleString()}`);
    console.log(`     Asset: ${cryptoCurrency}`);
    console.log(`     Amount: ${cryptoAmount} ${cryptoCurrency}`);
    console.log(`     Rate: ₦${rate.toFixed(2)}`);
    console.log(`     Credited: ₦${creditedNgn.toFixed(2)}`);
    console.log(`     Should be: ₦${correctNgnAmount.toFixed(2)}`);
    
    if (isAffected) {
      console.log(`     ⚠️  OVER-CREDITED by: ₦${difference.toFixed(2)}`);
      totalOverCredit += difference;
      affectedTxs.push({ tx, difference, correctNgnAmount });
    } else if (Math.abs(difference) > 0.01) {
      console.log(`     Difference: ₦${difference.toFixed(2)}`);
    } else {
      console.log(`     ✅ Correct`);
    }
    console.log('');
  }
  
  if (affectedTxs.length > 0) {
    console.log(`\n⚠️  Found ${affectedTxs.length} affected transactions`);
    console.log(`   Total over-credit: ₦${totalOverCredit.toFixed(2)}`);
    console.log(`\n   Current balance: ₦${parseFloat(userWallet?.ngn_balance || 0).toFixed(2)}`);
    console.log(`   Correct balance should be: ₦${(parseFloat(userWallet?.ngn_balance || 0) - totalOverCredit).toFixed(2)}`);
    
    console.log(`\n   To fix, run:`);
    console.log(`   node scripts/fix-specific-user.js ${user.id}`);
  } else {
    console.log(`\n✅ No affected transactions found - balances appear correct!`);
  }
}

const email = process.argv[2] || 'chaincolawallet@gmail.com';
checkUser(email).catch(console.error);
