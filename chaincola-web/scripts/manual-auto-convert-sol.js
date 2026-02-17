#!/usr/bin/env node

/**
 * Manually trigger auto-convert for a SOL transaction
 * Usage: node manual-auto-convert-sol.js [transaction_id]
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

async function manualAutoConvert(transactionId) {
  console.log('\n🔄 Manually Triggering Auto-Convert for SOL Transaction\n');
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
    // Find the transaction by hash
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

  // Call the auto-convert function directly
  console.log(`\n🔄 Calling auto-convert function...`);
  const functionUrl = `${supabaseUrl}/functions/v1/auto-convert-crypto-to-ngn`;
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({
        user_id: tx.user_id,
        crypto_currency: 'SOL',
        crypto_amount: tx.crypto_amount || SOL_AMOUNT,
        transaction_hash: tx.transaction_hash || TX_SIGNATURE,
        source_transaction_id: tx.id,
        skip_notification: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error calling auto-convert function: ${response.status}`);
      console.error(`   ${errorText}`);
      
      // If the function doesn't exist or doesn't accept POST, try updating the transaction
      // which will trigger auto-convert on next detection run
      console.log(`\n💡 Attempting to update transaction to trigger auto-convert...`);
      
      // Update transaction status to trigger detection function logic
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'CONFIRMED',
          confirmations: 32,
          metadata: {
            ...metadata,
            manual_convert_triggered: new Date().toISOString(),
          },
        })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`❌ Failed to update transaction:`, updateError);
      } else {
        console.log(`✅ Transaction updated. Auto-convert should trigger on next detection run.`);
        console.log(`   You may need to wait a few minutes for the cron job to run, or`);
        console.log(`   manually trigger: node scripts/diagnose-sol-deposit.js`);
      }
      return;
    }

    const result = await response.json();
    console.log(`✅ Auto-convert function response:`, result);

    // Wait a moment and check the transaction
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { data: updatedTx } = await supabase
      .from('transactions')
      .select('metadata')
      .eq('id', tx.id)
      .single();

    const updatedMetadata = updatedTx?.metadata || {};
    if (updatedMetadata.auto_converted_to_ngn) {
      console.log(`\n✅ Auto-convert successful!`);
      console.log(`   NGN Credited: ₦${updatedMetadata.ngn_credited || 'N/A'}`);
    } else {
      console.log(`\n⚠️  Auto-convert may still be processing...`);
    }

    // Check balance
    const { data: balance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', tx.user_id)
      .eq('currency', 'NGN')
      .maybeSingle();

    console.log(`\n💰 Current NGN Balance: ₦${balance?.balance || '0'}`);

  } catch (error) {
    console.error('❌ Exception calling auto-convert:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Process complete!\n');
}

const transactionId = process.argv[2];
manualAutoConvert(transactionId).catch(console.error);
