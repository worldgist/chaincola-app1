#!/usr/bin/env node

/**
 * Directly convert SOL to NGN for a transaction
 * This bypasses the detection function and directly credits NGN
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transaction details
const TX_SIGNATURE = '2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD';
const SOL_AMOUNT = 0.01579829;
const PLATFORM_FEE_PERCENTAGE = 0.03; // 3%

async function getPrice(cryptoCurrency) {
  // First check app rates
  const { data: appRate } = await supabase
    .from('crypto_rates')
    .select('price_ngn')
    .eq('crypto_symbol', cryptoCurrency.toUpperCase())
    .single();

  if (appRate && appRate.price_ngn > 0) {
    return { price: appRate.price_ngn, source: 'app_rate' };
  }

  // Fallback price for SOL (in NGN)
  const FALLBACK_PRICES = {
  };

  return { price: FALLBACK_PRICES[cryptoCurrency] || 0, source: 'fallback' };
}

async function creditNgnBalance(userId, amount) {
  // Get current balance
  const { data: currentBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .maybeSingle();

  const currentBalanceAmount = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
  const newBalance = currentBalanceAmount + amount;

  // Upsert balance
  const { error } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: userId,
      currency: 'NGN',
      balance: newBalance,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, newBalance };
}

async function directAutoConvert(transactionId) {
  console.log('\n💰 Directly Converting SOL to NGN\n');
  console.log('='.repeat(60));

  // Get the transaction
  let tx;
  if (transactionId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();
    
    if (error || !data) {
      console.error(`❌ Transaction ${transactionId} not found`);
      return;
    }
    tx = data;
  } else {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_hash', TX_SIGNATURE)
      .eq('crypto_currency', 'SOL')
      .single();
    
    if (error || !data) {
      console.error(`❌ Transaction ${TX_SIGNATURE} not found`);
      return;
    }
    tx = data;
  }

  console.log(`✅ Found transaction:`);
  console.log(`   ID: ${tx.id}`);
  console.log(`   Amount: ${tx.crypto_amount} SOL`);
  console.log(`   User ID: ${tx.user_id}`);
  console.log(`   Status: ${tx.status}`);

  const metadata = tx.metadata || {};
  if (metadata.auto_converted_to_ngn) {
    console.log(`\n✅ Transaction already auto-converted!`);
    console.log(`   NGN Credited: ₦${metadata.ngn_credited || 'N/A'}`);
    return;
  }

  // Get price
  console.log(`\n📊 Step 1: Getting SOL price...`);
  const { price: pricePerUnit, source: priceSource } = await getPrice('SOL');
  
  if (pricePerUnit <= 0) {
    console.error('❌ Unable to get SOL price');
    return;
  }

  console.log(`   Price: ₦${pricePerUnit.toFixed(2)} per SOL`);
  console.log(`   Source: ${priceSource}`);

  // Calculate NGN amounts
  const cryptoAmount = tx.crypto_amount || SOL_AMOUNT;
  const totalNgnBeforeFee = cryptoAmount * pricePerUnit;
  const platformFee = totalNgnBeforeFee * PLATFORM_FEE_PERCENTAGE;
  const ngnCredited = totalNgnBeforeFee - platformFee;

  console.log(`\n📊 Step 2: Calculating conversion...`);
  console.log(`   Crypto: ${cryptoAmount} SOL`);
  console.log(`   Total NGN: ₦${totalNgnBeforeFee.toFixed(2)}`);
  console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
  console.log(`   NGN to Credit: ₦${ngnCredited.toFixed(2)}`);

  // Credit NGN balance
  console.log(`\n💰 Step 3: Crediting NGN balance...`);
  const creditResult = await creditNgnBalance(tx.user_id, ngnCredited);
  
  if (!creditResult.success) {
    console.error(`❌ Failed to credit NGN balance: ${creditResult.error}`);
    return;
  }

  console.log(`✅ NGN balance credited!`);
  console.log(`   New Balance: ₦${creditResult.newBalance.toFixed(2)}`);

  // Create conversion transaction record
  console.log(`\n📝 Step 4: Creating conversion transaction...`);
  const { data: convertTx, error: convertError } = await supabase
    .from('transactions')
    .insert({
      user_id: tx.user_id,
      transaction_type: 'CONVERT',
      crypto_currency: 'SOL',
      crypto_amount: cryptoAmount,
      fiat_currency: 'NGN',
      fiat_amount: ngnCredited,
      status: 'COMPLETED',
      transaction_hash: tx.transaction_hash || TX_SIGNATURE,
      metadata: {
        auto_converted: true,
        source_transaction_id: tx.id,
        price_per_unit: pricePerUnit,
        price_source: priceSource,
        total_ngn_before_fee: totalNgnBeforeFee,
        platform_fee: platformFee,
        platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
        converted_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (convertError) {
    console.error(`⚠️  Failed to create conversion transaction: ${convertError.message}`);
  } else {
    console.log(`✅ Conversion transaction created: ${convertTx.id}`);
  }

  // Update source transaction metadata
  console.log(`\n📝 Step 5: Updating source transaction...`);
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      metadata: {
        ...metadata,
        auto_converted_to_ngn: true,
        conversion_transaction_id: convertTx?.id || null,
        ngn_credited: ngnCredited,
        converted_at: new Date().toISOString(),
        price_source: priceSource,
      },
    })
    .eq('id', tx.id);

  if (updateError) {
    console.error(`⚠️  Failed to update source transaction: ${updateError.message}`);
  } else {
    console.log(`✅ Source transaction updated`);
  }

  // Final balance check
  const { data: finalBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', tx.user_id)
    .eq('currency', 'NGN')
    .maybeSingle();

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Conversion Complete!`);
  console.log(`   SOL Amount: ${cryptoAmount} SOL`);
  console.log(`   NGN Credited: ₦${ngnCredited.toFixed(2)}`);
  console.log(`   Current NGN Balance: ₦${finalBalance?.balance || '0'}`);
  console.log('='.repeat(60) + '\n');
}

const transactionId = process.argv[2] || '88bc0dbc-5853-4d99-a648-d92729d0796f';
directAutoConvert(transactionId).catch(console.error);
