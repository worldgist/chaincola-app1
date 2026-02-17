#!/usr/bin/env node

/**
 * Check specific Solana transactions by hash
 * Usage: node check-specific-sol-transactions.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transaction hashes from the images
const transactionsToCheck = [
  {
    hash: 'ebKCDznWexoytLTszc9Vf2xfi1DZrHhnMii4ZjVWskZAPRhuSUhJUYHKTrdh8eWboX1jS4PBFj9SFuMEtkySTyc',
    amount: '0.01768339',
    fee: '0.00003565',
    date: '2026-01-30 08:47:09',
    toAddress: 'Aeo26Jc7M6UYbXmdSJhenrayhN9ovKemqsBgQyoSygbB',
  },
  {
    hash: '5WB6SN2tw8Nya272MZZjRpH4YRxHiZqpvXXbnneK9YaJbrF1HTwhoVEyAavxs4FoXCYf89fv5uCuB9j59Zf8jYgF',
    amount: '0.01771905',
    fee: '0.00010481',
    date: '2026-01-30 07:27:56',
    toAddress: 'Aeo26Jc7M6UYbXmdSJhenrayhN9ovKemqsBgQyoSygbB',
  },
];

async function checkTransactions() {
  console.log('🔍 Checking specific Solana transactions...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const txInfo of transactionsToCheck) {
    console.log(`\n📋 Transaction: ${txInfo.hash.substring(0, 32)}...`);
    console.log(`   Expected Amount: ${txInfo.amount} SOL`);
    console.log(`   Expected Fee: ${txInfo.fee} SOL`);
    console.log(`   Expected Date: ${txInfo.date}`);
    console.log(`   To Address: ${txInfo.toAddress.substring(0, 20)}...\n`);

    // Check in transactions table
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_hash', txInfo.hash)
      .maybeSingle();

    if (txError) {
      console.error(`   ❌ Error querying database: ${txError.message}`);
      continue;
    }

    if (!tx) {
      console.log(`   ⚠️  STATUS: NOT FOUND IN DATABASE`);
      console.log(`   ❌ This transaction is missing!`);
      console.log(`\n   💡 To add this transaction, you can:`);
      console.log(`      1. Run: node manual-detect-sol-deposit.js`);
      console.log(`      2. Or manually create it via admin panel`);
      continue;
    }

    console.log(`   ✅ STATUS: FOUND IN DATABASE`);
    console.log(`   Transaction ID: ${tx.id}`);
    console.log(`   Type: ${tx.transaction_type}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   Crypto Currency: ${tx.crypto_currency}`);
    console.log(`   Crypto Amount: ${tx.crypto_amount} ${tx.crypto_currency}`);
    console.log(`   Fiat Amount: ${tx.fiat_amount || 'N/A'} ${tx.fiat_currency || 'N/A'}`);
    console.log(`   Fee Amount: ${tx.fee_amount || 'N/A'}`);
    console.log(`   Created At: ${tx.created_at}`);
    console.log(`   User ID: ${tx.user_id}`);

    // Check amount match
    const dbAmount = parseFloat(tx.crypto_amount || '0');
    const expectedAmount = parseFloat(txInfo.amount);
    const amountDiff = Math.abs(dbAmount - expectedAmount);

    if (amountDiff > 0.00000001) {
      console.log(`   ⚠️  AMOUNT MISMATCH:`);
      console.log(`      Expected: ${expectedAmount} SOL`);
      console.log(`      Database: ${dbAmount} SOL`);
      console.log(`      Difference: ${amountDiff} SOL`);
    } else {
      console.log(`   ✅ Amount matches`);
    }

    // Check if it's displayed correctly in admin (currency should be SOL, not USD/NGN)
    if (tx.transaction_type === 'SEND') {
      console.log(`\n   📊 Admin Display Check:`);
      console.log(`      Transaction Type: SEND (should show crypto amount)`);
      console.log(`      Currency Field: ${tx.crypto_currency || 'N/A'}`);
      
      // For SEND transactions, currency should be SOL, amount should be crypto_amount
      if (tx.crypto_currency === 'SOL') {
        console.log(`      ✅ Currency is correct (SOL)`);
      } else {
        console.log(`      ⚠️  Currency might be wrong: ${tx.crypto_currency}`);
      }
    }

    // Get user info
    if (tx.user_id) {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('user_id', tx.user_id)
        .single();

      if (userProfile) {
        console.log(`   User: ${userProfile.full_name || userProfile.email || 'Unknown'}`);
      }
    }

    console.log(`\n   ────────────────────────────────────────────────`);
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   Total transactions checked: ${transactionsToCheck.length}`);
  
  // Check all at once
  const hashes = transactionsToCheck.map(t => t.hash);
  const { data: allTxs, error: allError } = await supabase
    .from('transactions')
    .select('transaction_hash, transaction_type, status, crypto_amount, crypto_currency')
    .in('transaction_hash', hashes);

  if (!allError && allTxs) {
    const found = allTxs.length;
    const missing = transactionsToCheck.length - found;
    console.log(`   ✅ Found in database: ${found}`);
    console.log(`   ❌ Missing from database: ${missing}`);
    
    if (missing > 0) {
      console.log(`\n   ⚠️  Missing transactions:`);
      const foundHashes = new Set(allTxs.map(t => t.transaction_hash));
      transactionsToCheck.forEach(tx => {
        if (!foundHashes.has(tx.hash)) {
          console.log(`      - ${tx.hash.substring(0, 32)}... (${tx.amount} SOL)`);
        }
      });
    }
  }

  console.log(`\n✅ Check complete!\n`);
}

checkTransactions().catch(console.error);
