#!/usr/bin/env node

/**
 * Diagnostic script to check and fix missing Solana deposits
 * Usage: node diagnose-sol-deposit.js [wallet_address] [transaction_hash]
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

async function diagnoseSolDeposit(walletAddress, txHash) {
  console.log('\n🔍 Diagnosing Solana Deposit Issue\n');
  console.log('=' .repeat(60));

  // Step 1: Check wallet exists
  console.log('\n📊 Step 1: Checking wallet...');
  let wallet = null;
  
  if (walletAddress) {
    // Look for specific wallet address
    const { data: specificWallet, error: specificError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network, is_active')
      .eq('address', walletAddress)
      .eq('asset', 'SOL')
      .maybeSingle();
    
    if (specificWallet) {
      wallet = specificWallet;
    } else {
      console.log(`⚠️  Wallet address ${walletAddress} not found`);
    }
  } else {
    // Get all active SOL wallets
    const { data: allWallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network, is_active')
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .limit(10);
    
    if (walletsError) {
      console.error('❌ Error fetching wallets:', walletsError);
      return;
    }
    
    if (!allWallets || allWallets.length === 0) {
      console.error('❌ No active SOL wallets found in database');
      console.log('\n💡 To check a specific wallet, run:');
      console.log('   node scripts/diagnose-sol-deposit.js <wallet_address> [transaction_hash]');
      return;
    }
    
    console.log(`✅ Found ${allWallets.length} active SOL wallet(s):`);
    allWallets.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.address} (User: ${w.user_id.substring(0, 8)}...)`);
    });
    
    // Use the first wallet for diagnosis
    wallet = allWallets[0];
    console.log(`\n   Using first wallet for diagnosis: ${wallet.address}`);
  }

  if (!wallet) {
    console.error('❌ No wallet found to diagnose');
    return;
  }

  console.log(`✅ Wallet found:`);
  console.log(`   Address: ${wallet.address}`);
  console.log(`   User ID: ${wallet.user_id}`);
  console.log(`   Active: ${wallet.is_active}`);

  // Step 2: Check for recent transactions
  console.log('\n📊 Step 2: Checking recent SOL transactions...');
  const { data: recentTxs, error: txError } = await supabase
    .from('transactions')
    .select('id, transaction_hash, crypto_amount, status, metadata, created_at')
    .eq('user_id', wallet.user_id)
    .eq('crypto_currency', 'SOL')
    .order('created_at', { ascending: false })
    .limit(10);

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
  } else {
    console.log(`✅ Found ${recentTxs?.length || 0} recent SOL transactions`);
    if (recentTxs && recentTxs.length > 0) {
      console.log('\n   Recent transactions:');
      recentTxs.forEach((tx, i) => {
        const metadata = tx.metadata || {};
        const converted = metadata.auto_converted_to_ngn ? '✅' : '❌';
        console.log(`   ${i + 1}. ${tx.transaction_hash?.substring(0, 20)}...`);
        console.log(`      Amount: ${tx.crypto_amount} SOL`);
        console.log(`      Status: ${tx.status}`);
        console.log(`      Auto-converted: ${converted}`);
        if (metadata.ngn_credited) {
          console.log(`      NGN Credited: ₦${metadata.ngn_credited}`);
        }
        console.log(`      Created: ${new Date(tx.created_at).toLocaleString()}`);
      });
    }
  }

  // Step 3: Check specific transaction if provided
  if (txHash) {
    console.log(`\n📊 Step 3: Checking specific transaction: ${txHash}...`);
    const { data: specificTx } = await supabase
      .from('transactions')
      .select('id, transaction_hash, crypto_amount, status, metadata')
      .eq('transaction_hash', txHash)
      .eq('user_id', wallet.user_id)
      .eq('crypto_currency', 'SOL')
      .maybeSingle();

    if (specificTx) {
      console.log(`✅ Transaction found in database:`);
      console.log(`   ID: ${specificTx.id}`);
      console.log(`   Amount: ${specificTx.crypto_amount} SOL`);
      console.log(`   Status: ${specificTx.status}`);
      const metadata = specificTx.metadata || {};
      if (metadata.auto_converted_to_ngn) {
        console.log(`   ✅ Auto-converted to NGN`);
        console.log(`   NGN Credited: ₦${metadata.ngn_credited || 'N/A'}`);
      } else {
        console.log(`   ❌ NOT auto-converted`);
      }
    } else {
      console.log(`❌ Transaction NOT found in database`);
      console.log(`   This transaction needs to be detected and processed`);
    }
  }

  // Step 4: Check NGN balance
  console.log('\n📊 Step 4: Checking NGN balance...');
  const { data: balance } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', wallet.user_id)
    .eq('currency', 'NGN')
    .maybeSingle();

  console.log(`   Current NGN Balance: ₦${balance?.balance || '0'}`);

  // Step 5: Trigger detection function
  console.log('\n📊 Step 5: Triggering deposit detection function...');
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/detect-solana-deposits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error triggering detection: ${response.status}`, errorText);
      return;
    }

    const result = await response.json();
    console.log('✅ Detection function executed:');
    console.log(`   Wallets checked: ${result.checked || result.data?.checked || 'N/A'}`);
    console.log(`   Deposits found: ${result.depositsFound || result.data?.depositsFound || 'N/A'}`);
    console.log(`   Deposits credited: ${result.depositsCredited || result.data?.depositsCredited || 'N/A'}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\n⚠️ Errors:`);
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    if (result.data?.errors && result.data.errors.length > 0) {
      console.log(`\n⚠️ Errors:`);
      result.data.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    // Wait a moment and check balance again
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { data: newBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', wallet.user_id)
      .eq('currency', 'NGN')
      .maybeSingle();

    console.log(`\n   Updated NGN Balance: ₦${newBalance?.balance || '0'}`);
    
    if (newBalance?.balance !== balance?.balance) {
      const diff = (parseFloat(newBalance?.balance || '0') - parseFloat(balance?.balance || '0')).toFixed(2);
      console.log(`   ✅ Balance increased by: ₦${diff}`);
    }

  } catch (error) {
    console.error('❌ Exception triggering detection:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnosis complete!\n');
}

const walletAddress = process.argv[2];
const txHash = process.argv[3];
diagnoseSolDeposit(walletAddress, txHash).catch(console.error);
