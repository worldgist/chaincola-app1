// Generate Ripple (XRP) Wallet Address Edge Function
// Generates a fresh XRP wallet address using @noble/secp256k1
//
// This function:
//   1. Generates a new XRP wallet using secp256k1 cryptographic primitives
//   2. Encrypts the private key using AES-256-GCM
//   3. Stores wallet address, public key, destination tag, and encrypted private key in database
//   4. Returns wallet address and destination tag to the client
//
// SECURITY:
//   - Private keys are NEVER returned to the client
//   - Private keys are encrypted using AES-256-GCM with PBKDF2 key derivation
//   - Only wallet address and destination tag are returned
//   - Uses cryptographically secure random number generation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Encrypt private key using AES-256-GCM
 * Uses Web Crypto API with PBKDF2 key derivation
 * 
 * This function encrypts private keys before storage.
 * Private keys are NEVER stored in plaintext in the database.
 * 
 * Encryption details:
 * - Algorithm: AES-256-GCM (Galois/Counter Mode)
 * - Key derivation: PBKDF2 with SHA-256
 * - Iterations: 100,000
 * - Salt: 16 random bytes (unique per encryption)
 * - IV: 12 random bytes (unique per encryption)
 * 
 * @param privateKey - Plaintext private key (hex string)
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
    const { user_id, network = 'mainnet', force_new = false } = body;

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
        .eq("asset", "XRP")
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
            message: 'Existing wallet found',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Force new wallet - delete existing wallet first
      console.log(`🗑️ Force new wallet requested - deleting existing XRP wallet for user ${targetUserId}`);
      const { error: deleteError } = await supabase
        .from("crypto_wallets")
        .delete()
        .eq("user_id", targetUserId)
        .eq("asset", "XRP")
        .eq("network", network);

      if (deleteError) {
        console.warn(`⚠️ Error deleting existing wallet (may not exist):`, deleteError);
      } else {
        console.log(`✅ Deleted existing XRP wallet`);
      }
    }

    // ============================================================
    // GENERATE XRP WALLET USING MANUAL CRYPTO PRIMITIVES
    // ============================================================
    // Uses secp256k1 (same as Bitcoin) with XRP address encoding
    // This approach is more reliable in Deno Edge Functions
    // ============================================================
    console.log(`🔑 Generating new XRP wallet for user ${targetUserId} on ${network}...`);

    // Use secp256k1 for key generation (works well in Deno)
    const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
    const getPrivateKey = secp256k1Module.utils.randomPrivateKey || secp256k1Module.privateKeyGenerate;
    const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
    
    // Generate private and public keys
    let privateKeyBytes = getPrivateKey();
    let publicKeyBytes = getPublicKey(privateKeyBytes, false); // uncompressed for XRP
    
    // Import hashing functions (needed for address encoding)
    const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
    const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
    const ripemd160Module = await import("https://esm.sh/@noble/hashes@1.3.3/ripemd160.js");
    const ripemd160 = ripemd160Module.ripemd160 || ripemd160Module.default?.ripemd160 || ripemd160Module.default;
    
    // XRP address encoding: SHA-256(RIPEMD-160(public key))
    let sha256Hash = sha256(publicKeyBytes);
    let accountId = ripemd160(sha256Hash); // 20 bytes
    
    // XRP classic address encoding
    // XRP addresses use base58 encoding and MUST start with 'r'
    // We'll use retry logic to regenerate keys until we get an address starting with 'r'
    let address: string;
    let privateKeyHex: string;
    let publicKeyHex: string;
    
    // Helper function to encode XRP address
    // XRP Classic addresses always start with 'r'
    const encodeXRPAddress = async (accountIdBytes: Uint8Array): Promise<string> => {
      // For XRP addresses to start with 'r', we need to use the value that encodes to 'r' in base58
      // In Bitcoin's base58, 'r' corresponds to decimal 33, which means we need a specific version byte
      // Actually, XRP uses: 0x00 for the account type, but the 'r' comes from the data range
      // The trick: addresses starting with 'r' need the first byte of the payload to be in a specific range
      
      // Let's use the standard XRP approach: prefix with 0x00 for account addresses
      const versioned = new Uint8Array(21);
      versioned[0] = 0x00; // XRP account address type
      versioned.set(accountIdBytes, 1);
      
      // Calculate checksum using double SHA-256
      const checksum1 = sha256(versioned);
      const checksum2 = sha256(checksum1);
      const checksum = checksum2.slice(0, 4);
      
      // Combine version + accountId + checksum
      const addressBytes = new Uint8Array(25);
      addressBytes.set(versioned, 0);
      addressBytes.set(checksum, 21);
      
      // Use ripple-address-codec alphabet for base58 encoding
      // This is the same as Bitcoin's alphabet
      const ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
      
      // Convert bytes to BigInt
      let num = BigInt(0);
      for (let i = 0; i < addressBytes.length; i++) {
        num = num * BigInt(256) + BigInt(addressBytes[i]);
      }
      
      // Encode to base58 using XRP alphabet
      let encoded = '';
      while (num > 0) {
        const remainder = Number(num % BigInt(58));
        encoded = ALPHABET[remainder] + encoded;
        num = num / BigInt(58);
      }
      
      // Preserve leading zeros as 'r' (first char of alphabet)
      for (let i = 0; i < addressBytes.length && addressBytes[i] === 0; i++) {
        encoded = ALPHABET[0] + encoded;
      }
      
      return encoded;
    };
    
    // Encode XRP address - with the XRP alphabet, addresses will always start with 'r'
    console.log(`🔄 Generating XRP address...`);
    address = await encodeXRPAddress(accountId);
    
    // Convert keys to hex for storage
    privateKeyHex = Array.from(privateKeyBytes).map((b) => (b as number).toString(16).padStart(2, '0')).join('');
    publicKeyHex = Array.from(publicKeyBytes).map((b) => (b as number).toString(16).padStart(2, '0')).join('');
    
    console.log(`✅ Generated XRP address: ${address}`);
    
    // Validate address format (XRP addresses are 25-34 characters, start with 'r')
    if (!address || address.length < 25 || address.length > 34 || !address.startsWith('r')) {
      throw new Error(`Invalid XRP address format: ${address}. Must be 25-34 chars and start with 'r'`);
    }
    
    console.log(`✅ Generated XRP wallet: ${address}`);
    console.log(`   Network: ${network} (${network === 'testnet' ? 'testnet - same address format as mainnet' : 'mainnet'})`);
    console.log(`   Private key length: ${privateKeyHex.length} hex chars (${privateKeyHex.length / 2} bytes)`);
    console.log(`   Public key length: ${publicKeyHex.length} hex chars`);
    console.log(`   Method: @noble/secp256k1 - cryptographically secure`);
    console.log(`   Note: XRP addresses use the same format for mainnet and testnet`);

    // Generate a random destination tag (optional, but useful for tracking)
    const destinationTag = Math.floor(Math.random() * 4294967295); // Max 32-bit unsigned int
    console.log(`   Destination tag: ${destinationTag}`);

    // ============================================================
    // ENCRYPT PRIVATE KEY BEFORE STORAGE
    // ============================================================
    // Private keys are NEVER stored in plaintext.
    // Encryption uses AES-256-GCM with PBKDF2 key derivation.
    // ============================================================
    
    // Get encryption key from Supabase Secrets
    // Priority: XRP_ENCRYPTION_KEY > CRYPTO_ENCRYPTION_KEY > ETH_ENCRYPTION_KEY
    const encryptionKey = Deno.env.get('XRP_ENCRYPTION_KEY') ||
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                         Deno.env.get('ETH_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('❌ XRP_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or ETH_ENCRYPTION_KEY not set in Supabase secrets');
      throw new Error('Encryption key not configured. Please set XRP_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or ETH_ENCRYPTION_KEY in Supabase secrets.');
    }

    console.log(`🔐 Encrypting XRP private key...`);
    console.log(`   Using encryption key: ${Deno.env.get('XRP_ENCRYPTION_KEY') ? 'XRP_ENCRYPTION_KEY' : Deno.env.get('CRYPTO_ENCRYPTION_KEY') ? 'CRYPTO_ENCRYPTION_KEY' : 'ETH_ENCRYPTION_KEY'}`);

    let encryptedPrivateKey: string;
    try {
      encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
      console.log(`✅ Private key encrypted successfully`);
      console.log(`   Encrypted key length: ${encryptedPrivateKey.length} chars`);
    } catch (encryptError: any) {
      console.error('❌ Failed to encrypt private key:', encryptError);
      throw new Error(`Failed to encrypt private key: ${encryptError.message || 'Unknown error'}`);
    }

    // ============================================================
    // STORE WALLET IN DATABASE
    // ============================================================
    console.log(`💾 Storing XRP wallet in database...`);
    
    const { data: wallet, error: insertError } = await supabase
      .from("crypto_wallets")
      .insert({
        user_id: targetUserId,
        asset: "XRP",
        network: network,
        address: address,
        public_key: publicKeyHex,
        private_key_encrypted: encryptedPrivateKey, // AES-256-GCM encrypted private key
        derivation_path: null,
        destination_tag: destinationTag.toString(), // XRP destination tag
        is_active: true,
      })
      .select('id, address, asset, network, destination_tag, is_active')
      .single();

    if (insertError) {
      console.error('❌ Error inserting wallet:', insertError);
      throw new Error(`Failed to store wallet: ${insertError.message}`);
    }

    console.log(`✅ XRP wallet stored successfully`);
    console.log(`   Wallet ID: ${wallet.id}`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Destination Tag: ${wallet.destination_tag}`);
    console.log(`   Network: ${wallet.network}`);

    return new Response(
      JSON.stringify({
        success: true,
        address: wallet.address,
        asset: wallet.asset,
        network: wallet.network,
        destination_tag: wallet.destination_tag,
        message: 'XRP wallet generated and stored successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in generate XRP wallet function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate XRP wallet',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

