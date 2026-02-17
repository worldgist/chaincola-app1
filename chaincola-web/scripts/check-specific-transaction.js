// Check a specific transaction hash to see if it was recorded correctly

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkTransaction(txHash) {
  console.log(`🔍 Checking transaction: ${txHash}\n`);

  try {
    // Get transaction from blockchain
    const txResponse = await fetch(alchemyUrl, {
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
    
    if (txData.error) {
      console.error('❌ Error fetching transaction:', txData.error);
      return;
    }

    const tx = txData.result;
    
    if (!tx) {
      console.error('❌ Transaction not found on blockchain');
      return;
    }

    console.log('📊 Blockchain Transaction Details:');
    console.log(`   Hash: ${tx.hash}`);
    console.log(`   From: ${tx.from}`);
    console.log(`   To: ${tx.to}`);
    console.log(`   Value: ${tx.value} wei (${parseInt(tx.value, 16) / 1e18} ETH)`);
    console.log(`   Block Number: ${parseInt(tx.blockNumber, 16)}`);
    console.log(`   Gas Used: ${parseInt(tx.gas, 16)}`);
    console.log(`   Gas Price: ${parseInt(tx.gasPrice, 16)} wei`);
    
    // Get receipt to check status
    const receiptResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 2,
      }),
    });

    const receiptData = await receiptResponse.json();
    if (receiptData.result) {
      const receipt = receiptData.result;
      console.log(`   Status: ${receipt.status === '0x1' ? 'Success' : 'Failed'}`);
      console.log(`   Gas Used: ${parseInt(receipt.gasUsed, 16)}`);
    }

    // Check if transaction exists in database
    console.log('\n🔍 Checking database...');
    
    const { data: dbTx, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_hash', txHash.toLowerCase())
      .maybeSingle();

    if (dbError) {
      console.error('❌ Database error:', dbError);
    } else if (!dbTx) {
      console.log('❌ Transaction NOT FOUND in database!');
      console.log('   This transaction needs to be recorded.');
      
      // Check if this is a send or receive transaction
      const { data: wallets } = await supabase
        .from('crypto_wallets')
        .select('user_id, address')
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .eq('is_active', true);

      const toAddress = tx.to?.toLowerCase();
      const fromAddress = tx.from?.toLowerCase();
      
      let isReceive = false;
      let userId = null;
      
      for (const wallet of wallets || []) {
        const walletAddr = wallet.address.toLowerCase();
        if (toAddress === walletAddr) {
          isReceive = true;
          userId = wallet.user_id;
          console.log(`\n✅ This is a RECEIVE transaction for user: ${userId}`);
          console.log(`   Wallet: ${wallet.address}`);
          break;
        } else if (fromAddress === walletAddr) {
          userId = wallet.user_id;
          console.log(`\n✅ This is a SEND transaction from user: ${userId}`);
          console.log(`   Wallet: ${wallet.address}`);
          break;
        }
      }

      if (!userId) {
        console.log('\n⚠️  Could not determine user for this transaction');
      }
    } else {
      console.log('✅ Transaction FOUND in database:');
      console.log(`   ID: ${dbTx.id}`);
      console.log(`   User ID: ${dbTx.user_id}`);
      console.log(`   Type: ${dbTx.transaction_type}`);
      console.log(`   Status: ${dbTx.status}`);
      console.log(`   Amount: ${dbTx.crypto_amount} ${dbTx.crypto_currency}`);
      console.log(`   From: ${dbTx.from_address || 'N/A'}`);
      console.log(`   To: ${dbTx.to_address || 'N/A'}`);
      console.log(`   Created: ${dbTx.created_at}`);
      
      // Check if amount matches
      const blockchainAmount = parseInt(tx.value, 16) / 1e18;
      const dbAmount = parseFloat(dbTx.crypto_amount || '0');
      const diff = Math.abs(blockchainAmount - dbAmount);
      
      if (diff > 0.00000001) {
        console.log(`\n⚠️  Amount mismatch:`);
        console.log(`   Blockchain: ${blockchainAmount.toFixed(8)} ETH`);
        console.log(`   Database: ${dbAmount.toFixed(8)} ETH`);
        console.log(`   Difference: ${diff.toFixed(8)} ETH`);
      } else {
        console.log(`\n✅ Amount matches: ${dbAmount.toFixed(8)} ETH`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Transaction hash from the image
const txHash = process.argv[2] || '0x0e150982c038a588fe3938c2a3b61d2f468958380284a3c88e119250fc1bad2c';

checkTransaction(txHash)
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



