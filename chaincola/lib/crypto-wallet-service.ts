import { supabase } from './supabase';
import Constants from 'expo-constants';

// Get Supabase URL from environment
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     'https://slleojsdpctxhlsoyenr.supabase.co';

const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey || 
                          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface CryptoWallet {
  id: string;
  user_id: string;
  asset: string; // BTC, ETH, SOL
  network: string; // mainnet, testnet
  address: string;
  public_key?: string;
  derivation_path?: string;
  destination_tag?: string; // Reserved for future use
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerateWalletResponse {
  success: boolean;
  address?: string;
  asset?: string;
  network?: string;
  destination_tag?: string; // Reserved for future use
  error?: string;
}

/**
 * Supported cryptocurrency assets
 */
export const SUPPORTED_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
export type SupportedAsset = typeof SUPPORTED_ASSETS[number];

/**
 * Main cryptocurrencies to create wallets for on user signup
 */
export const DEFAULT_WALLET_ASSETS: SupportedAsset[] = ['BTC', 'ETH', 'SOL'];

/**
 * Get network mode from app settings
 * Defaults to 'mainnet' if not available
 */
function getNetworkModeFromAppMode(): 'mainnet' | 'testnet' {
  // Default to mainnet for production
  // In the future, this could read from app settings or context
  return 'mainnet';
}

/**
 * Generate BTC wallet using the dedicated generate-bitcoin-wallet function
 */
async function generateBTCWallet(
  network: 'mainnet' | 'testnet' = 'mainnet',
  forceNew: boolean = false
): Promise<GenerateWalletResponse> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in to generate wallets.',
      };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase not configured. Please check environment variables.',
      };
    }

    console.log(`💰 Generating BTC wallet on ${network}...`);

    const functionUrl = `${SUPABASE_URL}/functions/v1/generate-bitcoin-wallet`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network,
        force_new: forceNew,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      console.error(`❌ Error generating BTC wallet:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log(`✅ BTC wallet generated:`, result.address);

    return {
      success: result.success !== false,
      address: result.address,
      asset: result.asset || 'BTC',
      network: result.network || network,
    };
  } catch (error: any) {
    console.error(`❌ Exception generating BTC wallet:`, error);
    return {
      success: false,
      error: error.message || `Failed to generate BTC wallet`,
    };
  }
}

/**
 * Generate SOL wallet using the dedicated generate-solana-wallet function
 */
async function generateSOLWallet(
  network: 'mainnet' | 'testnet' = 'mainnet',
  forceNew: boolean = false
): Promise<GenerateWalletResponse> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in to generate wallets.',
      };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase not configured. Please check environment variables.',
      };
    }

    console.log(`💰 Generating SOL wallet on ${network}...`);

    const functionUrl = `${SUPABASE_URL}/functions/v1/generate-solana-wallet`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network,
        force_new: forceNew,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      console.error(`❌ Error generating SOL wallet:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log(`✅ SOL wallet generated:`, result.address);

    return {
      success: result.success !== false,
      address: result.address,
      asset: result.asset || 'SOL',
      network: result.network || network,
    };
  } catch (error: any) {
    console.error(`❌ Exception generating SOL wallet:`, error);
    return {
      success: false,
      error: error.message || `Failed to generate SOL wallet`,
    };
  }
}

/**
 * Generate ETH wallet using the dedicated generate-eth-wallet function
 * This uses the updated ethers.js implementation for secure ETH wallet generation
 */
