/**
 * Check current balance for a user
 * 
 * Usage:
 *   SUPABASE_ANON_KEY=your_key node scripts/check-balance.js
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

async function checkBalance() {
  try {
    console.log('💰 Checking Balance\n');
    console.log('='.repeat(60));
    
    // Sign in
    console.log('🔐 Signing in...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    
    if (authError) {
      console.error('❌ Authentication failed:', authError.message);
      return;
    }
    
    const userId = authData.user.id;
    console.log(`✅ Signed in as: ${authData.user.email}\n`);
    
    // Get balances from all tables
    console.log('📊 Fetching balances from all tables...\n');
    
    // user_wallets (primary source)
    const { data: userWallet, error: uwError } = await supabase
      .from('user_wallets')
      .select('ngn_balance, btc_balance, eth_balance, usdt_balance, usdc_balance, xrp_balance, sol_balance, updated_at')
      .eq('user_id', userId)
      .single();
    
    // wallet_balances
    const { data: walletBalances, error: wbError } = await supabase
      .from('wallet_balances')
      .select('currency, balance, updated_at')
      .eq('user_id', userId)
      .order('currency');
    
    // wallets
    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('ngn_balance, usd_balance, updated_at')
      .eq('user_id', userId)
      .single();
    
    console.log('📋 Current Balances:');
    console.log('='.repeat(60));
    
    if (userWallet) {
      console.log('\n💼 user_wallets (PRIMARY SOURCE):');
      console.log(`   NGN:  ₦${parseFloat(userWallet.ngn_balance || 0).toFixed(2)}`);
      console.log(`   BTC:  ${parseFloat(userWallet.btc_balance || 0).toFixed(8)} BTC`);
      console.log(`   ETH:  ${parseFloat(userWallet.eth_balance || 0).toFixed(8)} ETH`);
      console.log(`   USDT: ${parseFloat(userWallet.usdt_balance || 0).toFixed(8)} USDT`);
      console.log(`   USDC: ${parseFloat(userWallet.usdc_balance || 0).toFixed(8)} USDC`);
      console.log(`   XRP:  ${parseFloat(userWallet.xrp_balance || 0).toFixed(8)} XRP`);
      console.log(`   SOL:  ${parseFloat(userWallet.sol_balance || 0).toFixed(8)} SOL`);
      console.log(`   Updated: ${userWallet.updated_at}`);
    } else {
      console.log('\n❌ user_wallets: Not found');
      if (uwError) console.log(`   Error: ${uwError.message}`);
    }
    
    if (walletBalances && walletBalances.length > 0) {
      console.log('\n💼 wallet_balances:');
      walletBalances.forEach(wb => {
        const balance = parseFloat(wb.balance || 0);
        if (wb.currency === 'NGN') {
          console.log(`   ${wb.currency}: ₦${balance.toFixed(2)}`);
        } else {
          console.log(`   ${wb.currency}: ${balance.toFixed(8)}`);
        }
        console.log(`   Updated: ${wb.updated_at}`);
      });
    } else {
      console.log('\n⚠️  wallet_balances: No records found');
      if (wbError) console.log(`   Error: ${wbError.message}`);
    }
    
    if (wallet) {
      console.log('\n💼 wallets:');
      console.log(`   NGN: ₦${parseFloat(wallet.ngn_balance || 0).toFixed(2)}`);
      console.log(`   USD: $${parseFloat(wallet.usd_balance || 0).toFixed(2)}`);
      console.log(`   Updated: ${wallet.updated_at}`);
    } else {
      console.log('\n⚠️  wallets: Not found');
      if (wError) console.log(`   Error: ${wError.message}`);
    }
    
    // Check if tables are in sync
    console.log('\n🔍 Sync Status:');
    console.log('='.repeat(60));
    
    if (userWallet && walletBalances && wallet) {
      const ngnFromUW = parseFloat(userWallet.ngn_balance || 0);
      const ngnFromWB = parseFloat(walletBalances.find(wb => wb.currency === 'NGN')?.balance || 0);
      const ngnFromW = parseFloat(wallet.ngn_balance || 0);
      
      const ngnInSync = Math.abs(ngnFromUW - ngnFromWB) < 0.01 && Math.abs(ngnFromUW - ngnFromW) < 0.01;
      
      if (ngnInSync) {
        console.log('✅ NGN balances are in sync across all tables');
      } else {
        console.log('❌ NGN balances are NOT in sync!');
        console.log(`   user_wallets: ₦${ngnFromUW.toFixed(2)}`);
        console.log(`   wallet_balances: ₦${ngnFromWB.toFixed(2)}`);
        console.log(`   wallets: ₦${ngnFromW.toFixed(2)}`);
      }
      
      // Check SOL sync
      const solFromUW = parseFloat(userWallet.sol_balance || 0);
      const solFromWB = parseFloat(walletBalances.find(wb => wb.currency === 'SOL')?.balance || 0);
      
      const solInSync = Math.abs(solFromUW - solFromWB) < 0.00000001;
      
      if (solInSync) {
        console.log('✅ SOL balances are in sync');
      } else {
        console.log('❌ SOL balances are NOT in sync!');
        console.log(`   user_wallets: ${solFromUW.toFixed(8)} SOL`);
        console.log(`   wallet_balances: ${solFromWB.toFixed(8)} SOL`);
      }
    }
    
    // Get recent transactions
    console.log('\n📜 Recent Transactions (Last 5):');
    console.log('='.repeat(60));
    
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(5);
    
    if (transactions && transactions.length > 0) {
      transactions.forEach((tx, index) => {
        console.log(`\n${index + 1}. ${tx.transaction_type} - ${tx.crypto_currency}`);
        console.log(`   Crypto: ${parseFloat(tx.crypto_amount || 0).toFixed(8)} ${tx.crypto_currency}`);
        console.log(`   Fiat: ₦${parseFloat(tx.fiat_amount || 0).toFixed(2)}`);
        console.log(`   Fee: ₦${parseFloat(tx.fee_amount || 0).toFixed(2)}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Time: ${tx.completed_at}`);
        if (tx.metadata?.fix_version) {
          console.log(`   Fix version: ${tx.metadata.fix_version}`);
        }
      });
    } else {
      console.log('No transactions found');
      if (txError) console.log(`Error: ${txError.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Balance check completed!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

checkBalance().catch(console.error);
