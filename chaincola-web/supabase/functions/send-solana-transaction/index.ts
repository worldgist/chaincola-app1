// Send Solana Transaction Edge Function
// Sends SOL using Solana RPC
//
// SECURITY: This is the ONLY function that decrypts SOL private keys.
// Decryption happens ONLY when sending SOL transactions.
// Flow:
//   1. Fetch encrypted private key from database
//   2. Decrypt in memory (temporary)
//   3. Sign transaction
//   4. Broadcast transaction
//   5. Immediately discard decrypted key from memory
//
// Private keys are NEVER:
//   - Logged or exposed
//   - Stored in plaintext
//   - Decrypted for any other purpose
//   - Returned to the client

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.87.6";
import { sendCryptoSendNotification } from "../_shared/send-crypto-send-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLATFORM_FEE_PERCENTAGE = 0.03; // 3% platform fee
const ESTIMATED_FEE_SOL = 0.0001; // Estimated network fee for SOL transfer (very low)

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Variables to track transaction state for error handling
  let signature: string | undefined;
  let amountToSend: number | undefined;
  let platformFee: number | undefined;
  let solWallet: any;
  let destination_address: string | undefined;
  let transactionRecord: any = null;
  let user: any;

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
    const { destination_address, amount_sol, send_all, skip_platform_fee } = body;

    if (!destination_address) {
      return new Response(
        JSON.stringify({ success: false, error: "destination_address is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!send_all && (!amount_sol || amount_sol <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "amount_sol is required when send_all is false" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Solana address format (base58, 32-44 characters)
    try {
      new PublicKey(destination_address);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Solana address format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Solana wallet
    const { data: solWallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, address, private_key_encrypted, is_active')
      .eq('user_id', user.id)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (walletError || !solWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Solana wallet not found or private key not available" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt private key
    const encryptionKey = Deno.env.get('SOL_ENCRYPTION_KEY') || 
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') || 
                         Deno.env.get('ETH_ENCRYPTION_KEY');
    
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Encryption key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let privateKeyHex: string;
    try {
      privateKeyHex = await decryptPrivateKey(solWallet.private_key_encrypted, encryptionKey);
    } catch (decryptError: any) {
      console.error('Decryption error:', decryptError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to decrypt private key: ${decryptError.message}. Please ensure the encryption key matches the one used to encrypt the private key.` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert hex private key to Uint8Array for Solana Keypair
    // Solana secretKey is 64 bytes (128 hex characters)
    const privateKeyBytes = new Uint8Array(
      privateKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    if (privateKeyBytes.length !== 64) {
      console.error(`Invalid private key length: ${privateKeyBytes.length} bytes (expected 64 bytes, ${privateKeyHex.length} hex chars)`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid private key format. Expected 64 bytes (128 hex characters), got ${privateKeyBytes.length} bytes (${privateKeyHex.length} hex characters)` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create keypair from secret key (64 bytes)
    // Solana's Keypair.fromSecretKey expects the full 64-byte secretKey
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // Verify the address matches
    if (keypair.publicKey.toBase58() !== solWallet.address) {
      console.error(`Address mismatch: stored=${solWallet.address}, derived=${keypair.publicKey.toBase58()}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Private key does not match stored wallet address' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to Solana RPC
    const solanaRpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(solanaRpcUrl, 'confirmed');

    // Get balance
    const balance = await connection.getBalance(keypair.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;

    // Calculate amounts
    let amountToSend: number;
    let platformFee: number;

    if (send_all) {
      // Send all SOL minus fees
      const totalFees = ESTIMATED_FEE_SOL + (skip_platform_fee ? 0 : (balanceSOL * PLATFORM_FEE_PERCENTAGE));
      const maxSendable = Math.max(0, balanceSOL - totalFees);
      
      if (maxSendable <= 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance to send all. Available: ${balanceSOL.toFixed(9)} SOL, but fees exceed available balance.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      amountToSend = maxSendable;
      platformFee = skip_platform_fee ? 0 : (amountToSend * PLATFORM_FEE_PERCENTAGE);
    } else {
      amountToSend = parseFloat(amount_sol);
      platformFee = skip_platform_fee ? 0 : (amountToSend * PLATFORM_FEE_PERCENTAGE);
      
      const totalRequired = amountToSend + ESTIMATED_FEE_SOL + platformFee;

      if (balanceSOL < totalRequired) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance. Available: ${balanceSOL.toFixed(9)} SOL, Required: ${totalRequired.toFixed(9)} SOL`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (amountToSend <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Amount must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create transaction
    const recipientPubKey = new PublicKey(destination_address);
    const lamportsToSend = Math.floor(amountToSend * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPubKey,
        lamports: lamportsToSend,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign and send transaction
    console.log(`📤 Sending ${amountToSend.toFixed(9)} SOL from ${keypair.publicKey.toBase58()} to ${destination_address}`);
    
    let signature: string;
    try {
      // Use sendAndConfirmTransaction with timeout handling
      signature = await Promise.race([
        sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair],
          { commitment: 'confirmed' }
        ),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
        )
      ]) as string;
      
      console.log(`✅ Transaction confirmed: ${signature}`);
    } catch (txError: any) {
      // If confirmation times out, try to get the signature from sendTransaction
      if (txError.message?.includes('timeout')) {
        console.warn('⚠️ Transaction confirmation timed out, trying to get signature...');
        
        try {
          // Send transaction without waiting for confirmation
          const txSignature = await connection.sendTransaction(transaction, [keypair], {
            skipPreflight: false,
            maxRetries: 3,
          });
          
          signature = txSignature;
          console.log(`✅ Transaction sent (signature: ${signature}), confirmation pending`);
          
          // Wait a bit and check status
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const status = await connection.getSignatureStatus(signature);
          if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed after timeout check`);
          } else {
            console.log(`⏳ Transaction still confirming: ${status.value?.confirmationStatus || 'unknown'}`);
          }
        } catch (sendError: any) {
          console.error('❌ Failed to send transaction:', sendError);
          throw new Error(`Failed to send transaction: ${sendError.message}`);
        }
      } else {
        throw txError;
      }
    }

    // Clear private key from memory
    privateKeyHex = '';
    privateKeyBytes.fill(0);

    // CRITICAL: Check if this transaction was already processed to prevent duplicate debits
    // This ensures idempotency - if the function is called multiple times with the same signature,
    // we won't debit multiple times
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_hash', signature)
      .eq('user_id', user.id)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'SOL')
      .limit(1);

    let transactionRecord: any = null;

    if (existingTx && existingTx.length > 0) {
      console.log(`⚠️ Transaction ${signature.substring(0, 16)}... already processed. Skipping debit to prevent duplicate.`);
      transactionRecord = existingTx[0];
      // Transaction already exists - return success without debiting again
      return new Response(
        JSON.stringify({
          success: true,
          transaction_hash: signature,
          amount: amountToSend.toString(),
          fee: ESTIMATED_FEE_SOL.toString(),
          platform_fee: platformFee.toString(),
          message: 'SOL sent successfully (already processed)',
          already_processed: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 1: Record transaction FIRST (before debiting balance)
    // This ensures we have a record even if debit fails
    // CRITICAL: Transaction MUST be recorded - retry if it fails
    let recordAttempts = 0;
    const maxRecordAttempts = 3;
    let recordSuccess = false;

    while (!recordSuccess && recordAttempts < maxRecordAttempts) {
      try {
        const transactionData = {
          user_id: user.id,
          transaction_type: 'SEND',
          crypto_currency: 'SOL',
          network: 'mainnet',
          crypto_amount: amountToSend.toString(),
          from_address: solWallet.address,
          to_address: destination_address,
          transaction_hash: signature,
          status: 'PENDING',
          fee_amount: ESTIMATED_FEE_SOL.toString(),
          fee_currency: 'SOL',
          metadata: {
            platform_fee: platformFee.toString(),
            platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
            source: 'send-solana-transaction',
            debit_pending: true,
            send_all: send_all || false,
            skip_platform_fee: skip_platform_fee || false,
          },
        };
        
        console.log(`📝 Attempting to record transaction (attempt ${recordAttempts + 1}/${maxRecordAttempts}):`, {
          transaction_hash: signature.substring(0, 16) + '...',
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
          
          // Check if it's a duplicate key error (transaction already exists)
          if (txError.code === '23505' || txError.message?.includes('duplicate') || txError.message?.includes('unique')) {
            console.log('⚠️ Transaction already exists, fetching existing record...');
            // Fetch the existing transaction
            const { data: existingRecord } = await supabase
              .from('transactions')
              .select('*')
              .eq('transaction_hash', signature)
              .eq('user_id', user.id)
              .eq('transaction_type', 'SEND')
              .eq('crypto_currency', 'SOL')
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
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (recordAttempts + 1)));
            continue;
          } else {
            // CRITICAL: If we can't record the transaction, we MUST still proceed
            // because the SOL was already sent on-chain. Log this as a critical error.
            console.error('❌ CRITICAL: Failed to record transaction after all retries. Transaction was sent on-chain but not recorded in database.');
            console.error(`   Transaction hash: ${signature}`);
            console.error(`   Error details:`, txError);
            console.error(`   This requires manual intervention to record the transaction.`);
            // Try one more time with a direct insert without select to see if that works
            try {
              const { data: lastAttemptRecord, error: lastAttemptError } = await supabase
                .from('transactions')
                .insert({
                  user_id: user.id,
                  transaction_type: 'SEND',
                  crypto_currency: 'SOL',
                  network: 'mainnet',
                  crypto_amount: amountToSend.toString(),
                  from_address: solWallet.address,
                  to_address: destination_address,
                  transaction_hash: signature,
                  status: 'PENDING',
                  fee_amount: ESTIMATED_FEE_SOL.toString(),
                  fee_currency: 'SOL',
                  metadata: {
                    platform_fee: platformFee.toString(),
                    platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
                    source: 'send-solana-transaction',
                    debit_pending: true,
                    send_all: send_all || false,
                    skip_platform_fee: skip_platform_fee || false,
                    recording_retry: true,
                  },
                })
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
            // Continue even if recording failed - transaction was sent on-chain
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
    // If recording failed completely, try one emergency attempt
    if (!transactionRecord || !transactionRecord.id) {
      console.error('❌ CRITICAL: Transaction was sent on-chain but recording failed completely.');
      console.error(`   Transaction hash: ${signature}`);
      console.error(`   Attempting emergency recording...`);
      
      try {
        // Emergency recording attempt with minimal fields
        const { data: emergencyRecord, error: emergencyError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            transaction_type: 'SEND',
            crypto_currency: 'SOL',
            network: 'mainnet',
            crypto_amount: amountToSend.toString(),
            from_address: solWallet.address,
            to_address: destination_address,
            transaction_hash: signature,
            status: 'PENDING',
            fee_amount: ESTIMATED_FEE_SOL.toString(),
            fee_currency: 'SOL',
            error_message: 'Transaction recorded in emergency handler - original recording failed',
            metadata: {
              platform_fee: platformFee.toString(),
              platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
              source: 'send-solana-transaction',
              debit_pending: true,
              send_all: send_all || false,
              skip_platform_fee: skip_platform_fee || false,
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
          // Still proceed - transaction was sent on-chain, but log this as critical
          console.error(`   ⚠️ Transaction ${signature} was sent but NOT recorded in database.`);
          console.error(`   This requires immediate manual intervention.`);
        }
      } catch (emergencyErr: any) {
        console.error(`❌ Exception during emergency recording:`, emergencyErr);
        console.error(`   ⚠️ Transaction ${signature} was sent but NOT recorded in database.`);
      }
    }

    // Send push notification when transaction is sent (only if recording succeeded)
    if (transactionRecord) {
      try {
        await sendCryptoSendNotification({
          supabase,
          userId: user.id,
          cryptoCurrency: 'SOL',
          amount: amountToSend,
          transactionHash: signature,
          toAddress: destination_address,
          confirmations: 0,
          status: 'PENDING',
        });
      } catch (notifError) {
        console.error('⚠️ Failed to send notification:', notifError);
        // Don't fail the request if notification fails
      }
    }

    // Debit balance from database
    // Note: For sell orders, the balance is already locked, so we debit from the total balance
    // The sell-sol function will unlock the locked amount after successful transfer
    // CRITICAL: Debit MUST happen after transaction is sent, even if confirmation times out
    // This ensures balance is always debited when SOL is actually sent on-chain
    
    let debitSuccess = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!debitSuccess && retryCount < maxRetries) {
      try {
        const { data: balanceData, error: balanceError } = await supabase
          .from('wallet_balances')
          .select('balance, locked')
          .eq('user_id', user.id)
          .eq('currency', 'SOL')
          .single();

        if (balanceError || !balanceData) {
          console.error('❌ No balance record found for user:', balanceError);
          throw new Error('No balance record found');
        }

        const currentBalance = parseFloat(balanceData.balance || '0');
        const currentLocked = parseFloat(balanceData.locked || '0');
        // For sell orders (skip_platform_fee=true), platformFee is 0
        // We need to debit: amountToSend + network fee (which is deducted on-chain)
        // For regular sends, we debit: amountToSend + platformFee + network fee
        const totalToDebit = amountToSend + platformFee + ESTIMATED_FEE_SOL;
        const newBalance = Math.max(0, currentBalance - totalToDebit);
        
        console.log(`💰 Debiting balance (attempt ${retryCount + 1}/${maxRetries}): Current=${currentBalance}, Locked=${currentLocked}, Debit=${totalToDebit}, New=${newBalance}`);
        
        // Use optimistic locking: update only if balance hasn't changed
        // This prevents race conditions and ensures atomic debit
        const { data: updateData, error: debitError } = await supabase
          .from('wallet_balances')
          .update({ 
            balance: newBalance.toFixed(9),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('currency', 'SOL')
          .eq('balance', balanceData.balance); // Optimistic locking: only update if balance hasn't changed

        if (debitError) {
          console.error(`❌ Failed to debit balance (attempt ${retryCount + 1}):`, debitError);
          retryCount++;
          if (retryCount < maxRetries) {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            continue;
          }
          throw new Error(`Failed to debit balance after ${maxRetries} attempts: ${debitError.message}`);
        } else {
          // Verify debit actually happened
          const { data: verifyBalance } = await supabase
            .from('wallet_balances')
            .select('balance')
            .eq('user_id', user.id)
            .eq('currency', 'SOL')
            .single();
          
          const verifiedBalance = parseFloat(verifyBalance?.balance || '0');
          if (Math.abs(verifiedBalance - newBalance) > 0.000001) {
            console.warn(`⚠️ Balance mismatch after debit. Expected: ${newBalance}, Got: ${verifiedBalance}`);
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
              continue;
            }
          } else {
            console.log(`✅ Balance debited successfully. Verified balance: ${verifiedBalance}`);
            debitSuccess = true;
          }
        }
      } catch (debitErr: any) {
        console.error(`❌ Debit error (attempt ${retryCount + 1}):`, debitErr);
        retryCount++;
        if (retryCount >= maxRetries) {
          // CRITICAL: Even if debit fails, we MUST record the transaction
          // This allows us to fix the balance later using the transaction hash
          console.error('❌ CRITICAL: Debit failed but transaction was sent. Recording transaction for manual fix.');
          throw new Error(`Transaction sent (${signature}) but debit failed. Balance needs manual adjustment. Error: ${debitErr.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      }
    }
    
    if (!debitSuccess) {
      // Update transaction status to FAILED if debit fails
      if (transactionRecord?.id) {
        await supabase
          .from('transactions')
          .update({ 
            status: 'FAILED',
            error_message: `Failed to debit balance after ${maxRetries} attempts`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionRecord.id);
      }
      throw new Error(`Failed to debit balance after ${maxRetries} attempts`);
    }

    // STEP 3: Update transaction status to COMPLETED after successful debit
    if (transactionRecord?.id) {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...transactionRecord.metadata,
            debit_verified: true,
            debit_completed_at: new Date().toISOString(),
          },
        })
        .eq('id', transactionRecord.id);

      if (updateError) {
        console.error('⚠️ Failed to update transaction status:', updateError);
      } else {
        console.log(`✅ Transaction status updated to COMPLETED: ${transactionRecord.id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_hash: signature,
        amount: amountToSend.toString(),
        fee: ESTIMATED_FEE_SOL.toString(),
        platform_fee: platformFee.toString(),
        message: 'SOL sent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Send SOL error:', error);
    
    // CRITICAL: If transaction was sent but debit/record failed, we need to handle it
    // Check if we have a signature (transaction was sent)
    const errorMessage = error.message || 'Failed to send SOL';
    const hasSignature = errorMessage.includes('Transaction sent') || 
                        errorMessage.includes('signature') ||
                        errorMessage.includes('but debit failed') ||
                        (typeof signature !== 'undefined' && signature);
    
    // Try to record transaction if it was sent but not recorded
    if (hasSignature && !transactionRecord) {
      const txSignature = typeof signature !== 'undefined' ? signature : 
                         (errorMessage.match(/\(([a-zA-Z0-9]{32,})\)/) || [])[1];
      
      if (txSignature) {
        console.log(`🔄 Attempting to record transaction that was sent but not recorded: ${txSignature}`);
        try {
          const { data: recordedTx, error: recordErr } = await supabase
            .from('transactions')
            .insert({
              user_id: user.id,
              transaction_type: 'SEND',
              crypto_currency: 'SOL',
              network: 'mainnet',
              crypto_amount: amountToSend?.toString() || '0',
              from_address: solWallet?.address || '',
              to_address: destination_address || '',
              transaction_hash: txSignature,
              status: 'FAILED', // Mark as failed since debit/process didn't complete
              fee_amount: ESTIMATED_FEE_SOL.toString(),
              fee_currency: 'SOL',
              error_message: errorMessage,
              metadata: {
                platform_fee: platformFee?.toString() || '0',
                platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
                source: 'send-solana-transaction',
                recorded_in_error_handler: true,
                original_error: errorMessage,
              },
            })
            .select()
            .single();
          
          if (!recordErr && recordedTx) {
            console.log(`✅ Transaction recorded in error handler: ${recordedTx.id}`);
            transactionRecord = recordedTx;
          } else {
            console.error(`❌ Failed to record transaction in error handler:`, recordErr);
          }
        } catch (recordErr: any) {
          console.error(`❌ Exception recording transaction in error handler:`, recordErr);
        }
      }
    }
    
    if (hasSignature) {
      // Extract signature from error message if possible
      const signatureMatch = errorMessage.match(/\(([a-zA-Z0-9]{32,})\)/);
      const txSignature = typeof signature !== 'undefined' ? signature : 
                         (signatureMatch ? signatureMatch[1] : null);
      
      if (txSignature) {
        console.error(`⚠️ CRITICAL: Transaction ${txSignature} was sent but debit/record failed.`);
        console.error(`   This requires manual intervention to fix the balance.`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Transaction sent (${txSignature.substring(0, 16)}...) but debit failed. Please contact support.`,
            transaction_hash: txSignature,
            requires_manual_fix: true,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Decrypt private key using AES-256-GCM
 */
async function decryptPrivateKey(encryptedKey: string, encryptionKey: string): Promise<string> {
  try {
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    
    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Derive key using PBKDF2
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

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error: any) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}