async function generateETHWallet(
  network: 'mainnet' | 'testnet' = 'mainnet',
  forceNew: boolean = false
): Promise<GenerateWalletResponse> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in to generate wallets.',
      };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase not configured. Please check environment variables.',
      };
    }

    console.log(`💰 Generating ETH wallet on ${network} using updated ethers.js...`);

    // Call the dedicated ETH wallet generation function
    const functionUrl = `${SUPABASE_URL}/functions/v1/generate-eth-wallet`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network,
        force_new: forceNew,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      console.error(`❌ Error generating ETH wallet:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log(`✅ ETH wallet generated using updated ethers.js:`, result.address);

    return {
      success: result.success !== false,
      address: result.address,
      asset: result.asset || 'ETH',
      network: result.network || network,
    };
  } catch (error: any) {
    console.error(`❌ Exception generating ETH wallet:`, error);
    return {
      success: false,
      error: error.message || `Failed to generate ETH wallet`,
    };
  }
}

/**
 * Generate XRP wallet using the dedicated generate-ripple-wallet function
 */
async function generateXRPWallet(
  network: 'mainnet' | 'testnet' = 'mainnet',
  forceNew: boolean = false
): Promise<GenerateWalletResponse> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in to generate wallets.',
      };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase not configured. Please check environment variables.',
      };
    }

    console.log(`💰 Generating XRP wallet on ${network}...`);

    const functionUrl = `${SUPABASE_URL}/functions/v1/generate-ripple-wallet`;

    // Add timeout to fetch (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network,
          force_new: forceNew,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        console.error(`❌ Error generating XRP wallet:`, errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      }

      const result = await response.json();
      console.log(`✅ XRP wallet generated:`, result.address);
      if (result.destination_tag) {
        console.log(`   Destination tag:`, result.destination_tag);
      }

      return {
        success: result.success !== false,
        address: result.address,
        asset: result.asset || 'XRP',
        network: result.network || network,
        destination_tag: result.destination_tag,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Check if it's an abort error (timeout)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error(`❌ XRP wallet generation timeout after 10 seconds`);
        return {
          success: false,
          error: 'Request timeout. Please check your internet connection and try again.',
        };
      }
      
      // Handle network errors
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network request failed') || fetchError instanceof TypeError) {
        console.error(`❌ Network error generating XRP wallet:`, errorMsg);
        return {
          success: false,
          error: 'Network error. Please check your internet connection and try again.',
        };
      }
      
      // Re-throw to be caught by outer catch
      throw fetchError;
    }
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Exception generating XRP wallet:`, errorMsg);
    
    // Provide user-friendly error messages
    if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
      return {
        success: false,
        error: 'Request timeout. Please check your internet connection and try again.',
      };
    }
    
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network request failed')) {
      return {
        success: false,
        error: 'Network error. Please check your internet connection and try again.',
      };
    }
    
    return {
      success: false,
      error: errorMsg || `Failed to generate XRP wallet`,
    };
  }
}

/**
 * Generate or get existing wallet for a user and cryptocurrency
 * This function calls the dedicated wallet generation functions:
 * - generate-bitcoin-wallet for BTC
 * - generate-eth-wallet for ETH, USDT, USDC (ERC-20 tokens use ETH address)
 * - generate-solana-wallet for SOL
 * - generate-ripple-wallet for XRP
 * 
 * All wallets are stored in the crypto_wallets table and are unique per user per asset per network
 */
export async function generateWallet(
  asset: SupportedAsset | 'USDT' | 'USDC',
  network: 'mainnet' | 'testnet' = getNetworkModeFromAppMode()
): Promise<GenerateWalletResponse> {
  // Use dedicated wallet generation functions
  if (asset === 'BTC') {
    return generateBTCWallet(network, false);
  } else if (asset === 'ETH' || asset === 'USDT' || asset === 'USDC') {
    // USDT and USDC are ERC-20 tokens on Ethereum, use ETH wallet
    return generateETHWallet(network, false);
  } else if (asset === 'SOL') {
    return generateSOLWallet(network, false);
  } else if (asset === 'XRP') {
    return generateXRPWallet(network, false);
  }

  // Unsupported asset
  return {
    success: false,
    error: `Unsupported asset: ${asset}. Supported: BTC, ETH, USDT, USDC, SOL, XRP`,
  };
}

/**
 * Get wallet address for a specific asset and network
 * FIRST creates and stores the wallet if it doesn't exist, THEN fetches it
 * This ensures wallets are always created and stored before being fetched
 */
