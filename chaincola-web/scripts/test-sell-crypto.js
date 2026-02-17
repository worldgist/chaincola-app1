/**
 * Test script for sell crypto functionality
 * Tests if NGN balance is correctly credited when selling crypto
 * 
 * Usage:
 *   SUPABASE_ANON_KEY=your_key node scripts/test-sell-crypto.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required!');
  console.error('   Set it with: export SUPABASE_ANON_KEY=your_key');
  process.exit(1);
}

const TEST_EMAIL = process.env.TEST_EMAIL || 'chaincolawallet@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Salifu147@';
const SELL_AMOUNT = 0.01; // Amount of SOL to sell (or use 'all' to sell all)

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  
  return {
    user: authData.user,
    session: authData.session,
    userId: authData.user.id
  };
}

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
  
  const { data: solBalance, error: solError } = await supabase
    .from('wallet_balances')
    .select('balance, currency, updated_at')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
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
    wallet_balances_ngn: walletBalance ? {
      ngn_balance: parseFloat(walletBalance.balance || 0),
      updated_at: walletBalance.updated_at,
      error: wbError?.message
    } : { error: wbError?.message || 'Not found' },
    wallet_balances_sol: solBalance ? {
      sol_balance: parseFloat(solBalance.balance || 0),
      updated_at: solBalance.updated_at,
      error: solError?.message
    } : { error: solError?.message || 'Not found' },
    wallets: wallet ? {
      ngn_balance: parseFloat(wallet.ngn_balance || 0),
      updated_at: wallet.updated_at,
      error: wError?.message
    } : { error: wError?.message || 'Not found' }
  };
}

async function testSellCrypto() {
  try {
    console.log('🧪 Testing Sell Crypto Functionality\n');
    console.log('=' .repeat(60));
    console.log(`Email: ${TEST_EMAIL}`);
    console.log(`Sell Amount: ${SELL_AMOUNT === 'all' ? 'ALL SOL' : SELL_AMOUNT + ' SOL'}`);
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
    
    // Step 2: Get balances BEFORE sell
    console.log('\n2️⃣ Checking balances BEFORE sell...');
    const balancesBefore = await getBalances(userId);
    
    console.log('\n📋 Balances BEFORE sell:');
    console.log(`   user_wallets.ngn_balance: ₦${balancesBefore.user_wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   user_wallets.sol_balance: ${balancesBefore.user_wallets.sol_balance?.toFixed(8) || 'N/A'} SOL`);
    console.log(`   wallet_balances (NGN): ₦${balancesBefore.wallet_balances_ngn.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallet_balances (SOL): ${balancesBefore.wallet_balances_sol.sol_balance?.toFixed(8) || 'N/A'} SOL`);
    console.log(`   wallets.ngn_balance: ₦${balancesBefore.wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    
    const ngnBalanceBefore = balancesBefore.user_wallets.ngn_balance || 0;
    const solBalanceBefore = balancesBefore.user_wallets.sol_balance || 0;
    
    // Determine how much SOL to sell
    let solToSell = SELL_AMOUNT;
    if (SELL_AMOUNT === 'all' || solBalanceBefore < SELL_AMOUNT) {
      solToSell = solBalanceBefore;
      console.log(`\n⚠️  Using all available SOL: ${solToSell.toFixed(8)} SOL`);
    }
    
    if (solBalanceBefore < solToSell || solToSell <= 0) {
      console.error(`\n❌ Insufficient SOL balance! Current: ${solBalanceBefore.toFixed(8)} SOL, Required: ${solToSell.toFixed(8)} SOL`);
      return;
    }
    
    // Step 3: Get SOL price
    console.log('\n3️⃣ Fetching SOL price...');
    try {
      const { data: priceData, error: priceError } = await supabase.functions.invoke('get-solana-price');
      
      if (priceError || !priceData?.price_ngn) {
        console.warn('⚠️  Could not get SOL price, but continuing with sell (edge function will fetch it)');
      } else {
        const solPrice = parseFloat(priceData.price_ngn);
        console.log(`✅ SOL price: ₦${solPrice.toFixed(2)}`);
      }
    } catch (err) {
      console.warn('⚠️  Could not get SOL price, but continuing with sell (edge function will fetch it)');
    }
    
    // Step 4: Execute sell
    console.log('\n4️⃣ Executing sell transaction...');
    console.log(`   Calling edge function: instant-sell-crypto-v2`);
    console.log(`   Asset: SOL`);
    console.log(`   Amount: ${solToSell.toFixed(8)} SOL`);
    
    // Call edge function with proper authentication
    const functionUrl = `${SUPABASE_URL}/functions/v1/instant-sell-crypto-v2`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'SOL',
        amount: solToSell,
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
      console.error('❌ Sell failed:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const sellResult = await response.json();
    
    if (!sellResult || !sellResult.success) {
      console.error('❌ Sell failed:', sellResult?.error || 'Unknown error');
      console.error('   Result:', JSON.stringify(sellResult, null, 2));
      return;
    }
    
    console.log('✅ Sell transaction completed!');
    console.log(`   NGN received: ₦${sellResult.ngn_amount?.toFixed(2) || 'N/A'}`);
    
    // Wait a bit for database to sync
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 5: Get balances AFTER sell
    console.log('\n5️⃣ Checking balances AFTER sell...');
    const balancesAfter = await getBalances(userId);
    
    console.log('\n📋 Balances AFTER sell:');
    console.log(`   user_wallets.ngn_balance: ₦${balancesAfter.user_wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   user_wallets.sol_balance: ${balancesAfter.user_wallets.sol_balance?.toFixed(8) || 'N/A'} SOL`);
    console.log(`   wallet_balances (NGN): ₦${balancesAfter.wallet_balances_ngn.ngn_balance?.toFixed(2) || 'N/A'}`);
    console.log(`   wallet_balances (SOL): ${balancesAfter.wallet_balances_sol.sol_balance?.toFixed(8) || 'N/A'} SOL`);
    console.log(`   wallets.ngn_balance: ₦${balancesAfter.wallets.ngn_balance?.toFixed(2) || 'N/A'}`);
    
    // Step 6: Calculate expected balance
    const ngnReceived = parseFloat(sellResult.ngn_amount || 0);
    const expectedNgnBalance = ngnBalanceBefore + ngnReceived;
    const expectedSolBalance = solBalanceBefore - solToSell;
    
    console.log('\n📊 Analysis:');
    console.log('=' .repeat(60));
    console.log(`NGN balance before: ₦${ngnBalanceBefore.toFixed(2)}`);
    console.log(`SOL balance before: ${solBalanceBefore.toFixed(8)} SOL`);
    console.log(`SOL amount sold: ${solToSell.toFixed(8)} SOL`);
    console.log(`NGN received: ₦${ngnReceived.toFixed(2)}`);
    console.log(`Expected NGN balance after: ₦${expectedNgnBalance.toFixed(2)}`);
    console.log(`Expected SOL balance after: ${expectedSolBalance.toFixed(8)} SOL`);
    console.log('=' .repeat(60));
    
    const actualNgnBalance = balancesAfter.user_wallets.ngn_balance || 0;
    const actualSolBalance = balancesAfter.user_wallets.sol_balance || 0;
    const ngnBalanceDiff = actualNgnBalance - expectedNgnBalance;
    const solBalanceDiff = actualSolBalance - expectedSolBalance;
    
    console.log(`\nActual NGN balance after: ₦${actualNgnBalance.toFixed(2)}`);
    console.log(`Actual SOL balance after: ${actualSolBalance.toFixed(8)} SOL`);
    console.log(`NGN difference: ₦${ngnBalanceDiff.toFixed(2)}`);
    console.log(`SOL difference: ${solBalanceDiff.toFixed(8)} SOL`);
    
    // Step 7: Check for issues
    console.log('\n🔍 Checking for issues...\n');
    
    if (actualNgnBalance < ngnBalanceBefore) {
      console.error('❌ CRITICAL ERROR: NGN balance DECREASED instead of INCREASED!');
      console.error(`   Before: ₦${ngnBalanceBefore.toFixed(2)}`);
      console.error(`   After: ₦${actualNgnBalance.toFixed(2)}`);
      console.error(`   This means NGN was DEBITED instead of CREDITED!`);
    } else if (Math.abs(ngnBalanceDiff) > 0.01) {
      console.warn('⚠️  WARNING: NGN balance difference detected!');
      console.warn(`   Expected: ₦${expectedNgnBalance.toFixed(2)}`);
      console.warn(`   Actual: ₦${actualNgnBalance.toFixed(2)}`);
      console.warn(`   Difference: ₦${ngnBalanceDiff.toFixed(2)}`);
    } else {
      console.log('✅ NGN balance correctly credited!');
    }
    
    if (actualSolBalance > solBalanceBefore) {
      console.error('❌ CRITICAL ERROR: SOL balance INCREASED instead of DECREASED!');
      console.error(`   Before: ${solBalanceBefore.toFixed(8)} SOL`);
      console.error(`   After: ${actualSolBalance.toFixed(8)} SOL`);
    } else if (Math.abs(solBalanceDiff) > 0.00000001) {
      console.warn('⚠️  WARNING: SOL balance difference detected!');
      console.warn(`   Expected: ${expectedSolBalance.toFixed(8)} SOL`);
      console.warn(`   Actual: ${actualSolBalance.toFixed(8)} SOL`);
      console.warn(`   Difference: ${solBalanceDiff.toFixed(8)} SOL`);
    } else {
      console.log('✅ SOL balance correctly debited!');
    }
    
    // Check if all tables are in sync
    const tablesInSync = 
      Math.abs(balancesAfter.user_wallets.ngn_balance - balancesAfter.wallet_balances_ngn.ngn_balance) < 0.01 &&
      Math.abs(balancesAfter.user_wallets.ngn_balance - balancesAfter.wallets.ngn_balance) < 0.01;
    
    if (!tablesInSync) {
      console.warn('\n⚠️  WARNING: Tables are not in sync!');
      console.warn(`   user_wallets: ₦${balancesAfter.user_wallets.ngn_balance?.toFixed(2)}`);
      console.warn(`   wallet_balances: ₦${balancesAfter.wallet_balances_ngn.ngn_balance?.toFixed(2)}`);
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
      .eq('transaction_type', 'SELL')
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
testSellCrypto().catch(console.error);
