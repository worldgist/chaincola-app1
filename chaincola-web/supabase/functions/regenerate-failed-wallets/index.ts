// Regenerate Failed Wallets Edge Function
// This function identifies wallets that can't be decrypted and regenerates them
// It safely deletes old wallets and creates new ones with proper encryption

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
 * Encrypt private key using AES-256-GCM
 */
async function encryptPrivateKey(privateKey: string, encryptionKey: string): Promise<string> {
  try {
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
  } catch (error: any) {
    throw new Error(`Failed to encrypt private key: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Generate BTC wallet directly
 */
async function generateBTCWalletDirect(userId: string, network: string): Promise<any> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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
  const address = bs58.encode(addressBytes);
  
  const privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const encryptionKey = Deno.env.get('BTC_ENCRYPTION_KEY') ||
                       Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                       Deno.env.get('ETH_ENCRYPTION_KEY');
  
  if (!encryptionKey) {
    throw new Error('BTC encryption key not configured');
  }
  
  const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
  
  const { data: wallet, error } = await supabase
    .from('crypto_wallets')
    .insert({
      user_id: userId,
      asset: 'BTC',
      network: network,
      address: address,
      public_key: publicKeyHex,
      private_key_encrypted: encryptedPrivateKey,
      is_active: true,
    })
    .select('address')
    .single();
  
  if (error) throw error;
  
  return { success: true, address: wallet.address };
}

/**
 * Generate ETH wallet directly
 */
async function generateETHWalletDirect(userId: string, network: string): Promise<any> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { ethers } = await import("https://esm.sh/ethers@6.9.0");
  const wallet = ethers.Wallet.createRandom();
  
  const walletAddress = wallet.address;
  const privateKeyHex = wallet.privateKey.replace('0x', '');
  const publicKeyHex = wallet.publicKey.replace('0x', '');
  
  const encryptionKey = Deno.env.get('ETH_ENCRYPTION_KEY') ||
                       Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                       Deno.env.get('TRON_ENCRYPTION_KEY');
  
  if (!encryptionKey) {
    throw new Error('ETH encryption key not configured');
  }
  
  const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
  
  const { data: walletData, error } = await supabase
    .from('crypto_wallets')
    .insert({
      user_id: userId,
      asset: 'ETH',
      network: network,
      address: walletAddress,
      public_key: publicKeyHex,
      private_key_encrypted: encryptedPrivateKey,
      is_active: true,
    })
    .select('address')
    .single();
  
  if (error) throw error;
  
  return { success: true, address: walletData.address };
}

/**
 * Generate XRP wallet directly
 */
async function generateXRPWalletDirect(userId: string, network: string): Promise<any> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const secp256k1Module = await import("https://esm.sh/@noble/secp256k1@1.7.1");
  const getPrivateKey = secp256k1Module.utils.randomPrivateKey || secp256k1Module.privateKeyGenerate;
  const getPublicKey = secp256k1Module.getPublicKey || secp256k1Module.publicKeyCreate;
  
  const privateKeyBytes = getPrivateKey();
  const publicKeyBytes = getPublicKey(privateKeyBytes, false);
  
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
  const address = bs58.encode(addressBytes);
  
  const privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const destinationTag = Math.floor(Math.random() * 4294967295).toString();
  
  const encryptionKey = Deno.env.get('XRP_ENCRYPTION_KEY') ||
                       Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                       Deno.env.get('ETH_ENCRYPTION_KEY');
  
  if (!encryptionKey) {
    throw new Error('XRP encryption key not configured');
  }
  
  const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
  
  const { data: walletData, error } = await supabase
    .from('crypto_wallets')
    .insert({
      user_id: userId,
      asset: 'XRP',
      network: network,
      address: address,
      public_key: publicKeyHex,
      private_key_encrypted: encryptedPrivateKey,
      destination_tag: destinationTag,
      is_active: true,
    })
    .select('address')
    .single();
  
  if (error) throw error;
  
  return { success: true, address: walletData.address };
}

/**
 * Generate SOL wallet directly
 */
async function generateSOLWalletDirect(userId: string, network: string): Promise<any> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { Keypair } = await import("https://esm.sh/@solana/web3.js@1.87.6");
  const keypair = Keypair.generate();
  
  const address = keypair.publicKey.toBase58();
  const publicKeyHex = Array.from(keypair.publicKey.toBytes()).map(b => b.toString(16).padStart(2, '0')).join('');
  const privateKeyHex = Array.from(keypair.secretKey).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const encryptionKey = Deno.env.get('SOL_ENCRYPTION_KEY') ||
                       Deno.env.get('CRYPTO_ENCRYPTION_KEY') ||
                       Deno.env.get('ETH_ENCRYPTION_KEY');
  
  if (!encryptionKey) {
    throw new Error('SOL encryption key not configured');
  }
  
  const encryptedPrivateKey = await encryptPrivateKey(privateKeyHex, encryptionKey);
  
  const { data: walletData, error } = await supabase
    .from('crypto_wallets')
    .insert({
      user_id: userId,
      asset: 'SOL',
      network: network,
      address: address,
      public_key: publicKeyHex,
      private_key_encrypted: encryptedPrivateKey,
      is_active: true,
    })
    .select('address')
    .single();
  
  if (error) throw error;
  
  return { success: true, address: walletData.address };
}

/**
 * Check if a wallet can be decrypted with any available key
 */
async function canDecryptWallet(
  encryptedKey: string,
  asset: string
): Promise<{ canDecrypt: boolean; error?: string }> {
  let possibleKeys: string[] = [];

  if (asset === 'BTC') {
    possibleKeys = [
      Deno.env.get('BTC_ENCRYPTION_KEY'),
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('ETH_ENCRYPTION_KEY'),
    ].filter(k => k) as string[];
  } else if (asset === 'ETH') {
    possibleKeys = [
      Deno.env.get('ETH_ENCRYPTION_KEY'),
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('TRON_ENCRYPTION_KEY'),
    ].filter(k => k) as string[];
  } else if (asset === 'XRP') {
    possibleKeys = [
      Deno.env.get('XRP_ENCRYPTION_KEY'),
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('ETH_ENCRYPTION_KEY'),
    ].filter(k => k) as string[];
  } else if (asset === 'SOL') {
    possibleKeys = [
      Deno.env.get('SOL_ENCRYPTION_KEY'),
      Deno.env.get('CRYPTO_ENCRYPTION_KEY'),
      Deno.env.get('ETH_ENCRYPTION_KEY'),
    ].filter(k => k) as string[];
  }

  if (possibleKeys.length === 0) {
    return { canDecrypt: false, error: 'No encryption keys configured' };
  }

  for (const key of possibleKeys) {
    try {
      await decryptPrivateKey(encryptedKey, key);
      return { canDecrypt: true };
    } catch (e: any) {
      continue;
    }
  }

  return { canDecrypt: false, error: 'Failed to decrypt with any available key' };
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
    
    // Check authentication
    let isAdmin = false;
    if (serviceRoleKey && (token === serviceRoleKey || token.length > 200)) {
      isAdmin = true;
      console.log('✅ Service role key authentication - admin access granted');
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
    }

    const body = await req.json();
    const { 
      user_id, 
      asset, 
      network = 'mainnet', 
      dry_run = false,
      limit = 100 
    } = body;

    console.log(`🔍 Finding wallets that can't be decrypted...`);
    console.log(`   Dry run: ${dry_run}`);
    console.log(`   Filters: user_id=${user_id || 'all'}, asset=${asset || 'all'}, network=${network}`);

    // Fetch wallets
    let query = supabase
      .from('crypto_wallets')
      .select('*')
      .eq('is_active', true)
      .not('private_key_encrypted', 'is', null)
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

    console.log(`📊 Checking ${wallets.length} wallets for decryption issues...`);

    const failedWallets: any[] = [];
    const results: any[] = [];

    // Check each wallet
    for (const wallet of wallets) {
      if (!wallet.private_key_encrypted) {
        continue;
      }

      const canDecrypt = await canDecryptWallet(wallet.private_key_encrypted, wallet.asset);
      
      if (!canDecrypt.canDecrypt) {
        failedWallets.push({
          ...wallet,
          decryption_error: canDecrypt.error,
        });
      }
    }

    console.log(`⚠️  Found ${failedWallets.length} wallets that can't be decrypted`);

    if (failedWallets.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All wallets can be decrypted',
          checked: wallets.length,
          failed: 0,
          regenerated: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If dry run, just return the list
    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          checked: wallets.length,
          failed: failedWallets.length,
          failed_wallets: failedWallets.map(w => ({
            wallet_id: w.id,
            user_id: w.user_id,
            asset: w.asset,
            network: w.network,
            address: w.address,
            error: w.decryption_error,
          })),
          message: 'Dry run complete. Set dry_run=false to regenerate wallets.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regenerate wallets
    console.log(`🔄 Regenerating ${failedWallets.length} wallets...`);

    const regenerationResults: any[] = [];

    for (const wallet of failedWallets) {
      const result: any = {
        wallet_id: wallet.id,
        user_id: wallet.user_id,
        asset: wallet.asset,
        network: wallet.network,
        old_address: wallet.address,
      };

      try {
        // Delete old wallet
        console.log(`🗑️  Deleting old ${wallet.asset} wallet ${wallet.id}...`);
        const { error: deleteError } = await supabase
          .from('crypto_wallets')
          .delete()
          .eq('id', wallet.id);

        if (deleteError) {
          result.status = 'error';
          result.error = `Failed to delete old wallet: ${deleteError.message}`;
          regenerationResults.push(result);
          continue;
        }

        // Get an admin user token to use for wallet generation
        // Find an admin user to use their token
        const { data: adminUsers } = await supabase
          .from('user_profiles')
          .select('user_id')
          .or('is_admin.eq.true,role.eq.admin')
          .limit(1);

        let adminToken: string | null = null;
        if (adminUsers && adminUsers.length > 0) {
          // Create a session for the admin user using service role
          // Actually, we can't easily create a user token from service role
          // Instead, let's generate wallets directly using the same logic
          console.log(`⚠️  Cannot get user token, generating wallet directly...`);
        }

        // Generate wallet directly (bypassing function authentication)
        // This uses the same logic as the generation functions
        console.log(`🔄 Generating new ${wallet.asset} wallet directly for user ${wallet.user_id}...`);
        
        let newWalletData: any = null;
        
        try {
          if (wallet.asset === 'BTC') {
            newWalletData = await generateBTCWalletDirect(wallet.user_id, wallet.network);
          } else if (wallet.asset === 'ETH') {
            newWalletData = await generateETHWalletDirect(wallet.user_id, wallet.network);
          } else if (wallet.asset === 'XRP') {
            newWalletData = await generateXRPWalletDirect(wallet.user_id, wallet.network);
          } else if (wallet.asset === 'SOL') {
            newWalletData = await generateSOLWalletDirect(wallet.user_id, wallet.network);
          } else {
            result.status = 'error';
            result.error = `Unsupported asset: ${wallet.asset}`;
            regenerationResults.push(result);
            continue;
          }

          if (newWalletData && newWalletData.success && newWalletData.address) {
            result.status = 'success';
            result.new_address = newWalletData.address;
            result.message = `Wallet regenerated successfully`;
          } else {
            result.status = 'error';
            result.error = `Generation failed: ${newWalletData?.error || 'Unknown error'}`;
          }
        } catch (genError: any) {
          result.status = 'error';
          result.error = `Generation exception: ${genError.message || 'Unknown error'}`;
        }

        regenerationResults.push(result);
      } catch (error: any) {
        result.status = 'error';
        result.error = error.message || 'Unknown error';
        regenerationResults.push(result);
      }
    }

    const successful = regenerationResults.filter(r => r.status === 'success').length;
    const failed = regenerationResults.filter(r => r.status === 'error').length;

    return new Response(
      JSON.stringify({
        success: true,
        checked: wallets.length,
        failed_wallets_found: failedWallets.length,
        regenerated: successful,
        failed_regenerations: failed,
        results: regenerationResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Regeneration error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