export async function getWalletAddress(
  asset: SupportedAsset | 'USDT' | 'USDC',
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ address: string | null; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { address: null, error: 'Not authenticated' };
    }

    // STEP 1: First, check if wallet exists in database
    const { data: existingWallet, error: fetchError } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', session.user.id)
      .eq('asset', asset)
      .eq('network', network)
      .single();

    // If wallet exists, return it immediately
    if (existingWallet && !fetchError && existingWallet.address) {
      console.log(`✅ Found existing ${asset} wallet in database:`, existingWallet.address);
      return { address: existingWallet.address, error: null };
    }

    // STEP 2: Wallet doesn't exist - CREATE and STORE it first
    console.log(`📝 No existing ${asset} wallet found, creating and storing new one...`);
    const generateResult = await generateWallet(asset, network);

    if (!generateResult.success || !generateResult.address) {
      const errorMsg = generateResult.error || 'Failed to generate wallet';
      
      // Provide user-friendly error messages
      let userFriendlyError = errorMsg;
      if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
        userFriendlyError = 'Request timeout. Please check your internet connection and try again.';
      } else if (errorMsg.includes('Network') || errorMsg.includes('network') || errorMsg.includes('Failed to fetch')) {
        userFriendlyError = 'Network error. Please check your internet connection and try again.';
      }
      
      console.error(`❌ Failed to create ${asset} wallet:`, errorMsg);
      return { address: null, error: userFriendlyError };
    }

    console.log(`✅ Created and stored ${asset} wallet:`, generateResult.address);

    // STEP 3: Verify wallet was stored by fetching from database
    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 500));

    // For USDT/USDC, check ETH wallet since they share the same address
    const assetToVerify = (asset === 'USDT' || asset === 'USDC') ? 'ETH' : asset;
    
    const { data: storedWallet, error: verifyError } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', session.user.id)
      .eq('asset', assetToVerify)
      .eq('network', network)
      .single();

    if (storedWallet && storedWallet.address) {
      console.log(`✅ Verified ${asset} wallet stored in database:`, storedWallet.address);
      return { address: storedWallet.address, error: null };
    }

    // If verification fails but we have the address from generation, return it anyway
    if (generateResult.address) {
      console.log(`⚠️ Wallet created but not yet in database, using generated address:`, generateResult.address);
      return { address: generateResult.address, error: null };
    }

    return { address: null, error: 'Wallet created but address not available' };
  } catch (error: any) {
    console.error(`❌ Exception getting ${asset} wallet address:`, error);
    return { address: null, error: error.message || 'Failed to get wallet address' };
  }
}

/**
 * Get all wallets for the current user
 */
export async function getUserWallets(
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ wallets: CryptoWallet[]; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { wallets: [], error: 'Not authenticated' };
    }

    const { data: wallets, error } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('network', network)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching user wallets:', error);
      return { wallets: [], error };
    }

    console.log(`✅ Found ${wallets?.length || 0} wallets for user`);
    return { wallets: wallets || [], error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching user wallets:', error);
    return { wallets: [], error: error.message || 'Failed to fetch wallets' };
  }
}

/**
 * Get wallet by asset and network
 */
export async function getWalletByAsset(
  asset: SupportedAsset,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ wallet: CryptoWallet | null; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { wallet: null, error: 'Not authenticated' };
    }

    const { data: wallet, error } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('asset', asset)
      .eq('network', network)
      .single();

    if (error) {
      // If wallet doesn't exist, return null (not an error)
      if (error.code === 'PGRST116') {
        return { wallet: null, error: null };
      }
      console.error(`❌ Error fetching ${asset} wallet:`, error);
      return { wallet: null, error };
    }

    return { wallet: wallet || null, error: null };
  } catch (error: any) {
    console.error(`❌ Exception fetching ${asset} wallet:`, error);
    return { wallet: null, error: error.message || 'Failed to fetch wallet' };
  }
}

/**
 * Create default wallets for a user (new or existing)
 * This function generates real wallets using the dedicated wallet generation functions
 * The backend will return existing wallet if it already exists, or create a new one
 * This is called automatically after user signup and can be called for existing users
 */
export async function createDefaultWallets(
  userId?: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ success: boolean; created: number; updated: number; errors: string[] }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session && !userId) {
      console.warn('⚠️ Cannot create wallets: No session and no userId provided');
      return { success: false, created: 0, updated: 0, errors: ['Not authenticated'] };
    }

    const targetUserId = userId || session?.user.id;
    if (!targetUserId) {
      return { success: false, created: 0, updated: 0, errors: ['No user ID available'] };
    }

    console.log(`🔄 Ensuring default wallets exist for user ${targetUserId}...`);

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    // Generate wallets for all default assets in parallel
    // The backend function will handle checking if wallet exists and creating if needed
    const walletPromises = DEFAULT_WALLET_ASSETS.map(async (asset) => {
      try {
        // Always call generateWallet - backend will return existing wallet or create new one
        // This ensures we always have a real wallet address
        const result = await generateWallet(asset, network);
        
        if (result.success && result.address) {
          // Check if this was a new wallet or existing one by querying database
          const { wallet } = await getWalletByAsset(asset, network);
          
          if (wallet) {
            // Wallet exists, check if it was just created (within last 5 seconds) or already existed
            const walletAge = Date.now() - new Date(wallet.created_at).getTime();
            if (walletAge < 5000) {
              console.log(`✅ Created new ${asset} wallet: ${result.address}`);
              created++;
            } else {
              console.log(`✅ Verified existing ${asset} wallet: ${result.address}`);
              updated++;
            }
            return { asset, success: true, address: result.address };
          } else {
            // Wallet was created but not yet in database (race condition)
            console.log(`✅ Created ${asset} wallet: ${result.address}`);
            created++;
            return { asset, success: true, address: result.address };
          }
        } else {
          const errorMsg = `Failed to create ${asset} wallet: ${result.error || 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
          return { asset, success: false, address: null };
        }
      } catch (error: any) {
        const errorMsg = `Exception creating ${asset} wallet: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
        return { asset, success: false, address: null };
      }
    });

    await Promise.all(walletPromises);

    console.log(`✅ Wallet creation complete: ${created} created, ${updated} verified, ${errors.length} errors`);
    return {
      success: errors.length === 0,
      created,
      updated,
      errors,
    };
  } catch (error: any) {
    console.error('❌ Exception creating default wallets:', error);
    return {
      success: false,
      created: 0,
      updated: 0,
      errors: [error.message || 'Failed to create default wallets'],
    };
  }
}

