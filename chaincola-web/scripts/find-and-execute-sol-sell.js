/**
 * Find sell order by transaction hash and execute it on Luno
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transaction details
const txHash = '5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB';
const solAmount = 0.015318545;
const toAddress = 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe';

async function findAndExecuteSell() {
  console.log('🔍 Finding sell order for transaction...\n');
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`SOL Amount: ${solAmount}`);
  console.log(`Address: ${toAddress}\n`);

  // Find the wallet owner
  const { data: wallet } = await supabase
    .from('crypto_wallets')
    .select('user_id')
    .eq('address', toAddress)
    .eq('asset_type', 'SOL')
    .single();

  if (!wallet) {
    console.error('❌ Wallet not found for address:', toAddress);
    return;
  }

  const userId = wallet.user_id;
  console.log(`✅ Found wallet owner: User ID = ${userId}\n`);

  // Find sell order by transaction hash
  const { data: sellOrders } = await supabase
    .from('sells')
    .select('*')
    .eq('sol_tx_hash', txHash)
    .in('status', ['SOL_SENT', 'SOLD_ON_LUNO', 'QUOTED'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!sellOrders || sellOrders.length === 0) {
    console.log('⚠️ No sell order found with this transaction hash.');
    console.log('Checking for sell orders for this user...\n');
    
    // Find any pending sell orders for this user
    const { data: userSells } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .eq('sol_amount', solAmount.toString())
      .in('status', ['SOL_SENT', 'SOLD_ON_LUNO', 'QUOTED'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (!userSells || userSells.length === 0) {
      console.error('❌ No pending sell orders found for this user.');
      console.log('\n💡 The user needs to create a sell order first using the sell-sol function.');
      return;
    }

    console.log(`Found ${userSells.length} sell order(s) for this user:\n`);
    userSells.forEach((sell, idx) => {
      console.log(`${idx + 1}. Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`   Created: ${sell.created_at}\n`);
    });

    // Use the most recent one
    const sellOrder = userSells[0];
    console.log(`✅ Using sell order: ${sellOrder.sell_id}\n`);
    await executeLunoSell(sellOrder.sell_id);
  } else {
    console.log(`✅ Found ${sellOrders.length} sell order(s) with this transaction hash:\n`);
    
    sellOrders.forEach((sell, idx) => {
      console.log(`${idx + 1}. Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   Created: ${sell.created_at}\n`);
    });

    // Use the most recent one
    const sellOrder = sellOrders[0];
    await executeLunoSell(sellOrder.sell_id);
  }
}

async function executeLunoSell(sellId) {
  console.log(`\n🔄 Executing Luno sell for sell_id: ${sellId}...\n`);

  try {
    const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
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
      console.log('✅ Sell executed successfully!\n');
      console.log(`📊 Results:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Asset: ${result.asset}`);
      console.log(`   Amount: ${result.sol_amount || result[`${result.asset?.toLowerCase()}_amount`] || 'N/A'}`);
      console.log(`   NGN Received: ₦${result.ngn_received || 'N/A'}`);
      console.log(`   Platform Fee: ₦${result.platform_fee || 'N/A'}`);
      console.log(`   Execution Price: ₦${result.execution_price || 'N/A'}`);
      console.log(`   Luno Order ID: ${result.luno_order_id || 'N/A'}`);
      console.log(`\n💬 Message: ${result.message || 'NGN has been credited to your wallet'}`);
      
      // Verify NGN balance
      const { data: balance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', result.user_id || '')
        .eq('currency', 'NGN')
        .single();
      
      const { data: wallet } = await supabase
        .from('wallets')
        .select('ngn_balance')
        .eq('user_id', result.user_id || '')
        .single();

      const ngnBalance = balance?.balance || wallet?.ngn_balance || '0';
      console.log(`\n💰 User NGN Balance: ₦${parseFloat(ngnBalance).toFixed(2)}`);
    } else {
      console.error('❌ Failed to execute sell:', result.error || 'Unknown error');
      console.log('\nFull response:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ Error executing sell:', error.message);
  }
}

findAndExecuteSell().catch(console.error);







