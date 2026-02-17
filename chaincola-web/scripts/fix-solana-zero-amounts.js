/**
 * Script to fix Solana transactions with 0.00 SOL amounts
 * Re-detects the amount from blockchain and updates the database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Solana RPC URL
const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                    process.env.ALCHEMY_SOLANA_URL || 
                    'https://api.mainnet-beta.solana.com';

async function fixSolanaZeroAmounts() {
  console.log('🔍 Finding Solana transactions with 0.00 SOL amounts...\n');

  // Find all SOL transactions - we'll filter for zero amounts in code
  const { data: allTransactions, error } = await supabase
    .from('transactions')
    .select('id, transaction_hash, to_address, crypto_amount, user_id, block_number')
    .eq('crypto_currency', 'SOL')
    .eq('transaction_type', 'RECEIVE')
    .order('created_at', { ascending: false })
    .limit(100); // Check recent 100 transactions

  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return;
  }

  // Filter for transactions with zero or very small amounts
  const transactions = (allTransactions || []).filter(tx => {
    const amount = parseFloat(tx.crypto_amount || '0');
    return amount === 0 || amount < 0.000000001; // Less than 1 lamport
  });

  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return;
  }

  if (!transactions || transactions.length === 0) {
    console.log('✅ No transactions with 0.00 SOL amounts found!');
    return;
  }

  console.log(`📊 Found ${transactions.length} transaction(s) with 0.00 SOL amounts\n`);

  let fixed = 0;
  let failed = 0;

  for (const tx of transactions) {
    try {
      console.log(`\n🔍 Processing transaction: ${tx.transaction_hash}`);
      console.log(`   To address: ${tx.to_address}`);
      console.log(`   Current amount: ${tx.crypto_amount} SOL`);

      // Get transaction details from Solana
      const txResponse = await fetch(solanaRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            tx.transaction_hash,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });

      if (!txResponse.ok) {
        console.log(`   ⚠️ Failed to fetch transaction from blockchain`);
        failed++;
        continue;
      }

      const txData = await txResponse.json();
      const transaction = txData.result;

      if (!transaction || !transaction.meta || transaction.meta.err) {
        console.log(`   ⚠️ Transaction not found or failed`);
        failed++;
        continue;
      }

      // Parse transaction to find SOL amount
      const preBalances = transaction.meta.preBalances || [];
      const postBalances = transaction.meta.postBalances || [];
      const accountKeys = transaction.transaction.message.accountKeys || [];

      // Find address index
      const normalizedAddress = tx.to_address.trim();
      let addressIndex = -1;
      
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i];
        let keyAddress = '';
        
        if (typeof key === 'string') {
          keyAddress = key;
        } else if (key && typeof key === 'object') {
          keyAddress = key.pubkey || key.address || '';
        }
        
        if (keyAddress === normalizedAddress || keyAddress.toLowerCase() === normalizedAddress.toLowerCase()) {
          addressIndex = i;
          break;
        }
      }

      if (addressIndex < 0 || addressIndex >= preBalances.length || addressIndex >= postBalances.length) {
        console.log(`   ⚠️ Address not found in transaction`);
        failed++;
        continue;
      }

      const preBalance = preBalances[addressIndex];
      const postBalance = postBalances[addressIndex];
      const balanceDiffLamports = postBalance - preBalance;

      if (balanceDiffLamports <= 0) {
        console.log(`   ⚠️ No positive balance change detected`);
        failed++;
        continue;
      }

      const solAmount = balanceDiffLamports / 1e9;
      const formattedAmount = solAmount.toFixed(9);

      console.log(`   ✅ Detected amount: ${formattedAmount} SOL (${balanceDiffLamports} lamports)`);

      // Update transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          crypto_amount: formattedAmount,
          metadata: {
            amount_fixed_at: new Date().toISOString(),
            detected_amount: solAmount,
            balance_diff_lamports: balanceDiffLamports.toString(),
          },
        })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`   ❌ Failed to update transaction:`, updateError);
        failed++;
      } else {
        console.log(`   ✅ Transaction updated successfully!`);
        fixed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error processing transaction:`, error.message);
      failed++;
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total: ${transactions.length}`);
}

// Run the fix
fixSolanaZeroAmounts()
  .then(() => {
    console.log('\n✅ Script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

