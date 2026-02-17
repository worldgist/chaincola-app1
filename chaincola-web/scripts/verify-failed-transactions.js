// Verify if failed transactions actually failed on-chain
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

const failedTxHashes = [
  '0x6b24fafaf7e5d1dd183f268d627d20c56f163c7ec5ac126adc63f65da4643e7c',
  '0x58f3e571ebb14638a42c42146a01cc74b8a05a8523c048070fd2321830d37b61',
  '0xfb3806b05be6ff3a02d4f8c6da52647d2f813b82517d6651f9ad5d664ab72d5c',
];

async function verifyTransactions() {
  console.log('🔍 Verifying Failed Transactions On-Chain\n');
  
  for (const txHash of failedTxHashes) {
    console.log(`\nChecking: ${txHash}`);
    
    try {
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
        const gasUsed = parseInt(receipt.gasUsed || '0', 16);
        
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
        console.log(`   Gas Used: ${gasUsed}`);
        console.log(`   Status: ${status}`);
        console.log(`   Status Meaning: ${status === '0x1' ? 'SUCCESS ✅' : status === '0x0' ? 'FAILED ❌' : 'UNKNOWN'}`);
        
        if (status === '0x1') {
          console.log(`   ⚠️  PROBLEM: Transaction actually SUCCEEDED but marked as FAILED in database!`);
          console.log(`   💡 This is a bug - transaction should be marked as COMPLETED`);
        } else if (status === '0x0') {
          console.log(`   ✅ Correctly marked as FAILED - transaction failed on-chain`);
        }
      } else {
        console.log(`   ⏳ Transaction not yet mined (still in mempool)`);
      }
      
      // Also get the raw transaction
      const txResponse = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [txHash],
          id: 1,
        }),
      });

      const txData = await txResponse.json();
      if (txData.result) {
        const tx = txData.result;
        const value = BigInt(tx.value || '0');
        const valueEth = Number(value) / 1e18;
        console.log(`   Value: ${valueEth.toFixed(8)} ETH`);
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Gas Price: ${tx.gasPrice}`);
        console.log(`   Gas Limit: ${tx.gas}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

verifyTransactions();





