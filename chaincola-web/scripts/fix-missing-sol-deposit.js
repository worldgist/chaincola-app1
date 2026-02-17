#!/usr/bin/env node

/**
 * Fix Missing Solana Deposit
 * Transaction: 2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD
 * Address: 5htD5gdX7dVvC1qZnuZaMMaPryy4HPVcHDkddo6Q2Qrc
 * Amount: 0.01579829 SOL
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

// Transaction details from the image
const TX_SIGNATURE = '2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD';
const RECIPIENT_ADDRESS = '5htD5gdX7dVvC1qZnuZaMMaPryy4HPVcHDkddo6Q2Qrc';
const SOL_AMOUNT = 0.01579829;

async function fixMissingDeposit() {
  console.log('🔍 Fixing Missing Solana Deposit\n');
  console.log(`Transaction: ${TX_SIGNATURE}`);
  console.log(`Address: ${RECIPIENT_ADDRESS}`);
  console.log(`Amount: ${SOL_AMOUNT} SOL\n`);

  // Step 1: Find wallet
  console.log('📊 Step 1: Finding wallet...');
  const { data: wallet, error: walletError } = await supabase
    .from('crypto_wallets')
    .select('id, user_id, address, asset, network, is_active')
    .eq('address', RECIPIENT_ADDRESS)
    .eq('asset', 'SOL')
    .eq('network', 'mainnet')
    .maybeSingle();

  if (walletError || !wallet) {
    console.error('❌ Wallet not found:', walletError);
    console.log('\nTrying broader search...');
    
    const { data: wallet2 } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .eq('address', RECIPIENT_ADDRESS)
      .maybeSingle();
    
    if (!wallet2) {
      console.error('❌ Wallet address not found in database');
      console.log('\nPlease verify:');
      console.log(`1. Address exists: ${RECIPIENT_ADDRESS}`);
      console.log('2. Asset is SOL');
      console.log('3. Network is mainnet');
      return;
    }
    
    console.log(`⚠️  Found wallet but asset/network mismatch:`);
    console.log(`   Asset: ${wallet2.asset}, Network: ${wallet2.network}`);
    console.log(`   User ID: ${wallet2.user_id}`);
    
    if (wallet2.asset !== 'SOL' || wallet2.network !== 'mainnet') {
      console.error('\n❌ Wallet asset/network mismatch. Cannot proceed.');
      return;
    }
    
    wallet = wallet2;
  }

  console.log(`✅ Wallet found:`);
  console.log(`   User ID: ${wallet.user_id}`);
  console.log(`   Wallet ID: ${wallet.id}`);
  console.log(`   Active: ${wallet.is_active}\n`);

  // Step 2: Check if transaction exists
  console.log('📊 Step 2: Checking for existing transaction...');
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id, status, crypto_amount, metadata')
    .eq('transaction_hash', TX_SIGNATURE)
    .eq('user_id', wallet.user_id)
    .eq('crypto_currency', 'SOL')
    .maybeSingle();

  if (existingTx) {
    console.log(`⚠️  Transaction already exists:`);
    console.log(`   ID: ${existingTx.id}`);
    console.log(`   Status: ${existingTx.status}`);
    console.log(`   Amount: ${existingTx.crypto_amount} SOL`);
    
    const metadata = existingTx.metadata || {};
    if (metadata.auto_converted_to_ngn) {
      console.log(`\n✅ Transaction already processed and converted to NGN`);
      console.log(`   NGN Credited: ₦${metadata.ngn_credited || 'N/A'}`);
      
      // Check balance
      const { data: balance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', wallet.user_id)
        .eq('currency', 'NGN')
        .maybeSingle();
      
      console.log(`   Current NGN Balance: ₦${balance?.balance || '0'}`);
      return;
    } else {
      console.log(`\n⚠️  Transaction exists but not converted. Triggering conversion...`);
      
      // Trigger the detection function to process it
      const functionUrl = `${supabaseUrl}/functions/v1/detect-solana-deposits`;
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      const result = await response.json();
      console.log(`✅ Detection function triggered:`, result);
      console.log(`\nPlease wait a moment and check your balance again.`);
      return;
    }
  }

  // Step 3: Create transaction record
  console.log('📊 Step 3: Creating transaction record...');
  const { data: newTx, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: wallet.user_id,
      transaction_type: 'RECEIVE',
      crypto_currency: 'SOL',
      crypto_amount: SOL_AMOUNT,
      status: 'CONFIRMED',
      to_address: RECIPIENT_ADDRESS,
      transaction_hash: TX_SIGNATURE,
      confirmations: 32,
      metadata: {
        detected_at: new Date().toISOString(),
        detected_via: 'manual_fix',
        confirmation_status: 'finalized',
        manual_credit: true,
      },
    })
    .select()
    .single();

  if (txError) {
    console.error('❌ Failed to create transaction:', txError);
    return;
  }

  console.log(`✅ Transaction recorded: ${newTx.id}\n`);

  // Step 4: Trigger auto-convert (which credits NGN)
  console.log('📊 Step 4: Triggering auto-convert to NGN...');
  const functionUrl = `${supabaseUrl}/functions/v1/detect-solana-deposits`;
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    console.log(`✅ Auto-convert triggered:`, result);
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if conversion happened
    const { data: updatedTx } = await supabase
      .from('transactions')
      .select('metadata')
      .eq('id', newTx.id)
      .single();
    
    const updatedMetadata = updatedTx?.metadata || {};
    if (updatedMetadata.auto_converted_to_ngn) {
      console.log(`\n✅ Deposit converted to NGN!`);
      console.log(`   NGN Credited: ₦${updatedMetadata.ngn_credited || 'N/A'}`);
    } else {
      console.log(`\n⚠️  Auto-convert may still be processing. Please check your balance.`);
    }
    
  } catch (error) {
    console.error('❌ Error triggering auto-convert:', error);
    console.log('\n⚠️  Transaction recorded but auto-convert failed.');
    console.log('   You may need to manually trigger the detection function.');
  }

  // Step 5: Check final balance
  console.log('\n📊 Step 5: Checking balances...');
  const { data: ngnBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', wallet.user_id)
    .eq('currency', 'NGN')
    .maybeSingle();

  console.log(`\n✅ Final NGN Balance: ₦${ngnBalance?.balance || '0'}`);
  console.log('\n✅ Process complete!');
}

fixMissingDeposit().catch(console.error);
