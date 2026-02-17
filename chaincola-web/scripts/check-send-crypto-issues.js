// Check why send crypto transactions are failing or pending
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function checkSendCryptoIssues() {
  try {
    console.log('🔍 Checking Send Crypto Transaction Issues\n');
    console.log('='.repeat(60));

    // Get all recent SEND transactions (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_type=eq.SEND&created_at=gte.${oneDayAgo}&select=id,user_id,transaction_hash,external_transaction_id,crypto_currency,crypto_amount,status,confirmations,from_address,to_address,created_at,error_message,metadata,block_number,completed_at&order=created_at.desc&limit=50`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!txResponse.ok) {
      console.error('❌ Failed to fetch transactions:', txResponse.status, await txResponse.text());
      return;
    }

    const transactions = await txResponse.json();
    console.log(`\n📊 Found ${transactions.length} SEND transactions in last 24 hours\n`);

    // Group by status
    const byStatus = {
      PENDING: [],
      CONFIRMING: [],
      CONFIRMED: [],
      COMPLETED: [],
      FAILED: [],
      other: [],
    };

    transactions.forEach(tx => {
      const status = tx.status || 'unknown';
      if (byStatus[status]) {
        byStatus[status].push(tx);
      } else {
        byStatus.other.push(tx);
      }
    });

    // Print summary
    console.log('📈 Status Summary:');
    Object.entries(byStatus).forEach(([status, txs]) => {
      if (txs.length > 0) {
        console.log(`   ${status}: ${txs.length} transaction(s)`);
      }
    });

    // Check pending transactions
    const pendingTxs = [...byStatus.PENDING, ...byStatus.CONFIRMING];
    if (pendingTxs.length > 0) {
      console.log(`\n⏳ Checking ${pendingTxs.length} PENDING/CONFIRMING transaction(s)...\n`);
      
      for (const tx of pendingTxs) {
        const txHash = tx.transaction_hash || tx.external_transaction_id;
        const currency = tx.crypto_currency;
        const age = Math.floor((Date.now() - new Date(tx.created_at).getTime()) / 1000 / 60); // minutes
        
        console.log(`\n🔍 Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`   Currency: ${currency}`);
        console.log(`   Amount: ${tx.crypto_amount} ${currency}`);
        console.log(`   Hash: ${txHash || 'MISSING'}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Age: ${age} minutes`);
        console.log(`   From: ${tx.from_address}`);
        console.log(`   To: ${tx.to_address}`);
        
        if (tx.error_message) {
          console.log(`   ❌ Error: ${tx.error_message}`);
        }

        // Check on-chain status
        if (txHash && currency === 'ETH') {
          await checkEthereumTransaction(txHash, tx);
        } else if (txHash && currency === 'TRX') {
          await checkTronTransaction(txHash, tx);
        } else if (!txHash) {
          console.log(`   ⚠️  WARNING: No transaction hash - transaction may not have been broadcast`);
        }
      }
    }

    // Check failed transactions
    if (byStatus.FAILED.length > 0) {
      console.log(`\n❌ Found ${byStatus.FAILED.length} FAILED transaction(s):\n`);
      
      byStatus.FAILED.forEach(tx => {
        console.log(`   Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`   Currency: ${tx.crypto_currency}`);
        console.log(`   Amount: ${tx.crypto_amount}`);
        console.log(`   Hash: ${tx.transaction_hash || tx.external_transaction_id || 'N/A'}`);
        console.log(`   Error: ${tx.error_message || 'No error message'}`);
        console.log(`   Created: ${tx.created_at}`);
        console.log('');
      });
    }

    // Check for transactions stuck in CONFIRMED status
    if (byStatus.CONFIRMED.length > 0) {
      console.log(`\n⚠️  Found ${byStatus.CONFIRMED.length} transaction(s) stuck in CONFIRMED status:`);
      console.log(`   These should be updated to COMPLETED by the verification cron job\n`);
    }

    // Check cron job status
    console.log('\n🔧 Checking Cron Jobs...');
    console.log('   Note: Cron jobs should run every 2 minutes to verify transactions');
    console.log('   - verify-ethereum-send-transactions: Should update ETH SEND transactions');
    console.log('   - verify-tron-send-transactions: Should update TRX SEND transactions');
    console.log('   Check Supabase Dashboard > Database > Cron Jobs to verify they are running\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

async function checkEthereumTransaction(txHash, tx) {
  try {
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    // Get transaction receipt
    const receiptResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
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
      
      if (status === '0x1') {
        if (confirmations >= 12) {
          console.log(`   ⚠️  Transaction has ${confirmations} confirmations but status is still ${tx.status}`);
          console.log(`   💡 Should be updated to COMPLETED by verification cron job`);
        } else {
          console.log(`   ⏳ Waiting for more confirmations (${confirmations}/12)`);
        }
      } else {
        console.log(`   ❌ Transaction failed on-chain - should be refunded`);
      }
    } else {
      console.log(`   ⏳ Transaction not yet mined (still in mempool)`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking on-chain: ${error.message}`);
  }
}

async function checkTronTransaction(txHash, tx) {
  try {
    const TRON_MAINNET_URL = 'https://api.trongrid.io';
    
    // Get transaction from TRON blockchain
    const txResponse = await fetch(
      `${TRON_MAINNET_URL}/wallet/gettransactionbyid?value=${txHash}`
    );

    if (!txResponse.ok) {
      console.log(`   ❌ Failed to fetch transaction from TRON network`);
      return;
    }

    const txData = await txResponse.json();

    if (txData.txID) {
      const blockNumber = txData.blockNumber;
      
      if (blockNumber) {
        // Get latest block
        const latestBlockResponse = await fetch(`${TRON_MAINNET_URL}/wallet/getnowblock`);
        const latestBlock = await latestBlockResponse.json();
        const latestBlockNumber = latestBlock.block_header?.raw_data?.number || 0;
        const confirmations = latestBlockNumber - blockNumber;
        
        console.log(`   ✅ Transaction found on-chain`);
        console.log(`   Block: ${blockNumber}`);
        console.log(`   Confirmations: ${confirmations}`);
        
        if (confirmations >= 19) {
          console.log(`   ⚠️  Transaction has ${confirmations} confirmations but status is still ${tx.status}`);
          console.log(`   💡 Should be updated to COMPLETED by verification cron job`);
        } else {
          console.log(`   ⏳ Waiting for more confirmations (${confirmations}/19)`);
        }
      } else {
        console.log(`   ⏳ Transaction not yet in a block`);
      }
    } else {
      console.log(`   ❌ Transaction not found on TRON blockchain`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking on-chain: ${error.message}`);
  }
}

checkSendCryptoIssues();





