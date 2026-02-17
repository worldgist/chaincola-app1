// Check for missing ETH deposits for a specific user
// Usage: node check-user-eth-deposits.js <user_id_or_email>

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const alchemyUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkUserDeposits(userIdentifier) {
  console.log(`🔍 Checking ETH deposits for: ${userIdentifier}\n`);

  try {
    // Find user
    let userId = userIdentifier;
    let userEmail = null;

    // If it looks like an email, find user by email
    if (userIdentifier.includes('@')) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .eq('email', userIdentifier)
        .single();

      if (profile) {
        userId = profile.user_id;
        userEmail = profile.email;
        console.log(`✅ Found user: ${userEmail} (${userId})\n`);
      } else {
        console.error('❌ User not found');
        return;
      }
    }

    // Get user's ETH wallet
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network')
      .eq('user_id', userId)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .single();

    if (walletError || !wallet) {
      console.error('❌ ETH wallet not found:', walletError?.message);
      return;
    }

    console.log(`📍 Wallet Address: ${wallet.address}\n`);

    // Get on-chain balance
    const balanceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [wallet.address, 'latest'],
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
      .eq('user_id', userId)
      .eq('currency', 'ETH')
      .single();

    const dbBalanceAmount = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;

    console.log(`💰 Balance Comparison:`);
    console.log(`   On-chain: ${onChainBalance.toFixed(8)} ETH`);
    console.log(`   Database: ${dbBalanceAmount.toFixed(8)} ETH`);
    console.log(`   Difference: ${(onChainBalance - dbBalanceAmount).toFixed(8)} ETH\n`);

    if (onChainBalance <= dbBalanceAmount) {
      console.log('✅ Balances match or database has more. No missing deposits.\n');
      return;
    }

    const missingAmount = onChainBalance - dbBalanceAmount;
    console.log(`⚠️  Missing deposit detected: ${missingAmount.toFixed(8)} ETH\n`);

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

    // Check last 100000 blocks (~14 days)
    const blocksToCheck = 100000;
    const fromBlock = Math.max(0, latestBlockNumber - blocksToCheck);
    const fromBlockHex = '0x' + fromBlock.toString(16);

    console.log(`🔍 Checking transactions in blocks ${fromBlock} to ${latestBlockNumber}...\n`);

    // Normalize address
    const normalizedAddress = wallet.address.toLowerCase().startsWith('0x') 
      ? wallet.address.toLowerCase() 
      : '0x' + wallet.address.toLowerCase();

    // Get transfers
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
      console.error('❌ Failed to fetch transfers');
      return;
    }

    const transfersData = await transfersResponse.json();
    const transfers = transfersData.result?.transfers || [];

    console.log(`📋 Found ${transfers.length} transfer(s)\n`);

    const missingDeposits = [];

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

      // Check if transaction exists in database
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id, status, crypto_amount, metadata')
        .eq('transaction_hash', txHash.toLowerCase())
        .or(`to_address.ilike.${normalizedAddress},to_address.ilike.${wallet.address}`)
        .maybeSingle();

      if (!existingTx) {
        console.log(`❌ MISSING TRANSACTION:`);
        console.log(`   TX Hash: ${txHash}`);
        console.log(`   Amount: ${amount.toFixed(8)} ETH`);
        console.log(`   Block: ${blockNum} (${confirmations} confirmations)`);
        console.log(`   From: ${transfer.from || 'N/A'}\n`);

        missingDeposits.push({
          txHash: txHash,
          amount: amount,
          blockNum: blockNum,
          confirmations: confirmations,
          from: transfer.from,
        });
      }
    }

    if (missingDeposits.length > 0) {
      console.log(`\n⚠️  Found ${missingDeposits.length} missing deposit(s)\n`);
      console.log('💡 To fix, run:');
      missingDeposits.forEach((deposit, index) => {
        console.log(`   node fix-missing-deposit.js ${deposit.txHash}`);
      });
    } else {
      console.log('✅ All transactions are recorded in database');
      console.log('   (Balance discrepancy might be due to withdrawals or other factors)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get user identifier from command line or use default
const userIdentifier = process.argv[2] || 'Netpayuser@gmail.com';

checkUserDeposits(userIdentifier)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



