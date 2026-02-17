// Diagnostic script to check why Ethereum deposits aren't being detected
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

// Configuration - UPDATE THESE VALUES
const WALLET_ADDRESS = ''; // The wallet address that received ETH
const TRANSACTION_HASH = ''; // Optional: specific transaction hash to check

async function checkEthereumDepositDetection() {
  try {
    console.log('🔍 Checking Ethereum Deposit Detection Issues\n');
    console.log('='.repeat(60));
    
    if (!WALLET_ADDRESS) {
      console.error('❌ Please set WALLET_ADDRESS in the script');
      return;
    }
    
    // Step 1: Check if wallet exists and is active
    console.log('\n1️⃣ Checking wallet in database...');
    const walletResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_wallets?address=ilike.${WALLET_ADDRESS}&asset=eq.ETH&network=eq.mainnet&select=id,user_id,address,asset,network,is_active`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    const wallets = await walletResponse.json();
    
    if (!wallets || wallets.length === 0) {
      console.error('❌ Wallet not found in database!');
      console.error('   Address:', WALLET_ADDRESS);
      console.error('   Make sure the wallet is registered in crypto_wallets table');
      return;
    }
    
    const wallet = wallets[0];
    console.log('   ✅ Wallet found:');
    console.log('      ID:', wallet.id);
    console.log('      User ID:', wallet.user_id);
    console.log('      Address:', wallet.address);
    console.log('      Asset:', wallet.asset);
    console.log('      Network:', wallet.network);
    console.log('      Is Active:', wallet.is_active);
    
    if (!wallet.is_active) {
      console.error('   ⚠️  WARNING: Wallet is NOT active! Set is_active = true');
    }
    
    // Step 2: Check if transaction exists
    if (TRANSACTION_HASH) {
      console.log('\n2️⃣ Checking if transaction exists in database...');
      const txResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?transaction_hash=eq.${TRANSACTION_HASH}&select=*`,
        {
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
        }
      );
      
      const transactions = await txResponse.json();
      
      if (transactions && transactions.length > 0) {
        const tx = transactions[0];
        console.log('   ✅ Transaction found in database:');
        console.log('      ID:', tx.id);
        console.log('      Status:', tx.status);
        console.log('      Amount:', tx.crypto_amount, tx.crypto_currency);
        console.log('      Confirmations:', tx.confirmations);
        console.log('      Created:', tx.created_at);
        console.log('      Updated:', tx.updated_at);
        console.log('      To Address:', tx.to_address);
        console.log('      From Address:', tx.from_address);
        
        if (tx.metadata?.credited) {
          console.log('      ✅ Already credited:', tx.metadata.credited);
        }
      } else {
        console.log('   ❌ Transaction NOT found in database');
        console.log('   This means the deposit detection function did not detect it');
      }
    }
    
    // Step 3: Check on-chain transaction
    console.log('\n3️⃣ Checking on-chain transaction...');
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    // Get transfers to this address
    const transfersResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{
          fromBlock: '0x0',
          toBlock: 'latest',
          toAddress: WALLET_ADDRESS,
          category: ['external'],
          withMetadata: true,
          excludeZeroValue: false,
        }],
        id: 1,
      }),
    });
    
    if (!transfersResponse.ok) {
      console.error('   ❌ Failed to fetch transfers:', transfersResponse.status);
      return;
    }
    
    const transfersData = await transfersResponse.json();
    const transfers = transfersData.result?.transfers || [];
    
    console.log(`   Found ${transfers.length} transfers to address ${WALLET_ADDRESS}`);
    
    if (TRANSACTION_HASH) {
      const specificTransfer = transfers.find(t => t.hash === TRANSACTION_HASH);
      if (specificTransfer) {
        console.log('\n   ✅ Transaction found on-chain:');
        console.log('      Hash:', specificTransfer.hash);
        console.log('      From:', specificTransfer.from);
        console.log('      To:', specificTransfer.to);
        console.log('      Value:', specificTransfer.value);
        console.log('      Block:', specificTransfer.blockNum);
        console.log('      Category:', specificTransfer.category);
        
        const amount = parseFloat(specificTransfer.value || '0') / 1e18;
        console.log('      Amount (ETH):', amount);
      } else {
        console.log('\n   ❌ Transaction NOT found on-chain');
        console.log('   Hash:', TRANSACTION_HASH);
      }
    } else {
      // Show recent transfers
      console.log('\n   Recent transfers (last 10):');
      transfers.slice(0, 10).forEach((transfer, i) => {
        const amount = parseFloat(transfer.value || '0') / 1e18;
        console.log(`   ${i + 1}. ${transfer.hash.substring(0, 20)}... - ${amount} ETH - Block: ${transfer.blockNum}`);
      });
    }
    
    // Step 4: Check balance
    console.log('\n4️⃣ Checking balances...');
    const balanceResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [WALLET_ADDRESS, 'latest'],
        id: 2,
      }),
    });
    
    const balanceData = await balanceResponse.json();
    const onChainBalance = parseFloat(balanceData.result || '0') / 1e18;
    
    const dbBalanceResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${wallet.user_id}&currency=eq.ETH&select=balance`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    const dbBalances = await dbBalanceResponse.json();
    const dbBalance = dbBalances && dbBalances.length > 0 ? parseFloat(dbBalances[0].balance || '0') : 0;
    
    console.log('   On-chain balance:', onChainBalance, 'ETH');
    console.log('   Database balance:', dbBalance, 'ETH');
    console.log('   Difference:', (onChainBalance - dbBalance).toFixed(8), 'ETH');
    
    if (Math.abs(onChainBalance - dbBalance) > 0.000001) {
      console.log('   ⚠️  Balance mismatch detected!');
    }
    
    // Step 5: Check cron job status
    console.log('\n5️⃣ Recommendations:');
    console.log('   - Ensure wallet is_active = true');
    console.log('   - Check cron job is running: detect-ethereum-deposits');
    console.log('   - Manually trigger detection: node manually-trigger-eth-detection.js');
    console.log('   - Check function logs in Supabase Dashboard');
    
    // Step 6: Manual trigger suggestion
    console.log('\n6️⃣ To manually trigger detection:');
    console.log('   curl -X POST "https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/detect-ethereum-deposits" \\');
    console.log('     -H "Authorization: Bearer ' + SERVICE_ROLE_KEY + '"');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkEthereumDepositDetection();





