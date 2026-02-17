// Check pending SEND transactions
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function checkPendingSendTx() {
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

    console.log('📋 Checking PENDING SEND Transactions\n');

    // Get pending SEND transactions
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&transaction_type=eq.SEND&select=id,transaction_hash,crypto_amount,status,confirmations,from_address,to_address,created_at,error_message,metadata&order=created_at.desc&limit=10`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const transactions = await txResponse.json();

    console.log(`Found ${transactions.length} SEND transactions:\n`);

    transactions.forEach((tx, i) => {
      console.log(`${i + 1}. Transaction ${tx.id.substring(0, 8)}...`);
      console.log(`   Hash: ${tx.transaction_hash}`);
      console.log(`   Amount: ${tx.crypto_amount || '0'} ETH`);
      console.log(`   Status: ${tx.status}`);
      console.log(`   Confirmations: ${tx.confirmations || 0}`);
      console.log(`   From: ${tx.from_address}`);
      console.log(`   To: ${tx.to_address}`);
      console.log(`   Created: ${tx.created_at}`);
      if (tx.error_message) {
        console.log(`   Error: ${tx.error_message}`);
      }
      if (tx.metadata?.receipt_status) {
        console.log(`   Receipt Status: ${tx.metadata.receipt_status}`);
      }
      console.log('');
    });

    // Check on-chain status for pending transactions
    const pendingTxs = transactions.filter(tx => tx.status === 'PENDING' || tx.status === 'CONFIRMING');
    if (pendingTxs.length > 0) {
      console.log(`\n🔍 Checking on-chain status for ${pendingTxs.length} pending transaction(s)...\n`);
      
      const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

      for (const tx of pendingTxs) {
        if (!tx.transaction_hash) continue;

        try {
          // Get transaction receipt
          const receiptResponse = await fetch(ALCHEMY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getTransactionReceipt',
              params: [tx.transaction_hash],
              id: 1,
            }),
          });

          const receiptData = await receiptResponse.json();
          const receipt = receiptData.result;

          if (receipt) {
            const status = receipt.status;
            const blockNumber = parseInt(receipt.blockNumber || '0', 16);
            
            console.log(`   Transaction ${tx.transaction_hash.substring(0, 16)}...`);
            console.log(`   Status: ${status === '0x1' ? '✅ SUCCESS' : '❌ FAILED'}`);
            console.log(`   Block Number: ${blockNumber}`);
            
            if (status === '0x1') {
              console.log(`   ⚠️  Transaction succeeded on-chain but status is still ${tx.status} in database`);
            } else {
              console.log(`   ⚠️  Transaction failed on-chain`);
            }
          } else {
            console.log(`   Transaction ${tx.transaction_hash.substring(0, 16)}... not yet mined`);
          }
        } catch (error) {
          console.log(`   Error checking ${tx.transaction_hash.substring(0, 16)}...: ${error.message}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkPendingSendTx();





