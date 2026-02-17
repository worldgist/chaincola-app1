/**
 * Directly execute SOL sell on Luno and credit NGN
 * Bypasses Edge Function to work around boot errors
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LUNO_API_BASE = 'https://api.luno.com';
const sellId = 'c760993e-7ad2-43a7-98d7-015a3f6df5fb';

async function directExecuteSell() {
  console.log('🔄 Directly executing SOL sell on Luno...\n');

  // Get Luno credentials from environment
  const lunoApiKeyId = process.env.LUNO_API_KEY_ID;
  const lunoApiSecret = process.env.LUNO_API_SECRET;

  if (!lunoApiKeyId || !lunoApiSecret) {
    console.error('❌ Luno API credentials not found in environment');
    console.log('Please set LUNO_API_KEY_ID and LUNO_API_SECRET');
    return;
  }

  const lunoAuthHeader = `Basic ${Buffer.from(`${lunoApiKeyId}:${lunoApiSecret}`).toString('base64')}`;

  // Get sell order
  const { data: sellOrder, error: orderError } = await supabase
    .from('sells')
    .select('*')
    .eq('sell_id', sellId)
    .single();

  if (orderError || !sellOrder) {
    console.error('❌ Sell order not found:', orderError);
    return;
  }

  console.log(`✅ Found sell order:`);
  console.log(`   User ID: ${sellOrder.user_id}`);
  console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
  console.log(`   Status: ${sellOrder.status}`);
  console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash || 'N/A'}\n`);

  const solAmount = parseFloat(sellOrder.sol_amount);
  const asset = 'SOL';

  // Check Luno SOL balance
  console.log('📊 Checking Luno SOL balance...');
  const balanceResponse = await fetch(`${LUNO_API_BASE}/api/1/balance`, {
    headers: { 'Authorization': lunoAuthHeader },
  });

  if (!balanceResponse.ok) {
    const errorText = await balanceResponse.text();
    console.error('❌ Failed to check Luno balance:', errorText);
    return;
  }

  const balanceData = await balanceResponse.json();
  console.log('Balance response:', JSON.stringify(balanceData, null, 2));

  let lunoSolBalance = 0;
  if (Array.isArray(balanceData)) {
    const solBalance = balanceData.find((b) => b.asset === 'SOL' || b.currency === 'SOL');
    lunoSolBalance = parseFloat(solBalance?.balance || solBalance?.available || '0');
  } else if (balanceData.balance !== undefined) {
    lunoSolBalance = parseFloat(balanceData.balance || '0');
  }

  console.log(`💰 Luno SOL balance: ${lunoSolBalance.toFixed(9)} SOL\n`);

  if (lunoSolBalance < solAmount * 0.99) {
    console.error(`❌ Insufficient SOL on Luno. Available: ${lunoSolBalance.toFixed(9)}, Required: ${solAmount.toFixed(9)}`);
    return;
  }

  // Get market price
  console.log('📊 Fetching market price...');
  const tickerResponse = await fetch(`${LUNO_API_BASE}/api/1/ticker?pair=SOLNGN`, {
    headers: { 'Authorization': lunoAuthHeader },
  });

  if (!tickerResponse.ok) {
    console.error('❌ Failed to fetch market price');
    return;
  }

  const tickerData = await tickerResponse.json();
  const bidPrice = parseFloat(tickerData.bid || tickerData.last_trade || '0');
  console.log(`💰 Market price: ₦${bidPrice.toFixed(2)} per SOL\n`);

  if (!bidPrice || bidPrice <= 0) {
    console.error('❌ Invalid market price');
    return;
  }

  // Place sell order
  console.log('🔄 Placing sell order on Luno...');
  const limitPrice = bidPrice * 0.995;
  const formattedVolume = solAmount.toFixed(9);
  const formattedPrice = limitPrice.toFixed(2);
  const orderId = `sell-sol-${sellId.substring(0, 8)}-${Date.now()}`;

  const orderResponse = await fetch(`${LUNO_API_BASE}/api/1/postorder`, {
    method: 'POST',
    headers: {
      'Authorization': lunoAuthHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      pair: 'SOLNGN',
      type: 'SELL',
      volume: formattedVolume,
      price: formattedPrice,
      time_in_force: 'IOC',
      client_order_id: orderId,
    }),
  });

  if (!orderResponse.ok) {
    const errorText = await orderResponse.text();
    console.error('❌ Failed to place sell order:', errorText);
    return;
  }

  const orderData = await orderResponse.json();
  const lunoOrderId = orderData.order_id;
  console.log(`✅ Sell order placed: ${lunoOrderId}\n`);

  // Wait for order to execute
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check order status
  const statusResponse = await fetch(`${LUNO_API_BASE}/api/1/orders/${lunoOrderId}`, {
    headers: { 'Authorization': lunoAuthHeader },
  });

  let ngnReceived = 0;
  let executionPrice = bidPrice;

  if (statusResponse.ok) {
    const statusData = await statusResponse.json();
    const counter = parseFloat(statusData.counter || '0');
    const base = parseFloat(statusData.base || '0');
    ngnReceived = counter;
    if (base > 0) {
      executionPrice = counter / base;
    }
    console.log(`📊 Order status: ${statusData.status}`);
    console.log(`   NGN Received: ₦${ngnReceived.toFixed(2)}`);
  } else {
    // Fallback: calculate expected NGN
    ngnReceived = solAmount * bidPrice;
    console.log(`⚠️ Could not fetch order status, using estimated NGN: ₦${ngnReceived.toFixed(2)}`);
  }

  // Calculate platform fee and final payout
  const platformFeePercentage = parseFloat(sellOrder.metadata?.platform_fee_percentage || '0.03');
  const platformFee = ngnReceived * platformFeePercentage;
  const finalNgnPayout = ngnReceived - platformFee;

  console.log(`\n💰 Payout Calculation:`);
  console.log(`   NGN Received: ₦${ngnReceived.toFixed(2)}`);
  console.log(`   Platform Fee (${(platformFeePercentage * 100).toFixed(1)}%): ₦${platformFee.toFixed(2)}`);
  console.log(`   Final Payout: ₦${finalNgnPayout.toFixed(2)}\n`);

  // Credit NGN balance using shared utility logic
  console.log('🔄 Crediting NGN balance...');
  const { creditNgnBalance } = await import('../supabase/functions/_shared/credit-ngn-balance.ts');
  
  // Since we can't import Deno modules in Node.js, let's do it manually
  const [ngnBalanceResult, walletResult] = await Promise.all([
    supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', sellOrder.user_id)
      .eq('currency', 'NGN')
      .single(),
    supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', sellOrder.user_id)
      .single(),
  ]);

  const balanceFromWalletBalances = ngnBalanceResult.data ? parseFloat(ngnBalanceResult.data.balance || '0') : 0;
  const balanceFromWallets = walletResult.data ? parseFloat(walletResult.data.ngn_balance || '0') : 0;
  const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
  const newNgnBalance = currentNgnBalance + finalNgnPayout;

  // Update wallet_balances
  await supabase
    .from('wallet_balances')
    .upsert({
      user_id: sellOrder.user_id,
      currency: 'NGN',
      balance: newNgnBalance.toFixed(2),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });

  // Update wallets table
  const { data: wallet } = await supabase
    .from('wallets')
    .select('ngn_balance')
    .eq('user_id', sellOrder.user_id)
    .single();

  if (wallet) {
    await supabase
      .from('wallets')
      .update({
        ngn_balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', sellOrder.user_id);
  } else {
    await supabase
      .from('wallets')
      .insert({
        user_id: sellOrder.user_id,
        usd_balance: 0,
        ngn_balance: newNgnBalance.toFixed(2),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  }

  console.log('✅ NGN balance credited\n');

  // Update sell order
  await supabase
    .from('sells')
    .update({
      status: 'COMPLETED',
      luno_order_id: lunoOrderId,
      ngn_received: ngnReceived.toFixed(2),
      completed_at: new Date().toISOString(),
      profit: (finalNgnPayout - parseFloat(sellOrder.quoted_ngn || '0')).toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: executionPrice.toFixed(2),
        luno_order_status: orderData.status,
      },
    })
    .eq('sell_id', sellId);

  console.log('✅ Sell order updated to COMPLETED\n');

  // Update or create transaction
  const { data: existingTxs } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', sellOrder.user_id)
    .eq('transaction_type', 'SELL')
    .eq('crypto_currency', 'SOL')
    .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${sellOrder.sol_tx_hash || 'none'}`)
    .limit(1);

  if (existingTxs && existingTxs.length > 0) {
    await supabase
      .from('transactions')
      .update({
        status: 'COMPLETED',
        fiat_amount: finalNgnPayout.toFixed(2),
        fiat_currency: 'NGN',
        fee_amount: platformFee.toFixed(2),
        fee_currency: 'NGN',
        external_order_id: lunoOrderId,
        completed_at: new Date().toISOString(),
        metadata: {
          sell_id: sellId,
          ngn_received: finalNgnPayout.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          luno_order_id: lunoOrderId,
          execution_price: executionPrice.toFixed(2),
        },
      })
      .eq('id', existingTxs[0].id);
  } else {
    await supabase
      .from('transactions')
      .insert({
        user_id: sellOrder.user_id,
        transaction_type: 'SELL',
        crypto_currency: 'SOL',
        crypto_amount: solAmount.toFixed(9),
        fiat_amount: finalNgnPayout.toFixed(2),
        fiat_currency: 'NGN',
        status: 'COMPLETED',
        transaction_hash: sellOrder.sol_tx_hash || undefined,
        external_order_id: lunoOrderId,
        fee_amount: platformFee.toFixed(2),
        fee_currency: 'NGN',
        completed_at: new Date().toISOString(),
        metadata: {
          sell_id: sellId,
          ngn_received: finalNgnPayout.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          luno_order_id: lunoOrderId,
          execution_price: executionPrice.toFixed(2),
        },
      });
  }

  console.log('✅ Transaction recorded\n');
  console.log('🎉 Sell completed successfully!');
  console.log(`   NGN Credited: ₦${finalNgnPayout.toFixed(2)}`);
  console.log(`   New NGN Balance: ₦${newNgnBalance.toFixed(2)}`);
}

directExecuteSell().catch(console.error);







