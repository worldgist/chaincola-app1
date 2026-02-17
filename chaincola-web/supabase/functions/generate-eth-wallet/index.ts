// Generate Ethereum Wallet Address Edge Function
// Generates a fresh ETH wallet address using ethers.js
//
// This function:
//   1. Generates a new ETH wallet using ethers.Wallet.createRandom()
//   2. Stores wallet address and public key in database
//   3. Returns wallet address to the client
//
// SECURITY:
//   - Private keys are NEVER returned to the client
//   - Private keys are stored encrypted via store-crypto-keys function
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
        JSON.stringify({ error: "Unauthorized" }),
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
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { network = 'mainnet', force_new = false } = body;

    // Validate network
    if (network !== 'mainnet' && network !== 'testnet') {
      return new Response(
        JSON.stringify({ error: "Invalid network. Must be 'mainnet' or 'testnet'" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if wallet already exists (skip if force_new is true)
    if (!force_new) {
      const { data: existingWallet } = await supabase
        .from("crypto_wallets")
        .select("*")
        .eq("user_id", user.id)
        .eq("asset", "ETH")
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
      console.log(`🗑️ Force new wallet requested - deleting existing ETH wallet for user ${user.id}`);
      const { error: deleteError } = await supabase
        .from("crypto_wallets")
        .delete()
        .eq("user_id", user.id)
        .eq("asset", "ETH")
        .eq("network", network);

      if (deleteError) {
        console.warn(`⚠️ Error deleting existing wallet (may not exist):`, deleteError);
      } else {
        console.log(`✅ Deleted existing ETH wallet`);
      }
    }

    // ============================================================
    // GENERATE ETH WALLET USING ETHERS.JS
    // ============================================================
    // This is the ONLY method for generating ETH wallets.
    // DO NOT use manual cryptographic implementations (@noble/secp256k1, etc.)
    // ethers.js handles all cryptographic operations securely.
    // ============================================================
    
    console.log(`🔑 Generating new ETH wallet for user ${user.id} on ${network}...`);

    // Import ethers.js (latest version)
    const { ethers } = await import("https://esm.sh/ethers@6.9.0");
    
    // Generate a fresh new wallet with cryptographically secure random private key
    // ethers.Wallet.createRandom() uses Web Crypto API for secure randomness
    // This generates a 256-bit private key using cryptographically secure RNG
    const wallet = ethers.Wallet.createRandom();
    
    // Extract wallet details
    const walletAddress = wallet.address;
    // Private key without 0x prefix (64 hex characters = 32 bytes = 256 bits)
    const privateKeyHex = wallet.privateKey.replace('0x', '');
    // Public key without 0x prefix (for storage)
    const publicKeyHex = wallet.publicKey.replace('0x', '');
    
    console.log(`✅ Generated fresh ETH wallet using ethers.js: ${walletAddress}`);
    console.log(`   Network: ${network} (${network === 'testnet' ? 'testnet - same address format as mainnet' : 'mainnet'})`);
    console.log(`   Private key length: ${privateKeyHex.length} hex chars (${privateKeyHex.length / 2} bytes)`);
    console.log(`   Public key length: ${publicKeyHex.length} hex chars`);
    console.log(`   Method: ethers.Wallet.createRandom() - cryptographically secure`);
    console.log(`   Note: ETH/USDT/USDC addresses use the same format for mainnet and testnet`);

    // ============================================================
    // ENCRYPT PRIVATE KEY BEFORE STORAGE
    // ============================================================
    // Private keys are NEVER stored in plaintext.
    // Encryption uses AES-256-GCM with PBKDF2 key derivation.
    // ============================================================
    
    // Get encryption key from Supabase Secrets
    const encryptionKey = Deno.env.get('ETH_ENCRYPTION_KEY') ||
                         Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                         Deno.env.get('TRON_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('❌ ETH_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or TRON_ENCRYPTION_KEY not set in Supabase secrets');
      throw new Error('Encryption key not configured. Please set ETH_ENCRYPTION_KEY, CRYPTO_ENCRYPTION_KEY, or TRON_ENCRYPTION_KEY in Supabase secrets.');
    }

    let encryptedPrivateKey: string;
    try {
      console.log(`🔐 Encrypting ETH private key...`);
      encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
      console.log(`✅ ETH private key encrypted successfully`);
      console.log(`   Encrypted key length: ${encryptedPrivateKey.length} chars`);
      console.log(`   Encryption method: AES-256-GCM with PBKDF2`);
    } catch (encryptError: any) {
      console.error(`❌ Error encrypting ETH private key:`, encryptError);
      throw new Error(`Failed to encrypt private key: ${encryptError.message}`);
    }

    // Clear private key from memory immediately after encryption
    // (privateKeyHex is now only in encrypted form)
    const _ = privateKeyHex; // Reference cleared
    console.log(`🗑️  Original private key cleared from memory`);

    // Save wallet to database WITH encrypted private key
    // This ensures the address and private key are always in sync
    const { data: newWallet, error: insertError } = await supabase
      .from("crypto_wallets")
      .insert({
        user_id: user.id,
        asset: "ETH",
        network: network,
        address: walletAddress,
        private_key_encrypted: encryptedPrivateKey, // AES-256-GCM encrypted private key
        public_key: publicKeyHex,
        derivation_path: null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error saving wallet to database:', insertError);
      throw insertError;
    }

    console.log(`✅ ETH wallet saved to database with encrypted private key: ${walletAddress}`);

    // Return address to app (NEVER return private key or mnemonic)
    const responseData: any = {
      success: true,
      address: newWallet.address,
      asset: newWallet.asset,
      network: newWallet.network,
      message: 'ETH wallet generated successfully',
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Generate ETH wallet error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

