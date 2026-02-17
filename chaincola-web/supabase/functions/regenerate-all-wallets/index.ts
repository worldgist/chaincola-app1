// Regenerate All User Wallets Admin Function
// Regenerates BTC, ETH, SOL, and XRP wallets for all users
// Requires admin/service role authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'];
const FUNCTION_MAP: Record<string, string> = {
  'BTC': 'generate-bitcoin-wallet',
  'ETH': 'generate-eth-wallet',
  'SOL': 'generate-solana-wallet',
  'XRP': 'generate-ripple-wallet',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify service role authentication
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
    
    // Verify this is a service role token
    if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return new Response(
        JSON.stringify({ error: "Service role authentication required" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔄 Starting wallet regeneration for all users...');

    // Get all active wallets for BTC, ETH, SOL, XRP
    const { data: wallets, error: fetchError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, asset, address')
      .in('asset', ASSETS)
      .eq('is_active', true)
      .eq('network', 'mainnet');

    if (fetchError) {
      throw new Error(`Failed to fetch wallets: ${fetchError.message}`);
    }

    if (!wallets || wallets.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No wallets found to regenerate',
          regenerated: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${wallets.length} wallets to regenerate`);

    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Group by user_id and asset
    const userAssetMap = new Map<string, typeof wallets>();
    wallets.forEach(wallet => {
      const key = `${wallet.user_id}_${wallet.asset}`;
      if (!userAssetMap.has(key)) {
        userAssetMap.set(key, []);
      }
      userAssetMap.get(key)!.push(wallet);
    });

    // Regenerate each unique user-asset combination
    for (const [key, walletList] of userAssetMap.entries()) {
      const [userId, asset] = key.split('_');
      const functionName = FUNCTION_MAP[asset];

      if (!functionName) {
        console.error(`❌ Unknown asset: ${asset}`);
        errorCount++;
        results.push({ user_id: userId, asset, success: false, error: `Unknown asset: ${asset}` });
        continue;
      }

      try {
        console.log(`🔄 Regenerating ${asset} wallet for user ${userId.substring(0, 8)}...`);

        // Delete old wallets for this user-asset combination
        console.log(`🗑️ Deleting old ${asset} wallet(s) for user ${userId.substring(0, 8)}...`);
        const { data: deletedWallets, error: deleteError } = await supabase
          .from('crypto_wallets')
          .delete()
          .eq('user_id', userId)
          .eq('asset', asset)
          .eq('network', 'mainnet')
          .select('id, address');

        if (deleteError) {
          console.warn(`⚠️ Error deleting old ${asset} wallet for user ${userId}:`, deleteError);
        } else {
          const deletedCount = deletedWallets?.length || 0;
          if (deletedCount > 0) {
            console.log(`✅ Deleted ${deletedCount} old ${asset} wallet(s)`);
            deletedWallets?.forEach(w => {
              console.log(`   - Deleted wallet: ${w.address}`);
            });
          } else {
            console.log(`ℹ️  No existing ${asset} wallet found to delete`);
          }
        }

        // Call the dedicated wallet generation function
        // We need to create a user token for this
        // For now, let's directly generate the wallet using the same logic
        
        // Import the wallet generation logic based on asset
        let newAddress: string | null = null;
        let encryptedPrivateKey: string | null = null;
        let publicKeyHex: string | null = null;
        let destinationTag: string | null = null;

        if (asset === 'BTC') {
          const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
          const getPrivateKey = secp256k1Module.utils.randomPrivateKey || secp256k1Module.privateKeyGenerate;
          const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
          
          const privateKeyBytes = getPrivateKey();
          const publicKeyBytes = getPublicKey(privateKeyBytes, true);
          
          const sha256Module = await import("https://esm.sh/@noble/hashes@1.3.3/sha256.js");
          const sha256 = sha256Module.sha256 || sha256Module.default?.sha256 || sha256Module.default;
          const ripemd160Module = await import("https://esm.sh/@noble/hashes@1.3.3/ripemd160.js");
          const ripemd160 = ripemd160Module.ripemd160 || ripemd160Module.default?.ripemd160 || ripemd160Module.default;
          
          const sha256Hash = sha256(publicKeyBytes);
          const hash160 = ripemd160(sha256Hash);
          
          const version = 0x00;
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
          newAddress = bs58.encode(addressBytes);
          
          const privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Encrypt private key
          const encryptionKey = Deno.env.get('BTC_ENCRYPTION_KEY') ||
                               Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                               Deno.env.get('ETH_ENCRYPTION_KEY');
          
          if (encryptionKey) {
            encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
          }
        } else if (asset === 'ETH') {
          const { ethers } = await import("https://esm.sh/ethers@6.9.0");
          const wallet = ethers.Wallet.createRandom();
          
          newAddress = wallet.address;
          const privateKeyHex = wallet.privateKey.replace('0x', '');
          publicKeyHex = wallet.publicKey.replace('0x', '');
          
          const encryptionKey = Deno.env.get('ETH_ENCRYPTION_KEY') ||
                               Deno.env.get('CRYPTO_ENCRYPTION_KEY');
          
          if (encryptionKey) {
            encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
          }
        } else if (asset === 'SOL') {
          const solanaModule = await import("https://esm.sh/@solana/web3.js@1.87.6");
          const Keypair = solanaModule.Keypair || solanaModule.default?.Keypair;
          
          const keypair = Keypair.generate();
          newAddress = keypair.publicKey.toBase58();
          
          const secretKey = keypair.secretKey;
          const privateKeyHex = Array.from(secretKey).map(b => b.toString(16).padStart(2, '0')).join('');
          publicKeyHex = Array.from(keypair.publicKey.toBytes()).map(b => b.toString(16).padStart(2, '0')).join('');
          
          const encryptionKey = Deno.env.get('SOL_ENCRYPTION_KEY') ||
                               Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                               Deno.env.get('ETH_ENCRYPTION_KEY');
          
          if (encryptionKey) {
            encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
          }
        } else if (asset === 'XRP') {
          const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
          const getPrivateKey = secp256k1Module.utils.randomPrivateKey || secp256k1Module.privateKeyGenerate;
          const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
          
          const privateKeyBytes = getPrivateKey();
          const publicKeyBytes = getPublicKey(privateKeyBytes, false);
          
          const privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          
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
          newAddress = bs58.encode(addressBytes);
          
          destinationTag = Math.floor(Math.random() * 4294967295).toString(); // Max 32-bit unsigned int
          
          const encryptionKey = Deno.env.get('XRP_ENCRYPTION_KEY') ||
                               Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                               Deno.env.get('ETH_ENCRYPTION_KEY');
          
          if (encryptionKey) {
            encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
          }
        }

        if (!newAddress) {
          throw new Error(`Failed to generate ${asset} address`);
        }
        
        if (!encryptedPrivateKey) {
          throw new Error(`Failed to encrypt ${asset} private key - encryption key not configured`);
        }
        
        // Validate XRP address format
        if (asset === 'XRP' && (!newAddress.startsWith('r') || newAddress.length !== 34)) {
          throw new Error(`Invalid XRP address format: ${newAddress}`);
        }

        // Insert new wallet
        const { error: insertError } = await supabase
          .from('crypto_wallets')
          .insert({
            user_id: userId,
            asset: asset,
            network: 'mainnet',
            address: newAddress,
            public_key: publicKeyHex,
            private_key_encrypted: encryptedPrivateKey,
            destination_tag: destinationTag,
            is_active: true,
          });

        if (insertError) {
          throw new Error(`Failed to store wallet: ${insertError.message}`);
        }

        console.log(`✅ Regenerated ${asset} wallet: ${newAddress.substring(0, 10)}...`);
        successCount++;
        results.push({ user_id: userId, asset, success: true, address: newAddress });
      } catch (error: any) {
        console.error(`❌ Error regenerating ${asset} wallet for user ${userId}:`, error.message);
        errorCount++;
        results.push({ user_id: userId, asset, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Regenerated ${successCount} wallets, ${errorCount} errors`,
        regenerated: successCount,
        errors: errorCount,
        results: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to regenerate wallets',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Encrypt private key using AES-256-GCM
 */
async function encryptPrivateKey(privateKey: string, encryptionKey: string): Promise<string> {
  const keyData = new TextEncoder().encode(encryptionKey);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

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

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    derivedKey,
    new TextEncoder().encode(privateKey)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

