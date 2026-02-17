/**
 * Credit SOL deposit to user wallet and record transaction
 * Transaction: 5RqgS76AUTKRFsCtviUHzmfn2xeevn hpW9qbEEpoP6RRFEdrMSZtURA2AjTV TcdAEC7pRQCwNTrk4Brj7GiNztQB
 * Amount: 0.015318545 SOL
 * Address: FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transaction details
const txHash = '5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB';
const solAmount = 0.015318545;
const toAddress = 'FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe';
const timestamp = '2026-01-05T19:17:45+01:00';

async function creditSolDeposit() {
  console.log('🔍 Finding wallet owner...\n');
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`Amount: ${solAmount} SOL`);
  console.log(`Address: ${toAddress}\n`);

  // Find the wallet owner
  const { data: wallet, error: walletError } = await supabase
    .from('crypto_wallets')
    .select('user_id, address')
    .eq('address', toAddress)
    .eq('asset_type', 'SOL')
    .eq('network', 'mainnet')
    .single();

  if (walletError || !wallet) {
    console.error('❌ Wallet not found:', walletError);
    console.log('\nTrying to find by address only...');
    
    // Try without network filter
    const { data: wallet2, error: walletError2 } = await supabase
      .from('crypto_wallets')
      .select('user_id, address, asset_type, network')
      .eq('address', toAddress)
      .single();
    
    if (walletError2 || !wallet2) {
      console.error('❌ Wallet not found in database');
      console.log('\nAvailable options:');
      console.log('1. Check if address exists in crypto_wallets table');
      console.log('2. Manually create wallet entry if needed');
      return;
    }
    
    console.log(`✅ Found wallet: User ID = ${wallet2.user_id}, Asset = ${wallet2.asset_type}, Network = ${wallet2.network}`);
    wallet.user_id = wallet2.user_id;
  } else {
    console.log(`✅ Found wallet: User ID = ${wallet.user_id}`);
  }

  const userId = wallet.user_id;

  // Check if transaction already exists
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id, status')
    .eq('transaction_hash', txHash)
    .single();

  if (existingTx) {
    console.log(`\n⚠️ Transaction already exists: ${existingTx.id}, Status: ${existingTx.status}`);
    
    if (existingTx.status === 'COMPLETED' || existingTx.status === 'CONFIRMED') {
      console.log('✅ Transaction already processed. Checking balance...');
      
      // Check current balance
      const { data: balance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'SOL')
        .single();
      
      console.log(`Current SOL balance: ${balance?.balance || '0'}`);
      return;
    }
  }

  // Get current balance
  const { data: currentBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  const currentSolBalance = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
  const newSolBalance = currentSolBalance + solAmount;

  console.log(`\n💰 Balance Update:`);
  console.log(`   Current: ${currentSolBalance.toFixed(9)} SOL`);
  console.log(`   Adding: ${solAmount.toFixed(9)} SOL`);
  console.log(`   New: ${newSolBalance.toFixed(9)} SOL`);

  // Credit SOL balance
  console.log('\n🔄 Crediting SOL balance...');
  const { error: balanceError } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: userId,
      currency: 'SOL',
      balance: newSolBalance.toFixed(9),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });

  if (balanceError) {
    console.error('❌ Failed to credit balance:', balanceError);
    return;
  }

  console.log('✅ Balance credited successfully');

  // Record transaction
  console.log('\n🔄 Recording transaction...');
  const txData = {
    user_id: userId,
    transaction_type: 'RECEIVE',
    crypto_currency: 'SOL',
    crypto_amount: solAmount.toFixed(9),
    network: 'mainnet',
    to_address: toAddress,
    transaction_hash: txHash,
    status: 'COMPLETED',
    completed_at: timestamp,
    metadata: {
      source: 'manual_credit',
      credited_at: new Date().toISOString(),
    },
  };

  if (existingTx) {
    // Update existing transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        ...txData,
        status: 'COMPLETED',
        completed_at: timestamp,
      })
      .eq('id', existingTx.id);

    if (updateError) {
      console.error('❌ Failed to update transaction:', updateError);
      return;
    }
    console.log(`✅ Transaction updated: ${existingTx.id}`);
  } else {
    // Create new transaction
    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert(txData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to record transaction:', insertError);
      return;
    }
    console.log(`✅ Transaction recorded: ${newTx.id}`);
  }

  // Verify final balance
  const { data: finalBalance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  console.log(`\n✅ Final SOL balance: ${finalBalance?.balance || '0'} SOL`);
  console.log('\n✅ Deposit credited successfully!');
}

creditSolDeposit().catch(console.error);







