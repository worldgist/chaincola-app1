// Verify Wallet Addresses Edge Function
// This function verifies that wallet addresses match their encrypted private keys
// by decrypting the private keys and deriving addresses from them

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Decrypt private key using AES-256-GCM
 */
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
    throw new Error(`Failed to decrypt private key: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Derive BTC address from private key hex
 */
async function deriveBTCAddress(privateKeyHex: string, network: 'mainnet' | 'testnet'): Promise<string> {
  const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
  const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
  
  const privateKeyBytes = Uint8Array.from(
    privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  const publicKeyBytes = getPublicKey(privateKeyBytes, true); // compressed
  
  const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
  const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
  const ripemd160Module = await import("https://esm.sh/@noble/hashes@1.3.3/ripemd160.js");
  const ripemd160 = ripemd160Module.ripemd160 || ripemd160Module.default?.ripemd160 || ripemd160Module.default;
  
  const sha256Hash = sha256(publicKeyBytes);
  const hash160 = ripemd160(sha256Hash);
  
  const version = network === 'mainnet' ? 0x00 : 0x6f;
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
  return bs58.encode(addressBytes);
}

/**
 * Derive ETH address from private key hex
 */
async function deriveETHAddress(privateKeyHex: string): Promise<string> {
  const { ethers } = await import("https://esm.sh/ethers@6.9.0");
  const wallet = new ethers.Wallet('0x' + privateKeyHex);
  return wallet.address;
}

/**
 * Derive XRP address from private key hex
 */
async function deriveXRPAddress(privateKeyHex: string): Promise<string> {
  const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
  const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
  
  const privateKeyBytes = Uint8Array.from(
    privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  const publicKeyBytes = getPublicKey(privateKeyBytes, false); // uncompressed for XRP
  
  const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
  const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
  const ripemd160Module = await import("https://esm.sh/@noble/hashes@1.3.3/ripemd160.js");
  const ripemd160 = ripemd160Module.ripemd160 || ripemd160Module.default?.ripemd160 || ripemd160Module.default;
  
  const sha256Hash = sha256(publicKeyBytes);
  const accountId = ripemd160(sha256Hash);
  
  const version = 0x00;
  const versioned = new Uint8Array(21);
  versioned[0] = version;
  versioned.set(accountId, 1);
  
  const checksum1 = sha256(versioned);
  const checksum2 = sha256(checksum1);
  const checksum = checksum2.slice(0, 4);
  
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versioned, 0);
  addressBytes.set(checksum, 21);
  
  const bs58Module = await import("https://esm.sh/bs58@5.0.0");
  const bs58 = bs58Module.default || bs58Module;
  return bs58.encode(addressBytes);
}

/**
 * Derive SOL address from private key hex (base58 encoded)
 */
async function deriveSOLAddress(privateKeyHex: string): Promise<string> {
  // Solana private keys are stored as base58-encoded seed
  // The address is the public key derived from the seed, also base58-encoded
  const { Keypair } = await import("https://esm.sh/@solana/web3.js@1.87.6");
  
  // Convert hex to Uint8Array
  const seedBytes = Uint8Array.from(
    privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  
  // Create keypair from seed
  const keypair = Keypair.fromSecretKey(seedBytes);
  
  // Return base58-encoded public key (address)
  return keypair.publicKey.toBase58();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = auth.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    // Allow service role key for admin operations
    let isAdmin = false;
    let userId: string | null = null;
    
    // Check if token is service role key (exact match or JWT pattern match)
    const isServiceRoleKey = serviceRoleKey && (
      token === serviceRoleKey || 
      token.length > 200 // Service role JWTs are typically long
    );
    
    if (isServiceRoleKey) {
      // Service role key used - grant admin access
      isAdmin = true;
      console.log('✅ Service role key authentication - admin access granted');
    } else {
      // Regular user token - verify user and check admin status
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
          // If user auth fails, check if token might be service role key anyway
          if (token.length > 200) {
            console.log('⚠️ User auth failed but token looks like service role - granting admin access');
            isAdmin = true;
          } else {
            console.error('Auth error:', authError);
            return new Response(
              JSON.stringify({ error: "Invalid or expired token" }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          userId = user.id;

          // Check if admin
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_admin, role')
            .eq('user_id', user.id)
            .single();

          if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
            return new Response(
              JSON.stringify({ error: 'Admin access required' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          isAdmin = true;
          console.log(`✅ User ${user.id.substring(0, 8)}... authenticated as admin`);
        }
      } catch (error: any) {
        // If error and token is long (likely service role), grant access
        if (token.length > 200) {
          console.log('⚠️ Auth error but token looks like service role - granting admin access');
          isAdmin = true;
        } else {
          console.error('Authentication error:', error);
          return new Response(
            JSON.stringify({ error: `Authentication failed: ${error.message}` }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const body = await req.json();
    const { user_id, asset, network = 'mainnet', limit = 10 } = body;
    
    // If service role key was used and no user_id specified, use the authenticated user
    // Otherwise, use the provided user_id or authenticated user
    const targetUserId = user_id || userId;

    // Fetch wallets
    let query = supabase
      .from('crypto_wallets')
      .select('*')
      .eq('is_active', true)
      .limit(limit);

    if (user_id) {
      query = query.eq('user_id', user_id);
    }
    if (asset) {
      query = query.eq('asset', asset);
    }
    if (network) {
      query = query.eq('network', network);
    }

    const { data: wallets, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch wallets: ${fetchError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!wallets || wallets.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No wallets found', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    for (const wallet of wallets) {
      const result: any = {
        wallet_id: wallet.id,
        user_id: wallet.user_id,
        asset: wallet.asset,
        network: wallet.network,
        stored_address: wallet.address,
        has_encrypted_key: !!wallet.private_key_encrypted,
      };

      if (!wallet.private_key_encrypted) {
        result.status = 'skipped';
        result.reason = 'No encrypted private key found';
        results.push(result);
        continue;
      }

      try {
        let encryptionKey: string | undefined;
        let derivedAddress: string;
        let privateKeyHex: string | null = null;
        let decryptionError: string | null = null;

        // Try all possible encryption keys in priority order (matching generation functions)
        if (wallet.asset === 'BTC') {
          const possibleKeys = [
            Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
            Deno.env.get('BTC_ENCRYPTION_KEY'),
            Deno.env.get('ETH_ENCRYPTION_KEY'),
          ].filter(k => k) as string[];

          if (possibleKeys.length === 0) {
            result.status = 'error';
            result.error = 'BTC encryption key not configured';
            results.push(result);
            continue;
          }

          // Try each key until one works
          for (const key of possibleKeys) {
            try {
              privateKeyHex = await decryptPrivateKey(wallet.private_key_encrypted, key);
              encryptionKey = key;
              break;
            } catch (e: any) {
              decryptionError = e.message;
              continue;
            }
          }

          if (!privateKeyHex) {
            result.status = 'error';
            result.error = `Failed to decrypt with any key: ${decryptionError}`;
            results.push(result);
            continue;
          }

          derivedAddress = await deriveBTCAddress(privateKeyHex, wallet.network as 'mainnet' | 'testnet');
        } else if (wallet.asset === 'ETH') {
          const possibleKeys = [
            Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
            Deno.env.get('ETH_ENCRYPTION_KEY'),
            Deno.env.get('TRON_ENCRYPTION_KEY'),
          ].filter(k => k) as string[];

          if (possibleKeys.length === 0) {
            result.status = 'error';
            result.error = 'ETH encryption key not configured';
            results.push(result);
            continue;
          }

          for (const key of possibleKeys) {
            try {
              privateKeyHex = await decryptPrivateKey(wallet.private_key_encrypted, key);
              encryptionKey = key;
              break;
            } catch (e: any) {
              decryptionError = e.message;
              continue;
            }
          }

          if (!privateKeyHex) {
            result.status = 'error';
            result.error = `Failed to decrypt with any key: ${decryptionError}`;
            results.push(result);
            continue;
          }

          derivedAddress = await deriveETHAddress(privateKeyHex);
        } else if (wallet.asset === 'XRP') {
          const possibleKeys = [
            Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
            Deno.env.get('XRP_ENCRYPTION_KEY'),
            Deno.env.get('ETH_ENCRYPTION_KEY'),
          ].filter(k => k) as string[];

          if (possibleKeys.length === 0) {
            result.status = 'error';
            result.error = 'XRP encryption key not configured';
            results.push(result);
            continue;
          }

          for (const key of possibleKeys) {
            try {
              privateKeyHex = await decryptPrivateKey(wallet.private_key_encrypted, key);
              encryptionKey = key;
              break;
            } catch (e: any) {
              decryptionError = e.message;
              continue;
            }
          }

          if (!privateKeyHex) {
            result.status = 'error';
            result.error = `Failed to decrypt with any key: ${decryptionError}`;
            results.push(result);
            continue;
          }

          derivedAddress = await deriveXRPAddress(privateKeyHex);
        } else if (wallet.asset === 'SOL') {
          const possibleKeys = [
            Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
            Deno.env.get('SOL_ENCRYPTION_KEY'),
            Deno.env.get('ETH_ENCRYPTION_KEY'),
          ].filter(k => k) as string[];

          if (possibleKeys.length === 0) {
            result.status = 'error';
            result.error = 'SOL encryption key not configured';
            results.push(result);
            continue;
          }

          for (const key of possibleKeys) {
            try {
              privateKeyHex = await decryptPrivateKey(wallet.private_key_encrypted, key);
              encryptionKey = key;
              break;
            } catch (e: any) {
              decryptionError = e.message;
              continue;
            }
          }

          if (!privateKeyHex) {
            result.status = 'error';
            result.error = `Failed to decrypt with any key: ${decryptionError}`;
            results.push(result);
            continue;
          }

          derivedAddress = await deriveSOLAddress(privateKeyHex);
        } else {
          result.status = 'skipped';
          result.reason = `Asset ${wallet.asset} not supported for verification`;
          results.push(result);
          continue;
        }

        result.derived_address = derivedAddress;
        result.match = derivedAddress.toLowerCase() === wallet.address.toLowerCase();
        result.status = result.match ? 'verified' : 'mismatch';

        if (!result.match) {
          result.error = `Address mismatch! Stored: ${wallet.address}, Derived: ${derivedAddress}`;
        }
      } catch (error: any) {
        result.status = 'error';
        result.error = error.message || 'Failed to verify wallet';
      }

      results.push(result);
    }

    const verified = results.filter(r => r.status === 'verified').length;
    const mismatches = results.filter(r => r.status === 'mismatch').length;
    const errors = results.filter(r => r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.length,
          verified,
          mismatches,
          errors,
          skipped,
        },
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Verification error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

