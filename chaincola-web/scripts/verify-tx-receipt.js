// Verify transaction receipt status
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
const TX_HASH = '0xfb3806b05be6ff3a02d4f8c6da52647d2f813b82517d6651f9ad5d664ab72d5c';

async function verifyReceipt() {
  try {
    console.log('🔍 Verifying Transaction Receipt\n');
    console.log(`Transaction Hash: ${TX_HASH}\n`);

    // Get transaction receipt
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
    
    if (receiptData.error) {
      console.error('❌ Error:', receiptData.error);
      return;
    }

    const receipt = receiptData.result;

    if (!receipt) {
      console.log('⏳ Transaction not yet mined');
      return;
    }

    console.log('📊 Transaction Receipt Details:');
    console.log('='.repeat(60));
    console.log(`Status: ${receipt.status}`);
    console.log(`Status (decoded): ${receipt.status === '0x1' || receipt.status === '0x01' ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Block Number: ${parseInt(receipt.blockNumber || '0', 16)}`);
    console.log(`Gas Used: ${parseInt(receipt.gasUsed || '0', 16)}`);
    console.log(`From: ${receipt.from}`);
    console.log(`To: ${receipt.to}`);
    
    if (receipt.logs && receipt.logs.length > 0) {
      console.log(`Logs: ${receipt.logs.length} events`);
    }

    // Get transaction details
    const txResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [TX_HASH],
        id: 2,
      }),
    });

    const txData = await txResponse.json();
    const tx = txData.result;

    if (tx) {
      const valueWei = BigInt(tx.value || '0');
      const valueEth = Number(valueWei) / 1e18;
      console.log(`\n📝 Transaction Details:`);
      console.log(`Value: ${valueEth.toFixed(8)} ETH`);
      console.log(`Gas Price: ${parseInt(tx.gasPrice || '0', 16)} wei`);
      console.log(`Gas Limit: ${parseInt(tx.gas || '0', 16)}`);
      console.log(`Nonce: ${parseInt(tx.nonce || '0', 16)}`);
    }

    // Get current block
    const blockResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 3,
      }),
    });

    const blockData = await blockResponse.json();
    const currentBlock = parseInt(blockData.result || '0', 16);
    const txBlock = parseInt(receipt.blockNumber || '0', 16);
    const confirmations = currentBlock - txBlock;

    console.log(`\n⏱️  Confirmation Info:`);
    console.log(`Current Block: ${currentBlock}`);
    console.log(`Transaction Block: ${txBlock}`);
    console.log(`Confirmations: ${confirmations}`);

    // Analysis
    console.log(`\n🔍 Analysis:`);
    if (receipt.status === '0x1' || receipt.status === '0x01') {
      console.log(`✅ Transaction succeeded on blockchain`);
      if (confirmations >= 12) {
        console.log(`✅ Has enough confirmations (${confirmations} >= 12)`);
        console.log(`⚠️  Status should be CONFIRMED in database`);
      } else {
        console.log(`⏳ Needs more confirmations (${confirmations} < 12)`);
        console.log(`⚠️  Status should be CONFIRMING in database`);
      }
    } else {
      console.log(`❌ Transaction failed on blockchain`);
      console.log(`   Status code: ${receipt.status}`);
      console.log(`   This could be due to:`);
      console.log(`   - Insufficient gas`);
      console.log(`   - Contract revert`);
      console.log(`   - Other on-chain failure`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyReceipt();





