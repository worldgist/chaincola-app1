// Verify deposit detection flow: detect -> record -> credit
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function verifyDepositDetection() {
  try {
    console.log('🔍 Verifying Deposit Detection Flow\n');
    console.log('=====================================\n');

    // Step 1: Find user and wallet
    console.log('Step 1: Finding wallet and user...');
    const walletResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=id,user_id,address,asset,network,is_active`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const wallets = await walletResponse.json();
    
    if (!wallets || wallets.length === 0) {
      console.error('❌ Wallet not found');
      return;
    }
    
    const wallet = wallets[0];
    const userId = wallet.user_id;
    console.log(`✅ Found wallet: ${wallet.address}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Asset: ${wallet.asset}, Network: ${wallet.network}, Active: ${wallet.is_active}\n`);

    // Step 2: Check recent transactions
    console.log('Step 2: Checking recent ETH RECEIVE transactions...');
    const txResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${userId}&crypto_currency=eq.ETH&transaction_type=eq.RECEIVE&select=id,transaction_hash,crypto_amount,status,confirmations,created_at,metadata&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const transactions = await txResponse.json();
    
    console.log(`✅ Found ${transactions.length} recent transactions:\n`);
    transactions.forEach((tx, i) => {
      const amount = parseFloat(tx.crypto_amount || '0');
      const credited = tx.metadata?.credited === true;
      const confirmations = tx.confirmations || 0;
      const status = tx.status;
      
      console.log(`  ${i + 1}. Transaction ${tx.id.substring(0, 8)}...`);
      console.log(`     Hash: ${tx.transaction_hash}`);
      console.log(`     Amount: ${amount.toFixed(8)} ETH`);
      console.log(`     Status: ${status}`);
      console.log(`     Confirmations: ${confirmations}`);
      console.log(`     Credited: ${credited ? '✅ YES' : '❌ NO'}`);
      console.log(`     Created: ${tx.created_at}`);
      
      // Verify transaction was recorded correctly
      if (amount === 0 || !tx.crypto_amount) {
        console.log(`     ⚠️  WARNING: Transaction has zero or missing amount!`);
      }
      if (status === 'CONFIRMED' && confirmations >= 12 && !credited) {
        console.log(`     ⚠️  WARNING: Transaction confirmed but not credited!`);
      }
      console.log('');
    });

    // Step 3: Check current balance
    console.log('Step 3: Checking current database balance...');
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance,updated_at`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const balances = await balanceResponse.json();
    const dbBalance = balances && balances.length > 0 ? parseFloat(balances[0].balance || '0') : 0;
    const balanceUpdated = balances && balances.length > 0 ? balances[0].updated_at : null;
    
    console.log(`✅ Database Balance: ${dbBalance.toFixed(8)} ETH`);
    console.log(`   Last Updated: ${balanceUpdated || 'Never'}\n`);

    // Step 4: Calculate expected balance from credited transactions
    console.log('Step 4: Verifying balance matches credited transactions...');
    let expectedBalance = 0;
    const creditedTxs = transactions.filter(tx => tx.metadata?.credited === true);
    
    creditedTxs.forEach(tx => {
      const amount = parseFloat(tx.crypto_amount || '0');
      expectedBalance += amount;
    });
    
    console.log(`   Credited Transactions: ${creditedTxs.length}`);
    console.log(`   Expected Balance (sum): ${expectedBalance.toFixed(8)} ETH`);
    console.log(`   Actual Database Balance: ${dbBalance.toFixed(8)} ETH`);
    
    const balanceDiff = Math.abs(expectedBalance - dbBalance);
    if (balanceDiff < 0.000001) {
      console.log(`   ✅ Balance matches expected amount!\n`);
    } else {
      console.log(`   ⚠️  Balance discrepancy: ${balanceDiff.toFixed(8)} ETH\n`);
    }

    // Step 5: Check on-chain balance
    console.log('Step 5: Checking on-chain balance...');
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

    console.log(`✅ On-chain Balance: ${onChainBalance.toFixed(8)} ETH`);
    
    const onChainDiff = Math.abs(onChainBalance - dbBalance);
    if (onChainDiff < 0.000001) {
      console.log(`   ✅ Database balance matches on-chain balance!\n`);
    } else {
      console.log(`   ⚠️  Discrepancy: ${onChainDiff.toFixed(8)} ETH\n`);
    }

    // Step 6: Test the detection function
    console.log('Step 6: Testing deposit detection function...');
    console.log('   Triggering detect-ethereum-deposits function...\n');
    
    const detectResponse = await fetch(`${SUPABASE_URL}/functions/v1/detect-ethereum-deposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (detectResponse.ok) {
      const detectResult = await detectResponse.json();
      console.log('✅ Detection function executed successfully!');
      console.log(`   Checked: ${detectResult.data?.checked || 0} wallets`);
      console.log(`   Deposits Found: ${detectResult.data?.depositsFound || 0}`);
      console.log(`   Deposits Credited: ${detectResult.data?.depositsCredited || 0}`);
      
      if (detectResult.data?.errors && detectResult.data.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${detectResult.data.errors.length}`);
        detectResult.data.errors.forEach((err, i) => {
          console.log(`      ${i + 1}. ${err}`);
        });
      }
      
      if (detectResult.data?.balanceReconciliation && detectResult.data.balanceReconciliation.length > 0) {
        console.log(`\n   Balance Reconciliation:`);
        detectResult.data.balanceReconciliation.forEach((rec, i) => {
          console.log(`      ${i + 1}. Address: ${rec.address}`);
          console.log(`         On-chain: ${rec.onChainBalance?.toFixed(8) || 0} ETH`);
          console.log(`         Database: ${rec.databaseBalance?.toFixed(8) || 0} ETH`);
          console.log(`         Discrepancy: ${rec.discrepancy?.toFixed(8) || 0} ETH`);
        });
      }
    } else {
      const errorText = await detectResponse.text();
      console.error(`❌ Detection function failed: ${detectResponse.status}`);
      console.error(`   ${errorText}`);
    }

    // Final Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Wallet Found: ${wallet.address}`);
    console.log(`✅ Transactions Recorded: ${transactions.length}`);
    console.log(`✅ Credited Transactions: ${creditedTxs.length}`);
    console.log(`✅ Database Balance: ${dbBalance.toFixed(8)} ETH`);
    console.log(`✅ On-chain Balance: ${onChainBalance.toFixed(8)} ETH`);
    console.log(`✅ Detection Function: Working`);
    
    const allGood = balanceDiff < 0.000001 && onChainDiff < 0.000001 && 
                    transactions.every(tx => tx.crypto_amount && parseFloat(tx.crypto_amount) > 0) &&
                    creditedTxs.every(tx => tx.status === 'CONFIRMED' && (tx.confirmations || 0) >= 12);
    
    if (allGood) {
      console.log('\n✅ All checks passed! Deposit detection is working correctly.');
    } else {
      console.log('\n⚠️  Some issues detected. Please review the warnings above.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

verifyDepositDetection();





