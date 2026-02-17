/**
 * Complete SOL sell process:
 * 1. Verify transaction is credited
 * 2. Find or create sell order
 * 3. Execute sell on Luno
 * 4. Credit NGN to user
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('Please set it in .env.local or pass as environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transaction details
const txHash = '5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB';
const solAmount = 0.015318545;
const toAddress = 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe';

async function processCompleteSell() {
  console.log('🔄 Processing complete SOL sell flow...\n');
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`SOL Amount: ${solAmount}`);
  console.log(`Address: ${toAddress}\n`);

  // Step 1: Find wallet owner
  console.log('📋 Step 1: Finding wallet owner...');
  const { data: wallet } = await supabase
    .from('crypto_wallets')
    .select('user_id')
    .eq('address', toAddress)
    .eq('asset_type', 'SOL')
    .single();

  if (!wallet) {
    console.error('❌ Wallet not found');
    return;
  }

  const userId = wallet.user_id;
  console.log(`✅ User ID: ${userId}\n`);

  // Step 2: Check if transaction exists and is credited
  console.log('📋 Step 2: Checking transaction status...');
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_hash', txHash)
    .single();

  if (!transaction) {
    console.log('⚠️ Transaction not found in database');
    console.log('💡 The detect-solana-deposits function should credit it automatically');
  } else {
    console.log(`✅ Transaction found: ${transaction.id}`);
    console.log(`   Status: ${transaction.status}`);
    console.log(`   Amount: ${transaction.crypto_amount} ${transaction.crypto_currency}`);
  }

  // Step 3: Check SOL balance
  console.log('\n📋 Step 3: Checking SOL balance...');
  const { data: balance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  const solBalance = balance ? parseFloat(balance.balance || '0') : 0;
  console.log(`Current SOL balance: ${solBalance.toFixed(9)} SOL`);

  if (solBalance < solAmount) {
    console.error(`❌ Insufficient balance. Need ${solAmount} SOL, have ${solBalance.toFixed(9)} SOL`);
    return;
  }

  // Step 4: Find sell order
  console.log('\n📋 Step 4: Finding sell order...');
  const { data: sellOrders } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', userId)
    .or(`sol_tx_hash.eq.${txHash},sol_amount.eq.${solAmount.toString()}`)
    .in('status', ['QUOTED', 'SOL_SENT', 'SOLD_ON_LUNO'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!sellOrders || sellOrders.length === 0) {
    console.log('⚠️ No sell order found');
    console.log('💡 A sell order needs to be created first using the sell-sol function');
    console.log('   The user should initiate a sell from the mobile app');
    return;
  }

  console.log(`✅ Found ${sellOrders.length} sell order(s)`);
  const sellOrder = sellOrders[0];
  console.log(`   Sell ID: ${sellOrder.sell_id}`);
  console.log(`   Status: ${sellOrder.status}`);
  console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
  console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}\n`);

  // Step 5: Execute sell on Luno
  console.log('📋 Step 5: Executing sell on Luno...');
  await executeLunoSell(sellOrder.sell_id);
}

async function executeLunoSell(sellId) {
  try {
    const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
    console.log(`Calling: ${functionUrl}`);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sell_id: sellId,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('\n✅ Sell executed successfully!\n');
      console.log(`📊 Results:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   NGN Received: ₦${result.ngn_received || 'N/A'}`);
      console.log(`   Platform Fee: ₦${result.platform_fee || 'N/A'}`);
      console.log(`   Luno Order ID: ${result.luno_order_id || 'N/A'}`);
      console.log(`\n💬 ${result.message || 'NGN has been credited to your wallet'}`);
    } else {
      console.error('\n❌ Failed to execute sell:', result.error || 'Unknown error');
      console.log('Response:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

processCompleteSell().catch(console.error);







