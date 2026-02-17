// Monitor script to check for contract addresses causing transaction failures
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function monitorContractFailures() {
  try {
    console.log('🔍 Monitoring Contract Address Failures\n');
    console.log('='.repeat(60));

    // Get failed transactions from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_type=eq.SEND&crypto_currency=eq.ETH&status=eq.FAILED&created_at=gte.${sevenDaysAgo}&select=id,to_address,transaction_hash,error_message,created_at&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!txResponse.ok) {
      console.error('❌ Failed to fetch transactions:', txResponse.status);
      return;
    }

    const transactions = await txResponse.json();
    console.log(`\n📊 Found ${transactions.length} failed ETH SEND transactions in last 7 days\n`);

    // Group by destination address
    const addressMap = new Map();
    
    for (const tx of transactions) {
      const address = tx.to_address;
      if (!address) continue;
      
      if (!addressMap.has(address)) {
        addressMap.set(address, {
          address,
          count: 0,
          transactions: [],
          isContract: null,
        });
      }
      
      const entry = addressMap.get(address);
      entry.count++;
      entry.transactions.push({
        id: tx.id,
        hash: tx.transaction_hash,
        created_at: tx.created_at,
        error: tx.error_message,
      });
    }

    console.log(`📈 Unique destination addresses: ${addressMap.size}\n`);

    // Check which addresses are contracts
    console.log('🔍 Checking which addresses are contracts...\n');
    
    for (const [address, data] of addressMap.entries()) {
      try {
        const codeResponse = await fetch(ALCHEMY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getCode',
            params: [address, 'latest'],
            id: 1,
          }),
        });

        const codeData = await codeResponse.json();
        const code = codeData.result;
        data.isContract = code && code !== '0x' && code !== '0x0';
      } catch (error) {
        console.error(`   Error checking ${address}:`, error.message);
      }
    }

    // Sort by failure count
    const sortedAddresses = Array.from(addressMap.values()).sort((a, b) => b.count - a.count);

    console.log('📋 Top Failed Destination Addresses:\n');
    
    let contractCount = 0;
    let eoaCount = 0;
    
    sortedAddresses.slice(0, 10).forEach((data, index) => {
      const type = data.isContract ? 'CONTRACT ⚠️' : 'EOA ✅';
      console.log(`${index + 1}. ${data.address}`);
      console.log(`   Type: ${type}`);
      console.log(`   Failures: ${data.count}`);
      console.log(`   Latest: ${data.transactions[0].created_at}`);
      console.log('');
      
      if (data.isContract) contractCount += data.count;
      else eoaCount += data.count;
    });

    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   Total Failed Transactions: ${transactions.length}`);
    console.log(`   Failed to Contracts: ${contractCount}`);
    console.log(`   Failed to EOAs: ${eoaCount}`);
    console.log(`   Contract Addresses: ${sortedAddresses.filter(a => a.isContract).length}`);
    console.log(`   EOA Addresses: ${sortedAddresses.filter(a => !a.isContract).length}`);
    
    if (contractCount > 0) {
      console.log(`\n⚠️  ${contractCount} transactions failed to contract addresses`);
      console.log(`   These contracts may not accept ETH transfers`);
      console.log(`   Consider adding frontend warnings for these addresses`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

monitorContractFailures();





