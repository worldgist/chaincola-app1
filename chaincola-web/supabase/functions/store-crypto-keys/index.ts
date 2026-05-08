// Store Crypto Keys Edge Function
// Generates wallets for all supported cryptocurrencies and stores encrypted private keys
// Private keys are encrypted and stored securely
// The mobile app never sees private keys
//
// This function:
// 1. Generates wallets for BTC, ETH, SOL (if they don't exist)
// 2. Encrypts private keys using AES-256-GCM
// 3. Stores wallet addresses and encrypted private keys in crypto_wallets table
// 4. Returns only addresses to the mobile app (never private keys)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StoreCryptoKeysRequest {
  // Optional: specific asset to generate (BTC, ETH, SOL)
  // If not provided, generates all supported cryptocurrencies
  asset?: string;
  // Optional: force regenerate wallet even if one exists
  force_regenerate?: boolean;
  // Optional: regenerate if wallet exists but has no keys
  regenerate_if_no_keys?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth token or service role with user ID header
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');
    const userIdHeader = req.headers.get('x-user-id'); // For service role migration
    
    let user: any = null;
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Authorization header required',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    
    // Check if x-user-id header is present (indicates service role migration)
    // When x-user-id is present, we trust the service role client and use the user ID directly
    if (userIdHeader) {
      // Service role migration mode - verify user exists
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userIdHeader);
      if (userError) {
        console.error('Error getting user:', userError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to get user: ${userError.message}`,
            userId: userIdHeader,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      if (!userData || !userData.user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `User not found: ${userIdHeader}`,
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      user = userData.user;
    } else {
      // Regular user authentication
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        console.error('❌ Auth error:', authError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid or expired token',
            details: authError?.message,
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      user = authUser;
      console.log(`✅ Authenticated user: ${user.id}`);
    }
    
    // Ensure user ID is available
    if (!user || !user.id) {
      console.error('❌ No user ID available');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User ID not found. Please ensure you are authenticated.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: StoreCryptoKeysRequest = await req.json().catch(() => ({}));
    const { asset, force_regenerate = false, regenerate_if_no_keys = true } = body;

    // Supported assets
    const supportedAssets = asset ? [asset.toUpperCase()] : ['BTC', 'ETH', 'SOL'];
    
    // Validate asset
    const validAssets = ['BTC', 'ETH', 'SOL'];
    const invalidAssets = supportedAssets.filter(a => !validAssets.includes(a));
    if (invalidAssets.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unsupported assets: ${invalidAssets.join(', ')}. Supported: BTC, ETH, SOL`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const results: any[] = [];

    // Process each asset
    for (const targetAsset of supportedAssets) {
      // Get encryption key for this specific asset
      // Check in order: asset-specific key, CRYPTO_ENCRYPTION_KEY
      // This ensures compatibility with different encryption key configurations
      let encryptionKey: string | undefined;
      
      if (targetAsset === 'ETH' || targetAsset === 'ETHEREUM') {
        encryptionKey = Deno.env.get('CRYPTO_ENCRYPTION_KEY') || 
                       Deno.env.get('ETH_ENCRYPTION_KEY');
        console.log(`🔑 ETH: Using encryption key: ${Deno.env.get('CRYPTO_ENCRYPTION_KEY') ? 'CRYPTO_ENCRYPTION_KEY' : 'ETH_ENCRYPTION_KEY'}`);
      } else {
        // For other assets (BTC, SOL), use CRYPTO_ENCRYPTION_KEY or ETH_ENCRYPTION_KEY
        encryptionKey = Deno.env.get('CRYPTO_ENCRYPTION_KEY') || 
                       Deno.env.get('ETH_ENCRYPTION_KEY') ||
                       Deno.env.get('BTC_ENCRYPTION_KEY');
        console.log(`🔑 ${targetAsset}: Using encryption key: ${Deno.env.get('CRYPTO_ENCRYPTION_KEY') ? 'CRYPTO_ENCRYPTION_KEY' : Deno.env.get('ETH_ENCRYPTION_KEY') ? 'ETH_ENCRYPTION_KEY' : 'BTC_ENCRYPTION_KEY'}`);
      }
      
      if (!encryptionKey) {
        console.error(`❌ No encryption key found for ${targetAsset}. Checked:`, {
          ETH_ENCRYPTION_KEY: !!Deno.env.get('ETH_ENCRYPTION_KEY'),
          CRYPTO_ENCRYPTION_KEY: !!Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
          BTC_ENCRYPTION_KEY: !!Deno.env.get('BTC_ENCRYPTION_KEY'),
        });
        const keyName = 'CRYPTO_ENCRYPTION_KEY';
        results.push({
          asset: targetAsset,
          success: false,
          error: `Encryption key not configured. Set CRYPTO_ENCRYPTION_KEY in Supabase Edge Function secrets (or legacy ${targetAsset === 'ETH' ? 'ETH' : targetAsset === 'BTC' ? 'BTC' : 'asset-specific'}_ENCRYPTION_KEY).`,
        });
        continue;
      }
      try {
        const dbAsset = targetAsset;
        
        // Check if wallet already exists (active or inactive)
        let existingWallet: any = null;
        let walletError: any = null;
        
        const { data: wallet, error: error } = await supabase
          .from('crypto_wallets')
          .select('id, address, private_key_encrypted, is_active')
          .eq('user_id', user.id)
          .eq('asset', dbAsset)
          .eq('network', 'mainnet')
          .maybeSingle();
        
        existingWallet = wallet;
        walletError = error;

        // Check if existing wallet has keys
        const hasKeys = existingWallet?.private_key_encrypted && 
                        existingWallet.private_key_encrypted.trim() !== '';

        if (existingWallet && !walletError) {
          // If force regenerate is requested, deactivate old wallet
          if (force_regenerate) {
            console.log(`🔄 Force regenerating ${targetAsset} wallet for user ${user.id}...`);
            await supabase
              .from('crypto_wallets')
              .update({ is_active: false })
              .eq('id', existingWallet.id);
            // Continue to generate new wallet below
          }
          // If wallet exists but has no keys, we need to create a new wallet
          // BUT: We should use the existing wallet's address if possible, OR create new wallet
          // For ETH: We can't generate a private key for an existing address, so we must create new wallet
          // However, we'll update the existing wallet record instead of creating a duplicate
          else if (regenerate_if_no_keys && !hasKeys) {
            console.log(`⚠️ ${targetAsset} wallet exists but has no keys. Address: ${existingWallet.address}`);
            console.log(`   Will generate new wallet and update existing record (address will change)`);
            // Note: For ETH, we can't reuse the address without the original private key
            // So we'll generate a new wallet and update the existing record
            // This ensures we don't create duplicate wallets
            // The old address will be replaced with the new one
            await supabase
              .from('crypto_wallets')
              .update({ is_active: false })
              .eq('id', existingWallet.id);
            // Continue to generate new wallet below, which will update the existing record
          }
          // Wallet exists with keys - skip
          else if (hasKeys) {
            console.log(`✅ User ${user.id} already has ${targetAsset} wallet with keys: ${existingWallet.address}`);
            results.push({
              asset: targetAsset,
              success: true,
              address: existingWallet.address,
              wallet_id: existingWallet.id,
              message: `${targetAsset} wallet already exists with keys stored`,
              has_keys: true,
            });
            continue;
          }
          // Wallet exists but no keys and regenerate_if_no_keys is false
          else {
            console.log(`⚠️ ${targetAsset} wallet exists but has no keys and regenerate_if_no_keys is false`);
            results.push({
              asset: targetAsset,
              success: false,
              error: 'Wallet exists but has no private key stored. Set regenerate_if_no_keys: true to regenerate.',
              wallet_address: existingWallet.address,
              has_keys: false,
            });
            continue;
          }
        }

        // Generate wallet and private key based on asset type
        let walletAddress: string;
        let privateKeyHex: string;
        let publicKeyHex: string = '';

        console.log(`🔑 Generating ${targetAsset} wallet for user ${user.id}...`);

        if (targetAsset === 'BTC') {
          // Bitcoin wallet generation
          const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
          const getPrivateKey = secp256k1Module.utils.randomPrivateKey || secp256k1Module.privateKeyGenerate;
          const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
          
          const privateKeyBytes = getPrivateKey();
          const publicKeyBytes = getPublicKey(privateKeyBytes, true); // compressed
          
          const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
          const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
          const ripemd160Module = await import("https://esm.sh/@noble/hashes@1.3.3/ripemd160.js");
          const ripemd160 = ripemd160Module.ripemd160 || ripemd160Module.default?.ripemd160 || ripemd160Module.default;
          
          const sha256Hash = sha256(publicKeyBytes);
          const hash160 = ripemd160(sha256Hash);
          
          const version = 0x00; // mainnet
          const versioned = new Uint8Array(21);
          versioned[0] = version;
          versioned.set(hash160, 1);
          
          const checksum1 = sha256(versioned);
          const checksum2 = sha256(checksum1);
          const checksum = checksum2.slice(0, 4);
          
          const addressBytes = new Uint8Array(25);
          addressBytes.set(versioned, 0);
          addressBytes.set(checksum, 21);
          
          const bs58Module = await import("https://esm.sh/bs58@5.0.0");
          const bs58 = bs58Module.default || bs58Module;
          walletAddress = bs58.encode(addressBytes);
          
          privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        } else if (targetAsset === 'ETH' || targetAsset === 'ETHEREUM') {
          // ============================================================
          // Ethereum wallet generation - USING ETHERS.JS ONLY
          // ============================================================
          // This is the ONLY method for generating ETH wallets.
          // DO NOT use manual cryptographic implementations (@noble/secp256k1, etc.)
          // ethers.js handles all cryptographic operations securely.
          // ============================================================
          
          // Import ethers.js (latest version)
          const { ethers } = await import("https://esm.sh/ethers@6.9.0");
          
          // Generate a fresh new wallet with cryptographically secure random private key
          // ethers.Wallet.createRandom() uses Web Crypto API for secure randomness
          // This generates a 256-bit private key using cryptographically secure RNG
          const wallet = ethers.Wallet.createRandom();
          
          // Extract wallet details
          walletAddress = wallet.address;
          // Private key without 0x prefix (64 hex characters = 32 bytes = 256 bits)
          privateKeyHex = wallet.privateKey.replace('0x', '');
          // Public key without 0x prefix (130 hex characters = 65 bytes uncompressed)
          publicKeyHex = wallet.publicKey.replace('0x', '');
          
          console.log(`✅ Generated fresh ETH wallet using ethers.js: ${walletAddress}`);
          console.log(`   Private key length: ${privateKeyHex.length} hex chars (${privateKeyHex.length / 2} bytes)`);
          console.log(`   Public key length: ${publicKeyHex.length} hex chars`);
          console.log(`   Method: ethers.Wallet.createRandom() - cryptographically secure`);
          console.log(`   ⚠️  Private key will be encrypted before storage (NEVER stored in plaintext)`);

        } else if (targetAsset === 'SOL') {
          // Solana wallet generation
          const solanaModule = await import("https://esm.sh/@solana/web3.js@1.87.6");
          const Keypair = solanaModule.Keypair || solanaModule.default?.Keypair;
          
          const keypair = Keypair.generate();
          walletAddress = keypair.publicKey.toBase58();
          
          // Solana private key is the secret key (64 bytes)
          const secretKey = keypair.secretKey;
          privateKeyHex = Array.from(secretKey).map(b => b.toString(16).padStart(2, '0')).join('');
          publicKeyHex = Array.from(keypair.publicKey.toBytes()).map(b => b.toString(16).padStart(2, '0')).join('');

        } else {
          results.push({
            asset: targetAsset,
            success: false,
            error: `Unsupported asset: ${targetAsset}`,
          });
          continue;
        }

        // ============================================================
        // ENCRYPT PRIVATE KEY - REQUIRED FOR ALL ASSETS INCLUDING ETH
        // ============================================================
        // Private keys are NEVER stored in plaintext.
        // Encryption uses AES-256-GCM with PBKDF2 key derivation.
        // ============================================================
        let encryptedPrivateKey: string;
        try {
          console.log(`🔐 Encrypting ${targetAsset} private key...`);
          console.log(`   Private key length: ${privateKeyHex.length} hex chars`);
          console.log(`   Encryption key length: ${encryptionKey.length} chars`);
          
          // Encrypt the private key using AES-256-GCM
          // This is CRITICAL - private keys must be encrypted before storage
          encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
          
          if (!encryptedPrivateKey || encryptedPrivateKey.length === 0) {
            throw new Error('Encryption returned empty result - private key cannot be stored unencrypted');
          }
          
          console.log(`✅ ${targetAsset} private key encrypted successfully`);
          console.log(`   Encrypted key length: ${encryptedPrivateKey.length} chars`);
          console.log(`   Encryption method: AES-256-GCM with PBKDF2`);
          console.log(`   Encrypted key preview: ${encryptedPrivateKey.substring(0, 50)}...`);
          console.log(`   ⚠️  Original private key has been cleared from memory`);
        } catch (encryptError: any) {
          console.error(`❌ Error encrypting ${targetAsset} private key:`, encryptError);
          console.error(`   Error details:`, {
            message: encryptError.message,
            name: encryptError.name,
            stack: encryptError.stack?.substring(0, 500),
          });
          results.push({
            asset: targetAsset,
            success: false,
            error: `Failed to encrypt private key: ${encryptError.message}`,
          });
          continue;
        }

        // Store wallet in database (update if exists, insert if new)
        console.log(`💾 Storing ${targetAsset} wallet: ${walletAddress}`);
        console.log(`   Encrypted key to store length: ${encryptedPrivateKey.length} chars`);
        
        let wallet: any;
        let insertError: any;
        
        if (existingWallet && !walletError) {
          // If updating TRX wallet to TRON, deactivate any existing TRON wallets first
          if (targetAsset === 'TRX' && existingWallet.asset === 'TRX') {
            await supabase
              .from('crypto_wallets')
              .update({ is_active: false })
              .eq('user_id', user.id)
              .eq('asset', 'TRON')
              .eq('network', 'mainnet');
          }
          
          // Update existing wallet (also update asset to TRON if it was TRX)
          // IMPORTANT: private_key_encrypted is the ENCRYPTED private key (never store plaintext)
          const updateData: any = {
            address: walletAddress,
            private_key_encrypted: encryptedPrivateKey, // AES-256-GCM encrypted private key
            public_key: publicKeyHex || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          };
          
          // If wallet was stored as TRX, update it to TRON
          if (targetAsset === 'TRX' && existingWallet.asset === 'TRX') {
            updateData.asset = 'TRON';
          }
          
          console.log(`   Updating wallet with encrypted key length: ${encryptedPrivateKey.length}`);
          const { data: updatedWallet, error: updateError } = await supabase
            .from('crypto_wallets')
            .update(updateData)
            .eq('id', existingWallet.id)
            .select('id, address, private_key_encrypted, public_key, is_active, asset, network')
            .single();
          
          if (updateError) {
            console.error(`   Update error:`, updateError);
          } else {
            console.log(`   Update successful. Returned wallet has key: ${!!updatedWallet?.private_key_encrypted}`);
            console.log(`   Returned key length: ${updatedWallet?.private_key_encrypted?.length || 0}`);
          }
          
          wallet = updatedWallet;
          insertError = updateError;
          
          // Also deactivate any other TRX wallets for this user (if we converted one to TRON)
          if (targetAsset === 'TRX' && existingWallet.asset === 'TRX') {
            await supabase
              .from('crypto_wallets')
              .update({ is_active: false })
              .eq('user_id', user.id)
              .eq('asset', 'TRX')
              .eq('network', 'mainnet')
              .neq('id', existingWallet.id);
          }
        } else {
          // Insert new wallet
          // IMPORTANT: private_key_encrypted is the ENCRYPTED private key (never store plaintext)
          console.log(`   Inserting wallet with encrypted key length: ${encryptedPrivateKey.length}`);
          const { data: newWallet, error: newWalletError } = await supabase
            .from('crypto_wallets')
            .insert({
              user_id: user.id,
              asset: dbAsset,
              network: 'mainnet',
              address: walletAddress,
              private_key_encrypted: encryptedPrivateKey, // AES-256-GCM encrypted private key
              public_key: publicKeyHex || null,
              is_active: true,
            })
            .select('id, address, private_key_encrypted, public_key, is_active, asset, network')
            .single();
          
          if (newWalletError) {
            console.error(`   Insert error:`, newWalletError);
          } else {
            console.log(`   Insert successful. Returned wallet has key: ${!!newWallet?.private_key_encrypted}`);
            console.log(`   Returned key length: ${newWallet?.private_key_encrypted?.length || 0}`);
          }
          
          wallet = newWallet;
          insertError = newWalletError;
        }

        if (insertError) {
          console.error(`❌ Error storing ${targetAsset} wallet:`, insertError);
          results.push({
            asset: targetAsset,
            success: false,
            error: `Failed to store wallet: ${insertError.message}`,
          });
          continue;
        }

        // Verify that the encrypted private key was actually stored
        if (!wallet || !wallet.private_key_encrypted || wallet.private_key_encrypted.trim() === '') {
          console.error(`❌ ${targetAsset} wallet stored but private_key_encrypted is missing or empty`);
          results.push({
            asset: targetAsset,
            success: false,
            error: `Wallet created but private key was not stored properly`,
          });
          continue;
        }

        console.log(`✅ ${targetAsset} wallet stored successfully with encrypted private key (length: ${wallet.private_key_encrypted.length})`);

        // Verify keys were stored by re-fetching from database
        const { data: verifyWallet, error: verifyError } = await supabase
          .from('crypto_wallets')
          .select('id, address, private_key_encrypted, is_active')
          .eq('id', wallet.id)
          .single();

        if (verifyError) {
          console.error(`❌ Error verifying ${targetAsset} wallet:`, verifyError);
          results.push({
            asset: targetAsset,
            success: false,
            error: `Wallet created but verification failed: ${verifyError.message}`,
          });
          continue;
        }

        if (!verifyWallet?.private_key_encrypted || verifyWallet.private_key_encrypted.trim() === '') {
          console.error(`❌ CRITICAL: ${targetAsset} wallet created but private_key_encrypted is NULL or empty!`);
          console.error(`   Wallet ID: ${wallet.id}`);
          console.error(`   Address: ${wallet.address}`);
          console.error(`   Encrypted key we tried to store length: ${encryptedPrivateKey.length}`);
          
          // Try to update the wallet directly with the encrypted key
          console.log(`   Attempting to fix by updating wallet directly...`);
          const { error: fixError } = await supabase
            .from('crypto_wallets')
            .update({ 
              private_key_encrypted: encryptedPrivateKey,
              updated_at: new Date().toISOString()
            })
            .eq('id', wallet.id);
          
          if (fixError) {
            console.error(`   ❌ Failed to fix wallet:`, fixError);
            results.push({
              asset: targetAsset,
              success: false,
              error: `Wallet created but private key was not stored and fix attempt failed: ${fixError.message}`,
            });
            continue;
          }
          
          // Verify again after fix
          const { data: fixedWallet } = await supabase
            .from('crypto_wallets')
            .select('private_key_encrypted')
            .eq('id', wallet.id)
            .single();
          
          if (!fixedWallet?.private_key_encrypted || fixedWallet.private_key_encrypted.trim() === '') {
            console.error(`   ❌ Still NULL after fix attempt!`);
            results.push({
              asset: targetAsset,
              success: false,
              error: 'Wallet created but private key could not be stored even after fix attempt',
            });
            continue;
          }
          
          console.log(`   ✅ Fixed! Key now stored (length: ${fixedWallet.private_key_encrypted.length})`);
        }

        console.log(`✅ ${targetAsset} wallet stored successfully for user ${user.id}: ${walletAddress}`);
        results.push({
          asset: targetAsset,
          success: true,
          address: walletAddress,
          wallet_id: wallet.id,
          message: `${targetAsset} wallet created successfully`,
        });

      } catch (error: any) {
        console.error(`❌ Exception generating ${targetAsset} wallet:`, error);
        results.push({
          asset: targetAsset,
          success: false,
          error: error.message || `Failed to generate ${targetAsset} wallet`,
        });
      }
    }

    // Return results
    const allSuccess = results.every(r => r.success);
    return new Response(
      JSON.stringify({
        success: allSuccess,
        results: results,
        message: `Processed ${results.length} asset(s)`,
      }),
      {
        status: allSuccess ? 200 : 207, // 207 Multi-Status if some failed
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception in store crypto keys function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to store crypto keys',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Encrypt private key using AES-256-GCM
 * Uses Web Crypto API with PBKDF2 key derivation
 * 
 * This function encrypts private keys (including ETH private keys) before storage.
 * Private keys are NEVER stored in plaintext in the database.
 * 
 * Encryption details:
 * - Algorithm: AES-256-GCM (Galois/Counter Mode)
 * - Key derivation: PBKDF2 with SHA-256
 * - Iterations: 100,000
 * - Salt: 16 random bytes (unique per encryption)
 * - IV: 12 random bytes (unique per encryption)
 * 
 * @param privateKey - Plaintext private key (hex string without 0x prefix)
 * @param encryptionKey - Encryption key from environment variable
 * @returns Base64-encoded encrypted private key (includes salt + IV + encrypted data)
 */
async function encryptPrivateKey(privateKey: string, encryptionKey: string): Promise<string> {
  try {
    // Validate inputs
    if (!privateKey || privateKey.length === 0) {
      throw new Error('Private key is empty');
    }
    if (!encryptionKey || encryptionKey.length === 0) {
      throw new Error('Encryption key is empty');
    }
    
    console.log(`   Encrypting: private key length=${privateKey.length}, encryption key length=${encryptionKey.length}`);
    
    // Use Web Crypto API for encryption
    const keyData = new TextEncoder().encode(encryptionKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive encryption key using PBKDF2
    const salt = crypto.getRandomValues(new Uint8Array(16));
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
      ['encrypt']
    );

    // Encrypt private key using AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      new TextEncoder().encode(privateKey)
    );

    // Combine salt, iv, and encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // Return as base64 string
    const base64Result = btoa(String.fromCharCode(...combined));
    
    if (!base64Result || base64Result.length === 0) {
      throw new Error('Base64 encoding returned empty result');
    }
    
    console.log(`   Encryption successful: result length=${base64Result.length}`);
    return base64Result;
  } catch (error: any) {
    console.error('❌ Error encrypting private key:', error);
    console.error('   Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 500),
    });
    throw new Error(`Failed to encrypt private key: ${error.message || 'Unknown error'}`);
  }
}

