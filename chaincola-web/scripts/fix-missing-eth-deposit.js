// Fix missing Ethereum deposit - manually create transaction and credit balance
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

// Configuration - UPDATE THESE VALUES
const TRANSACTION_HASH = ''; // The transaction hash
const WALLET_ADDRESS = ''; // The wallet address that received ETH

async function fixMissingDeposit() {
  try {
    if (!TRANSACTION_HASH || !WALLET_ADDRESS) {
      console.error('❌ Please set TRANSACTION_HASH and WALLET_ADDRESS');
      return;
    }
    
    console.log('🔧 Fixing Missing Ethereum Deposit\n');
    console.log('='.repeat(60));
    console.log('Transaction Hash:', TRANSACTION_HASH);
    console.log('Wallet Address:', WALLET_ADDRESS);
    console.log('');
    
    // Step 1: Get transaction details from blockchain
    console.log('1️⃣ Fetching transaction from blockchain...');
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    // Get transaction receipt
    const receiptResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [TRANSACTION_HASH],
        id: 1,
      }),
    });
    
    const receiptData = await receiptResponse.json();
    const receipt = receiptData.result;
    
    if (!receipt) {
      console.error('❌ Transaction not found on blockchain');
      return;
    }
    
    // Get transaction details
    const txResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [TRANSACTION_HASH],
        id: 2,
      }),
    });
    
    const txData = await txResponse.json();
    const tx = txData.result;
    
    if (!tx) {
      console.error('❌ Transaction details not found');
      return;
    }
    
    const amountWei = BigInt(tx.value || '0');
    const amount = Number(amountWei) / 1e18;
    const blockNumber = parseInt(receipt.blockNumber || '0', 16);
    
    // Get latest block for confirmations
    const latestBlockResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 3,
      }),
    });
    
    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result || '0', 16);
    const confirmations = latestBlockNumber - blockNumber;
    
    console.log('   ✅ Transaction found:');
    console.log('      Amount:', amount, 'ETH');
    console.log('      From:', tx.from);
    console.log('      To:', tx.to);
    console.log('      Block:', blockNumber);
    console.log('      Confirmations:', confirmations);
    console.log('      Status:', receipt.status === '0x1' ? 'SUCCESS' : 'FAILED');
    
    if (receipt.status !== '0x1') {
      console.error('❌ Transaction failed on blockchain');
      return;
    }
    
    if (tx.to?.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
      console.error('❌ Transaction to address does not match wallet address');
      console.error('   Transaction to:', tx.to);
      console.error('   Wallet address:', WALLET_ADDRESS);
      return;
    }
    
    // Step 2: Find wallet in database
    console.log('\n2️⃣ Finding wallet in database...');
    const walletResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_wallets?address=ilike.${WALLET_ADDRESS}&asset=eq.ETH&network=eq.mainnet&select=id,user_id,address,is_active`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    const wallets = await walletResponse.json();
    
    if (!wallets || wallets.length === 0) {
      console.error('❌ Wallet not found in database');
      return;
    }
    
    const wallet = wallets[0];
    console.log('   ✅ Wallet found:');
    console.log('      User ID:', wallet.user_id);
    console.log('      Is Active:', wallet.is_active);
    
    if (!wallet.is_active) {
      console.error('   ⚠️  Wallet is not active!');
    }
    
    // Step 3: Check if transaction already exists
    console.log('\n3️⃣ Checking if transaction exists...');
    const existingTxResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_hash=eq.${TRANSACTION_HASH}&select=*`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    const existingTxs = await existingTxResponse.json();
    
    if (existingTxs && existingTxs.length > 0) {
      const existingTx = existingTxs[0];
      console.log('   ⚠️  Transaction already exists:');
      console.log('      ID:', existingTx.id);
      console.log('      Status:', existingTx.status);
      console.log('      Amount:', existingTx.crypto_amount);
      
      if (existingTx.metadata?.credited) {
        console.log('      ✅ Already credited');
      } else if (confirmations >= 12) {
        console.log('      ⚠️  Not credited but has enough confirmations');
        console.log('      💡 Triggering credit...');
        
        // Trigger credit via the detection function
        const creditResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/detect-ethereum-deposits`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({}),
          }
        );
        
        const creditResult = await creditResponse.json();
        console.log('      Result:', JSON.stringify(creditResult, null, 2));
      }
      return;
    }
    
    // Step 4: Create transaction record
    console.log('\n4️⃣ Creating transaction record...');
    const txStatus = confirmations >= 12 ? 'CONFIRMED' : confirmations > 0 ? 'CONFIRMING' : 'PENDING';
    
    const createTxResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions`,
      {
        method: 'POST',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: wallet.user_id,
          transaction_type: 'RECEIVE',
          crypto_currency: 'ETH',
          network: 'mainnet',
          crypto_amount: amount.toFixed(8),
          to_address: WALLET_ADDRESS,
          from_address: tx.from,
          transaction_hash: TRANSACTION_HASH,
          status: txStatus,
          confirmations: confirmations,
          block_number: blockNumber,
          metadata: {
            detected_via: 'manual_fix',
            detected_at: new Date().toISOString(),
            transfer_value_wei: amountWei.toString(),
            transfer_value_eth: amount.toFixed(8),
          },
        }),
      }
    );
    
    if (!createTxResponse.ok) {
      const errorText = await createTxResponse.text();
      console.error('❌ Failed to create transaction:', createTxResponse.status, errorText);
      return;
    }
    
    const newTx = await createTxResponse.json();
    console.log('   ✅ Transaction created:', newTx[0].id);
    
    // Step 5: Credit balance if enough confirmations
    if (confirmations >= 12) {
      console.log('\n5️⃣ Crediting wallet balance...');
      
      const creditResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/credit_crypto_wallet`,
        {
          method: 'POST',
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_user_id: wallet.user_id,
            p_amount: amount.toFixed(8),
            p_currency: 'ETH',
          }),
        }
      );
      
      if (!creditResponse.ok) {
        const errorText = await creditResponse.text();
        console.error('❌ Failed to credit balance:', creditResponse.status, errorText);
        return;
      }
      
      console.log('   ✅ Balance credited successfully');
      
      // Update transaction metadata
      await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?id=eq.${newTx[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'CONFIRMED',
            confirmed_at: new Date().toISOString(),
            metadata: {
              ...newTx[0].metadata,
              credited: true,
              credited_at: new Date().toISOString(),
            },
          }),
        }
      );
    } else {
      console.log(`\n5️⃣ Waiting for more confirmations (${confirmations}/12)`);
      console.log('   Transaction will be credited automatically when confirmations reach 12');
    }
    
    console.log('\n✅ Fix completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

fixMissingDeposit();





