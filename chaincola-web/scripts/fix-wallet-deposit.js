// Fix missing deposit for a specific wallet address

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function fixWalletDeposit(walletAddress) {
  console.log(`🔍 Checking wallet: ${walletAddress}\n`);

  try {
    // Find wallet
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .ilike('address', walletAddress)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .single();

    if (!wallet) {
      console.error('❌ Wallet not found');
      return;
    }

    console.log(`✅ Found wallet for user: ${wallet.user_id}\n`);

    // Normalize address
    const normalizedAddress = wallet.address.toLowerCase().startsWith('0x') 
      ? wallet.address.toLowerCase() 
      : '0x' + wallet.address.toLowerCase();

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

    const balanceData = await balanceResponse.json();
    const balanceWei = BigInt(balanceData.result || '0');
    const onChainBalance = Number(balanceWei) / 1e18;

    // Get database balance
    const { data: dbBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', wallet.user_id)
      .eq('currency', 'ETH')
      .single();

    const dbBalanceAmount = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;

    console.log(`💰 Balance:`);
    console.log(`   On-chain: ${onChainBalance.toFixed(8)} ETH`);
    console.log(`   Database: ${dbBalanceAmount.toFixed(8)} ETH`);
    console.log(`   Difference: ${(onChainBalance - dbBalanceAmount).toFixed(8)} ETH\n`);

    if (onChainBalance <= dbBalanceAmount) {
      console.log('✅ No missing deposits\n');
      return;
    }

    // Get latest block
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

    // Check last 200000 blocks
    const blocksToCheck = 200000;
    const fromBlock = Math.max(0, latestBlockNumber - blocksToCheck);
    const fromBlockHex = '0x' + fromBlock.toString(16);

    console.log(`🔍 Checking transactions...\n`);

    // Get transfers
    const transfersResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{
          fromBlock: '0x0', // Check from genesis to find all deposits
          toBlock: 'latest',
          toAddress: normalizedAddress,
          category: ['external', 'internal'],
          withMetadata: true,
          excludeZeroValue: false,
        }],
        id: 2,
      }),
    });

    const transfersData = await transfersResponse.json();
    const transfers = transfersData.result?.transfers || [];

    console.log(`📋 Found ${transfers.length} transfer(s)\n`);

    // Find deposits that aren't in database
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

      // Check if transaction exists
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id, status, crypto_amount')
        .eq('transaction_hash', txHash.toLowerCase())
        .or(`to_address.ilike.${normalizedAddress},to_address.ilike.${wallet.address}`)
        .maybeSingle();

      if (!existingTx) {
        console.log(`❌ Missing transaction found:`);
        console.log(`   TX Hash: ${txHash}`);
        console.log(`   Amount: ${amount.toFixed(8)} ETH`);
        console.log(`   Block: ${blockNum} (${confirmations} confirmations)`);
        console.log(`   Fixing...\n`);

        // Fix it using the fix-missing-deposit script
        const { exec } = require('child_process');
        exec(`node fix-missing-deposit.js ${txHash}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`);
            return;
          }
          console.log(stdout);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get wallet address from command line
const walletAddress = process.argv[2] || '0x6Da01B7380B22CcbEA';

fixWalletDeposit(walletAddress)
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



