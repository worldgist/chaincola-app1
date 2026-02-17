/**
 * Check recent Solana transactions for a specific wallet address
 * Usage: node check-sol-wallet-transactions.js <wallet_address>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const solanaRpcUrl = process.env.ALCHEMY_SOLANA_URL || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

async function checkWalletTransactions(walletAddress) {
  console.log(`\n🔍 Checking transactions for wallet: ${walletAddress}\n`);

  try {
    // Get balance
    const balanceResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress],
      }),
    });

    const balanceData = await balanceResponse.json();
    const balanceLamports = balanceData.result?.value || 0;
    const balanceSOL = balanceLamports / 1e9;
    console.log(`💰 On-chain balance: ${balanceSOL.toFixed(9)} SOL\n`);

    // Get recent signatures
    console.log('📋 Fetching recent transactions...\n');
    const signaturesResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
          {
            limit: 50, // Get last 50 transactions
            commitment: 'confirmed',
          },
        ],
      }),
    });

    const signaturesData = await signaturesResponse.json();
    const signatures = signaturesData.result || [];

    console.log(`✅ Found ${signatures.length} transaction(s)\n`);

    // Get latest slot for confirmation calculation
    const slotResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSlot',
      }),
    });
    const slotData = await slotResponse.json();
    const latestSlot = slotData.result || 0;

    // Check database transactions
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select('transaction_hash, crypto_amount, status, created_at, metadata')
      .eq('to_address', walletAddress)
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false })
      .limit(50);

    const dbTxHashes = new Set(dbTransactions?.map(tx => tx.transaction_hash) || []);
    console.log(`📊 Database transactions: ${dbTransactions?.length || 0}\n`);

    // Process each signature
    for (let i = 0; i < Math.min(signatures.length, 20); i++) {
      const sigInfo = signatures[i];
      const txSignature = sigInfo.signature;
      const slot = sigInfo.slot;
      const confirmations = latestSlot - slot;
      const isInDb = dbTxHashes.has(txSignature);

      console.log(`\n${i + 1}. Transaction: ${txSignature.substring(0, 16)}...`);
      console.log(`   Slot: ${slot}, Confirmations: ${confirmations}`);
      console.log(`   In Database: ${isInDb ? '✅ Yes' : '❌ No'}`);

      if (!isInDb) {
        // Get transaction details
        const txResponse = await fetch(solanaRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              txSignature,
              {
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 0,
              },
            ],
          }),
        });

        if (txResponse.ok) {
          const txData = await txResponse.json();
          const transaction = txData.result;

          if (transaction && transaction.meta && !transaction.meta.err) {
            const preBalances = transaction.meta.preBalances || [];
            const postBalances = transaction.meta.postBalances || [];
            const accountKeys = transaction.transaction?.message?.accountKeys || [];

            // Find wallet index
            let walletIndex = -1;
            for (let j = 0; j < accountKeys.length; j++) {
              const key = accountKeys[j];
              const keyAddress = typeof key === 'string' ? key : (key?.pubkey || key?.address || '');
              if (keyAddress === walletAddress) {
                walletIndex = j;
                break;
              }
            }

            if (walletIndex >= 0 && walletIndex < preBalances.length && walletIndex < postBalances.length) {
              const preBalance = preBalances[walletIndex];
              const postBalance = postBalances[walletIndex];
              const diffLamports = postBalance - preBalance;
              const diffSOL = diffLamports / 1e9;

              if (diffSOL > 0) {
                console.log(`   💰 Deposit detected: ${diffSOL.toFixed(9)} SOL`);
                console.log(`   ⚠️ MISSING FROM DATABASE!`);
              } else if (diffSOL < 0) {
                console.log(`   📤 Send: ${Math.abs(diffSOL).toFixed(9)} SOL`);
              } else {
                console.log(`   ℹ️ No balance change (likely fee payment)`);
              }
            }
          }
        }
      } else {
        const dbTx = dbTransactions?.find(tx => tx.transaction_hash === txSignature);
        if (dbTx) {
          console.log(`   Amount: ${dbTx.crypto_amount} SOL`);
          console.log(`   Status: ${dbTx.status}`);
        }
      }
    }

    console.log(`\n\n💡 Tip: If you see missing deposits, run: node manual-detect-sol-deposit.js`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

const walletAddress = process.argv[2];
if (!walletAddress) {
  console.error('❌ Please provide a wallet address');
  console.log('Usage: node check-sol-wallet-transactions.js <wallet_address>');
  process.exit(1);
}

checkWalletTransactions(walletAddress).catch(console.error);



