// Verify a specific pending transaction
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

// Transaction hash from the pending transaction
const TX_HASH = '0xfdae3c22e43ac2b8b6a1bf1f1c45a994f5658295735202c7028980d6fb843dc1';

async function verifyPendingTransaction() {
  try {
    console.log('🔍 Verifying specific pending transaction...\n');
    console.log(`Transaction Hash: ${TX_HASH}\n`);
    
    // First, check current status in database
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_hash=eq.${TX_HASH}&select=*`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!txResponse.ok) {
      console.error('❌ Failed to fetch transaction:', txResponse.status);
      return;
    }
    
    const transactions = await txResponse.json();
    
    if (transactions.length === 0) {
      console.log('❌ Transaction not found in database');
      return;
    }
    
    const tx = transactions[0];
    console.log('📊 Current Database Status:');
    console.log(`   ID: ${tx.id}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   Currency: ${tx.crypto_currency}`);
    console.log(`   Amount: ${tx.crypto_amount}`);
    console.log(`   Created: ${tx.created_at}`);
    console.log(`   Updated: ${tx.updated_at}`);
    console.log(`   Error: ${tx.error_message || 'None'}`);
    console.log('');
    
    // Check on-chain status
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    console.log('🔗 Checking on-chain status...');
    const receiptResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [TX_HASH],
        id: 1,
      }),
    });
    
    const receiptData = await receiptResponse.json();
    const receipt = receiptData.result;
    
    if (receipt) {
      const status = receipt.status;
      const blockNumber = parseInt(receipt.blockNumber || '0', 16);
      
      // Get latest block
      const latestBlockResponse = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      });
      
      const latestBlockData = await latestBlockResponse.json();
      const latestBlockNumber = parseInt(latestBlockData.result || '0', 16);
      const confirmations = latestBlockNumber - blockNumber;
      
      console.log(`   ✅ Transaction found on-chain`);
      console.log(`   Block: ${blockNumber}`);
      console.log(`   Confirmations: ${confirmations}`);
      console.log(`   Status: ${status === '0x1' ? 'SUCCESS ✅' : 'FAILED ❌'}`);
      console.log('');
      
      if (status === '0x0' && tx.status === 'PENDING') {
        console.log('⚠️  ISSUE: Transaction failed on-chain but still PENDING in database');
        console.log('   The verification cron job should update this automatically');
        console.log('   Or you can manually trigger verification');
      } else if (status === '0x1' && tx.status === 'PENDING') {
        console.log('⚠️  ISSUE: Transaction succeeded on-chain but still PENDING in database');
        console.log('   Waiting for confirmations...');
      } else {
        console.log('✅ Status matches on-chain status');
      }
    } else {
      console.log('   ⏳ Transaction not yet mined (still in mempool)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

verifyPendingTransaction();





