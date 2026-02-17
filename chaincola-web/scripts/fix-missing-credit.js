// Fix the missing credit for the second transaction
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function fixMissingCredit() {
  try {
    // Find user_id
    const walletResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=user_id`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const wallets = await walletResponse.json();
    const userId = wallets[0].user_id;

    console.log('🔍 Checking transactions that need crediting...\n');

    // Get all CONFIRMED RECEIVE transactions that are marked as credited but balance doesn't match
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&transaction_type=eq.RECEIVE&status=eq.CONFIRMED&select=id,transaction_hash,crypto_amount,metadata,confirmations&order=created_at.asc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const transactions = await txResponse.json();

    // Get current balance
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const balances = await balanceResponse.json();
    let currentBalance = balances && balances.length > 0 ? parseFloat(balances[0].balance || '0') : 0;

    console.log(`Current Balance: ${currentBalance.toFixed(8)} ETH\n`);

    // Calculate expected balance
    let expectedBalance = 0;
    transactions.forEach(tx => {
      if (tx.metadata?.credited === true && tx.confirmations >= 12) {
        const amount = parseFloat(tx.crypto_amount || '0');
        expectedBalance += amount;
        console.log(`✅ Transaction ${tx.transaction_hash.substring(0, 16)}...: ${amount.toFixed(8)} ETH (credited)`);
      }
    });

    console.log(`\nExpected Balance: ${expectedBalance.toFixed(8)} ETH`);
    console.log(`Current Balance: ${currentBalance.toFixed(8)} ETH`);
    console.log(`Missing: ${(expectedBalance - currentBalance).toFixed(8)} ETH\n`);

    // If there's a discrepancy, credit the missing amount
    if (expectedBalance > currentBalance + 0.000001) {
      const missingAmount = expectedBalance - currentBalance;
      console.log(`💳 Crediting missing amount: ${missingAmount.toFixed(8)} ETH\n`);

      // Call the credit function via RPC
      const creditResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/credit_crypto_wallet`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_amount: missingAmount.toFixed(8),
          p_currency: 'ETH',
        }),
      });

      if (creditResponse.ok) {
        const creditResult = await creditResponse.text();
        console.log(`✅ Credit function called successfully`);
        console.log(`   Response: ${creditResult}\n`);

        // Verify new balance
        const newBalanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance,updated_at`, {
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
        });
        const newBalances = await newBalanceResponse.json();
        const newBalance = newBalances && newBalances.length > 0 ? parseFloat(newBalances[0].balance || '0') : 0;

        console.log(`📊 New Balance: ${newBalance.toFixed(8)} ETH`);
        console.log(`   Updated: ${newBalances[0].updated_at}`);
        
        if (Math.abs(newBalance - expectedBalance) < 0.000001) {
          console.log(`\n✅ Balance now matches expected amount!`);
        } else {
          console.log(`\n⚠️  Balance still doesn't match. Expected: ${expectedBalance.toFixed(8)}, Got: ${newBalance.toFixed(8)}`);
        }
      } else {
        const errorText = await creditResponse.text();
        console.error(`❌ Failed to credit: ${creditResponse.status}`);
        console.error(`   ${errorText}`);
      }
    } else {
      console.log(`✅ Balance is correct - no action needed`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

fixMissingCredit();





