/**
 * Test script for buy crypto functionality
 * Tests if NGN balance is correctly debited when buying crypto
 * 
 * Usage:
 *   node scripts/test-buy-crypto.js
 * 
 * Environment variables needed:
 *   SUPABASE_URL=https://slleojsdpctxhlsoyenr.supabase.co
 *   SUPABASE_ANON_KEY=your_anon_key
 *   TEST_EMAIL=chaincolawallet@gmail.com
 *   TEST_PASSWORD=Salifu147@
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TEST_EMAIL = process.env.TEST_EMAIL || 'chaincolawallet@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Salifu147@';
const BUY_AMOUNT = 3000; // NGN amount to buy

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getBalances(userId) {
  console.log('\n📊 Fetching balances from all tables...\n');
  
  // Get from user_wallets (primary source)
  const { data: userWallet, error: uwError } = await supabase
    .from('user_wallets')
    .select('ngn_balance, sol_balance, updated_at')
    .eq('user_id', userId)
    .single();
  
  // Get from wallet_balances
  const { data: walletBalance, error: wbError } = await supabase
    .from('wallet_balances')
    .select('balance, currency, updated_at')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .single();
  
  // Get from wallets
  const { data: wallet, error: wError } = await supabase
    .from('wallets')
    .select('ngn_balance, updated_at')
    .eq('user_id', userId)
    .single();
  
  return {
    user_wallets: userWallet ? {
      ngn_balance: parseFloat(userWallet.ngn_balance || 0),
      sol_balance: parseFloat(userWallet.sol_balance || 0),
      updated_at: userWallet.updated_at,
      error: uwError?.message
    } : { error: uwError?.message || 'Not found' },
    wallet_balances: walletBalance ? {
      ngn_balance: parseFloat(walletBalance.balance || 0),
      updated_at: walletBalance.updated_at,
      error: wbError?.message
    } : { error: wbError?.message || 'Not found' },
    wallets: wallet ? {
      ngn_balance: parseFloat(wallet.ngn_balance || 0),
      updated_at: wallet.updated_at,
      error: wError?.message
    } : { error: wError?.message || 'Not found' }
  };
}

async function signIn() {
  console.log('\n🔐 Signing in...');
  console.log(`   Email: ${TEST_EMAIL}`);
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  
  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    throw new Error(`Sign in failed: ${authError.message}`);
  }
  
  if (!authData.user) {
    console.error('❌ No user data returned');
    throw new Error('No user data returned from sign in');
  }
  
  console.log(`✅ Signed in successfully!`);
  console.log(`   Email: ${authData.user.email}`);
  console.log(`   User ID: ${authData.user.id.substring(0, 8)}...`);
  console.log(`   Access Token: ${authData.session?.access_token?.substring(0, 20)}...`);
  
  return {
    user: authData.user,
    session: authData.session,
    userId: authData.user.id
  };
}

async function testBuyCrypto() {
  try {
    console.log('🧪 Testing Buy Crypto Functionality\n');
    console.log('=' .repeat(60));
    console.log(`Email: ${TEST_EMAIL}`);
    console.log(`Buy Amount: ₦${BUY_AMOUNT.toFixed(2)}`);
    console.log('=' .repeat(60));
    
    // Step 1: Sign in
    const { userId, session } = await signIn();
    
    if (!session) {
      console.error('❌ No session created');
      return;
    }
    
    // Update supabase client with the session
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    
    // Step 2: Get balances BEFORE buy
    console.log('\n2️⃣ Checking balances BEFORE buy...');
    const balancesBefore = await getBalances(userId);
    
    console.log('\n📋 Balances BEFORE buy:');
    console.log(`   user_wallets.ngn_balance: ₦${balancesBefore.user_wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallet_balances.balance: ₦${balancesBefore.wallet_balances.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallets.ngn_balance: ₦${balancesBefore.wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    
    const ngnBalanceBefore = balancesBefore.user_wallets.ngn_balance || 0;
    
    if (ngnBalanceBefore < BUY_AMOUNT) {
      console.error(`\n❌ Insufficient balance! Current: ₦${ngnBalanceBefore.toFixed(2)}, Required: ₦${BUY_AMOUNT.toFixed(2)}`);
      return;
    }
    
    // Step 3: Get SOL price (optional - will be fetched by edge function)
    console.log('\n3️⃣ Fetching SOL price...');
    let solPrice = null;
    
    try {
      const priceUrl = `${SUPABASE_URL}/functions/v1/get-solana-price`;
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        if (priceData?.price_ngn) {
          solPrice = parseFloat(priceData.price_ngn);
          console.log(`✅ SOL price: ₦${solPrice.toFixed(2)}`);
        } else {
          console.log('⚠️  Could not get SOL price, but continuing with buy (edge function will fetch it)');
        }
      } else {
        console.log('⚠️  Could not get SOL price, but continuing with buy (edge function will fetch it)');
      }
    } catch (err) {
      console.log('⚠️  Could not get SOL price, but continuing with buy (edge function will fetch it)');
    }
    
    // Step 4: Execute buy
    console.log('\n4️⃣ Executing buy transaction...');
    console.log(`   Calling edge function: instant-buy-crypto`);
    console.log(`   Asset: SOL`);
    console.log(`   Amount: ₦${BUY_AMOUNT.toFixed(2)}`);
    
    // Call edge function with proper authentication
    const functionUrl = `${SUPABASE_URL}/functions/v1/instant-buy-crypto`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'SOL',
        ngn_amount: BUY_AMOUNT,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      console.error('❌ Buy failed:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const buyResult = await response.json();
    
    if (!buyResult || !buyResult.success) {
      console.error('❌ Buy failed:', buyResult?.error || 'Unknown error');
      console.error('   Result:', JSON.stringify(buyResult, null, 2));
      return;
    }
    
    console.log('✅ Buy transaction completed!');
    console.log(`   Crypto received: ${buyResult.crypto_amount} SOL`);
    console.log(`   Rate: ₦${buyResult.rate?.toFixed(2) || 'N/A'}`);
    
    // Wait a bit for database to sync
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 5: Get balances AFTER buy
    console.log('\n5️⃣ Checking balances AFTER buy...');
    const balancesAfter = await getBalances(userId);
    
    console.log('\n📋 Balances AFTER buy:');
    console.log(`   user_wallets.ngn_balance: ₦${balancesAfter.user_wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallet_balances.balance: ₦${balancesAfter.wallet_balances.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallets.ngn_balance: ₦${balancesAfter.wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    
    // Step 6: Calculate expected balance
    const fee = BUY_AMOUNT * 0.01; // 1% fee
    const totalDebit = BUY_AMOUNT + fee;
    const expectedBalance = ngnBalanceBefore - totalDebit;
    
    console.log('\n📊 Analysis:');
    console.log('=' .repeat(60));
    console.log(`Balance before: ₦${ngnBalanceBefore.toFixed(2)}`);
    console.log(`Amount to buy: ₦${BUY_AMOUNT.toFixed(2)}`);
    console.log(`Fee (1%): ₦${fee.toFixed(2)}`);
    console.log(`Total to debit: ₦${totalDebit.toFixed(2)}`);
    console.log(`Expected balance after: ₦${expectedBalance.toFixed(2)}`);
    console.log('=' .repeat(60));
    
    const actualBalance = balancesAfter.user_wallets.ngn_balance || 0;
    const balanceDiff = actualBalance - expectedBalance;
    
    console.log(`\nActual balance after: ₦${actualBalance.toFixed(2)}`);
    console.log(`Difference: ₦${balanceDiff.toFixed(2)}`);
    
    // Step 7: Check for issues
    console.log('\n🔍 Checking for issues...\n');
    
    if (actualBalance > ngnBalanceBefore) {
      console.error('❌ CRITICAL ERROR: Balance INCREASED instead of DECREASED!');
      console.error(`   Before: ₦${ngnBalanceBefore.toFixed(2)}`);
      console.error(`   After: ₦${actualBalance.toFixed(2)}`);
      console.error(`   This means NGN was CREDITED instead of DEBITED!`);
    } else if (Math.abs(balanceDiff) > 0.01) {
      console.warn('⚠️  WARNING: Balance difference detected!');
      console.warn(`   Expected: ₦${expectedBalance.toFixed(2)}`);
      console.warn(`   Actual: ₦${actualBalance.toFixed(2)}`);
      console.warn(`   Difference: ₦${balanceDiff.toFixed(2)}`);
    } else {
      console.log('✅ Balance correctly debited!');
    }
    
    // Check if all tables are in sync
    const tablesInSync = 
      Math.abs(balancesAfter.user_wallets.ngn_balance - balancesAfter.wallet_balances.ngn_balance) < 0.01 &&
      Math.abs(balancesAfter.user_wallets.ngn_balance - balancesAfter.wallets.ngn_balance) < 0.01;
    
    if (!tablesInSync) {
      console.warn('\n⚠️  WARNING: Tables are not in sync!');
      console.warn(`   user_wallets: ₦${balancesAfter.user_wallets.ngn_balance?.toFixed(2)}`);
      console.warn(`   wallet_balances: ₦${balancesAfter.wallet_balances.ngn_balance?.toFixed(2)}`);
      console.warn(`   wallets: ₦${balancesAfter.wallets.ngn_balance?.toFixed(2)}`);
    } else {
      console.log('\n✅ All tables are in sync!');
    }
    
    // Step 8: Check recent transaction
    console.log('\n6️⃣ Checking recent transaction...');
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'BUY')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!txError && transactions) {
      console.log('✅ Transaction found:');
      console.log(`   ID: ${transactions.id}`);
      console.log(`   Crypto: ${transactions.crypto_amount} ${transactions.crypto_currency}`);
      console.log(`   Fiat: ₦${transactions.fiat_amount}`);
      console.log(`   Fee: ₦${transactions.fee_amount}`);
      console.log(`   Status: ${transactions.status}`);
      console.log(`   Fix version: ${transactions.metadata?.fix_version || 'N/A'}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testBuyCrypto().catch(console.error);
