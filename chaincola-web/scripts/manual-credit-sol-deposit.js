#!/usr/bin/env node

/**
 * Manual Solana Deposit Credit Script
 * Credits a specific Solana transaction that wasn't automatically detected
 * 
 * Usage:
 *   node scripts/manual-credit-sol-deposit.js
 */

const https = require('https');

// Transaction details from the image
const TRANSACTION_SIGNATURE = '2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD';
const RECIPIENT_ADDRESS = '5htD5gdX7dVvC1qZnuZaMMaPryy4HPVcHDkddo6Q2Qrc';
const EXPECTED_AMOUNT = 0.01579829; // SOL (from image: SOL 0.01579829)

const PROJECT_REF = 'slleojsdpctxhlsoyenr';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const ALCHEMY_SOLANA_URL = process.env.ALCHEMY_SOLANA_URL || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

/**
 * Make HTTP request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Get transaction details from Solana blockchain
 */
async function getSolanaTransaction(signature) {
  console.log(`🔍 Fetching transaction details for: ${signature}`);
  
  const payload = {
    jsonrpc: '2.0',
    method: 'getTransaction',
    params: [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
    ],
    id: 1,
  };

  const response = await makeRequest(ALCHEMY_SOLANA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (response.statusCode !== 200 || !response.data.result) {
    throw new Error(`Failed to fetch transaction: ${JSON.stringify(response.data)}`);
  }

  return response.data.result;
}

/**
 * Find wallet in database by address
 */
async function findWalletByAddress(address) {
  console.log(`🔍 Looking up wallet address: ${address}`);
  
  const url = `${SUPABASE_URL}/rest/v1/crypto_wallets?select=id,user_id,address,asset,network,is_active&address=eq.${address}&asset=eq.SOL&network=eq.mainnet`;
  
  const response = await makeRequest(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Failed to fetch wallet: ${response.statusCode}`);
  }

  const wallets = Array.isArray(response.data) ? response.data : [];
  if (wallets.length === 0) {
    throw new Error(`Wallet not found for address: ${address}`);
  }

  const wallet = wallets[0];
  if (!wallet.is_active) {
    console.warn(`⚠️  Wallet found but is not active`);
  }

  return wallet;
}

/**
 * Check if transaction already exists
 */
async function checkExistingTransaction(signature, userId) {
  console.log(`🔍 Checking if transaction already exists...`);
  
  const url = `${SUPABASE_URL}/rest/v1/transactions?select=id,status,crypto_amount,metadata&transaction_hash=eq.${signature}&user_id=eq.${userId}&crypto_currency=eq.SOL`;
  
  const response = await makeRequest(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Failed to check transaction: ${response.statusCode}`);
  }

  const transactions = Array.isArray(response.data) ? response.data : [];
  return transactions.length > 0 ? transactions[0] : null;
}

/**
 * Credit Solana deposit via Edge Function
 */
