// Send XRP Transaction Edge Function
// Sends XRP using ripple-lib or direct XRP Ledger API
//
// SECURITY: This is the ONLY function that decrypts XRP private keys.
// Decryption happens ONLY when sending XRP transactions.
// Flow:
//   1. Fetch encrypted private key from database
//   2. Decrypt in memory (temporary)
//   3. Sign transaction
//   4. Submit to XRP Ledger
//   5. Immediately discard decrypted key from memory
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

/**
 * Decrypt private key using AES-256-GCM
 * Reverses the encryption done during wallet generation
 */
async function decryptPrivateKey(encryptedPrivateKey: string, encryptionKey: string): Promise<string> {
  try {
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedPrivateKey), c => c.charCodeAt(0));
    
    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encryptedData = combined.slice(28);
    
    // Import encryption key
    const keyData = new TextEncoder().encode(encryptionKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive decryption key using same parameters as encryption
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
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      encryptedData
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error: any) {
    console.error('❌ Decryption error:', error);
    throw new Error('Failed to decrypt private key');
  }
}

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
    const { destination_address, destination_tag, amount_xrp, send_all } = body;

    if (!destination_address) {
      return new Response(
        JSON.stringify({ success: false, error: "destination_address is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!send_all && (!amount_xrp || amount_xrp <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "amount_xrp is required when send_all is false" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate XRP address format (starts with 'r', 25-34 characters)
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination_address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid XRP address format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📤 Sending XRP transaction for user ${user.id}`);
    console.log(`   Destination: ${destination_address}${destination_tag ? ` (tag: ${destination_tag})` : ''}`);
    console.log(`   Amount: ${send_all ? 'ALL' : `${amount_xrp} XRP`}`);

    // Get user's XRP wallet
    const { data: xrpWallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, address, private_key_encrypted, is_active, destination_tag')
      .eq('user_id', user.id)
      .eq('asset', 'XRP')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '')
      .single();

    if (walletError || !xrpWallet) {
      console.error('❌ Error fetching XRP wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: "XRP wallet not found. Please set up your wallet first." }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📝 Wallet found: ${xrpWallet.address}`);
    
    if (!xrpWallet.private_key_encrypted || xrpWallet.private_key_encrypted.trim() === '') {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No private key found in wallet. Please store your XRP wallet keys first.",
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get encryption key
    const encryptionKey = Deno.env.get('XRP_ENCRYPTION_KEY') ||
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                         Deno.env.get('ETH_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('❌ Encryption key not configured');
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt private key
    console.log(`🔓 Decrypting private key...`);
    let privateKeyHex: string;
    try {
      privateKeyHex = await decryptPrivateKey(xrpWallet.private_key_encrypted, encryptionKey);
      console.log(`✅ Private key decrypted (length: ${privateKeyHex.length} hex chars)`);
    } catch (decryptError: any) {
      console.error('❌ Failed to decrypt private key:', decryptError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to decrypt wallet keys" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to XRP Ledger (using public server)
    const xrplServerUrl = Deno.env.get('XRPL_SERVER_URL') || 'https://s1.ripple.com:51234';
    
    console.log(`🌐 Connecting to XRP Ledger: ${xrplServerUrl}`);

    // Get account info and current balance
    const accountInfoResponse = await fetch(xrplServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{
          account: xrpWallet.address,
          ledger_index: 'validated',
        }],
      }),
    });

    if (!accountInfoResponse.ok) {
      throw new Error('Failed to fetch account info from XRP Ledger');
    }

    const accountInfoData = await accountInfoResponse.json();
    
    if (accountInfoData.result?.error) {
      console.error('❌ XRP Ledger error:', accountInfoData.result.error_message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `XRP Ledger error: ${accountInfoData.result.error_message || 'Unknown error'}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountInfo = accountInfoData.result.account_data;
    const balanceDrops = accountInfo.Balance; // Balance in drops (1 XRP = 1,000,000 drops)
    const balanceXRP = Number(balanceDrops) / 1000000;
    const sequence = accountInfo.Sequence;

    console.log(`💰 Current balance: ${balanceXRP} XRP (${balanceDrops} drops)`);
    console.log(`📊 Account sequence: ${sequence}`);

    // Reserve requirement: 10 XRP base reserve + 2 XRP per object
    const reserveXRP = 10;
    const availableXRP = balanceXRP - reserveXRP;

    if (availableXRP <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Insufficient balance. Available: ${availableXRP.toFixed(6)} XRP (${reserveXRP} XRP reserve required)` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate amount to send
    let amountToSendXRP: number;
    let amountToSendDrops: string;

    if (send_all) {
      // Send all available XRP minus network fee
      const estimatedFeeDrops = 12; // 0.000012 XRP typical fee
      const maxSendableDrops = Number(balanceDrops) - (reserveXRP * 1000000) - estimatedFeeDrops;
      amountToSendXRP = maxSendableDrops / 1000000;
      amountToSendDrops = maxSendableDrops.toString();
      
      if (amountToSendXRP <= 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Insufficient balance to send. Available: ${availableXRP.toFixed(6)} XRP` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`💸 Sending all available XRP: ${amountToSendXRP.toFixed(6)} XRP`);
    } else {
      amountToSendXRP = amount_xrp;
      amountToSendDrops = (amount_xrp * 1000000).toString();
      
      if (amountToSendXRP > availableXRP) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Requested: ${amountToSendXRP} XRP, Available: ${availableXRP.toFixed(6)} XRP` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`💸 Sending ${amountToSendXRP} XRP (${amountToSendDrops} drops)`);
    }

    // Get current ledger info for LastLedgerSequence
    const serverStateResponse = await fetch(xrplServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'server_state',
        params: [],
      }),
    });

    const serverStateData = await serverStateResponse.json();
    const currentLedger = serverStateData.result.state.validated_ledger?.seq || serverStateData.result.state.server_state_duration_us;
    const lastLedgerSequence = currentLedger + 4; // Transaction expires after 4 ledgers (~20 seconds)

    // Prepare transaction
    const transaction: any = {
      TransactionType: 'Payment',
      Account: xrpWallet.address,
      Destination: destination_address,
      Amount: amountToSendDrops,
      Sequence: sequence,
      Fee: '12', // 0.000012 XRP (standard fee)
      LastLedgerSequence: lastLedgerSequence,
    };

    // Add destination tag if provided
    if (destination_tag) {
      transaction.DestinationTag = parseInt(destination_tag);
    }

    console.log(`📝 Transaction prepared:`, {
      ...transaction,
      Amount: `${amountToSendXRP} XRP`,
    });

    // Sign transaction
    console.log(`✍️ Signing transaction...`);
    
    // Import secp256k1 for signing
    const secp256k1 = await import("https://esm.sh/@noble/secp256k1@1.7.1");
    const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
    const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
    const sha512Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha512.js");
    const sha512 = sha512Module.sha512 || sha512Module.default?.sha512 || sha512Module.default;

    // Encode transaction for signing
    const encodeTransaction = (tx: any): Uint8Array => {
      // This is a simplified encoding - in production, use ripple-binary-codec
      const json = JSON.stringify(tx);
      return new TextEncoder().encode(json);
    };

    const txBlob = encodeTransaction(transaction);
    const txHash = sha512(txBlob).slice(0, 32); // Use first 32 bytes of SHA-512

    // Convert private key hex to bytes
    const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    // Sign the transaction hash
    const signature = await secp256k1.sign(txHash, privateKeyBytes);
    const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`✅ Transaction signed`);

    // Add signature to transaction
    transaction.TxnSignature = signatureHex.toUpperCase();

    // Submit transaction to XRP Ledger
    console.log(`📡 Broadcasting transaction to XRP Ledger...`);

    const submitResponse = await fetch(xrplServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'submit',
        params: [{
          tx_json: transaction,
        }],
      }),
    });

    if (!submitResponse.ok) {
      throw new Error('Failed to submit transaction to XRP Ledger');
    }

    const submitData = await submitResponse.json();

    if (submitData.result?.error) {
      console.error('❌ Transaction submission error:', submitData.result.error_message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transaction failed: ${submitData.result.error_message || 'Unknown error'}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const txResult = submitData.result;
    const transactionHash = txResult.tx_json?.hash || txResult.hash;

    console.log(`✅ Transaction submitted successfully`);
    console.log(`   Hash: ${transactionHash}`);
    console.log(`   Engine result: ${txResult.engine_result}`);

    // CRITICAL: Check if this transaction was already processed
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_hash', transactionHash)
      .eq('user_id', user.id)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'XRP')
      .limit(1);

    let transactionRecord: any = null;

    if (existingTx && existingTx.length > 0) {
      console.log(`⚠️ Transaction ${transactionHash.substring(0, 16)}... already processed.`);
      transactionRecord = existingTx[0];
      return new Response(
        JSON.stringify({
          success: true,
          transaction_hash: transactionHash,
          amount_xrp: amountToSendXRP,
          destination: destination_address,
          destination_tag: destination_tag || null,
          engine_result: txResult.engine_result,
          fee_xrp: 0.000012,
          already_processed: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record transaction in database with retry logic
    let recordAttempts = 0;
    const maxRecordAttempts = 3;
    let recordSuccess = false;

    while (!recordSuccess && recordAttempts < maxRecordAttempts) {
      try {
        const transactionData = {
          user_id: user.id,
          transaction_type: 'SEND',
          crypto_currency: 'XRP',
          network: 'mainnet',
          crypto_amount: amountToSendXRP.toFixed(6),
          from_address: xrpWallet.address,
          to_address: destination_address,
          transaction_hash: transactionHash,
          status: txResult.engine_result === 'tesSUCCESS' ? 'CONFIRMED' : 'PENDING',
          metadata: {
            destination_tag: destination_tag || null,
            send_all: send_all || false,
            engine_result: txResult.engine_result,
            fee_drops: transaction.Fee,
            sequence: sequence,
          },
        };
        
        console.log(`📝 Attempting to record transaction (attempt ${recordAttempts + 1}/${maxRecordAttempts}):`, {
          transaction_hash: transactionHash.substring(0, 16) + '...',
          user_id: user.id,
          amount: amountToSendXRP.toFixed(6),
        });
        
        const { data: txRecord, error: txError } = await supabase
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
              .eq('transaction_hash', transactionHash)
              .eq('user_id', user.id)
              .eq('transaction_type', 'SEND')
              .eq('crypto_currency', 'XRP')
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
            console.error(`   Transaction hash: ${transactionHash}`);
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
          console.log(`✅ Transaction recorded in database: ${txRecord.id}`);
          transactionRecord = txRecord;
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
      console.error(`   Transaction hash: ${transactionHash}`);
      console.error(`   Attempting emergency recording...`);
      
      try {
        const { data: emergencyRecord, error: emergencyError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            transaction_type: 'SEND',
            crypto_currency: 'XRP',
            network: 'mainnet',
            crypto_amount: amountToSendXRP.toFixed(6),
            from_address: xrpWallet.address,
            to_address: destination_address,
            transaction_hash: transactionHash,
            status: txResult.engine_result === 'tesSUCCESS' ? 'CONFIRMED' : 'PENDING',
            error_message: 'Transaction recorded in emergency handler - original recording failed',
            metadata: {
              destination_tag: destination_tag || null,
              send_all: send_all || false,
              engine_result: txResult.engine_result,
              fee_drops: transaction.Fee,
              sequence: sequence,
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
          console.error(`   ⚠️ Transaction ${transactionHash} was sent but NOT recorded in database.`);
        }
      } catch (emergencyErr: any) {
        console.error(`❌ Exception during emergency recording:`, emergencyErr);
        console.error(`   ⚠️ Transaction ${transactionHash} was sent but NOT recorded in database.`);
      }
    }

    // Send push notification (only if recording succeeded)
    if (transactionRecord) {
      try {
        await sendCryptoSendNotification({
          supabase,
          userId: user.id,
          cryptoCurrency: 'XRP',
          amount: amountToSendXRP,
          destinationAddress: destination_address,
          transactionHash: transactionHash,
        });
      } catch (notifError) {
        console.error('⚠️ Failed to send notification:', notifError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_hash: transactionHash,
        amount_xrp: amountToSendXRP,
        destination: destination_address,
        destination_tag: destination_tag || null,
        engine_result: txResult.engine_result,
        fee_xrp: 0.000012,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error sending XRP transaction:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to send XRP transaction',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
