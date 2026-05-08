import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Encrypt private key using AES-256-GCM with PBKDF2 key derivation
 * @param privateKey - Plaintext private key (hex string)
 * @param encryptionKey - Encryption key from environment variable
 * @returns Base64-encoded encrypted private key
 */
async function encryptPrivateKey(privateKey: string, encryptionKey: string): Promise<string> {
  try {
    if (!privateKey || privateKey.length === 0) {
      throw new Error('Private key is empty');
    }
    if (!encryptionKey || encryptionKey.length === 0) {
      throw new Error('Encryption key is empty');
    }
    
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
    
    return base64Result;
  } catch (error: any) {
    console.error('❌ Error encrypting private key:', error);
    throw new Error(`Failed to encrypt private key: ${error.message || 'Unknown error'}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. Auth check (important)
    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user token
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { user_id, asset = 'ETH', network = 'mainnet', force_new = false } = body;

    // Use authenticated user_id or provided user_id (admin can generate for others)
    const targetUserId = user_id || user.id;

    // Check if admin or generating for self
    if (user_id && user_id !== user.id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_admin, role')
        .eq('user_id', user.id)
        .single();

      if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
        return new Response(
          JSON.stringify({ error: 'Admin access required to generate wallets for other users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if wallet already exists (skip if force_new is true)
    if (!force_new) {
      const { data: existingWallet } = await supabase
        .from("crypto_wallets")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("asset", asset)
        .eq("network", network)
        .single();

      if (existingWallet) {
        return new Response(
          JSON.stringify({ 
            success: true,
            address: existingWallet.address,
            asset: existingWallet.asset,
            network: existingWallet.network,
            destination_tag: existingWallet.destination_tag,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Force new wallet - delete existing wallet first
      console.log(`🗑️ Force new wallet requested - deleting existing ${asset} wallet for user ${targetUserId}`);
      const { error: deleteError } = await supabase
        .from("crypto_wallets")
        .delete()
        .eq("user_id", targetUserId)
        .eq("asset", asset)
        .eq("network", network);

      if (deleteError) {
        console.warn(`⚠️ Error deleting existing wallet (may not exist):`, deleteError);
      } else {
        console.log(`✅ Deleted existing ${asset} wallet`);
      }
    }

    let walletData: any;

    // Generate wallet based on asset type
    if (asset === 'BTC' || asset === 'BITCOIN') {
      // ============================================================
      // Bitcoin wallet generation
      // ============================================================
      try {
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
        
        const version = network === 'mainnet' ? 0x00 : 0x6f; // mainnet or testnet
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
        const address = bs58.encode(addressBytes);
        
        const privateKeyHex = Array.from(privateKeyBytes).map((b) => (b as number).toString(16).padStart(2, '0')).join('');
        const publicKeyHex = Array.from(publicKeyBytes).map((b) => (b as number).toString(16).padStart(2, '0')).join('');
        
        // Encrypt private key before storage
        const encryptionKey = Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                             Deno.env.get('BTC_ENCRYPTION_KEY');
        
        if (!encryptionKey) {
          throw new Error('CRYPTO_ENCRYPTION_KEY or BTC_ENCRYPTION_KEY not set in Supabase Edge Function secrets');
        }
        
        const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
        
        walletData = {
          address: address,
          public_key: publicKeyHex,
          derivation_path: null,
          private_key_encrypted: encryptedPrivateKey,
        };
        
        console.log(`✅ Generated BTC wallet: ${address}`);
        console.log(`   Private key encrypted and ready for storage`);
      } catch (btcError: any) {
        console.error('Bitcoin wallet generation error:', btcError);
        throw new Error(`Failed to generate Bitcoin wallet: ${btcError?.message || 'Unknown error'}`);
      }
    } else if (asset === 'ETH' || asset === 'ETHEREUM') {
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
      const wallet = ethers.Wallet.createRandom();
      
      // Extract public key (remove 0x prefix for storage)
      const publicKeyHex = wallet.publicKey.replace('0x', '');
      
      walletData = {
        address: wallet.address,
        public_key: publicKeyHex,
        derivation_path: null,
      };
    } else if (asset === 'SOL') {
      // Solana wallet using @solana/web3.js
      try {
        const solanaModule = await import("https://esm.sh/@solana/web3.js@1.87.6");
        const Keypair = solanaModule.Keypair || solanaModule.default?.Keypair;
        const Connection = solanaModule.Connection || solanaModule.default?.Connection;
        
        if (!Keypair) {
          throw new Error('Solana Keypair not found in module');
        }
        
        // Generate a new keypair
        const keypair = Keypair.generate();
        
        // Get the public key as base58 string (this is the Solana address)
        const address = keypair.publicKey.toBase58();
        
        // Validate address format (Solana addresses are 32-44 characters in base58)
        if (!address || address.length < 32 || address.length > 44) {
          throw new Error(`Invalid Solana address format: ${address}`);
        }
        
        // Optional: Verify address is valid on the Solana network using Connection
        // This helps ensure the address format is correct and checks the wallet balance
        try {
          const alchemyApiKey = Deno.env.get('ALCHEMY_SOLANA_API_KEY');
          if (alchemyApiKey && Connection) {
            const rpcUrl = network === 'mainnet'
              ? Deno.env.get('ALCHEMY_SOLANA_URL') || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ'
              : `https://solana-devnet.g.alchemy.com/v2/${alchemyApiKey}`;
            
            const connection = new Connection(rpcUrl, 'confirmed');
            
            // Verify the connection is working by getting the slot
            const slot = await connection.getSlot();
            console.log(`✅ Solana ${network} connection verified, current slot: ${slot}`);
            
            // Check the balance of the newly generated wallet (should be 0 for a new wallet)
            try {
              const balance = await connection.getBalance(keypair.publicKey);
              const balanceInSol = balance / 1e9; // Convert lamports to SOL
              console.log(`✅ Wallet balance verified: ${balanceInSol} SOL (${balance} lamports)`);
              
              // New wallets should have 0 balance, but log if there's any balance
              if (balance > 0) {
                console.log(`ℹ️ Wallet already has balance: ${balanceInSol} SOL`);
              }
            } catch (balanceError) {
              // Balance check is optional, don't fail if it errors
              console.warn('⚠️ Could not check wallet balance (wallet generation continues):', balanceError);
            }
            
            // Get account info to verify the account state
            try {
              const accountInfo = await connection.getAccountInfo(keypair.publicKey);
              if (accountInfo) {
                console.log(`✅ Account info retrieved:`, {
                  executable: accountInfo.executable,
                  owner: accountInfo.owner?.toBase58(),
                  lamports: accountInfo.lamports,
                  dataLength: accountInfo.data?.length || 0,
                });
              } else {
                // Account doesn't exist yet (normal for new wallets)
                console.log(`ℹ️ Account does not exist on-chain yet (normal for new wallets)`);
              }
            } catch (accountError) {
              // Account info check is optional, don't fail if it errors
              console.warn('⚠️ Could not get account info (wallet generation continues):', accountError);
            }
          }
        } catch (connError) {
          // Connection verification is optional, don't fail wallet generation if it fails
          console.warn('⚠️ Could not verify Solana connection (wallet generation continues):', connError);
        }
        
        // Convert public key bytes to hex (without Buffer)
        const publicKeyBytes = keypair.publicKey.toBytes();
        const publicKeyHex = Array.from(publicKeyBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        // Solana private key is the secret key (64 bytes)
        const secretKey = keypair.secretKey;
        const privateKeyHex = Array.from(secretKey).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Encrypt private key before storage
        const encryptionKey = Deno.env.get('CRYPTO_ENCRYPTION_KEY') || 
                             Deno.env.get('ETH_ENCRYPTION_KEY') ||
                             Deno.env.get('SOL_ENCRYPTION_KEY');
        
        if (!encryptionKey) {
          throw new Error('CRYPTO_ENCRYPTION_KEY (or ETH_ENCRYPTION_KEY / SOL_ENCRYPTION_KEY) not set in Supabase Edge Function secrets');
        }
        
        const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
        
        walletData = {
          address: address,
          public_key: publicKeyHex,
          derivation_path: null,
          private_key_encrypted: encryptedPrivateKey,
        };
        
        console.log(`✅ Generated SOL wallet: ${address}`);
        console.log(`   Private key encrypted and ready for storage`);
      } catch (solError) {
        console.error('Solana wallet generation error:', solError);
        throw new Error(`Failed to generate Solana wallet: ${solError.message}`);
      }
    } else if (asset === 'XRP' || asset === 'RIPPLE') {
      // XRP wallet generation has been moved to dedicated generate-ripple-wallet function
      // This prevents conflicts and ensures proper encryption key handling
      return new Response(
        JSON.stringify({ 
          error: 'XRP wallet generation is handled by the dedicated generate-ripple-wallet function. Please use /functions/v1/generate-ripple-wallet instead.',
          redirect_to: '/functions/v1/generate-ripple-wallet'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Asset ${asset} not supported. Supported: BTC, ETH, SOL. Use generate-ripple-wallet for XRP.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save wallet to database
    // ============================================================
    // STORAGE ARCHITECTURE:
    // - Encryption Key: Stored in Supabase Secrets (via supabase secrets set)
    // - Encrypted Private Key: Stored in crypto_wallets.private_key_encrypted column
    // - Plaintext Private Key: NEVER stored, only exists in memory during generation
    // ============================================================
    // For BTC wallets, store encrypted private key directly (following Ethereum pattern)
    const insertData: any = {
      user_id: targetUserId,
      asset: asset,
      network: network,
      address: walletData.address,
      public_key: walletData.public_key,
      derivation_path: walletData.derivation_path,
      is_active: true,
    };
    
    // ============================================================
    // SECURITY: ONLY STORE ENCRYPTED PRIVATE KEYS
    // ============================================================
    // Private keys MUST be encrypted before storage.
    // Plaintext private keys are NEVER stored in the database.
    // ============================================================
    
    // Add encrypted private key for wallets that support it (ETH, etc.)
    // The encryption key used to encrypt this is stored in Supabase Secrets
    // The encrypted key is stored in the database table
    if (walletData.private_key_encrypted) {
      insertData.private_key_encrypted = walletData.private_key_encrypted;
      console.log(`💾 Storing wallet with encrypted private key in database: ${walletData.address}`);
      console.log(`   Encryption key source: Supabase Secrets`);
      console.log(`   Storage location: crypto_wallets.private_key_encrypted column`);
      console.log(`   ✅ Only encrypted key will be stored (never plaintext)`);
    } else {
      // If no encrypted key is provided, log a warning
      console.warn(`⚠️ Warning: No encrypted private key provided for ${asset} wallet. Wallet will be stored without private key.`);
    }
    
    // SECURITY CHECK: Explicitly prevent storing plaintext private keys
    // This is a critical security safeguard - plaintext keys must NEVER be stored
    if (walletData.private_key) {
      console.error('❌ SECURITY ERROR: Plaintext private key detected in walletData!');
      console.error('   This should NEVER happen. Plaintext keys are not stored.');
      console.error('   The plaintext key will be discarded and NOT stored in the database.');
      // Explicitly remove any plaintext key from insertData to prevent accidental storage
      delete insertData.private_key;
      // Do NOT store plaintext private key - this is a security violation
      throw new Error('SECURITY: Plaintext private key detected. Only encrypted keys can be stored. This is a critical security violation.');
    }
    
    // Ensure private_key field is never set (double-check)
    if (insertData.private_key !== undefined) {
      console.error('❌ SECURITY ERROR: Attempted to store plaintext private_key field!');
      delete insertData.private_key;
      throw new Error('SECURITY: Cannot store plaintext private_key. Only private_key_encrypted is allowed.');
    }
    
    // Add destination tag for XRP wallets
    if (walletData.destination_tag) {
      insertData.destination_tag = walletData.destination_tag;
    }
    
    const { data: newWallet, error: insertError } = await supabase
      .from("crypto_wallets")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error saving wallet to database:', insertError);
      throw insertError;
    }

    // Log success for wallets with encrypted key
    if (walletData.private_key_encrypted) {
      console.log(`✅ ${asset} wallet saved to database with encrypted private key: ${newWallet.address}`);
    }

    // Return address to app (NEVER return private key or mnemonic)
    const responseData: any = {
      success: true,
      address: newWallet.address,
      asset: newWallet.asset,
      network: newWallet.network,
    };
    
    // Include destination tag for XRP wallets
    if (newWallet.destination_tag) {
      responseData.destination_tag = newWallet.destination_tag;
    }
    
    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Generate wallet error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

