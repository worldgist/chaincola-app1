// Check transactions for the wallet address
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function checkTransactions() {
  try {
    // Find user_id
    const findUserResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=user_id`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const wallets = await findUserResponse.json();
    if (!wallets || wallets.length === 0) {
      console.error('❌ Wallet not found');
      return;
    }

    const userId = wallets[0].user_id;
    console.log('User ID:', userId);

    // Get all ETH RECEIVE transactions for this user
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&transaction_type=eq.RECEIVE&select=id,transaction_hash,crypto_amount,status,confirmations,created_at,metadata&order=created_at.desc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const transactions = await txResponse.json();
    
    console.log('\n📋 ETH Receive Transactions:');
    console.log('============================');
    
    if (!transactions || transactions.length === 0) {
      console.log('No transactions found');
    } else {
      transactions.forEach((tx, index) => {
        console.log(`\n${index + 1}. Transaction ${tx.id}`);
        console.log(`   Hash: ${tx.transaction_hash}`);
        console.log(`   Amount: ${tx.crypto_amount || '0'} ETH`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Confirmations: ${tx.confirmations || 0}`);
        console.log(`   Created: ${tx.created_at}`);
        console.log(`   Credited: ${tx.metadata?.credited || false}`);
        if (tx.metadata?.transfer_value_wei) {
          console.log(`   Wei: ${tx.metadata.transfer_value_wei}`);
        }
      });
    }

    // Get current balance
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance,updated_at`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const balances = await balanceResponse.json();
    console.log('\n💰 Current Database Balance:');
    if (balances && balances.length > 0) {
      console.log(`   Balance: ${balances[0].balance} ETH`);
      console.log(`   Updated: ${balances[0].updated_at}`);
    } else {
      console.log('   No balance record found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTransactions();











