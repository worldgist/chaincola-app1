/**
 * Check current NGN balance and transaction history
 * 
 * Usage:
 *   SUPABASE_ANON_KEY=your_key node scripts/check-ngn-balance.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required!');
  process.exit(1);
}

const TEST_EMAIL = process.env.TEST_EMAIL || 'chaincolawallet@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Salifu147@';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signIn() {
  console.log('\n🔐 Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  
  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    throw new Error(`Sign in failed: ${authError.message}`);
  }
  
  if (!authData.user) {
    throw new Error('No user data returned from sign in');
  }
  
  console.log(`✅ Signed in as: ${authData.user.email}`);
  return {
    userId: authData.user.id,
    session: authData.session
  };
}

async function checkBalance() {
  try {
    console.log('🔍 Checking NGN Balance and Transaction History\n');
    console.log('='.repeat(60));
    
    const { userId, session } = await signIn();
    
    // Set session for authenticated requests
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    
    // Get current balances from all tables
    console.log('\n📊 Current Balances:\n');
    
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    const { data: walletBalances } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId);
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    console.log('user_wallets (PRIMARY SOURCE):');
    if (userWallet) {
      console.log(`   NGN:  ₦${parseFloat(userWallet.ngn_balance || 0).toFixed(2)}`);
      console.log(`   BTC:  ${parseFloat(userWallet.btc_balance || 0).toFixed(8)} BTC`);
      console.log(`   ETH:  ${parseFloat(userWallet.eth_balance || 0).toFixed(8)} ETH`);
      console.log(`   USDT: ${parseFloat(userWallet.usdt_balance || 0).toFixed(8)} USDT`);
      console.log(`   USDC: ${parseFloat(userWallet.usdc_balance || 0).toFixed(8)} USDC`);
      console.log(`   XRP:  ${parseFloat(userWallet.xrp_balance || 0).toFixed(8)} XRP`);
      console.log(`   SOL:  ${parseFloat(userWallet.sol_balance || 0).toFixed(8)} SOL`);
      console.log(`   Updated: ${userWallet.updated_at}`);
    } else {
      console.log('   Not found');
    }
    
    console.log('\nwallet_balances:');
    if (walletBalances && walletBalances.length > 0) {
      walletBalances.forEach(wb => {
        console.log(`   ${wb.currency}: ${parseFloat(wb.balance || 0).toFixed(wb.currency === 'NGN' ? 2 : 8)} ${wb.currency}`);
      });
    } else {
      console.log('   Not found');
    }
    
    console.log('\nwallets:');
    if (wallet) {
      console.log(`   NGN: ₦${parseFloat(wallet.ngn_balance || 0).toFixed(2)}`);
      console.log(`   USD: $${parseFloat(wallet.usd_balance || 0).toFixed(2)}`);
      console.log(`   Updated: ${wallet.updated_at}`);
    } else {
      console.log('   Not found');
    }
    
    // Get recent transactions
    console.log('\n\n📜 Recent Transactions (Last 10):\n');
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(10);
    
    if (txError) {
      console.error('❌ Error fetching transactions:', txError.message);
    } else if (transactions && transactions.length > 0) {
      transactions.forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.transaction_type} - ${tx.crypto_amount || 0} ${tx.crypto_currency || 'N/A'}`);
        console.log(`   Fiat: ₦${parseFloat(tx.fiat_amount || 0).toFixed(2)}`);
        console.log(`   Fee: ₦${parseFloat(tx.fee_amount || 0).toFixed(2)}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Date: ${tx.completed_at}`);
        console.log(`   Fix version: ${tx.metadata?.fix_version || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   No transactions found');
    }
    
    // Calculate expected balance based on transactions
    console.log('\n\n💰 Balance Analysis:\n');
    if (transactions && transactions.length > 0) {
      let expectedBalance = 0;
      const buyTxs = transactions.filter(tx => tx.transaction_type === 'BUY');
      const sellTxs = transactions.filter(tx => tx.transaction_type === 'SELL');
      
      console.log(`Total BUY transactions: ${buyTxs.length}`);
      console.log(`Total SELL transactions: ${sellTxs.length}`);
      
      // Sum up all buy debits and sell credits
      const totalDebited = buyTxs.reduce((sum, tx) => sum + parseFloat(tx.fiat_amount || 0), 0);
      const totalCredited = sellTxs.reduce((sum, tx) => sum + parseFloat(tx.fiat_amount || 0), 0);
      
      console.log(`\nTotal NGN debited (BUY): ₦${totalDebited.toFixed(2)}`);
      console.log(`Total NGN credited (SELL): ₦${totalCredited.toFixed(2)}`);
      console.log(`Net change: ₦${(totalCredited - totalDebited).toFixed(2)}`);
      
      // Note: We can't calculate absolute balance without knowing starting balance
      console.log('\n⚠️  Note: To determine if balance is correct, we need to know the starting balance.');
      console.log('   The current balance should be: Starting Balance - Total BUY + Total SELL');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Check completed!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkBalance().catch(console.error);
