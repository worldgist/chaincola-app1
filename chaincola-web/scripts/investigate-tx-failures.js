// Investigate why transactions are failing on-chain
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

const walletAddress = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';
const failedTxHashes = [
  '0x6b24fafaf7e5d1dd183f268d627d20c56f163c7ec5ac126adc63f65da4643e7c',
  '0x58f3e571ebb14638a42c42146a01cc74b8a05a8523c048070fd2321830d37b61',
  '0xfb3806b05be6ff3a02d4f8c6da52647d2f813b82517d6651f9ad5d664ab72d5c',
];

async function investigate() {
  console.log('🔍 Investigating Transaction Failures\n');
  console.log('='.repeat(60));
  
  // Check wallet balance
  console.log('\n1. Checking wallet balance...');
  const balanceResponse = await fetch(ALCHEMY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [walletAddress, 'latest'],
      id: 1,
    }),
  });
  
  const balanceData = await balanceResponse.json();
  const balanceWei = BigInt(balanceData.result || '0');
  const balanceETH = Number(balanceWei) / 1e18;
  console.log(`   Wallet: ${walletAddress}`);
  console.log(`   Balance: ${balanceETH.toFixed(8)} ETH`);
  
  // Check each failed transaction
  console.log('\n2. Analyzing failed transactions...\n');
  
  for (const txHash of failedTxHashes) {
    console.log(`Transaction: ${txHash}`);
    
    // Get transaction details
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
    const tx = txData.result;
    
    if (tx) {
      const value = BigInt(tx.value || '0');
      const valueETH = Number(value) / 1e18;
      const gasPrice = BigInt(tx.gasPrice || '0');
      const gasLimit = BigInt(tx.gas || '0');
      const gasPriceGwei = Number(gasPrice) / 1e9;
      const totalCostWei = value + (gasPrice * gasLimit);
      const totalCostETH = Number(totalCostWei) / 1e18;
      
      console.log(`   Value: ${valueETH.toFixed(8)} ETH`);
      console.log(`   Gas Price: ${gasPriceGwei.toFixed(2)} Gwei`);
      console.log(`   Gas Limit: ${gasLimit.toString()}`);
      console.log(`   Total Cost: ${totalCostETH.toFixed(8)} ETH`);
      console.log(`   To: ${tx.to}`);
      
      // Get receipt
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
        const gasUsed = BigInt(receipt.gasUsed || '0');
        const gasUsedETH = Number(gasUsed * gasPrice) / 1e18;
        console.log(`   Gas Used: ${gasUsed.toString()}`);
        console.log(`   Gas Cost: ${gasUsedETH.toFixed(8)} ETH`);
        console.log(`   Status: ${receipt.status === '0x0' ? 'FAILED ❌' : 'SUCCESS ✅'}`);
        
        // Check if destination is a contract
        const codeResponse = await fetch(ALCHEMY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getCode',
            params: [tx.to, 'latest'],
            id: 1,
          }),
        });
        
        const codeData = await codeResponse.json();
        const code = codeData.result;
        const isContract = code && code !== '0x';
        
        console.log(`   Destination Type: ${isContract ? 'CONTRACT ⚠️' : 'EOA (Regular Address) ✅'}`);
        
        if (receipt.status === '0x0') {
          console.log(`   ⚠️  Transaction failed - possible reasons:`);
          console.log(`      - Destination contract rejected the transfer`);
          console.log(`      - Insufficient gas (but gas was used: ${gasUsed.toString()})`);
          console.log(`      - Contract execution reverted`);
        }
      }
    }
    
    console.log('');
  }
  
  // Check if destination address is a contract
  console.log('\n3. Checking destination address...');
  const destAddress = '0x2296a48a83e294e0eb32e261270091bd74385603';
  const codeResponse = await fetch(ALCHEMY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [destAddress, 'latest'],
      id: 1,
    }),
  });
  
  const codeData = await codeResponse.json();
  const code = codeData.result;
  const isContract = code && code !== '0x';
  
  console.log(`   Address: ${destAddress}`);
  console.log(`   Type: ${isContract ? 'CONTRACT ⚠️' : 'EOA (Regular Address) ✅'}`);
  
  if (isContract) {
    console.log(`   ⚠️  WARNING: This is a contract address!`);
    console.log(`   Contracts can reject ETH transfers if they don't have a payable fallback function`);
    console.log(`   This could explain why transactions are failing`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Recommendations:');
  console.log('   1. Verify the destination address is correct');
  console.log('   2. If sending to a contract, ensure it accepts ETH transfers');
  console.log('   3. Check if the contract has a payable fallback/receive function');
  console.log('   4. Consider using a different destination address for testing');
}

investigate();





