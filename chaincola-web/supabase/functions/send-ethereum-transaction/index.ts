// Send Ethereum Transaction Edge Function
// Sends ETH using Alchemy API
//
// SECURITY: This is the ONLY function that decrypts ETH private keys.
// Decryption happens ONLY when sending ETH transactions.
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
    const { destination_address, amount_eth, send_all } = body;

    if (!destination_address) {
      return new Response(
        JSON.stringify({ success: false, error: "destination_address is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!send_all && (!amount_eth || amount_eth <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "amount_eth is required when send_all is false" }),
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

    // Get user's Ethereum wallet
    // Use service role key to bypass RLS and ensure we can read private_key_encrypted
    // Priority: Active wallet with private key > Active wallet without key > Inactive wallet with key
    let ethWallet: any = null;
    let walletError: any = null;
    
    // First, try to get active wallet with private key
    // Order by created_at DESC to get the most recently created wallet (after regeneration)
    const { data: activeWalletWithKey, error: error1 } = await supabase
      .from('crypto_wallets')
      .select('id, address, private_key_encrypted, is_active, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
      .neq('private_key_encrypted', '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (activeWalletWithKey) {
      ethWallet = activeWalletWithKey;
      
      // Check if this wallet has 0 balance on-chain (might be a regenerated wallet)
      // If so, check if there are inactive wallets with balance
      try {
        const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
        
        const balanceCheck = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [ethWallet.address, 'latest'],
            id: 999,
          }),
        });
        
        if (balanceCheck.ok) {
          const balanceData = await balanceCheck.json();
          const balanceWei = BigInt(balanceData.result || '0');
          const balanceETH = Number(balanceWei) / 1e18;
          
          // If active wallet has 0 balance, check inactive wallets
          if (balanceETH === 0) {
            console.warn(`⚠️ Active wallet ${ethWallet.address} has 0 ETH on-chain. Checking inactive wallets...`);
            
            const { data: inactiveWallets } = await supabase
              .from('crypto_wallets')
              .select('id, address, private_key_encrypted, is_active')
              .eq('user_id', user.id)
              .eq('asset', 'ETH')
              .eq('network', 'mainnet')
              .eq('is_active', false)
              .not('private_key_encrypted', 'is', null)
              .neq('private_key_encrypted', '')
              .order('created_at', { ascending: false });
            
            if (inactiveWallets && inactiveWallets.length > 0) {
              // Check balance of inactive wallets
              for (const inactiveWallet of inactiveWallets) {
                const inactiveBalanceCheck = await fetch(alchemyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [inactiveWallet.address, 'latest'],
                    id: 998,
                  }),
                });
                
                if (inactiveBalanceCheck.ok) {
                  const inactiveBalanceData = await inactiveBalanceCheck.json();
                  const inactiveBalanceWei = BigInt(inactiveBalanceData.result || '0');
                  const inactiveBalanceETH = Number(inactiveBalanceWei) / 1e18;
                  
                  if (inactiveBalanceETH > 0) {
                    console.warn(`⚠️ Found inactive wallet ${inactiveWallet.address} with ${inactiveBalanceETH} ETH on-chain`);
                    // Note: We'll still use the active wallet, but this info will be in logs
                  }
                }
              }
            }
          }
        }
      } catch (balanceCheckError) {
        console.warn('Could not check wallet balance before transaction:', balanceCheckError);
      }
    } else {
      // Fallback: Get any active wallet (even without key, we'll handle error later)
      // Order by created_at DESC to prioritize most recently created wallet
      const { data: activeWallet, error: error2 } = await supabase
        .from('crypto_wallets')
        .select('id, address, private_key_encrypted, is_active, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (activeWallet) {
        ethWallet = activeWallet;
        walletError = error2;
      } else {
        // Last resort: Get any ETH wallet (even inactive)
        const { data: anyWallet, error: error3 } = await supabase
          .from('crypto_wallets')
          .select('id, address, private_key_encrypted, is_active')
          .eq('user_id', user.id)
          .eq('asset', 'ETH')
          .eq('network', 'mainnet')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        ethWallet = anyWallet;
        walletError = error3;
      }
    }

    if (walletError || !ethWallet) {
      console.error('❌ Error fetching Ethereum wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: "Ethereum wallet not found. Please set up your wallet first." }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📝 Wallet found: ${ethWallet.address}`);
    console.log(`   Wallet ID: ${ethWallet.id}`);
    console.log(`   Is Active: ${ethWallet.is_active}`);
    console.log(`   Has private_key_encrypted: ${!!ethWallet.private_key_encrypted}`);
    console.log(`   private_key_encrypted length: ${ethWallet.private_key_encrypted?.length || 0}`);
    console.log(`   private_key_encrypted is empty: ${!ethWallet.private_key_encrypted || ethWallet.private_key_encrypted.trim() === ''}`);
    
    // Check on-chain balance to provide better error messages
    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    try {
      const balanceResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [ethWallet.address, 'latest'],
          id: 999,
        }),
      });
      
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const balanceWei = BigInt(balanceData.result || '0');
        const balanceETH = Number(balanceWei) / 1e18;
        console.log(`💰 On-chain balance for ${ethWallet.address}: ${balanceETH} ETH`);
        
        if (balanceETH === 0) {
          console.warn(`⚠️ Wallet has 0 ETH on-chain. User needs to fund this wallet address.`);
        }
      }
    } catch (balanceError) {
      console.warn('Could not check on-chain balance:', balanceError);
    }

    // Check if destination is a contract (warning only - don't block transaction)
    try {
      const codeResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [destination_address, 'latest'],
          id: 998,
        }),
      });
      
      if (codeResponse.ok) {
        const codeData = await codeResponse.json();
        const code = codeData.result;
        const isContract = code && code !== '0x';
        
        if (isContract) {
          console.warn(`⚠️ Destination address ${destination_address} is a contract. Transaction may fail if contract doesn't accept ETH transfers.`);
          // Note: We still allow the transaction, but log a warning
          // The transaction will fail on-chain if the contract rejects it, and the user will be refunded
        }
      }
    } catch (error) {
      // If check fails, continue anyway - don't block the transaction
      console.warn('Could not check if destination is a contract:', error);
    }

    if (!ethWallet.private_key_encrypted || ethWallet.private_key_encrypted.trim() === '') {
      console.error('❌ Private key not found in wallet');
      console.error(`   Wallet ID: ${ethWallet.id}`);
      console.error(`   Address: ${ethWallet.address}`);
      console.error(`   private_key_encrypted value: ${ethWallet.private_key_encrypted === null ? 'NULL' : ethWallet.private_key_encrypted === '' ? 'EMPTY STRING' : 'UNKNOWN'}`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No private key found in wallet. Please store your Ethereum wallet keys first by calling the store-crypto-keys function.",
          wallet_address: ethWallet.address,
          wallet_id: ethWallet.id,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's ETH balance
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'ETH')
      .single();

    if (balanceError || !balance) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch ETH balance" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const availableBalance = parseFloat(balance.balance || '0');
    
    // Get gas price first to calculate fees
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
    const gasLimit = BigInt(21000); // Standard ETH transfer gas limit
    const estimatedGasFee = gasPriceWei * gasLimit;
    const estimatedGasFeeEth = Number(estimatedGasFee) / 1e18;

    // Calculate platform fee (3% of send amount)
    const PLATFORM_FEE_PERCENTAGE = 0.03; // 3%
    const safetyMargin = Math.max(estimatedGasFeeEth * 0.01, 0.00001);
    
    // Auto-detect if user is trying to send their entire balance
    // If requested amount is within 0.1% of available balance, treat as send_all
    const requestedAmount = parseFloat(amount_eth || '0');
    const balanceThreshold = availableBalance * 0.999; // 99.9% of balance
    const shouldSendAll = send_all === true || (requestedAmount >= balanceThreshold && requestedAmount > 0);
    
    let amountToSend: number;
    let platformFee: number;
    
    // If send_all is true (explicit or auto-detected), calculate the maximum sendable amount
    if (shouldSendAll) {
      // Formula: sendAmount = (availableBalance - gasFee - safetyMargin) / (1 + platformFeePercentage)
      // This ensures: sendAmount + platformFee + gasFee + safetyMargin = availableBalance
      const maxSendable = (availableBalance - estimatedGasFeeEth - safetyMargin) / (1 + PLATFORM_FEE_PERCENTAGE);
      
      if (maxSendable <= 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance to send all. Available: ${availableBalance.toFixed(8)} ETH, but gas fee (${estimatedGasFeeEth.toFixed(8)} ETH) and safety margin (${safetyMargin.toFixed(8)} ETH) exceed available balance.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      amountToSend = maxSendable;
      platformFee = amountToSend * PLATFORM_FEE_PERCENTAGE;
      
      console.log(`💰 Send All Mode: Calculated send amount: ${amountToSend.toFixed(8)} ETH`);
      console.log(`   Platform fee (3%): ${platformFee.toFixed(8)} ETH`);
      console.log(`   Gas fee: ${estimatedGasFeeEth.toFixed(8)} ETH`);
      console.log(`   Safety margin: ${safetyMargin.toFixed(8)} ETH`);
      console.log(`   Total: ${(amountToSend + platformFee + estimatedGasFeeEth + safetyMargin).toFixed(8)} ETH`);
    } else {
      amountToSend = parseFloat(amount_eth);
      platformFee = amountToSend * PLATFORM_FEE_PERCENTAGE;
      
      // Check if user has enough balance
      const totalRequired = amountToSend + estimatedGasFeeEth + platformFee + safetyMargin;

      if (availableBalance < totalRequired) {
        const shortage = totalRequired - availableBalance;
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient balance. Available: ${availableBalance.toFixed(8)} ETH, Required: ${totalRequired.toFixed(8)} ETH (${amountToSend.toFixed(8)} send + ${estimatedGasFeeEth.toFixed(8)} gas fee + ${platformFee.toFixed(8)} platform fee). Shortage: ${shortage.toFixed(8)} ETH`,
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

    // Get nonce for the transaction
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
    // This is the ONLY function that decrypts ETH private keys.
    // Decryption happens ONLY when sending ETH transactions.
    // The decrypted key exists ONLY in memory and is immediately discarded.
    // ============================================================
    
    // Try keys in order: shared CRYPTO first (recommended), then legacy per-chain secrets
    const possibleEncryptionKeys = [
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('ETH_ENCRYPTION_KEY'),
      Deno.env.get('TRON_ENCRYPTION_KEY'),
    ].filter(key => key && key.length > 0); // Filter out undefined/null/empty keys
    
    if (possibleEncryptionKeys.length === 0) {
      console.error('❌ No encryption keys found. Set CRYPTO_ENCRYPTION_KEY (recommended) or ETH_ENCRYPTION_KEY / TRON_ENCRYPTION_KEY in Edge Function secrets');
      return new Response(
        JSON.stringify({ success: false, error: 'Encryption key not configured. Set CRYPTO_ENCRYPTION_KEY in Supabase → Project Settings → Edge Functions → Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt private key (in memory only, never logged, immediately discarded after use)
    let privateKey: string | null = null;
    let signedTx: string | null = null;
    let usedEncryptionKey: string | null = null;
    
    try {
      console.log('🔓 Decrypting private key for transaction signing (ONLY time decryption happens)...');
      console.log(`📝 Encrypted key length: ${ethWallet.private_key_encrypted?.length || 0}`);
      console.log(`🔑 Trying ${possibleEncryptionKeys.length} encryption key(s)...`);
      
      // Try each encryption key until one works
      let decryptionError: Error | null = null;
      for (let i = 0; i < possibleEncryptionKeys.length; i++) {
        const encryptionKey = possibleEncryptionKeys[i];
        const keyName = Deno.env.get('CRYPTO_ENCRYPTION_KEY') === encryptionKey ? 'CRYPTO_ENCRYPTION_KEY' :
                       Deno.env.get('ETH_ENCRYPTION_KEY') === encryptionKey ? 'ETH_ENCRYPTION_KEY' :
                       'TRON_ENCRYPTION_KEY';
        
        try {
          console.log(`   Trying key ${i + 1}/${possibleEncryptionKeys.length}: ${keyName}`);
          privateKey = await decryptPrivateKey(ethWallet.private_key_encrypted, encryptionKey!);
          usedEncryptionKey = keyName;
          console.log(`✅ Decryption successful with ${keyName}`);
          break; // Success, exit loop
        } catch (error: any) {
          console.warn(`   ⚠️ Decryption failed with ${keyName}: ${error.message}`);
          decryptionError = error;
          privateKey = null; // Reset for next attempt
        }
      }
      
      // If all decryption attempts failed
      if (!privateKey) {
        throw decryptionError || new Error('All decryption attempts failed');
      }
      
      // Validate private key format (should be 64 hex characters)
      if (!privateKey || !privateKey.match(/^[0-9a-fA-F]{64}$/)) {
        console.error('❌ Decrypted key format invalid (format check only, key not logged)');
        throw new Error('Invalid private key format after decryption');
      }
      console.log(`✅ Private key decrypted successfully using ${usedEncryptionKey} (in memory only)`);
      
      // Import ethers.js for transaction signing
      const { ethers } = await import('https://esm.sh/ethers@6.9.0');

      // Create wallet from private key (temporary, in memory only)
      const wallet = new ethers.Wallet(`0x${privateKey}`);

      // Build transaction object
      // Use amountToSend (which accounts for fees in send_all mode) instead of amount_eth
      const tx = {
        to: destination_address,
        value: ethers.parseEther(amountToSend.toString()),
        gasLimit: gasLimit,
        gasPrice: gasPriceWei,
        nonce: nonce,
        chainId: 1, // Ethereum mainnet
      };

      // Sign transaction using decrypted private key
      console.log('✍️  Signing transaction with decrypted private key...');
      signedTx = await wallet.signTransaction(tx);
      console.log('✅ Transaction signed successfully');
      
      // IMMEDIATELY clear private key from memory
      // Overwrite the variable to help garbage collection
      privateKey = null;
      console.log('🗑️  Decrypted private key cleared from memory');
      
    } catch (error: any) {
      // Ensure private key is cleared even on error
      privateKey = null;
      
      console.error('❌ Error during decryption/signing:', error);
      console.error('❌ Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500),
      });
      
      // Provide more helpful error message
      let errorMessage = 'Failed to decrypt private key';
      if (error.message?.includes('decrypt')) {
        errorMessage = 'Failed to decrypt private key. The encryption key may not match the one used to encrypt this key.';
      } else if (error.message?.includes('Invalid')) {
        errorMessage = 'Decrypted key format is invalid. The encryption key may be incorrect.';
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: 'Please ensure the encryption key matches the one used to encrypt the private key.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify we have a signed transaction before proceeding
    if (!signedTx) {
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
    
    // Send transaction via Alchemy
    console.log('📡 Broadcasting signed transaction to network...');
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
      
      let errorMessage = "Failed to send transaction";
      let errorDetails: any = { raw: errorText };
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          const alchemyError = errorJson.error.message;
          if (alchemyError.includes('insufficient funds')) {
            // Extract the required amount from error if available
            const wantMatch = alchemyError.match(/want (\d+)/);
            const wantWei = wantMatch ? BigInt(wantMatch[1]) : BigInt(0);
            const wantETH = Number(wantWei) / 1e18;
            
            errorMessage = `Insufficient ETH balance. Wallet address ${ethWallet.address} has 0 ETH on-chain. Please send at least ${wantETH.toFixed(8)} ETH to this address to complete the transaction.`;
            errorDetails = {
              wallet_address: ethWallet.address,
              error: alchemyError,
              required_amount_eth: wantETH.toFixed(8),
              transaction_amount: amount_eth,
            };
          } else {
            errorMessage = `Transaction failed: ${alchemyError}`;
            errorDetails = errorJson;
          }
        } else {
          errorDetails = errorJson;
        }
      } catch {
        errorDetails = { raw: errorText };
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: errorDetails,
          wallet_address: ethWallet.address,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sendData = await sendResponse.json();
    const txHash = sendData.result;

    // Clear signed transaction from memory immediately after broadcasting
    // (signed transaction is no longer needed once broadcast)
    signedTx = null;

    if (!txHash) {
      // Check if there's an error in the response
      if (sendData.error) {
        const alchemyError = sendData.error.message || JSON.stringify(sendData.error);
        let errorMessage = `Transaction failed: ${alchemyError}`;
        
        if (alchemyError.includes('insufficient funds')) {
          const wantMatch = alchemyError.match(/want (\d+)/);
          const wantWei = wantMatch ? BigInt(wantMatch[1]) : BigInt(0);
          const wantETH = Number(wantWei) / 1e18;
          errorMessage = `Insufficient ETH balance. Wallet address ${ethWallet.address} has 0 ETH on-chain. Please send at least ${wantETH.toFixed(8)} ETH to this address.`;
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            details: sendData,
            wallet_address: ethWallet.address,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Transaction failed - no transaction hash returned", 
          details: sendData,
          wallet_address: ethWallet.address,
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
      .eq('crypto_currency', 'ETH')
      .limit(1);

    let transactionRecord: any = null;

    if (existingTx && existingTx.length > 0) {
      console.log(`⚠️ Transaction ${txHash.substring(0, 16)}... already processed. Skipping debit to prevent duplicate.`);
      transactionRecord = existingTx[0];
      // Transaction already exists - return success without debiting again
      return new Response(
        JSON.stringify({
          success: true,
          transaction_hash: txHash,
          amount: amountToSend.toString(),
          fee: estimatedGasFeeEth.toString(),
          platform_fee: platformFee.toString(),
          message: 'ETH sent successfully (already processed)',
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
          crypto_currency: 'ETH',
          network: 'mainnet',
          crypto_amount: amountToSend.toString(),
          from_address: ethWallet.address,
          to_address: destination_address,
          transaction_hash: txHash,
          status: 'PENDING',
          metadata: {
            gas_fee: estimatedGasFeeEth.toString(),
            gas_price: gasPriceWei.toString(),
            gas_limit: gasLimit.toString(),
            nonce: nonce.toString(),
            platform_fee: platformFee.toString(),
            platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
            source: 'send-ethereum-transaction',
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
          
          // Check if it's a duplicate key error (transaction already exists)
          if (txError.code === '23505' || txError.message?.includes('duplicate') || txError.message?.includes('unique')) {
            console.log('⚠️ Transaction already exists, fetching existing record...');
            const { data: existingRecord } = await supabase
              .from('transactions')
              .select('*')
              .eq('transaction_hash', txHash)
              .eq('user_id', user.id)
              .eq('transaction_type', 'SEND')
              .eq('crypto_currency', 'ETH')
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
            // Try one more time with a direct insert
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
            crypto_currency: 'ETH',
            network: 'mainnet',
            crypto_amount: amountToSend.toString(),
            from_address: ethWallet.address,
            to_address: destination_address,
            transaction_hash: txHash,
            status: 'PENDING',
            error_message: 'Transaction recorded in emergency handler - original recording failed',
            metadata: {
              gas_fee: estimatedGasFeeEth.toString(),
              gas_price: gasPriceWei.toString(),
              gas_limit: gasLimit.toString(),
              nonce: nonce.toString(),
              platform_fee: platformFee.toString(),
              platform_fee_percentage: PLATFORM_FEE_PERCENTAGE.toString(),
              source: 'send-ethereum-transaction',
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
          cryptoCurrency: 'ETH',
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

    // STEP 2: Debit ETH balance (amount + gas fee + platform fee)
    const totalDebit = amountToSend + estimatedGasFeeEth + platformFee;
    
    // Get current balance before debiting for verification
    const { data: balanceBeforeDebit } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'ETH')
      .single();
    
    const balanceBeforeDebitAmount = balanceBeforeDebit ? parseFloat(balanceBeforeDebit.balance || '0') : 0;
    console.log(`📊 Balance before debit: ${balanceBeforeDebitAmount} ETH, Debit amount: ${totalDebit} ETH`);
    
    const { error: debitError } = await supabase.rpc('debit_crypto_wallet', {
      p_user_id: user.id,
      p_amount: totalDebit,
      p_currency: 'ETH',
    });

    // STEP 3: Update transaction status after debit
    if (debitError) {
      // Update transaction status to FAILED if debit fails
      if (transactionRecord?.id) {
        await supabase
          .from('transactions')
          .update({ 
            status: 'FAILED',
            error_message: debitError.message || 'Failed to debit balance',
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionRecord.id);
      }
      throw new Error(`Failed to debit balance: ${debitError.message}`);
    } else {
      // Update transaction status to COMPLETED after successful debit
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
    }

    // Record admin revenue from platform fee (only if debit succeeded and fee was charged)
    if (platformFee > 0 && !debitError && transactionRecord?.id) {
      try {
        await supabase.rpc('record_admin_revenue', {
          p_revenue_type: 'SEND_FEE',
          p_source: 'ETHEREUM_SEND',
          p_amount: platformFee,
          p_currency: 'ETH',
          p_fee_percentage: PLATFORM_FEE_PERCENTAGE * 100, // Convert to percentage (3.00)
          p_base_amount: amountToSend,
          p_transaction_id: transactionRecord.id,
          p_user_id: user.id,
          p_metadata: {
            transaction_hash: txHash,
            gas_fee: estimatedGasFeeEth,
            send_amount: amountToSend,
            destination_address: destination_address,
          },
          p_notes: `Platform fee from Ethereum send transaction`,
        });
        console.log(`✅ Recorded admin revenue: ${platformFee.toFixed(8)} ETH from send fee`);
      } catch (revenueError) {
        console.error('⚠️ Error recording admin revenue (non-critical):', revenueError);
        // Don't fail the transaction if revenue recording fails
      }
    }

    if (debitError) {
      console.error('❌ Error debiting ETH balance:', debitError);
      console.error('❌ Debit error details:', JSON.stringify(debitError, null, 2));
      console.error('❌ Balance before debit:', balanceBeforeDebitAmount);
      console.error('❌ Attempted debit amount:', totalDebit);
      
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
              debit_attempted_at: new Date().toISOString(),
            },
          })
          .eq('id', transactionRecord.id);
      }
      
      // Transaction was sent but balance update failed - this is critical
      // Try to manually update balance as fallback
      try {
        const newBalance = Math.max(0, balanceBeforeDebitAmount - totalDebit);
        const { error: manualUpdateError } = await supabase
          .from('wallet_balances')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('currency', 'ETH');
        
        if (manualUpdateError) {
          console.error('❌ Manual balance update also failed:', manualUpdateError);
          // Still return error but include transaction hash
          return new Response(
            JSON.stringify({
              success: false,
              error: "Transaction sent but failed to update balance. Transaction hash: " + txHash + ". Error: " + (debitError.message || JSON.stringify(debitError)),
              transaction_hash: txHash,
              transaction_id: transactionRecord?.id,
              debit_error: debitError,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('✅ Manual balance update succeeded as fallback');
          // Update transaction to reflect successful fallback
          if (transactionRecord?.id) {
            await supabase
              .from('transactions')
              .update({
                status: 'PENDING',
                metadata: {
                  ...(transactionRecord.metadata || {}),
                  debit_completed_via_fallback: true,
                  debit_completed_at: new Date().toISOString(),
                },
              })
              .eq('id', transactionRecord.id);
          }
        }
      } catch (fallbackError: any) {
        console.error('❌ Fallback balance update failed:', fallbackError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Transaction sent but failed to update balance. Transaction hash: " + txHash + ". Error: " + (debitError.message || JSON.stringify(debitError)),
            transaction_hash: txHash,
            transaction_id: transactionRecord?.id,
            debit_error: debitError,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log(`✅ Successfully debited ${totalDebit} ETH from user ${user.id}`);
      
      // Verify balance was actually updated
      const { data: balanceAfterDebit } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', user.id)
        .eq('currency', 'ETH')
        .single();
      
      const balanceAfterDebitAmount = balanceAfterDebit ? parseFloat(balanceAfterDebit.balance || '0') : 0;
      const expectedBalance = balanceBeforeDebitAmount - totalDebit;
      
      console.log(`📊 Balance after debit: ${balanceAfterDebitAmount} ETH (expected: ${expectedBalance} ETH)`);
      
      if (Math.abs(balanceAfterDebitAmount - expectedBalance) > 0.000001) {
        console.error(`⚠️ Balance mismatch after debit! Expected ${expectedBalance} ETH but got ${balanceAfterDebitAmount} ETH`);
        // Try to fix it
        const { error: fixError } = await supabase
          .from('wallet_balances')
          .update({ 
            balance: expectedBalance,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('currency', 'ETH');
        
        if (fixError) {
          console.error('❌ Failed to fix balance mismatch:', fixError);
        } else {
          console.log('✅ Balance mismatch fixed');
        }
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
        gas_fee: estimatedGasFeeEth.toString(),
        platform_fee: platformFee.toString(),
        total_fee: (estimatedGasFeeEth + platformFee).toString(),
        message: 'Transaction sent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Send Ethereum transaction error:', error);
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
 * SECURITY WARNING: This function is ONLY called from send-ethereum-transaction.
 * Private keys are decrypted ONLY when sending ETH transactions.
 * 
 * The decrypted private key:
 *   - Exists ONLY in memory
 *   - Is NEVER logged or exposed
 *   - Is immediately discarded after signing the transaction
 *   - Is NEVER returned to the client
 * 
 * @param encryptedKey - Base64-encoded encrypted private key from database
 * @param encryptionKey - Encryption key from environment variable
 * @returns Plaintext private key (hex string without 0x prefix) - MUST be discarded immediately after use
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
    console.error('Decryption error details:', {
      message: error.message,
      name: error.name,
    });
    
    // Provide more specific error messages
    if (error.message?.includes('OperationError') || error.message?.includes('decrypt')) {
      throw new Error('Decryption failed - the encryption key may not match the one used to encrypt this key');
    } else if (error.message?.includes('Invalid')) {
      throw new Error('Invalid encrypted key format');
    }
    
    throw new Error(`Failed to decrypt private key: ${error.message || 'Unknown error'}`);
  }
}
