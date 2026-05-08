// Generate Bitcoin Wallet Address Edge Function
// Generates a fresh BTC wallet address using bitcoinjs-lib
//
// This function:
//   1. Generates a new BTC wallet using bitcoinjs-lib (supports mainnet and testnet)
//   2. Encrypts the private key using AES-256-GCM
//   3. Stores wallet address, public key, and encrypted private key in database
//   4. Returns wallet address to the client
//
// SECURITY:
//   - Private keys are NEVER returned to the client
//   - Private keys are encrypted using AES-256-GCM with PBKDF2 key derivation
//   - Only wallet address is returned
//   - Uses cryptographically secure random number generation
//   - Supports both mainnet and testnet networks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { bytesToBase64 } from "../_shared/bytes-to-base64.ts";

const ECPair = ECPairFactory(ecc);

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

    const base64Result = bytesToBase64(combined);
    
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
        .eq("asset", "BTC")
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
      console.log(`🗑️ Force new wallet requested - deleting existing BTC wallet for user ${targetUserId}`);
      const { error: deleteError } = await supabase
        .from("crypto_wallets")
        .delete()
        .eq("user_id", targetUserId)
        .eq("asset", "BTC")
        .eq("network", network);

      if (deleteError) {
        console.warn(`⚠️ Error deleting existing wallet (may not exist):`, deleteError);
      } else {
        console.log(`✅ Deleted existing BTC wallet`);
      }
    }

    // ============================================================
    // GENERATE BTC WALLET USING bitcoinjs-lib
    // ============================================================
    console.log(`🔑 Generating new BTC wallet for user ${targetUserId} on ${network}...`);

    // Select network (mainnet or testnet)
    const bitcoinNetwork = network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    
    if (!bitcoinNetwork) {
      throw new Error(`Invalid network: ${network}`);
    }
    
    // Verify ECPair.makeRandom is available
    if (!ECPair || typeof ECPair.makeRandom !== 'function') {
      console.error('❌ ECPair.makeRandom is not available');
      throw new Error('ECPair.makeRandom is not available');
    }
    
    // Generate a random ECPair (keypair) using bitcoinjs-lib
    // This uses cryptographically secure random number generation
    const keyPair = ECPair.makeRandom({ network: bitcoinNetwork });
    
    // Get the private key (WIF format for storage, hex for encryption)
    const privateKeyWIF = keyPair.toWIF(); // Wallet Import Format
    const privateKeyHex = keyPair.privateKey!.toString('hex');
    
    // Get the public key
    const publicKey = keyPair.publicKey;
    const publicKeyHex = publicKey.toString('hex');
    
    // Generate P2PKH address (legacy address format)
    // This is the standard "1..." address format for mainnet or "m/n..." for testnet
    const { address } = bitcoin.payments.p2pkh({
      pubkey: publicKey,
      network: bitcoinNetwork,
    });
    
    if (!address) {
      throw new Error('Failed to generate Bitcoin address');
    }
    
    // Validate address format
    if (!address || address.length < 26 || address.length > 35) {
      throw new Error(`Invalid Bitcoin address length: ${address.length} (expected 26-35)`);
    }
    
    // Verify address format matches expected pattern
    // Mainnet P2PKH addresses should start with '1'
    // Testnet P2PKH addresses should start with 'm' or 'n'
    const isValidFormat = network === 'mainnet' 
      ? (address.startsWith('1') || address.startsWith('3'))
      : (address.startsWith('m') || address.startsWith('n') || address.startsWith('2'));
    
    if (!isValidFormat) {
      console.warn(`⚠️ Generated ${network} BTC address has unusual format: ${address}`);
      console.warn(`   Expected: ${network === 'mainnet' ? '1 or 3' : 'm, n, or 2'}`);
      console.warn(`   Address length: ${address.length}`);
      // Don't throw error - address might still be valid, just log warning
    }
    
    console.log(`✅ Generated BTC wallet using bitcoinjs-lib: ${address}`);
    console.log(`   Network: ${network}`);
    console.log(`   Address format: ${address.startsWith('1') ? 'P2PKH (legacy mainnet)' : address.startsWith('3') ? 'P2SH (mainnet)' : address.startsWith('m') || address.startsWith('n') ? 'P2PKH (testnet)' : 'Unusual format'}`);
    console.log(`   Private key length: ${privateKeyHex.length} hex chars (${privateKeyHex.length / 2} bytes)`);
    console.log(`   Public key length: ${publicKeyHex.length} hex chars`);
    console.log(`   Method: bitcoinjs-lib - cryptographically secure`);

    // ============================================================
    // ENCRYPT PRIVATE KEY BEFORE STORAGE
    // ============================================================
    // Private keys are NEVER stored in plaintext.
    // Encryption uses AES-256-GCM with PBKDF2 key derivation.
    // ============================================================
    
    const encryptionKey =
      Deno.env.get("CRYPTO_ENCRYPTION_KEY") ||
      Deno.env.get("BTC_ENCRYPTION_KEY") ||
      Deno.env.get("ETH_ENCRYPTION_KEY") ||
      Deno.env.get("SOL_ENCRYPTION_KEY") ||
      Deno.env.get("TRON_ENCRYPTION_KEY");

    if (!encryptionKey) {
      console.error(
        "❌ No wallet encryption secret: set CRYPTO_ENCRYPTION_KEY or BTC_ENCRYPTION_KEY in Edge Function secrets",
      );
      throw new Error(
        "Encryption key not configured. Supabase → Project Settings → Edge Functions → Secrets: add CRYPTO_ENCRYPTION_KEY (recommended) or BTC_ENCRYPTION_KEY.",
      );
    }

    console.log(`🔐 Encrypting BTC private key...`);

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
    console.log(`💾 Storing BTC wallet in database...`);
    
    const { data: wallet, error: insertError } = await supabase
      .from("crypto_wallets")
      .insert({
        user_id: targetUserId,
        asset: "BTC",
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

    console.log(`✅ BTC wallet stored successfully`);
    console.log(`   Wallet ID: ${wallet.id}`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Network: ${wallet.network}`);

    return new Response(
      JSON.stringify({
        success: true,
        address: wallet.address,
        asset: wallet.asset,
        network: wallet.network,
        message: 'BTC wallet generated and stored successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in generate BTC wallet function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate BTC wallet',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

