// Refund failed transaction and update status
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const TX_HASH = '0xfb3806b05be6ff3a02d4f8c6da52647d2f813b82517d6651f9ad5d664ab72d5c';

async function refundFailedTransaction() {
  try {
    console.log('💰 Refunding Failed Transaction\n');
    console.log('='.repeat(60));

    // Step 1: Find the transaction
    console.log('Step 1: Finding transaction...');
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?transaction_hash=eq.${TX_HASH}&select=id,user_id,transaction_hash,crypto_amount,status,from_address,to_address,metadata`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const transactions = await txResponse.json();
    const transaction = transactions && transactions.length > 0 ? transactions[0] : null;
    
    if (!transaction || !transaction.id) {
      console.error('❌ Transaction not found');
      return;
    }

    console.log(`✅ Found transaction: ${transaction.id}`);
    console.log(`   User ID: ${transaction.user_id}`);
    console.log(`   Amount: ${transaction.crypto_amount} ETH`);
    console.log(`   Current Status: ${transaction.status}`);
    console.log(`   Gas Fee: ${transaction.metadata?.gas_fee || '0'} ETH\n`);

    const userId = transaction.user_id;
    const amount = parseFloat(transaction.crypto_amount || '0');
    const gasFee = parseFloat(transaction.metadata?.gas_fee || '0');
    const totalDebited = amount + gasFee;

    // Step 2: Check current balance
    console.log('Step 2: Checking current balance...');
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const balances = await balanceResponse.json();
    const currentBalance = balances && balances.length > 0 ? parseFloat(balances[0].balance || '0') : 0;
    console.log(`✅ Current Balance: ${currentBalance.toFixed(8)} ETH\n`);

    // Step 3: Refund the amount (credit back)
    console.log('Step 3: Refunding debited amount...');
    console.log(`   Amount to refund: ${totalDebited.toFixed(8)} ETH (${amount.toFixed(8)} send + ${gasFee.toFixed(8)} gas)`);
    
    const refundResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/credit_crypto_wallet`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_amount: totalDebited.toFixed(8),
        p_currency: 'ETH',
      }),
    });

    if (!refundResponse.ok) {
      const errorText = await refundResponse.text();
      console.error(`❌ Failed to refund: ${refundResponse.status}`);
      console.error(`   ${errorText}`);
      return;
    }

    const refundResult = await refundResponse.text();
    console.log(`✅ Refund successful`);
    console.log(`   Response: ${refundResult}\n`);

    // Step 4: Verify new balance
    const newBalanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance,updated_at`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const newBalances = await newBalanceResponse.json();
    const newBalance = newBalances && newBalances.length > 0 ? parseFloat(newBalances[0].balance || '0') : 0;
    const expectedBalance = currentBalance + totalDebited;

    console.log(`📊 Balance After Refund:`);
    console.log(`   Expected: ${expectedBalance.toFixed(8)} ETH`);
    console.log(`   Actual: ${newBalance.toFixed(8)} ETH`);
    
    if (Math.abs(newBalance - expectedBalance) < 0.000001) {
      console.log(`   ✅ Balance matches expected amount!\n`);
    } else {
      console.log(`   ⚠️  Balance discrepancy: ${Math.abs(newBalance - expectedBalance).toFixed(8)} ETH\n`);
    }

    // Step 5: Update transaction status to FAILED
    console.log('Step 4: Updating transaction status to FAILED...');
    
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${transaction.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        status: 'FAILED',
        error_message: 'Transaction failed on blockchain. Amount refunded.',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(transaction.metadata || {}),
          refunded: true,
          refunded_at: new Date().toISOString(),
          refund_amount: totalDebited.toFixed(8),
          refund_reason: 'Transaction failed on blockchain (status: 0x0)',
          balance_before_refund: currentBalance.toFixed(8),
          balance_after_refund: newBalance.toFixed(8),
        },
      }),
    });

    if (updateResponse.ok) {
      const updatedTx = await updateResponse.json();
      console.log(`✅ Transaction status updated to FAILED`);
      console.log(`   Transaction ID: ${updatedTx[0]?.id || transaction.id}\n`);
    } else {
      const errorText = await updateResponse.text();
      console.error(`❌ Failed to update transaction status: ${updateResponse.status}`);
      console.error(`   ${errorText}\n`);
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 REFUND SUMMARY');
    console.log('='.repeat(60));
    console.log(`Transaction Hash: ${TX_HASH}`);
    console.log(`Original Amount: ${amount.toFixed(8)} ETH`);
    console.log(`Gas Fee: ${gasFee.toFixed(8)} ETH`);
    console.log(`Total Refunded: ${totalDebited.toFixed(8)} ETH`);
    console.log(`Balance Before: ${currentBalance.toFixed(8)} ETH`);
    console.log(`Balance After: ${newBalance.toFixed(8)} ETH`);
    console.log(`Transaction Status: FAILED ✅`);
    console.log(`\n✅ Refund completed successfully!`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

refundFailedTransaction();

