// Fix missing deposit by recording transaction and crediting balance

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function fixMissingDeposit(txHash) {
  console.log(`🔧 Fixing missing deposit: ${txHash}\n`);

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
    const tx = txData.result;
    
    if (!tx) {
      console.error('❌ Transaction not found on blockchain');
      return;
    }

    const amountWei = BigInt(tx.value);
    const weiPerEth = BigInt('1000000000000000000');
    const wholeEth = amountWei / weiPerEth;
    const remainderWei = amountWei % weiPerEth;
    const decimalPart = Number(remainderWei) / Number(weiPerEth);
    const amount = Number(wholeEth) + decimalPart;

    const toAddress = tx.to?.toLowerCase();
    const fromAddress = tx.from?.toLowerCase();
    const blockNumber = parseInt(tx.blockNumber, 16);

    // Get latest block for confirmations
    const latestBlockResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 2,
      }),
    });

    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result || '0', 16);
    const confirmations = latestBlockNumber - blockNumber;

    console.log(`📊 Transaction Details:`);
    console.log(`   Amount: ${amount.toFixed(8)} ETH`);
    console.log(`   From: ${fromAddress}`);
    console.log(`   To: ${toAddress}`);
    console.log(`   Block: ${blockNumber} (${confirmations} confirmations)`);

    // Find wallet
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('user_id, address')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .ilike('address', toAddress)
      .single();

    if (!wallet) {
      console.error('❌ Wallet not found for address:', toAddress);
      return;
    }

    console.log(`\n✅ Found wallet for user: ${wallet.user_id}`);

    // Check if transaction already exists
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status, crypto_amount')
      .eq('transaction_hash', txHash.toLowerCase())
      .maybeSingle();

    if (existingTx) {
      console.log(`\n⚠️  Transaction already exists in database:`);
      console.log(`   ID: ${existingTx.id}`);
      console.log(`   Status: ${existingTx.status}`);
      console.log(`   Amount: ${existingTx.crypto_amount} ETH`);
      return;
    }

    // Record transaction
    console.log(`\n📝 Recording transaction in database...`);
    
    const status = confirmations >= 12 ? 'CONFIRMED' : confirmations > 0 ? 'CONFIRMING' : 'PENDING';
    
    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: wallet.user_id,
        transaction_type: 'RECEIVE',
        crypto_currency: 'ETH',
        network: 'mainnet',
        crypto_amount: amount.toFixed(8),
        to_address: toAddress,
        from_address: fromAddress,
        transaction_hash: txHash.toLowerCase(),
        status: status,
        confirmations: confirmations,
        block_number: blockNumber,
        metadata: {
          detected_via: 'manual_fix',
          detected_at: new Date().toISOString(),
          fixed_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (txError) {
      console.error('❌ Error recording transaction:', txError);
      return;
    }

    console.log(`✅ Transaction recorded: ${newTx.id}`);

    // Credit balance if confirmed
    if (confirmations >= 12) {
      console.log(`\n💳 Crediting balance...`);
      
      // Get current balance
      const { data: balanceData } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', wallet.user_id)
        .eq('currency', 'ETH')
        .single();

      const currentBalance = balanceData ? parseFloat(balanceData.balance || '0') : 0;
      console.log(`   Current balance: ${currentBalance.toFixed(8)} ETH`);

      // Credit using RPC function
      const { data: rpcResult, error: creditError } = await supabase.rpc('credit_crypto_wallet', {
        p_user_id: wallet.user_id,
        p_amount: amount,
        p_currency: 'ETH',
      });

      if (creditError) {
        console.error('❌ Error crediting balance:', creditError);
        
        // Try direct update as fallback
        const newBalance = currentBalance + amount;
        const { error: updateError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: wallet.user_id,
            currency: 'ETH',
            balance: newBalance,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,currency'
          });

        if (updateError) {
          console.error('❌ Direct update also failed:', updateError);
          return;
        }
        
        console.log(`✅ Balance credited via direct update: ${newBalance.toFixed(8)} ETH`);
      } else {
        console.log(`✅ Balance credited via RPC: ${amount.toFixed(8)} ETH`);
      }

      // Update transaction metadata
      await supabase
        .from('transactions')
        .update({
          metadata: {
            ...newTx.metadata,
            credited: true,
            credited_at: new Date().toISOString(),
          },
        })
        .eq('id', newTx.id);

      // Send push notification
      console.log(`\n📤 Sending push notification...`);
      try {
        const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: wallet.user_id,
            title: '💰 ETH Deposit Received',
            body: `You received ${amount.toFixed(8)} ETH. Confirmed.`,
            data: {
              type: 'crypto_deposit',
              cryptoCurrency: 'ETH',
              amount: amount,
              transactionHash: txHash,
              confirmations: confirmations,
              status: 'CONFIRMED',
            },
            priority: 'high',
          }),
        });

        if (notificationResponse.ok) {
          console.log(`✅ Push notification sent`);
        } else {
          console.log(`⚠️  Push notification failed (non-critical)`);
        }
      } catch (notifError) {
        console.log(`⚠️  Push notification error (non-critical):`, notifError.message);
      }
    } else {
      console.log(`\n⏳ Transaction needs more confirmations (${confirmations}/12)`);
    }

    console.log(`\n✅ Deposit fixed successfully!`);
    console.log(`\n📊 Summary:`);
    console.log(`   Transaction ID: ${newTx.id}`);
    console.log(`   Amount: ${amount.toFixed(8)} ETH`);
    console.log(`   Status: ${status}`);
    console.log(`   Confirmations: ${confirmations}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Transaction hash from the image
const txHash = process.argv[2] || '0x0e150982c038a588fe3938c2a3b61d2f468958380284a3c88e119250fc1bad2c';

fixMissingDeposit(txHash)
  .then(() => {
    console.log('\n✅ Process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



