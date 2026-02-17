// Send USDC Transaction Edge Function
// Sends USDC (ERC-20 token) using Alchemy API
//
// SECURITY: This is the ONLY function that decrypts ETH private keys for USDC transfers.
// Decryption happens ONLY when sending USDC transactions.
// Flow:
//   1. Fetch encrypted private key from database
//   2. Decrypt in memory (temporary)
//   3. Sign ERC-20 transfer transaction
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
import { sendCryptoSendNotification } from "../_shared/send-crypto-send-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// USDC contract address on Ethereum mainnet
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_DECIMALS = 6; // USDC has 6 decimals
// ERC-20 transfer function signature: transfer(address to, uint256 amount)
const TRANSFER_FUNCTION_SIGNATURE = '0xa9059cbb'; // transfer(address,uint256)

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
    const { destination_address, amount_usdc, skip_platform_fee } = body;

    if (!destination_address) {
      return new Response(
        JSON.stringify({ success: false, error: "destination_address is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!amount_usdc || parseFloat(amount_usdc) <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "amount_usdc is required and must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination_address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Ethereum address format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Ethereum wallet (same wallet used for ETH, since USDC is ERC-20 on Ethereum)
    const { data: ethWallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, address, private_key_encrypted, is_active')
      .eq('user_id', user.id)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (walletError || !ethWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Ethereum wallet not found. Please set up your wallet first." }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's USDC balance
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'USDC')
      .single();

    if (balanceError || !balance) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch USDC balance" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const availableBalance = parseFloat(balance.balance || '0');
    const amountToSend = parseFloat(amount_usdc);

    // Check if user has enough USDC
    if (amountToSend > availableBalance) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Insufficient USDC balance. Available: ${availableBalance.toFixed(6)} USDC, Required: ${amountToSend.toFixed(6)} USDC`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has enough ETH for gas fees
    const { data: ethBalance, error: ethBalanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'ETH')
      .single();

    if (ethBalanceError || !ethBalance) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch ETH balance for gas fees" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const availableEthBalance = parseFloat(ethBalance.balance || '0');
    const estimatedGasFeeEth = 0.001; // Estimated gas fee for ERC-20 transfer

    if (availableEthBalance < estimatedGasFeeEth) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Insufficient ETH for gas fees. Available: ${availableEthBalance.toFixed(8)} ETH, Required: ${estimatedGasFeeEth.toFixed(8)} ETH`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Alchemy API URL
    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    // Get gas price
    const gasPriceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1,
      }),
    });

    if (!gasPriceResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch gas price" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gasPriceData = await gasPriceResponse.json();
    const gasPriceWei = BigInt(gasPriceData.result || '0x0');
    const gasLimit = BigInt(65000); // ERC-20 transfer typically uses ~65,000 gas

    // Get nonce
    const nonceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [ethWallet.address, 'latest'],
        id: 2,
      }),
    });

    if (!nonceResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch nonce" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nonceData = await nonceResponse.json();
    const nonce = parseInt(nonceData.result || '0x0', 16);

    // ============================================================
    // DECRYPT PRIVATE KEY - ONLY TIME DECRYPTION HAPPENS
    // ============================================================
    const possibleEncryptionKeys = [
      Deno.env.get('ETH_ENCRYPTION_KEY'),
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('TRON_ENCRYPTION_KEY'),
    ].filter(key => key && key.length > 0);

    if (possibleEncryptionKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Encryption key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let privateKey: string | null = null;
    let signedTx: string | null = null;

    try {
      console.log('🔓 Decrypting private key for USDC transfer...');

      for (const encryptionKey of possibleEncryptionKeys) {
        try {
          privateKey = await decryptPrivateKey(ethWallet.private_key_encrypted, encryptionKey!);
          break;
        } catch (error: any) {
          console.warn(`⚠️ Decryption failed with key: ${error.message}`);
        }
      }

      if (!privateKey || !privateKey.match(/^[0-9a-fA-F]{64}$/)) {
        throw new Error('Invalid private key format after decryption');
      }

      console.log('✅ Private key decrypted successfully (in memory only)');

      // Import ethers.js
      const { ethers } = await import('https://esm.sh/ethers@6.9.0');

      // Create wallet from private key
      const wallet = new ethers.Wallet(`0x${privateKey}`);

      // Convert USDC amount to token units (6 decimals)
      const amountInTokenUnits = BigInt(Math.floor(amountToSend * 1e6));

      // Encode the transfer function call
      // transfer(address to, uint256 amount)
      const iface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)'
      ]);
      const data = iface.encodeFunctionData('transfer', [destination_address, amountInTokenUnits]);

      // Build transaction object
      const tx = {
        to: USDC_CONTRACT_ADDRESS, // Contract address, not destination
        data: data, // Encoded function call
        gasLimit: gasLimit,
        gasPrice: gasPriceWei,
        nonce: nonce,
        chainId: 1, // Ethereum mainnet
      };

      // Sign transaction
      console.log('✍️  Signing USDC transfer transaction...');
      signedTx = await wallet.signTransaction(tx);
      console.log('✅ Transaction signed successfully');

      // Clear private key from memory
      privateKey = null;
      console.log('🗑️  Decrypted private key cleared from memory');

    } catch (error: any) {
      privateKey = null;
      console.error('❌ Error during decryption/signing:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to decrypt private key or sign transaction',
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!signedTx) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to sign transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // BROADCAST TRANSACTION
    // ============================================================
    console.log('📡 Broadcasting USDC transfer transaction...');
    const sendResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendRawTransaction',
        params: [signedTx],
        id: 3,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('❌ Error sending transaction:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send transaction", details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sendData = await sendResponse.json();
    const txHash = sendData.result;

    if (!txHash) {
      return new Response(
        JSON.stringify({ success: false, error: "No transaction hash returned" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ USDC transfer transaction broadcasted: ${txHash}`);

    // Wait for transaction confirmation (optional, but good for user experience)
    let confirmed = false;
    let confirmationAttempts = 0;
    const maxAttempts = 10;

    while (!confirmed && confirmationAttempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      const receiptResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 4,
        }),
      });

      if (receiptResponse.ok) {
        const receiptData = await receiptResponse.json();
        const receipt = receiptData.result;

        if (receipt && receipt.status === '0x1') {
          confirmed = true;
          console.log('✅ Transaction confirmed on-chain');
        } else if (receipt && receipt.status === '0x0') {
          return new Response(
            JSON.stringify({ success: false, error: "Transaction failed on-chain" }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      confirmationAttempts++;
    }

    // Debit USDC balance
    const newBalance = Math.max(0, availableBalance - amountToSend);
    const { error: debitError } = await supabase
      .from('wallet_balances')
      .update({ balance: newBalance.toFixed(6) })
      .eq('user_id', user.id)
      .eq('currency', 'USDC');

    if (debitError) {
      console.error('⚠️ Failed to debit USDC balance:', debitError);
      // Don't fail the whole operation - transaction was sent
    } else {
      console.log(`✅ Debited ${amountToSend.toFixed(6)} USDC from balance`);
    }

    // CRITICAL: Check if this transaction was already processed
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_hash', txHash)
      .eq('user_id', user.id)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'USDC')
      .limit(1);

    let transactionRecord: any = null;

    if (existingTx && existingTx.length > 0) {
      console.log(`⚠️ Transaction ${txHash.substring(0, 16)}... already processed.`);
      transactionRecord = existingTx[0];
    } else {
      // Record transaction with retry logic
      let recordAttempts = 0;
      const maxRecordAttempts = 3;
      let recordSuccess = false;

      while (!recordSuccess && recordAttempts < maxRecordAttempts) {
        try {
          const transactionData = {
            user_id: user.id,
            transaction_type: 'SEND',
            crypto_currency: 'USDC',
            crypto_amount: amountToSend.toString(),
            transaction_hash: txHash,
            status: confirmed ? 'COMPLETED' : 'PENDING',
            network: 'mainnet',
            from_address: ethWallet.address,
            to_address: destination_address,
            fee_amount: (Number(gasLimit * gasPriceWei) / 1e18).toFixed(8),
            fee_currency: 'ETH',
            metadata: {
              contract_address: USDC_CONTRACT_ADDRESS,
              token_decimals: USDC_DECIMALS,
              skip_platform_fee: skip_platform_fee || false,
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
                .eq('crypto_currency', 'USDC')
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
              crypto_currency: 'USDC',
              crypto_amount: amountToSend.toString(),
              transaction_hash: txHash,
              status: confirmed ? 'COMPLETED' : 'PENDING',
              network: 'mainnet',
              from_address: ethWallet.address,
              to_address: destination_address,
              fee_amount: (Number(gasLimit * gasPriceWei) / 1e18).toFixed(8),
              fee_currency: 'ETH',
              error_message: 'Transaction recorded in emergency handler - original recording failed',
              metadata: {
                contract_address: USDC_CONTRACT_ADDRESS,
                token_decimals: USDC_DECIMALS,
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
            console.error(`   ⚠️ Transaction ${txHash} was sent but NOT recorded in database.`);
          }
        } catch (emergencyErr: any) {
          console.error(`❌ Exception during emergency recording:`, emergencyErr);
          console.error(`   ⚠️ Transaction ${txHash} was sent but NOT recorded in database.`);
        }
      }
    }

    // Send notification (only if recording succeeded)
    if (transactionRecord) {
      try {
        await sendCryptoSendNotification({
          supabase: supabase,
          userId: user.id,
          cryptoCurrency: 'USDC',
          amount: amountToSend,
          transactionHash: txHash,
          toAddress: destination_address,
          status: confirmed ? 'COMPLETED' : 'PENDING',
        });
      } catch (notifError) {
        console.warn('⚠️ Failed to send notification:', notifError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_hash: txHash,
        status: confirmed ? 'COMPLETED' : 'PENDING',
        message: confirmed
          ? 'USDC transfer completed successfully'
          : 'USDC transfer sent. Confirmation pending.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Send USDC transaction error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Decrypt private key function (same as in send-ethereum-transaction)
async function decryptPrivateKey(encryptedKey: string, encryptionKey: string): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

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

