// Check all ETH transactions (RECEIVE and SEND) to understand balance discrepancy
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function checkAllTransactions() {
  try {
    // Find user_id
    const walletResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=user_id`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const wallets = await walletResponse.json();
    const userId = wallets[0].user_id;

    console.log('📋 Checking ALL ETH Transactions for User\n');
    console.log('='.repeat(60));

    // Get all ETH transactions (both RECEIVE and SEND)
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&select=id,transaction_type,transaction_hash,crypto_amount,status,confirmations,created_at,metadata&order=created_at.asc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const transactions = await txResponse.json();

    console.log(`Found ${transactions.length} total ETH transactions:\n`);

    let totalReceived = 0;
    let totalSent = 0;
    let creditedReceived = 0;

    transactions.forEach((tx, i) => {
      const amount = parseFloat(tx.crypto_amount || '0');
      const type = tx.transaction_type;
      const credited = tx.metadata?.credited === true;
      
      console.log(`${i + 1}. [${type}] ${tx.transaction_hash?.substring(0, 16)}...`);
      console.log(`   Amount: ${amount.toFixed(8)} ETH`);
      console.log(`   Status: ${tx.status}, Confirmations: ${tx.confirmations || 0}`);
      console.log(`   Created: ${tx.created_at}`);
      
      if (type === 'RECEIVE') {
        totalReceived += amount;
        if (credited) {
          creditedReceived += amount;
          console.log(`   ✅ Credited: YES`);
        } else {
          console.log(`   ⚠️  Credited: NO`);
        }
      } else if (type === 'SEND') {
        totalSent += amount;
        console.log(`   💸 Sent/Debited`);
      }
      console.log('');
    });

    // Get current balance
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const balances = await balanceResponse.json();
    const dbBalance = balances && balances.length > 0 ? parseFloat(balances[0].balance || '0') : 0;

    console.log('='.repeat(60));
    console.log('📊 TRANSACTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Received: ${totalReceived.toFixed(8)} ETH`);
    console.log(`Total Sent: ${totalSent.toFixed(8)} ETH`);
    console.log(`Credited Amount: ${creditedReceived.toFixed(8)} ETH`);
    console.log(`Expected Balance: ${(creditedReceived - totalSent).toFixed(8)} ETH`);
    console.log(`Actual Database Balance: ${dbBalance.toFixed(8)} ETH`);
    console.log(`Balance Difference: ${(dbBalance - (creditedReceived - totalSent)).toFixed(8)} ETH`);

    // Check on-chain balance
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const onChainResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [WALLET_ADDRESS, 'latest'],
        id: 1,
      }),
    });

    const onChainData = await onChainResponse.json();
    const balanceWeiHex = onChainData.result || '0x0';
    const balanceWeiBigInt = BigInt(balanceWeiHex);
    const weiPerEth = BigInt('1000000000000000000');
    const wholeEth = balanceWeiBigInt / weiPerEth;
    const remainderWei = balanceWeiBigInt % weiPerEth;
    const decimalPart = Number(remainderWei) / Number(weiPerEth);
    const onChainBalance = Number(wholeEth) + decimalPart;

    console.log(`\nOn-chain Balance: ${onChainBalance.toFixed(8)} ETH`);
    console.log(`On-chain vs Database: ${(onChainBalance - dbBalance).toFixed(8)} ETH difference`);

    // Analysis
    console.log('\n' + '='.repeat(60));
    console.log('🔍 ANALYSIS');
    console.log('='.repeat(60));
    
    if (totalSent > 0) {
      console.log(`✅ Found ${transactions.filter(t => t.transaction_type === 'SEND').length} SEND transaction(s)`);
      console.log(`   This explains why balance is less than total received.`);
    } else {
      console.log(`⚠️  No SEND transactions found, but balance is less than credited amount.`);
      console.log(`   Possible reasons:`);
      console.log(`   - Transaction was debited but not recorded as SEND`);
      console.log(`   - Balance was manually adjusted`);
      console.log(`   - First transaction (0.00094268 ETH) was not actually credited`);
    }

    const expectedFromCredits = creditedReceived - totalSent;
    if (Math.abs(dbBalance - expectedFromCredits) < 0.000001) {
      console.log(`\n✅ Balance matches expected amount (credited - sent)`);
    } else {
      console.log(`\n⚠️  Balance discrepancy detected!`);
      console.log(`   Expected: ${expectedFromCredits.toFixed(8)} ETH`);
      console.log(`   Actual: ${dbBalance.toFixed(8)} ETH`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAllTransactions();