async function creditSolanaDeposit(userId, amount, signature, walletAddress) {
  console.log(`💰 Crediting ${amount} SOL to user ${userId}...`);
  
  const url = `${SUPABASE_URL}/functions/v1/auto-convert-crypto-to-ngn`;
  
  // Note: We'll use the detect-solana-deposits function approach
  // But first, let's manually create the transaction record and credit
  
  // Step 1: Create transaction record
  const txUrl = `${SUPABASE_URL}/rest/v1/transactions`;
  const txPayload = {
    user_id: userId,
    transaction_type: 'RECEIVE',
    crypto_currency: 'SOL',
    crypto_amount: amount,
    status: 'CONFIRMED',
    to_address: walletAddress,
    transaction_hash: signature,
    confirmations: 32,
    metadata: {
      detected_at: new Date().toISOString(),
      detected_via: 'manual_credit',
      confirmation_status: 'finalized',
      manual_credit: true,
    },
  };

  const txResponse = await makeRequest(txUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: txPayload,
  });

  if (txResponse.statusCode !== 201) {
    throw new Error(`Failed to create transaction: ${JSON.stringify(txResponse.data)}`);
  }

  const transaction = Array.isArray(txResponse.data) ? txResponse.data[0] : txResponse.data;
  console.log(`✅ Transaction recorded: ${transaction.id}`);

  // Step 2: Trigger auto-convert (which will credit NGN)
  const convertUrl = `${SUPABASE_URL}/functions/v1/detect-solana-deposits`;
  const convertResponse = await makeRequest(convertUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: {},
  });

  console.log(`✅ Deposit detection triggered (status: ${convertResponse.statusCode})`);

  return transaction;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Manual Solana Deposit Credit Script\n');
    console.log(`Transaction: ${TRANSACTION_SIGNATURE}`);
    console.log(`Recipient: ${RECIPIENT_ADDRESS}`);
    console.log(`Expected Amount: ${EXPECTED_AMOUNT} SOL\n`);

    // Step 1: Verify transaction on-chain
    console.log('📊 Step 1: Verifying transaction on Solana blockchain...');
    const txDetails = await getSolanaTransaction(TRANSACTION_SIGNATURE);
    
    if (!txDetails) {
      throw new Error('Transaction not found on blockchain');
    }

    if (txDetails.meta?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(txDetails.meta.err)}`);
    }

    // Calculate amount received
    const accountKeys = txDetails.transaction?.message?.accountKeys || [];
    const walletIndex = accountKeys.findIndex((key) => {
      const pubkey = typeof key === 'string' ? key : key.pubkey;
      return pubkey === RECIPIENT_ADDRESS;
    });

    let amountReceived = 0;
    if (walletIndex >= 0) {
      const preBalances = txDetails.meta?.preBalances || [];
      const postBalances = txDetails.meta?.postBalances || [];
      if (preBalances[walletIndex] !== undefined && postBalances[walletIndex] !== undefined) {
        amountReceived = (postBalances[walletIndex] - preBalances[walletIndex]) / 1e9;
      }
    }

    // Also check transfer instructions
    if (amountReceived === 0 && txDetails.transaction?.message?.instructions) {
      for (const instruction of txDetails.transaction.message.instructions) {
        if (instruction.program === 'system' && instruction.parsed?.type === 'transfer') {
          const transferInfo = instruction.parsed.info;
          if (transferInfo.destination === RECIPIENT_ADDRESS) {
            amountReceived = parseFloat(transferInfo.lamports || '0') / 1e9;
          }
        }
      }
    }

    if (amountReceived <= 0) {
      throw new Error('No SOL received in this transaction');
    }

    console.log(`✅ Transaction verified: ${amountReceived} SOL received`);
    console.log(`   Confirmation Status: ${txDetails.meta?.confirmationStatus || 'unknown'}`);
    console.log(`   Slot: ${txDetails.slot}\n`);

    // Step 2: Find wallet in database
    console.log('📊 Step 2: Finding wallet in database...');
    const wallet = await findWalletByAddress(RECIPIENT_ADDRESS);
    console.log(`✅ Wallet found:`);
    console.log(`   User ID: ${wallet.user_id}`);
    console.log(`   Wallet ID: ${wallet.id}`);
    console.log(`   Active: ${wallet.is_active}\n`);

    // Step 3: Check if transaction already exists
    console.log('📊 Step 3: Checking for existing transaction...');
    const existingTx = await checkExistingTransaction(TRANSACTION_SIGNATURE, wallet.user_id);
    
    if (existingTx) {
      console.log(`⚠️  Transaction already exists:`);
      console.log(`   Transaction ID: ${existingTx.id}`);
      console.log(`   Status: ${existingTx.status}`);
      console.log(`   Amount: ${existingTx.crypto_amount} SOL`);
      console.log(`   Metadata: ${JSON.stringify(existingTx.metadata, null, 2)}`);
      
      const metadata = existingTx.metadata || {};
      if (metadata.auto_converted_to_ngn) {
        console.log(`\n✅ Transaction already processed and converted to NGN`);
        console.log(`   NGN Credited: ₦${metadata.ngn_credited || 'N/A'}`);
        return;
      } else {
        console.log(`\n⚠️  Transaction exists but not converted. Triggering conversion...`);
        // Trigger the detection function to process it
        const convertUrl = `${SUPABASE_URL}/functions/v1/detect-solana-deposits`;
        await makeRequest(convertUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: {},
        });
        console.log(`✅ Conversion triggered. Please check the transaction again.`);
        return;
      }
    }

    // Step 4: Credit the deposit
    console.log('📊 Step 4: Crediting deposit...');
    const transaction = await creditSolanaDeposit(
      wallet.user_id,
      amountReceived,
      TRANSACTION_SIGNATURE,
      RECIPIENT_ADDRESS
    );

    console.log(`\n✅ Deposit credited successfully!`);
    console.log(`   Transaction ID: ${transaction.id}`);
    console.log(`   Amount: ${amountReceived} SOL`);
    console.log(`   Status: ${transaction.status}`);
    console.log(`\n💡 The deposit should be auto-converted to NGN. Check your balance!`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