/**
 * Ensure wallets exist for the current user
 * Checks if user has all default wallets and creates any missing ones
 * This is useful for existing users who don't have wallets yet
 */
export async function ensureUserWallets(
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<{ success: boolean; created: number; errors: string[] }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.warn('⚠️ Cannot ensure wallets: No session');
      return { success: false, created: 0, errors: ['Not authenticated'] };
    }

    console.log(`🔍 Checking wallets for user ${session.user.id}...`);

    // Get existing wallets
    const { wallets: existingWallets, error: fetchError } = await getUserWallets(network);
    
    if (fetchError) {
      console.warn('⚠️ Could not fetch existing wallets, will attempt to create all:', fetchError);
    }

    const existingAssets = new Set(existingWallets.map(w => w.asset));
    const missingAssets = DEFAULT_WALLET_ASSETS.filter(asset => !existingAssets.has(asset));

    if (missingAssets.length === 0) {
      console.log('✅ All wallets already exist');
      return { success: true, created: 0, errors: [] };
    }

    console.log(`📝 Found ${missingAssets.length} missing wallets: ${missingAssets.join(', ')}`);
    console.log(`🔄 Creating missing wallets...`);

    const errors: string[] = [];
    let created = 0;

    // Create missing wallets in parallel
    const walletPromises = missingAssets.map(async (asset) => {
      try {
        const result = await generateWallet(asset, network);
        
        if (result.success && result.address) {
          console.log(`✅ Created ${asset} wallet: ${result.address}`);
          created++;
          return { asset, success: true };
        } else {
          const errorMsg = `Failed to create ${asset} wallet: ${result.error || 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
          return { asset, success: false };
        }
      } catch (error: any) {
        const errorMsg = `Exception creating ${asset} wallet: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
        return { asset, success: false };
      }
    });

    await Promise.all(walletPromises);

    console.log(`✅ Wallet check complete: ${created} created, ${errors.length} errors`);
    return {
      success: errors.length === 0,
      created,
      errors,
    };
  } catch (error: any) {
    console.error('❌ Exception ensuring user wallets:', error);
    return {
      success: false,
      created: 0,
      errors: [error.message || 'Failed to ensure wallets'],
    };
  }
}

/**
 * Generate a new wallet address and replace the old one
 * This deletes the old wallet from the database and creates a new one
 * 
 * Uses dedicated wallet generation functions with force_new=true
 * Note: USDT and USDC are ERC-20 tokens on Ethereum, so they use ETH wallet
 */
export async function regenerateWallet(
  asset: SupportedAsset | 'USDT' | 'USDC',
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<GenerateWalletResponse> {
  // Use dedicated wallet generation functions with force_new=true
  if (asset === 'BTC') {
    return generateBTCWallet(network, true);
  } else if (asset === 'ETH' || asset === 'USDT' || asset === 'USDC') {
    // USDT and USDC are ERC-20 tokens on Ethereum, use ETH wallet
    return generateETHWallet(network, true);
  } else if (asset === 'SOL') {
    return generateSOLWallet(network, true);
  } else if (asset === 'XRP') {
    return generateXRPWallet(network, true);
  }

  // Unsupported asset
  return {
    success: false,
    error: `Unsupported asset: ${asset}. Supported: BTC, ETH, USDT, USDC, SOL, XRP`,
  };
}

