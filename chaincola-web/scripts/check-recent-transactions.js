// Script to check recent transactions for all ETH wallets
// This helps identify deposits that might have been missed

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Alchemy API configuration
const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkRecentTransactions() {
  console.log('🔍 Checking recent transactions for all ETH wallets...\n');

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

    // Check last 50000 blocks (~175 hours / ~7 days)
    const blocksToCheck = 50000;
    const fromBlock = Math.max(0, latestBlockNumber - blocksToCheck);
    const fromBlockHex = '0x' + fromBlock.toString(16);

    console.log(`🔍 Checking blocks ${fromBlock} to ${latestBlockNumber} (last ${blocksToCheck} blocks)\n`);

    for (const wallet of wallets) {
      try {
        // Normalize address
        const normalizedAddress = wallet.address.toLowerCase().startsWith('0x') 
          ? wallet.address.toLowerCase() 
          : '0x' + wallet.address.toLowerCase();

        console.log(`\n📍 Checking wallet: ${normalizedAddress}`);
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
          console.log(`   ❌ Failed to fetch transfers`);
          continue;
        }

        const transfersData = await transfersResponse.json();
        
        if (transfersData.error) {
          console.log(`   ❌ Alchemy API error: ${transfersData.error.message}`);
          continue;
        }

        const transfers = transfersData.result?.transfers || [];
        console.log(`   📋 Found ${transfers.length} transfer(s) in the last ${blocksToCheck} blocks`);

        if (transfers.length === 0) {
          console.log(`   ✅ No recent transfers found`);
          continue;
        }

        // Check each transfer
        for (const transfer of transfers) {
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

          if (amount <= 0) continue;

          console.log(`\n   💰 Transaction: ${txHash}`);
          console.log(`      Amount: ${amount.toFixed(8)} ETH`);
          console.log(`      Block: ${blockNum} (${confirmations} confirmations)`);
          console.log(`      From: ${transfer.from || 'N/A'}`);

          // Check if transaction exists in database
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, crypto_amount, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .or(`to_address.ilike.${normalizedAddress},to_address.ilike.${wallet.address}`)
            .maybeSingle();

          if (existingTx) {
            const dbAmount = parseFloat(existingTx.crypto_amount || '0');
            const amountDiff = Math.abs(dbAmount - amount);
            
            if (amountDiff > 0.00000001) {
              console.log(`      ⚠️  EXISTS but amount mismatch: DB=${dbAmount.toFixed(8)}, On-chain=${amount.toFixed(8)}`);
            } else {
              console.log(`      ✅ EXISTS in database: ${existingTx.status} (${dbAmount.toFixed(8)} ETH)`);
            }
          } else {
            console.log(`      ❌ NOT FOUND in database - MISSING DEPOSIT!`);
            console.log(`      ⚠️  This transaction should be credited`);
          }
        }

        // Get database balance
        const { data: balanceData } = await supabase
          .from('wallet_balances')
          .select('balance')
          .eq('user_id', wallet.user_id)
          .eq('currency', 'ETH')
          .single();

        const dbBalance = balanceData ? parseFloat(balanceData.balance || '0') : 0;

        // Get on-chain balance
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

        console.log(`\n   📊 Balance Summary:`);
        console.log(`      On-chain: ${onChainBalance.toFixed(8)} ETH`);
        console.log(`      Database: ${dbBalance.toFixed(8)} ETH`);
        console.log(`      Difference: ${(onChainBalance - dbBalance).toFixed(8)} ETH`);

      } catch (error) {
        console.error(`   ❌ Error checking wallet ${wallet.address}:`, error.message);
      }
    }

    console.log('\n✅ Check completed\n');

  } catch (error) {
    console.error('❌ Error checking transactions:', error);
  }
}

// Run the check
checkRecentTransactions()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
