#!/usr/bin/env node

/**
 * Fix Solana Deposit - Credit Balance and Stop Duplicate Notifications
 * 
 * This script:
 * 1. Finds the SOL transaction
 * 2. Credits the balance if not already credited
 * 3. Marks transaction as notified to stop duplicate notifications
 * 
 * Usage:
 *   node scripts/fix-sol-deposit-credit-and-notify.js --tx-hash=<signature> --user-email=<email>
 *   OR
 *   node scripts/fix-sol-deposit-credit-and-notify.js --tx-hash=<signature> --user-id=<user_id>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse command line arguments
const args = process.argv.slice(2);
const txHashArg = args.find(arg => arg.startsWith('--tx-hash='))?.split('=')[1];
const userEmailArg = args.find(arg => arg.startsWith('--user-email='))?.split('=')[1];
const userIdArg = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];

if (!txHashArg) {
  console.error('❌ Transaction hash is required');
  console.error('Usage: node scripts/fix-sol-deposit-credit-and-notify.js --tx-hash=<signature> --user-email=<email>');
  process.exit(1);
}

async function fixSolDeposit() {
  try {
    console.log('🔧 Fixing SOL Deposit - Credit Balance and Stop Notifications\n');
    console.log(`Transaction Hash: ${txHashArg}\n`);

    // Step 1: Find the transaction
    console.log('📊 Step 1: Finding transaction...');
    let query = supabase
      .from('transactions')
      .select('*, crypto_wallets!inner(user_id, address)')
      .eq('transaction_hash', txHashArg)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'RECEIVE');

    const { data: transactions, error: txError } = await query;

    if (txError) {
      throw new Error(`Failed to find transaction: ${txError.message}`);
    }

    if (!transactions || transactions.length === 0) {
      console.error('❌ Transaction not found in database');
      console.error('   Make sure the transaction hash is correct and the deposit detection has run');
      process.exit(1);
    }

    // Filter by user if provided
    let transaction = transactions[0];
    if (userEmailArg || userIdArg) {
      let userId = userIdArg;
      
      if (userEmailArg) {
        // Get user ID from email
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('email', userEmailArg)
          .maybeSingle();
        
        if (!profile) {
          // Try auth.users
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          const authUser = authUsers?.users?.find(u => u.email === userEmailArg);
          if (authUser) {
            userId = authUser.id;
          } else {
            throw new Error(`User not found with email: ${userEmailArg}`);
          }
        } else {
          userId = profile.user_id;
        }
      }

      transaction = transactions.find(tx => tx.user_id === userId);
      if (!transaction) {
        throw new Error(`Transaction found but not for the specified user`);
      }
    }

    const userId = transaction.user_id;
    const amount = parseFloat(transaction.crypto_amount || 0);
    const status = transaction.status;
    const metadata = transaction.metadata || {};

    console.log(`✅ Transaction found:`);
    console.log(`   ID: ${transaction.id}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Amount: ${amount} SOL`);
    console.log(`   Status: ${status}`);
    console.log(`   Already Credited: ${metadata.credited ? 'Yes' : 'No'}`);
    console.log(`   Notified Statuses: ${metadata.notifiedStatuses ? JSON.stringify(metadata.notifiedStatuses) : 'None'}\n`);

    // Step 2: Credit balance if not credited
    if (!metadata.credited && status === 'CONFIRMED') {
      console.log('💰 Step 2: Crediting SOL balance...');
      
      const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
        p_user_id: userId,
        p_amount: amount,
        p_currency: 'SOL',
      });

      if (creditError) {
        console.error('⚠️ RPC credit failed, trying direct update...');
        
        // Fallback: direct update
        const { data: currentBalance } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', userId)
          .eq('currency', 'SOL')
          .maybeSingle();

        const currentSolBalance = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
        const newSolBalance = currentSolBalance + amount;

        const { error: updateError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: userId,
            currency: 'SOL',
            balance: newSolBalance,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,currency',
          });

        if (updateError) {
          throw new Error(`Failed to credit balance: ${updateError.message}`);
        }
        
        console.log(`✅ Balance credited via direct update: ${newSolBalance.toFixed(9)} SOL`);
      } else {
        console.log(`✅ Balance credited successfully: ${amount} SOL`);
      }

      // Verify balance
      const { data: balance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'SOL')
        .maybeSingle();

      console.log(`📊 Current SOL balance: ${parseFloat(balance?.balance || '0').toFixed(9)} SOL\n`);
    } else if (metadata.credited) {
      console.log('⏭️ Balance already credited, skipping...\n');
    } else {
      console.log(`⏳ Transaction status is ${status}, will be credited when CONFIRMED\n`);
    }

    // Step 3: Mark as notified to stop duplicate notifications
    console.log('🔕 Step 3: Marking transaction as notified to stop duplicate notifications...');
    
    const notifiedStatuses = Array.isArray(metadata.notifiedStatuses) ? metadata.notifiedStatuses : [];
    
    // Add all possible statuses to prevent future notifications
    const statusesToMark = ['PENDING', 'CONFIRMING', 'CONFIRMED'];
    let updated = false;
    
    for (const statusToMark of statusesToMark) {
      if (!notifiedStatuses.includes(statusToMark)) {
        notifiedStatuses.push(statusToMark);
        updated = true;
      }
    }

    const updatedMetadata = {
      ...metadata,
      notifiedStatuses,
      credited: metadata.credited || (status === 'CONFIRMED'),
      credited_at: metadata.credited_at || (status === 'CONFIRMED' ? new Date().toISOString() : undefined),
      last_notified_at: new Date().toISOString(),
      notification_fixed_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        metadata: updatedMetadata,
        status: status === 'PENDING' || status === 'CONFIRMING' ? 'CONFIRMED' : status, // Ensure it's CONFIRMED if it should be
      })
      .eq('id', transaction.id);

    if (updateError) {
      throw new Error(`Failed to update transaction metadata: ${updateError.message}`);
    }

    console.log(`✅ Transaction marked as notified for all statuses`);
    console.log(`   Notified Statuses: ${JSON.stringify(notifiedStatuses)}`);
    console.log(`   This will prevent future duplicate notifications\n`);

    console.log('✅ Fix completed successfully!');
    console.log('   - Balance credited (if needed)');
    console.log('   - Duplicate notifications stopped');
    console.log('\n💡 The user should stop receiving duplicate notifications now.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

fixSolDeposit();
