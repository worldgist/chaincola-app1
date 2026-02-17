// Reconcile ETH balance - ensure all credited transactions sum to current balance
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function reconcileBalance() {
  try {
    // Find user_id
    const findUserResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=user_id`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const wallets = await findUserResponse.json();
    const userId = wallets[0].user_id;

    // Get all credited ETH RECEIVE transactions
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&transaction_type=eq.RECEIVE&select=id,transaction_hash,crypto_amount,status,metadata&order=created_at.asc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const transactions = await txResponse.json();
    
    // Calculate expected balance from credited transactions
    let expectedBalance = 0;
    const creditedTxs = [];
    
    transactions.forEach(tx => {
      const isCredited = tx.metadata?.credited === true;
      const amount = parseFloat(tx.crypto_amount || '0');
      
      if (isCredited && amount > 0) {
        expectedBalance += amount;
        creditedTxs.push({ hash: tx.transaction_hash, amount });
      }
    });

    // Get current database balance
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const balances = await balanceResponse.json();
    const currentBalance = balances && balances.length > 0 ? parseFloat(balances[0].balance || '0') : 0;

    console.log('\n📊 Balance Reconciliation');
    console.log('========================');
    console.log(`Wallet: ${WALLET_ADDRESS}`);
    console.log(`User ID: ${userId}`);
    console.log(`\nCredited Transactions:`);
    creditedTxs.forEach((tx, i) => {
      console.log(`  ${i + 1}. ${tx.hash}: ${tx.amount} ETH`);
    });
    console.log(`\nExpected Balance (sum of credited): ${expectedBalance.toFixed(8)} ETH`);
    console.log(`Current Database Balance: ${currentBalance.toFixed(8)} ETH`);
    console.log(`Difference: ${(expectedBalance - currentBalance).toFixed(8)} ETH`);

    // Check on-chain balance again
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const balanceResponse2 = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [WALLET_ADDRESS, 'latest'],
        id: 1,
      }),
    });

    const balanceData = await balanceResponse2.json();
    const balanceWeiHex = balanceData.result || '0x0';
    const balanceWeiBigInt = BigInt(balanceWeiHex);
    const weiPerEth = BigInt('1000000000000000000');
    const wholeEth = balanceWeiBigInt / weiPerEth;
    const remainderWei = balanceWeiBigInt % weiPerEth;
    const decimalPart = Number(remainderWei) / Number(weiPerEth);
    const onChainBalance = Number(wholeEth) + decimalPart;

    console.log(`\nOn-chain Balance: ${onChainBalance.toFixed(8)} ETH`);
    console.log(`\nRecommendation:`);
    
    if (Math.abs(expectedBalance - currentBalance) > 0.000001) {
      console.log(`⚠️  Database balance doesn't match sum of credited transactions!`);
      console.log(`   Should update database balance to: ${expectedBalance.toFixed(8)} ETH`);
    }
    
    if (Math.abs(onChainBalance - currentBalance) > 0.000001) {
      console.log(`⚠️  Database balance doesn't match on-chain balance!`);
      console.log(`   On-chain: ${onChainBalance.toFixed(8)} ETH`);
      console.log(`   Database: ${currentBalance.toFixed(8)} ETH`);
      console.log(`   Difference: ${(onChainBalance - currentBalance).toFixed(8)} ETH`);
    }

    if (Math.abs(expectedBalance - currentBalance) < 0.000001 && Math.abs(onChainBalance - currentBalance) < 0.000001) {
      console.log(`✅ All balances match!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

reconcileBalance();





