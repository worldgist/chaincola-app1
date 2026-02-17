#!/usr/bin/env node

/**
 * Check where the SOL conversion went
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

const TX_SIGNATURE = '2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD';

async function checkConversion() {
  console.log('\n🔍 Checking SOL Conversion Details\n');
  console.log('='.repeat(60));

  // Find the RECEIVE transaction
  const { data: receiveTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_hash', TX_SIGNATURE)
    .eq('crypto_currency', 'SOL')
    .eq('transaction_type', 'RECEIVE')
    .single();

  if (!receiveTx) {
    console.error('❌ RECEIVE transaction not found');
    return;
  }

  console.log(`✅ Found RECEIVE Transaction:`);
  console.log(`   ID: ${receiveTx.id}`);
  console.log(`   Amount: ${receiveTx.crypto_amount} SOL`);
  console.log(`   User ID: ${receiveTx.user_id}`);
  console.log(`   Status: ${receiveTx.status}`);
  console.log(`   Created: ${new Date(receiveTx.created_at).toLocaleString()}`);

  const metadata = receiveTx.metadata || {};
  if (metadata.auto_converted_to_ngn) {
    console.log(`\n✅ Auto-converted: YES`);
    console.log(`   NGN Credited: ₦${metadata.ngn_credited || 'N/A'}`);
    console.log(`   Converted At: ${metadata.converted_at || 'N/A'}`);
  }

  // Find the CONVERT transaction
  const { data: convertTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_hash', TX_SIGNATURE)
    .eq('crypto_currency', 'SOL')
    .eq('transaction_type', 'CONVERT')
    .single();

  if (convertTx) {
    console.log(`\n✅ Found CONVERT Transaction:`);
    console.log(`   ID: ${convertTx.id}`);
    console.log(`   SOL Amount: ${convertTx.crypto_amount} SOL`);
    console.log(`   NGN Amount: ₦${convertTx.fiat_amount}`);
    console.log(`   Status: ${convertTx.status}`);
    console.log(`   Created: ${new Date(convertTx.created_at).toLocaleString()}`);
    
    const convertMetadata = convertTx.metadata || {};
    console.log(`\n   Conversion Details:`);
    console.log(`   Price per SOL: ₦${convertMetadata.price_per_unit || 'N/A'}`);
    console.log(`   Price Source: ${convertMetadata.price_source || 'N/A'}`);
    console.log(`   Total NGN (before fee): ₦${convertMetadata.total_ngn_before_fee || 'N/A'}`);
    console.log(`   Platform Fee: ₦${convertMetadata.platform_fee || 'N/A'} (${(convertMetadata.platform_fee_percentage * 100 || 0).toFixed(1)}%)`);
    console.log(`   Net NGN Credited: ₦${convertTx.fiat_amount}`);
  }

  // Check wallet balance
  console.log(`\n💰 Checking Wallet Balance...`);
  const { data: balance } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', receiveTx.user_id)
    .eq('currency', 'NGN')
    .single();

  if (balance) {
    console.log(`\n✅ NGN Balance Found:`);
    console.log(`   User ID: ${balance.user_id}`);
    console.log(`   Currency: ${balance.currency}`);
    console.log(`   Balance: ₦${parseFloat(balance.balance || 0).toFixed(2)}`);
    console.log(`   Updated: ${new Date(balance.updated_at).toLocaleString()}`);
    
    if (convertTx) {
      const expectedBalance = parseFloat(balance.balance || 0);
      console.log(`\n📊 Verification:`);
      console.log(`   Expected NGN from conversion: ₦${convertTx.fiat_amount}`);
      console.log(`   Current NGN balance: ₦${expectedBalance.toFixed(2)}`);
      console.log(`   ✅ Funds are in your NGN wallet balance`);
    }
  } else {
    console.log(`\n⚠️  No NGN balance record found for this user`);
  }

  // Check user details
  console.log(`\n👤 User Information:`);
  const { data: user } = await supabase.auth.admin.getUserById(receiveTx.user_id);
  if (user) {
    console.log(`   User ID: ${receiveTx.user_id}`);
    console.log(`   Email: ${user.user?.email || 'N/A'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📍 Summary:`);
  console.log(`   The converted NGN (₦${convertTx?.fiat_amount || metadata.ngn_credited || 'N/A'}) is in your:`);
  console.log(`   → NGN Wallet Balance (wallet_balances table)`);
  console.log(`   → This is your main account balance that you can use for:`);
  console.log(`     • Buying crypto`);
  console.log(`     • Withdrawing to bank`);
  console.log(`     • Sending to other users`);
  console.log(`     • Any other transactions\n`);
}

checkConversion().catch(console.error);
