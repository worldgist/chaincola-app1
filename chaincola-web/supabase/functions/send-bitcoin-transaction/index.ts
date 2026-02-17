// Send Bitcoin Transaction Edge Function
// Sends BTC using Alchemy Bitcoin API
//
// SECURITY: This is the ONLY function that decrypts BTC private keys.
// Decryption happens ONLY when sending BTC transactions.
// Flow:
//   1. Fetch encrypted private key from database
//   2. Decrypt in memory (temporary)
//   3. Get UTXOs for the wallet
//   4. Select UTXOs to cover amount + fees
//   5. Sign transaction
//   6. Broadcast transaction
//   7. Immediately discard decrypted key from memory
//
// Private keys are NEVER:
//   - Logged or exposed
//   - Stored in plaintext
//   - Decrypted for any other purpose
//   - Returned to the client

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoSendNotification } from "../_shared/send-crypto-send-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user token
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? '';
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { destination_address, amount_btc, send_all } = body;

    if (!destination_address) {
      return new Response(
        JSON.stringify({ success: false, error: "destination_address is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!send_all && (!amount_btc || amount_btc <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "amount_btc is required when send_all is false" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Bitcoin address format (basic check)
    if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(destination_address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Bitcoin address format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Bitcoin wallet
    let btcWallet: any = null;
    let walletError: any = null;
    
    // First, try to get active wallet with private key
    const { data: activeWalletWithKey, error: error1 } = await supabase
      .from('crypto_wallets')
      .select('id, address, private_key_encrypted, is_active')
      .eq('user_id', user.id)
      .eq('asset', 'BTC')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (activeWalletWithKey) {
      btcWallet = activeWalletWithKey;
    } else {
      // Fallback: Get any active wallet
      const { data: activeWallet, error: error2 } = await supabase
        .from('crypto_wallets')
        .select('id, address, private_key_encrypted, is_active')
        .eq('user_id', user.id)
        .eq('asset', 'BTC')
        .eq('network', 'mainnet')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (activeWallet) {
        btcWallet = activeWallet;
        walletError = error2;
      } else {
        // Last resort: Get any BTC wallet
        const { data: anyWallet, error: error3 } = await supabase
          .from('crypto_wallets')
          .select('id, address, private_key_encrypted, is_active')
          .eq('user_id', user.id)
          .eq('asset', 'BTC')
          .eq('network', 'mainnet')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        btcWallet = anyWallet;
        walletError = error3;
      }
    }

    if (walletError || !btcWallet) {
      console.error('❌ Error fetching Bitcoin wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: "Bitcoin wallet not found. Please set up your wallet first." }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📝 Wallet found: ${btcWallet.address}`);
    console.log(`   Wallet ID: ${btcWallet.id}`);
    console.log(`   Is Active: ${btcWallet.is_active}`);
    console.log(`   Has private_key_encrypted: ${!!btcWallet.private_key_encrypted}`);

    if (!btcWallet.private_key_encrypted || btcWallet.private_key_encrypted.trim() === '') {
      console.error('❌ Private key not found in wallet');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No private key found in wallet. Please store your Bitcoin wallet keys first.",
          wallet_address: btcWallet.address,
          wallet_id: btcWallet.id,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's BTC balance
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'BTC')
      .single();

    if (balanceError || !balance) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch BTC balance" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const availableBalance = parseFloat(balance.balance || '0');

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    const alchemyUrl = bitcoinRpcUrl;

    // Estimate transaction fee (in BTC)
    // Bitcoin fees are typically calculated per byte. A standard transaction is ~250 bytes.
    // We'll use a conservative estimate: 10 sat/vB (satoshi per virtual byte) = ~0.000025 BTC
    const ESTIMATED_FEE_BTC = 0.000025; // Conservative estimate
    const PLATFORM_FEE_PERCENTAGE = 0.03; // 3%
    
    let amountToSend: number;
    let platformFee: number;
    
    // If send_all is true, calculate the maximum sendable amount
    if (send_all === true) {
      // Formula: sendAmount = (availableBalance - networkFee) / (1 + platformFeePercentage)
      // This ensures: sendAmount + platformFee + networkFee = availableBalance
      const maxSendable = (availableBalance - ESTIMATED_FEE_BTC) / (1 + PLATFORM_FEE_PERCENTAGE);
      
      if (maxSendable <= 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance to send all. Available: ${availableBalance.toFixed(8)} BTC, but network fee (${ESTIMATED_FEE_BTC.toFixed(8)} BTC) exceeds available balance.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      amountToSend = maxSendable;
      platformFee = amountToSend * PLATFORM_FEE_PERCENTAGE;
      
      console.log(`💰 Send All Mode: Calculated send amount: ${amountToSend.toFixed(8)} BTC`);
      console.log(`   Platform fee (3%): ${platformFee.toFixed(8)} BTC`);
      console.log(`   Network fee: ${ESTIMATED_FEE_BTC.toFixed(8)} BTC`);
      console.log(`   Total: ${(amountToSend + platformFee + ESTIMATED_FEE_BTC).toFixed(8)} BTC`);
    } else {
      amountToSend = parseFloat(amount_btc);
      
      if (amountToSend <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Amount must be greater than 0" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      platformFee = amountToSend * PLATFORM_FEE_PERCENTAGE;
      const totalRequired = amountToSend + ESTIMATED_FEE_BTC + platformFee;

      if (availableBalance < totalRequired) {
        const shortage = totalRequired - availableBalance;
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance. Available: ${availableBalance.toFixed(8)} BTC, Required: ${totalRequired.toFixed(8)} BTC (${amountToSend.toFixed(8)} send + ${ESTIMATED_FEE_BTC.toFixed(8)} network fee + ${platformFee.toFixed(8)} platform fee). Shortage: ${shortage.toFixed(8)} BTC`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================================
    // DECRYPT PRIVATE KEY - ONLY TIME DECRYPTION HAPPENS
    // ============================================================
    // This is the ONLY function that decrypts BTC private keys.
    // Decryption happens ONLY when sending BTC transactions.
    // The decrypted key exists ONLY in memory and is immediately discarded.
    // ============================================================
    
    // Get encryption key from Supabase Secrets
    const encryptionKey = Deno.env.get('BTC_ENCRYPTION_KEY') || 
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') || 
                         Deno.env.get('ETH_ENCRYPTION_KEY') ||
                         Deno.env.get('TRON_ENCRYPTION_KEY');
    
    if (!encryptionKey) {
      console.error('❌ Encryption key not set in Supabase secrets');
      return new Response(
        JSON.stringify({ success: false, error: 'Encryption key not configured. Please set BTC_ENCRYPTION_KEY or CRYPTO_ENCRYPTION_KEY in Supabase secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt private key (in memory only, never logged, immediately discarded after use)
    let privateKey: string | null = null;
    let signedTxHex: string | null = null;
    
    try {
      console.log('🔓 Decrypting private key for transaction signing (ONLY time decryption happens)...');
      
      // Decrypt private key - exists ONLY in memory
      privateKey = await decryptPrivateKey(btcWallet.private_key_encrypted, encryptionKey);
      
      // Validate private key format (should be 64 hex characters for WIF or hex)
      if (!privateKey || privateKey.length < 32) {
        console.error('❌ Decrypted key format invalid (format check only, key not logged)');
        throw new Error('Invalid private key format after decryption');
      }
      console.log('✅ Private key decrypted successfully (in memory only)');
      
      // Import bitcoinjs-lib for transaction building and signing
      const bitcoin = await import('https://esm.sh/bitcoinjs-lib@6.1.5');
      const { networks, payments, Psbt } = bitcoin;
      const network = networks.bitcoin; // Mainnet

      // Convert private key to ECPair
      // Private key can be in WIF format or hex format
      let keyPair: any;
      try {
        // Try WIF format first
        keyPair = bitcoin.ECPair.fromWIF(privateKey, network);
      } catch {
        // If WIF fails, try hex format
        const privateKeyBuffer = Buffer.from(privateKey, 'hex');
        keyPair = bitcoin.ECPair.fromPrivateKey(privateKeyBuffer, { network });
      }

      // Get UTXOs for the wallet address
      // We'll get UTXOs from known transactions in the database
      const { data: knownTransactions } = await supabase
        .from('transactions')
        .select('transaction_hash, crypto_amount, to_address, status, metadata')
        .eq('to_address', btcWallet.address)
        .eq('crypto_currency', 'BTC')
        .eq('status', 'CONFIRMED')
        .order('created_at', { ascending: false })
        .limit(100);

      const utxos: any[] = [];
      
      // Check each transaction for unspent outputs
      for (const dbTx of knownTransactions || []) {
        if (!dbTx.transaction_hash) continue;
        
        try {
          // Get transaction details
          const txResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'getrawtransaction',
              params: [dbTx.transaction_hash, true],
              id: 1,
            }),
          });

          if (txResponse.ok) {
            const txData = await txResponse.json();
            const tx = txData.result;
            if (!tx || !tx.vout) continue;

            // Check each output
            for (let voutIndex = 0; voutIndex < tx.vout.length; voutIndex++) {
              const output = tx.vout[voutIndex];
              
              if (output.scriptPubKey && output.scriptPubKey.addresses) {
                const outputAddresses = output.scriptPubKey.addresses;
                if (outputAddresses.includes(btcWallet.address)) {
                  // Check if unspent using gettxout
                  const txoutResponse = await fetch(alchemyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      jsonrpc: '2.0',
                      method: 'gettxout',
                      params: [dbTx.transaction_hash, voutIndex],
                      id: 2,
                    }),
                  });

                  if (txoutResponse.ok) {
                    const txoutData = await txoutResponse.json();
                    if (txoutData.result) {
                      // Output is unspent (UTXO)
                      const amount = txoutData.result.value || output.value || 0;
                      utxos.push({
                        txid: dbTx.transaction_hash,
                        vout: voutIndex,
                        value: Math.round(amount * 1e8), // Convert to satoshis
                        scriptPubKey: output.scriptPubKey.hex,
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (utxoError) {
          console.warn(`Error checking UTXO for transaction ${dbTx.transaction_hash}:`, utxoError);
        }
      }

      if (utxos.length === 0) {
        throw new Error('No UTXOs found for this wallet. Please ensure the wallet has received funds.');
      }

      // Select UTXOs to cover the amount + fees
      const amountSatoshis = Math.round(amountToSend * 1e8);
      const feeSatoshis = Math.round(ESTIMATED_FEE_BTC * 1e8);
      const totalNeededSatoshis = amountSatoshis + feeSatoshis;

      // Sort UTXOs by value (descending) for efficient selection
      utxos.sort((a, b) => b.value - a.value);

      const selectedUtxos: any[] = [];
      let totalSelectedSatoshis = 0;

      for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalSelectedSatoshis += utxo.value;
        if (totalSelectedSatoshis >= totalNeededSatoshis) {
          break;
        }
      }

      if (totalSelectedSatoshis < totalNeededSatoshis) {
        throw new Error(`Insufficient UTXOs. Found ${totalSelectedSatoshis} satoshis, need ${totalNeededSatoshis} satoshis.`);
      }

      // Calculate change (if any)
      const changeSatoshis = totalSelectedSatoshis - totalNeededSatoshis;

      // Build PSBT (Partially Signed Bitcoin Transaction)
      const psbt = new Psbt({ network });

      // Add inputs
      for (const utxo of selectedUtxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          nonWitnessUtxo: Buffer.from(await getRawTransaction(utxo.txid, alchemyUrl), 'hex'),
        });
      }

      // Add outputs
      // Output 1: Destination address
      psbt.addOutput({
        address: destination_address,
        value: amountSatoshis,
      });

      // Output 2: Change address (if change > dust threshold)
      const DUST_THRESHOLD = 546; // Minimum satoshis (dust threshold)
      if (changeSatoshis > DUST_THRESHOLD) {
        psbt.addOutput({
          address: btcWallet.address, // Change goes back to sender
          value: changeSatoshis,
        });
      } else {
        // If change is too small, add it to the fee
        console.log(`Change amount ${changeSatoshis} satoshis is below dust threshold, adding to fee`);
      }

      // Sign all inputs
      console.log('✍️  Signing transaction with decrypted private key...');
      for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, keyPair);
      }

      // Validate signatures
      psbt.validateSignaturesOfAllInputs(bitcoin.validator);
      
      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      signedTxHex = tx.toHex();
      
      console.log('✅ Transaction signed successfully');
      
      // IMMEDIATELY clear private key from memory
      privateKey = null;
      console.log('🗑️  Decrypted private key cleared from memory');
      
    } catch (error: any) {
      // Ensure private key is cleared even on error
      privateKey = null;
      
      console.error('❌ Error during decryption/signing:', error);
      
      let errorMessage = 'Failed to process transaction';
      if (error.message?.includes('decrypt')) {
        errorMessage = 'Failed to decrypt private key. The encryption key may not match.';
      } else if (error.message?.includes('UTXO')) {
        errorMessage = error.message;
      } else if (error.message?.includes('Insufficient')) {
        errorMessage = error.message;
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: error.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify we have a signed transaction before proceeding
    if (!signedTxHex) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to sign transaction'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ============================================================
    // BROADCAST TRANSACTION
    // ============================================================
    // At this point, the private key has been discarded.
    // Only the signed transaction (which doesn't contain the private key) is sent.
    // ============================================================
    
    // Send transaction via Alchemy Bitcoin API
    console.log('📡 Broadcasting signed transaction to network...');
    const sendResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'sendrawtransaction',
        params: [signedTxHex],
        id: 3,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('❌ Error sending transaction:', errorText);
      
      // Clear signed transaction from memory
      signedTxHex = null;
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to send transaction",
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sendData = await sendResponse.json();
    const txHash = sendData.result;

    // Clear signed transaction from memory immediately after broadcasting
    signedTxHex = null;

    if (!txHash || sendData.error) {
      const errorMsg = sendData.error?.message || 'Transaction failed - no transaction hash returned';
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: sendData
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ============================================================
    // TRANSACTION BROADCAST SUCCESSFUL
    // ============================================================
    // At this point:
    //   - Private key has been discarded (cleared from memory)
    //   - Signed transaction has been broadcast and cleared
    //   - Only transaction hash is retained (safe to store)
    // ============================================================
    console.log(`✅ Transaction broadcast successful: ${txHash}`);
    console.log(`🗑️  Private key and signed transaction cleared from memory`);

    // CRITICAL: Check if this transaction was already processed to prevent duplicate debits
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_hash', txHash)
      .eq('user_id', user.id)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'BTC')
      .limit(1);

    let transactionRecord: any = null;

    if (existingTx && existingTx.length > 0) {
      console.log(`⚠️ Transaction ${txHash.substring(0, 16)}... already processed. Skipping debit to prevent duplicate.`);
      transactionRecord = existingTx[0];
      return new Response(
        JSON.stringify({
          success: true,
          transaction_hash: txHash,
          amount: amountToSend.toString(),
          fee: ESTIMATED_FEE_BTC.toString(),
          platform_fee: platformFee.toString(),
          message: 'BTC sent successfully (already processed)',
          already_processed: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 1: Record transaction FIRST (before debiting balance)
    // CRITICAL: Transaction MUST be recorded - retry if it fails
    let recordAttempts = 0;
    const maxRecordAttempts = 3;
    let recordSuccess = false;

    while (!recordSuccess && recordAttempts < maxRecordAttempts) {
      try {
        const transactionData = {
          user_id: user.id,
          transaction_type: 'SEND',
          crypto_currency: 'BTC',
          network: 'mainnet',
          crypto_amount: amountToSend.toString(),
          from_address: btcWallet.address,
          to_address: destination_address,
          transaction_hash: txHash,
          status: 'PENDING',
          metadata: {
            network_fee: ESTIMATED_FEE_BTC.toString(),
            platform_fee: platformFee.toString(),
            platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
            source: 'send-bitcoin-transaction',
            debit_pending: true,
          },
        };
        
        console.log(`📝 Attempting to record transaction (attempt ${recordAttempts + 1}/${maxRecordAttempts}):`, {
          transaction_hash: txHash.substring(0, 16) + '...',
          user_id: user.id,
          amount: amountToSend.toString(),
        });
        
        const { data: newTransactionRecord, error: txError } = await supabase
          .from('transactions')
          .insert(transactionData)
          .select()
          .single();

        if (txError) {
          console.error(`❌ Error recording transaction (attempt ${recordAttempts + 1}/${maxRecordAttempts}):`, txError);
          
          if (txError.code === '23505' || txError.message?.includes('duplicate') || txError.message?.includes('unique')) {
            console.log('⚠️ Transaction already exists, fetching existing record...');
            const { data: existingRecord } = await supabase
              .from('transactions')
              .select('*')
              .eq('transaction_hash', txHash)
              .eq('user_id', user.id)
              .eq('transaction_type', 'SEND')
              .eq('crypto_currency', 'BTC')
              .single();
            
            if (existingRecord) {
              transactionRecord = existingRecord;
              recordSuccess = true;
              console.log(`✅ Found existing transaction record: ${existingRecord.id}`);
              break;
            }
          }
          
          recordAttempts++;
          if (recordAttempts < maxRecordAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (recordAttempts + 1)));
            continue;
          } else {
            console.error('❌ CRITICAL: Failed to record transaction after all retries.');
            console.error(`   Transaction hash: ${txHash}`);
            console.error(`   Error details:`, txError);
            try {
              const { data: lastAttemptRecord, error: lastAttemptError } = await supabase
                .from('transactions')
                .insert(transactionData)
                .select()
                .single();
              
              if (!lastAttemptError && lastAttemptRecord) {
                console.log(`✅ Transaction recorded on final attempt: ${lastAttemptRecord.id}`);
                transactionRecord = lastAttemptRecord;
                recordSuccess = true;
              } else {
                console.error(`❌ Final recording attempt also failed:`, lastAttemptError);
              }
            } catch (finalErr: any) {
              console.error(`❌ Exception on final recording attempt:`, finalErr);
            }
          }
        } else {
          console.log(`✅ Transaction recorded in database: ${newTransactionRecord.id}`);
          transactionRecord = newTransactionRecord;
          recordSuccess = true;
        }
      } catch (recordErr: any) {
        console.error(`❌ Exception recording transaction (attempt ${recordAttempts + 1}):`, recordErr);
        recordAttempts++;
        if (recordAttempts >= maxRecordAttempts) {
          console.error('❌ CRITICAL: Failed to record transaction after all retries.');
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * (recordAttempts + 1)));
        }
      }
    }

    // CRITICAL: Ensure transaction is recorded before proceeding
    if (!transactionRecord || !transactionRecord.id) {
      console.error('❌ CRITICAL: Transaction was sent on-chain but recording failed completely.');
      console.error(`   Transaction hash: ${txHash}`);
      console.error(`   Attempting emergency recording...`);
      
      try {
        const { data: emergencyRecord, error: emergencyError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            transaction_type: 'SEND',
            crypto_currency: 'BTC',
            network: 'mainnet',
            crypto_amount: amountToSend.toString(),
            from_address: btcWallet.address,
            to_address: destination_address,
            transaction_hash: txHash,
            status: 'PENDING',
            error_message: 'Transaction recorded in emergency handler - original recording failed',
            metadata: {
              network_fee: ESTIMATED_FEE_BTC.toString(),
              platform_fee: platformFee.toString(),
              platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
              source: 'send-bitcoin-transaction',
              debit_pending: true,
              emergency_recording: true,
              original_recording_failed: true,
            },
          })
          .select()
          .single();
        
        if (!emergencyError && emergencyRecord) {
          console.log(`✅ Emergency recording successful: ${emergencyRecord.id}`);
          transactionRecord = emergencyRecord;
        } else {
          console.error(`❌ Emergency recording also failed:`, emergencyError);
          console.error(`   ⚠️ Transaction ${txHash} was sent but NOT recorded in database.`);
        }
      } catch (emergencyErr: any) {
        console.error(`❌ Exception during emergency recording:`, emergencyErr);
        console.error(`   ⚠️ Transaction ${txHash} was sent but NOT recorded in database.`);
      }
    }

    // Send push notification when transaction is sent (only if recording succeeded)
    if (transactionRecord) {
      try {
        await sendCryptoSendNotification({
          supabase,
          userId: user.id,
          cryptoCurrency: 'BTC',
          amount: amountToSend,
          transactionHash: txHash,
          toAddress: destination_address,
          confirmations: 0,
          status: 'PENDING',
        });
      } catch (notifError) {
        console.error('⚠️ Failed to send notification:', notifError);
      }
    }

    // STEP 2: Debit BTC balance (amount + network fee + platform fee)
    const totalDebit = amountToSend + ESTIMATED_FEE_BTC + platformFee;
    
    const { data: balanceBeforeDebit } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'BTC')
      .single();
    
    const balanceBeforeDebitAmount = balanceBeforeDebit ? parseFloat(balanceBeforeDebit.balance || '0') : 0;
    console.log(`📊 Balance before debit: ${balanceBeforeDebitAmount} BTC, Debit amount: ${totalDebit} BTC`);
    
    const { error: debitError } = await supabase.rpc('debit_crypto_wallet', {
      p_user_id: user.id,
      p_amount: totalDebit,
      p_currency: 'BTC',
    });

    // Record admin revenue from platform fee (only if debit succeeded and fee was charged)
    if (platformFee > 0 && !debitError && transactionRecord?.id) {
      try {
        await supabase.rpc('record_admin_revenue', {
          p_revenue_type: 'SEND_FEE',
          p_source: 'BITCOIN_SEND',
          p_amount: platformFee,
          p_currency: 'BTC',
          p_fee_percentage: PLATFORM_FEE_PERCENTAGE * 100, // Convert to percentage (3.00)
          p_base_amount: amountToSend,
          p_transaction_id: transactionRecord.id,
          p_user_id: user.id,
          p_metadata: {
            transaction_hash: txHash,
            network_fee: ESTIMATED_FEE_BTC,
            send_amount: amountToSend,
            destination_address: destination_address,
          },
          p_notes: `Platform fee from Bitcoin send transaction`,
        });
        console.log(`✅ Recorded admin revenue: ${platformFee.toFixed(8)} BTC from send fee`);
      } catch (revenueError) {
        console.error('⚠️ Error recording admin revenue (non-critical):', revenueError);
        // Don't fail the transaction if revenue recording fails
      }
    }

    if (debitError) {
      console.error('❌ Error debiting BTC balance:', debitError);
      
      // Update transaction status to reflect debit failure
      if (transactionRecord?.id) {
        await supabase
          .from('transactions')
          .update({
            status: 'FAILED',
            error_message: `Failed to debit balance: ${debitError.message || JSON.stringify(debitError)}`,
            metadata: {
              ...(transactionRecord.metadata || {}),
              debit_failed: true,
              debit_error: debitError.message || JSON.stringify(debitError),
            },
          })
          .eq('id', transactionRecord.id);
      }
      
      // Try manual balance update as fallback
      try {
        const newBalance = Math.max(0, balanceBeforeDebitAmount - totalDebit);
        const { error: manualUpdateError } = await supabase
          .from('wallet_balances')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('currency', 'BTC');
        
        if (manualUpdateError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Transaction sent but failed to update balance. Transaction hash: " + txHash,
              transaction_hash: txHash,
              transaction_id: transactionRecord?.id,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (fallbackError: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Transaction sent but failed to update balance. Transaction hash: " + txHash,
            transaction_hash: txHash,
            transaction_id: transactionRecord?.id,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log(`✅ Successfully debited ${totalDebit} BTC from user ${user.id}`);
      
      // Verify balance was updated
      const { data: balanceAfterDebit } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', user.id)
        .eq('currency', 'BTC')
        .single();
      
      const balanceAfterDebitAmount = balanceAfterDebit ? parseFloat(balanceAfterDebit.balance || '0') : 0;
      const expectedBalance = balanceBeforeDebitAmount - totalDebit;
      
      if (Math.abs(balanceAfterDebitAmount - expectedBalance) > 0.00000001) {
        console.error(`⚠️ Balance mismatch after debit!`);
        // Try to fix it
        await supabase
          .from('wallet_balances')
          .update({ 
            balance: expectedBalance,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('currency', 'BTC');
      }
      
      // Update transaction to mark debit as completed
      if (transactionRecord?.id) {
        await supabase
          .from('transactions')
          .update({
            metadata: {
              ...(transactionRecord.metadata || {}),
              debit_completed: true,
              debit_completed_at: new Date().toISOString(),
              balance_before_debit: balanceBeforeDebitAmount.toString(),
              balance_after_debit: balanceAfterDebitAmount.toString(),
            },
          })
          .eq('id', transactionRecord.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_hash: txHash,
        transaction_id: transactionRecord?.id,
        amount: amountToSend.toString(),
        network_fee: ESTIMATED_FEE_BTC.toString(),
        platform_fee: platformFee.toString(),
        total_fee: (ESTIMATED_FEE_BTC + platformFee).toString(),
        message: 'Transaction sent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Send Bitcoin transaction error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Decrypt private key using AES-256-GCM
 * Uses Web Crypto API with PBKDF2 key derivation
 * 
 * SECURITY WARNING: This function is ONLY called from send-bitcoin-transaction.
 * Private keys are decrypted ONLY when sending BTC transactions.
 * 
 * The decrypted private key:
 *   - Exists ONLY in memory
 *   - Is NEVER logged or exposed
 *   - Is immediately discarded after signing the transaction
 *   - Is NEVER returned to the client
 * 
 * @param encryptedKey - Base64-encoded encrypted private key from database
 * @param encryptionKey - Encryption key from environment variable
 * @returns Plaintext private key (WIF or hex format) - MUST be discarded immediately after use
 */
async function decryptPrivateKey(encryptedKey: string, encryptionKey: string): Promise<string> {
  try {
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    
    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Derive decryption key
    const keyData = new TextEncoder().encode(encryptionKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decrypt private key
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error: any) {
    console.error('Error decrypting private key:', error);
    
    if (error.message?.includes('OperationError') || error.message?.includes('decrypt')) {
      throw new Error('Decryption failed - the encryption key may not match the one used to encrypt this key');
    } else if (error.message?.includes('Invalid')) {
      throw new Error('Invalid encrypted key format');
    }
    
    throw new Error(`Failed to decrypt private key: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Helper function to get raw transaction hex
 */
async function getRawTransaction(txid: string, alchemyUrl: string): Promise<string> {
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getrawtransaction',
      params: [txid, false], // false = return hex string
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get raw transaction: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Error getting raw transaction: ${data.error.message}`);
  }

  return data.result;
}

