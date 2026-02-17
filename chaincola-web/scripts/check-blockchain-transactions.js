// Script to check recent blockchain transactions for all ETH wallets
// Identifies deposits that might have been missed

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Alchemy API configuration
const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkBlockchainTransactions() {
  console.log('🔍 Checking blockchain for recent ETH transactions...\n');

  try {
    // Get all active ETH wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError) {
      console.error('❌ Error fetching wallets:', walletsError);
      return;
    }

    console.log(`📋 Found ${wallets.length} active ETH wallets\n`);

    // Get latest block number
    const latestBlockResponse = await fetch(alchemyUrl, {
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
    console.log(`📊 Latest block: ${latestBlockNumber}\n`);

    // Check last 100000 blocks (~350 hours / ~14 days)
    const blocksToCheck = 100000;
    const fromBlock = Math.max(0, latestBlockNumber - blocksToCheck);
    const fromBlockHex = '0x' + fromBlock.toString(16);

    console.log(`🔍 Checking blocks ${fromBlock} to ${latestBlockNumber} (last ${blocksToCheck} blocks / ~14 days)\n`);

    const missingDeposits = [];
    const allTransactions = [];

    for (const wallet of wallets) {
      try {
        // Normalize address
        const normalizedAddress = wallet.address.toLowerCase().startsWith('0x') 
          ? wallet.address.toLowerCase() 
          : '0x' + wallet.address.toLowerCase();

        console.log(`\n📍 Wallet: ${normalizedAddress.substring(0, 20)}...`);
        console.log(`   User ID: ${wallet.user_id}`);

        // Get transfers to this address
        const transfersResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alchemy_getAssetTransfers',
            params: [{
              fromBlock: fromBlockHex,
              toBlock: 'latest',
              toAddress: normalizedAddress,
              category: ['external', 'internal'],
              withMetadata: true,
              excludeZeroValue: false,
            }],
            id: 2,
          }),
        });

        if (!transfersResponse.ok) {
          const errorText = await transfersResponse.text();
          console.log(`   ❌ Failed to fetch transfers: ${errorText.substring(0, 100)}`);
          continue;
        }

        const transfersData = await transfersResponse.json();
        
        if (transfersData.error) {
          console.log(`   ❌ Alchemy API error: ${transfersData.error.message}`);
          continue;
        }

        const transfers = transfersData.result?.transfers || [];
        console.log(`   📋 Found ${transfers.length} transfer(s)`);

        if (transfers.length === 0) {
          console.log(`   ✅ No transfers found in the last ${blocksToCheck} blocks`);
          continue;
        }

        // Process each transfer
        for (const transfer of transfers) {
          console.log(`\n   🔍 Checking transaction: ${transfer.hash.substring(0, 20)}...`);
          const txHash = transfer.hash;
          const blockNum = parseInt(transfer.blockNum || '0', 16);
          const confirmations = latestBlockNumber - blockNum;
          
          // Parse amount
          let amountWei = BigInt(0);
          if (transfer.value) {
            if (typeof transfer.value === 'string') {
              if (transfer.value.startsWith('0x') || transfer.value.startsWith('0X')) {
                amountWei = BigInt(transfer.value);
              } else {
                amountWei = BigInt(transfer.value);
              }
            }
          }
          
          const weiPerEth = BigInt('1000000000000000000');
          const wholeEth = amountWei / weiPerEth;
          const remainderWei = amountWei % weiPerEth;
          const decimalPart = Number(remainderWei) / Number(weiPerEth);
          const amount = Number(wholeEth) + decimalPart;

          console.log(`      Amount: ${amount.toFixed(8)} ETH`);
          console.log(`      Block: ${blockNum} (${confirmations} confirmations)`);
          console.log(`      From: ${transfer.from || 'N/A'}`);

          if (amount <= 0) {
            console.log(`      ⏭️  Skipping zero-value transaction`);
            continue;
          }

          allTransactions.push({
            wallet: wallet,
            txHash: txHash,
            amount: amount,
            blockNum: blockNum,
            confirmations: confirmations,
            from: transfer.from,
          });

          // Check if transaction exists in database
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, crypto_amount, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .or(`to_address.ilike.${normalizedAddress},to_address.ilike.${wallet.address}`)
            .maybeSingle();

          if (!existingTx) {
            console.log(`      ❌ STATUS: NOT IN DATABASE - MISSING DEPOSIT!`);
            
            missingDeposits.push({
              wallet: wallet,
              txHash: txHash,
              amount: amount,
              blockNum: blockNum,
              confirmations: confirmations,
              from: transfer.from,
            });
          } else {
            const dbAmount = parseFloat(existingTx.crypto_amount || '0');
            const amountDiff = Math.abs(dbAmount - amount);
            
            if (amountDiff > 0.00000001) {
              console.log(`      ⚠️  STATUS: EXISTS but amount mismatch`);
              console.log(`         On-chain: ${amount.toFixed(8)} ETH`);
              console.log(`         Database: ${dbAmount.toFixed(8)} ETH`);
              console.log(`         Difference: ${amountDiff.toFixed(8)} ETH`);
            } else {
              console.log(`      ✅ STATUS: ${existingTx.status} (${dbAmount.toFixed(8)} ETH)`);
            }
          }
        }

        // Get balances
        const { data: balanceData } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', wallet.user_id)
          .eq('currency', 'ETH')
          .single();

        const dbBalance = balanceData ? parseFloat(balanceData.balance || '0') : 0;

        const balanceResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [normalizedAddress, 'latest'],
            id: 999,
          }),
        });

        let onChainBalance = 0;
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          const balanceWei = BigInt(balanceData.result || '0');
          onChainBalance = Number(balanceWei) / 1e18;
        }

        const balanceDiff = onChainBalance - dbBalance;
        if (Math.abs(balanceDiff) > 0.000001) {
          console.log(`\n   📊 Balance Discrepancy:`);
          console.log(`      On-chain: ${onChainBalance.toFixed(8)} ETH`);
          console.log(`      Database: ${dbBalance.toFixed(8)} ETH`);
          console.log(`      Difference: ${balanceDiff > 0 ? '+' : ''}${balanceDiff.toFixed(8)} ETH`);
        }

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total wallets checked: ${wallets.length}`);
    console.log(`Total transactions found: ${allTransactions.length}`);
    console.log(`Missing deposits: ${missingDeposits.length}\n`);

    if (missingDeposits.length > 0) {
      console.log('⚠️  MISSING DEPOSITS THAT NEED TO BE CREDITED:\n');
      missingDeposits.forEach((deposit, index) => {
        console.log(`${index + 1}. Wallet: ${deposit.wallet.address}`);
        console.log(`   User ID: ${deposit.wallet.user_id}`);
        console.log(`   TX Hash: ${deposit.txHash}`);
        console.log(`   Amount: ${deposit.amount.toFixed(8)} ETH`);
        console.log(`   Block: ${deposit.blockNum} (${deposit.confirmations} confirmations)`);
        console.log(`   From: ${deposit.from || 'N/A'}`);
        console.log('');
      });

      console.log('\n💡 To credit these deposits, the detect-ethereum-deposits function');
      console.log('   should pick them up automatically. If not, check function logs.');
    } else {
      console.log('✅ No missing deposits found! All transactions are recorded.\n');
    }

    console.log('✅ Check completed\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkBlockchainTransactions()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

