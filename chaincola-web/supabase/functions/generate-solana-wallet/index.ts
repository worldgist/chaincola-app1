// Generate Solana Wallet Address Edge Function
// Generates a fresh SOL wallet address using @solana/web3.js
//
// This function:
//   1. Generates a new SOL wallet using Keypair.generate()
//   2. Encrypts the private key using AES-256-GCM
//   3. Stores wallet address, public key, and encrypted private key in database
//   4. Returns wallet address to the client
//
// SECURITY:
//   - Private keys are NEVER returned to the client
//   - Private keys are encrypted using AES-256-GCM with PBKDF2 key derivation
//   - Only wallet address is returned
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error encrypting private key:', errorMessage);
    console.error('   Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 500),
    });
    throw new Error(`Failed to encrypt private key: ${error.message || 'Unknown error'}`);
  }
}

serve(async (req: Request) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        .eq("asset", "SOL")
        .eq("network", network)
        .single();

      if (existingWallet) {
        return new Response(
          JSON.stringify({ 
            success: true,
            address: existingWallet.address,
            asset: existingWallet.asset,
            network: existingWallet.network,
            message: 'Existing wallet found',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Force new wallet - delete existing wallet first
      console.log(`🗑️ Force new wallet requested - deleting existing SOL wallet for user ${targetUserId}`);
      const { error: deleteError } = await supabase
        .from("crypto_wallets")
        .delete()
        .eq("user_id", targetUserId)
        .eq("asset", "SOL")
        .eq("network", network);

      if (deleteError) {
        console.warn(`⚠️ Error deleting existing wallet (may not exist):`, deleteError);
      } else {
        console.log(`✅ Deleted existing SOL wallet`);
      }
    }

    // ============================================================
    // GENERATE SOL WALLET USING @solana/web3.js
    // ============================================================
    console.log(`🔑 Generating new SOL wallet for user ${targetUserId} on ${network}...`);

    // Import Solana Web3.js
    const solanaModule = await import("https://esm.sh/@solana/web3.js@1.87.6");
    const Keypair = solanaModule.Keypair || solanaModule.default?.Keypair;
    // Connection is imported but not used in this function (kept for potential future use)
    const _Connection = solanaModule.Connection || solanaModule.default?.Connection;
    
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
    
    // Log network information
    console.log(`✅ Generated SOL wallet on ${network}`);
    console.log(`   Network: ${network} (${network === 'testnet' ? 'testnet/devnet - same address format as mainnet' : 'mainnet'})`);
    console.log(`   Note: Solana addresses use the same format for mainnet, devnet, and testnet`);
    
    console.log(`✅ Generated SOL wallet: ${address}`);
    console.log(`   Network: ${network} (${network === 'testnet' ? 'testnet/devnet - same address format as mainnet' : 'mainnet'})`);
    console.log(`   Note: Solana addresses use the same format for mainnet, devnet, and testnet`);
    
    // Convert public key bytes to hex
    const publicKeyBytes = keypair.publicKey.toBytes();
    const publicKeyHex = Array.from(publicKeyBytes)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Solana private key is the secret key (64 bytes)
    const secretKey = keypair.secretKey;
    const privateKeyHex = Array.from(secretKey).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    
    console.log(`   Private key length: ${privateKeyHex.length} hex chars (${privateKeyHex.length / 2} bytes)`);
    console.log(`   Public key length: ${publicKeyHex.length} hex chars`);
    console.log(`   Method: Keypair.generate() - cryptographically secure`);

    // ============================================================
    // ENCRYPT PRIVATE KEY BEFORE STORAGE
    // ============================================================
    // Private keys are NEVER stored in plaintext.
    // Encryption uses AES-256-GCM with PBKDF2 key derivation.
    // ============================================================
    
    // Get encryption key from Supabase Secrets
    // Priority: SOL_ENCRYPTION_KEY > CRYPTO_ENCRYPTION_KEY > ETH_ENCRYPTION_KEY
    const encryptionKey = Deno.env.get('SOL_ENCRYPTION_KEY') ||
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                         Deno.env.get('ETH_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('❌ SOL_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or ETH_ENCRYPTION_KEY not set in Supabase secrets');
      throw new Error('Encryption key not configured. Please set SOL_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or ETH_ENCRYPTION_KEY in Supabase secrets.');
    }

    console.log(`🔐 Encrypting SOL private key...`);
    console.log(`   Using encryption key: ${Deno.env.get('SOL_ENCRYPTION_KEY') ? 'SOL_ENCRYPTION_KEY' : Deno.env.get('CRYPTO_ENCRYPTION_KEY') ? 'CRYPTO_ENCRYPTION_KEY' : 'ETH_ENCRYPTION_KEY'}`);

    let encryptedPrivateKey: string;
    try {
      encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
      console.log(`✅ Private key encrypted successfully`);
      console.log(`   Encrypted key length: ${encryptedPrivateKey.length} chars`);
    } catch (encryptError: unknown) {
      const errorMessage = encryptError instanceof Error ? encryptError.message : String(encryptError);
      console.error('❌ Failed to encrypt private key:', errorMessage);
      throw new Error(`Failed to encrypt private key: ${errorMessage}`);
    }

    // ============================================================
    // STORE WALLET IN DATABASE
    // ============================================================
    console.log(`💾 Storing SOL wallet in database...`);
    
    const { data: wallet, error: insertError } = await supabase
      .from("crypto_wallets")
      .insert({
        user_id: targetUserId,
        asset: "SOL",
        network: network,
        address: address,
        public_key: publicKeyHex,
        private_key_encrypted: encryptedPrivateKey, // AES-256-GCM encrypted private key
        derivation_path: null,
        is_active: true,
      })
      .select('id, address, asset, network, is_active')
      .single();

    if (insertError) {
      console.error('❌ Error inserting wallet:', insertError);
      throw new Error(`Failed to store wallet: ${insertError.message}`);
    }

    console.log(`✅ SOL wallet stored successfully`);
    console.log(`   Wallet ID: ${wallet.id}`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Network: ${wallet.network}`);

    return new Response(
      JSON.stringify({
        success: true,
        address: wallet.address,
        asset: wallet.asset,
        network: wallet.network,
        message: 'SOL wallet generated and stored successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Exception in generate SOL wallet function:', errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate SOL wallet',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

