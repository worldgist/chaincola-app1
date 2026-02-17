#!/usr/bin/env node

/**
 * Fix Solana Deposit - Credit Balance and Stop Duplicate Notifications
 * 
 * This script:
 * 1. Finds the SOL transaction by hash
 * 2. Credits the balance if not already credited
 * 3. Marks transaction as notified to stop duplicate notifications
 * 
 * Usage:
 *   node scripts/fix-sol-deposit-and-stop-notifications.js <transaction_hash> [user_email]
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get transaction hash from command line
const txHash = process.argv[2];
const userEmail = process.argv[3];

if (!txHash) {
  console.error('❌ Transaction hash is required');
  console.error('Usage: node scripts/fix-sol-deposit-and-stop-notifications.js <transaction_hash> [user_email]');
  process.exit(1);
}

async function fixSolDeposit() {
  try {
    console.log('🔧 Fixing SOL Deposit and Stopping Notifications\n');
    console.log(`Transaction Hash: ${txHash}\n`);

    // Step 1: Find the transaction
    console.log('📊 Step 1: Finding transaction...');
    let query = supabase
      .from('transactions')
      .select('*, crypto_wallets!inner(address, user_id, user_profiles!inner(email))')
      .eq('transaction_hash', txHash)
      .eq('crypto_currency', 'SOL');

    if (userEmail) {
      query = query.eq('crypto_wallets.user_profiles.email', userEmail);
    }

    const { data: transactions, error: txError } = await query;

    if (txError) {
      throw new Error(`Failed to find transaction: ${txError.message}`);
    }

    if (!transactions || transactions.length === 0) {
      console.error('❌ Transaction not found');
      console.error('   Make sure the transaction hash is correct');
      if (userEmail) {
        console.error(`   And user email matches: ${userEmail}`);
      }
      process.exit(1);
    }

    const transaction = transactions[0];
    const userId = transaction.user_id;
    const amount = parseFloat(transaction.crypto_amount || 0);
    const walletAddress = transaction.to_address;

    console.log(`✅ Transaction found:`);
    console.log(`   ID: ${transaction.id}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Amount: ${amount} SOL`);
    console.log(`   Status: ${transaction.status}`);
    console.log(`   Wallet: ${walletAddress}\n`);

    // Step 2: Check if balance is already credited
    console.log('💰 Step 2: Checking current balance...');
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .maybeSingle();

    if (balanceError && balanceError.code !== 'PGRST116') {
      throw new Error(`Failed to check balance: ${balanceError.message}`);
    }

    const currentBalance = balance ? parseFloat(balance.balance || '0') : 0;
    console.log(`   Current SOL balance: ${currentBalance.toFixed(9)} SOL`);

    // Check metadata to see if already credited
    const metadata = transaction.metadata || {};
    const alreadyCredited = metadata.credited === true || metadata.credited_at;

    if (alreadyCredited) {
      console.log(`   ⚠️  Transaction metadata shows it was already credited`);
      console.log(`   Credited at: ${metadata.credited_at || 'unknown'}\n`);
    }

    // Step 3: Credit balance if not credited
    if (!alreadyCredited || currentBalance === 0) {
      console.log('💳 Step 3: Crediting SOL balance...');
      
      const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
        p_user_id: userId,
        p_amount: amount,
        p_currency: 'SOL',
      });

      if (creditError) {
        console.error(`   ⚠️  RPC credit failed: ${creditError.message}`);
        console.log('   Trying direct update...');
        
        const newBalance = currentBalance + amount;
        const { error: updateError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: userId,
            currency: 'SOL',
            balance: newBalance,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,currency',
          });

        if (updateError) {
          throw new Error(`Failed to credit balance: ${updateError.message}`);
        }
        console.log(`   ✅ Balance credited via direct update: ${newBalance.toFixed(9)} SOL`);
      } else {
        console.log(`   ✅ Balance credited successfully: ${amount} SOL`);
      }
    } else {
      console.log('   ⏭️  Balance already credited, skipping...\n');
    }

    // Step 4: Mark transaction as notified to stop duplicate notifications
    console.log('🔕 Step 4: Marking transaction as notified to stop duplicate notifications...');
    
    const notifiedStatuses = Array.isArray(metadata.notifiedStatuses) ? metadata.notifiedStatuses : [];
    if (!notifiedStatuses.includes('CONFIRMED')) {
      notifiedStatuses.push('CONFIRMED');
    }
    if (!notifiedStatuses.includes('CONFIRMING')) {
      notifiedStatuses.push('CONFIRMING');
    }
    if (!notifiedStatuses.includes('PENDING')) {
      notifiedStatuses.push('PENDING');
    }

    const updatedMetadata = {
      ...metadata,
      credited: true,
      credited_at: metadata.credited_at || new Date().toISOString(),
      notifiedStatuses: notifiedStatuses,
      pre_notified_at: metadata.pre_notified_at || new Date().toISOString(),
      last_notified_at: new Date().toISOString(),
      notification_fixed: true,
      fixed_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'CONFIRMED',
        metadata: updatedMetadata,
      })
      .eq('id', transaction.id);

    if (updateError) {
      throw new Error(`Failed to update transaction: ${updateError.message}`);
    }

    console.log('   ✅ Transaction marked as notified (all statuses)');
    console.log('   ✅ Duplicate notifications will now be prevented\n');

    // Step 5: Verify final balance
    console.log('✅ Step 5: Verifying final balance...');
    const { data: finalBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .maybeSingle();

    const finalSolBalance = finalBalance ? parseFloat(finalBalance.balance || '0') : 0;
    console.log(`   Final SOL balance: ${finalSolBalance.toFixed(9)} SOL\n`);

    console.log('✅ Fix completed successfully!');
    console.log('   - Balance credited');
    console.log('   - Transaction marked as notified');
    console.log('   - Duplicate notifications stopped\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixSolDeposit();
