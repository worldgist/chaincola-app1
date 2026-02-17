// Crypto prices from pricing engine only (no Luno, CoinGecko, or other market APIs)

import Constants from 'expo-constants';
import { supabase } from './supabase';

/** NGN per 1 USD - used for "per USD" rate display on buy/sell screens */
export const USD_TO_NGN_RATE = 1650;

/** Supported crypto symbols for pricing (pricing engine only) */
const SUPPORTED_SYMBOLS = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX'];

/**
 * Static crypto rates in NGN (used for buy/sell instead of market prices)
 * Update these values as needed for your pricing strategy
 */
export const STATIC_CRYPTO_RATES_NGN: Record<string, number> = {
  BTC: 70_000_000,
  ETH: 4_000_000,
  USDT: 1_650,
  USDC: 1_650,
  XRP: 1_000,
  TRX: 250,
};

const CACHE_DURATION_MS = 10000;

interface CachedPrices {
  prices: Record<string, CryptoPrice>;
  timestamp: number;
  pendingRequest?: Promise<{ prices: Record<string, CryptoPrice>; error: any }>;
}

let priceCache: CachedPrices | null = null;

export interface CryptoPrice {
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  last_updated: string;
  bid?: number;
  ask?: number;
  volume_24h?: number;
  source?: string;
}

export interface CryptoBalance {
  symbol: string;
  balance: number;
  usdValue: number;
  ngnValue: number;
}

/**
 * Fetch buy/sell rates from pricing engine only (no market/Luno/crypto price).
 * Returns static rates from pricing_engine_config (override or frozen).
 */
async function getStaticRatesFromPricingEngine(symbols: string[]): Promise<Record<string, CryptoPrice>> {
  const usdToNgn = USD_TO_NGN_RATE;
  const now = new Date().toISOString();
  const result: Record<string, CryptoPrice> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      const symbolUpper = symbol.toUpperCase();
      try {
        const { data: configData, error: configError } = await supabase.rpc('get_pricing_engine_config', {
          p_asset: symbolUpper,
        });
        if (configError || !configData || configData.length === 0) {
          return;
        }
        const config = configData[0];
        let buyPrice = 0;
        let sellPrice = 0;
        if (config.price_frozen) {
          buyPrice = parseFloat((config.frozen_buy_price_ngn ?? 0).toString());
          sellPrice = parseFloat((config.frozen_sell_price_ngn ?? 0).toString());
        } else {
          buyPrice = parseFloat((config.override_buy_price_ngn ?? 0).toString());
          sellPrice = parseFloat((config.override_sell_price_ngn ?? 0).toString());
        }
        if (buyPrice > 0 || sellPrice > 0) {
          result[symbolUpper] = {
            crypto_symbol: symbolUpper,
            price_usd: buyPrice > 0 ? buyPrice / usdToNgn : 0,
            price_ngn: buyPrice,
            bid: sellPrice,
            ask: buyPrice,
            last_updated: now,
            source: 'static_rate',
          };
        }
      } catch (e) {
        console.warn(`Pricing config for ${symbolUpper} failed:`, e);
      }
    })
  );
  return result;
}

/**
 * Get a single crypto price from pricing engine only (static rate).
 */
export async function getCryptoPrice(symbol: string): Promise<{ price: CryptoPrice | null; error: any }> {
  const symbolUpper = symbol.toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(symbolUpper)) {
    return { price: null, error: `Unsupported cryptocurrency: ${symbol}` };
  }
  if (priceCache?.prices?.[symbolUpper] && Date.now() - priceCache.timestamp < CACHE_DURATION_MS) {
    return { price: priceCache.prices[symbolUpper], error: null };
  }
  const { prices, error } = await getLunoPrices([symbolUpper]);
  if (error || !prices[symbolUpper]) {
    return { price: null, error: error || `Price not found for ${symbol}` };
  }
  if (!priceCache) priceCache = { prices: {}, timestamp: 0 };
  priceCache.prices[symbolUpper] = prices[symbolUpper];
  priceCache.timestamp = Date.now();
  return { price: prices[symbolUpper], error: null };
}

/**
 * Get static crypto rates (fallback when pricing engine has no config).
 * Uses in-app constants only.
 */
export function getStaticCryptoRates(symbols?: string[]): { prices: Record<string, CryptoPrice>; error: null } {
  const symbolsToUse = symbols || SUPPORTED_SYMBOLS;
  const prices: Record<string, CryptoPrice> = {};
  const now = new Date().toISOString();
  for (const symbol of symbolsToUse) {
    const symbolUpper = symbol.toUpperCase();
    const rateNgn = STATIC_CRYPTO_RATES_NGN[symbolUpper];
    if (rateNgn != null && rateNgn > 0) {
      prices[symbolUpper] = {
        crypto_symbol: symbolUpper,
        price_usd: rateNgn / USD_TO_NGN_RATE,
        price_ngn: rateNgn,
        bid: rateNgn,
        ask: rateNgn,
        last_updated: now,
        source: 'static',
      };
    }
  }
  return { prices, error: null };
}

/**
 * Get crypto prices from pricing engine only (no Luno, CoinGecko, or market APIs).
 */
export async function getCryptoPrices(): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  return getLunoPrices(SUPPORTED_SYMBOLS);
}

/**
 * Fetch prices from pricing engine only (static rates).
 * No Luno, CoinGecko, or other market API calls.
 */
export async function getLunoPrices(symbols?: string[]): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  try {
    const symbolsToUse = symbols || SUPPORTED_SYMBOLS;
    if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION_MS) {
      const cached: Record<string, CryptoPrice> = {};
      for (const sym of symbolsToUse) {
        const s = sym.toUpperCase();
        if (priceCache.prices[s]) cached[s] = priceCache.prices[s];
      }
      if (Object.keys(cached).length > 0) return { prices: cached, error: null };
    }
    const prices = await getStaticRatesFromPricingEngine(symbolsToUse);
    if (!priceCache) priceCache = { prices: {}, timestamp: 0 };
    priceCache.prices = { ...priceCache.prices, ...prices };
    priceCache.timestamp = Date.now();
    return { prices, error: null };
  } catch (error: any) {
    console.error('❌ Error fetching static rates:', error);
    if (priceCache?.prices && Object.keys(priceCache.prices).length > 0) {
      return { prices: priceCache.prices, error: null };
    }
    return { prices: {}, error: error?.message || 'Failed to fetch prices' };
  }
}

/**
 * Get user crypto balances
 * This calculates balances from buy and sell transactions
 */
export async function getUserCryptoBalances(userId: string): Promise<{ balances: Record<string, CryptoBalance>; error: any }> {
  // Initialize balances for all supported cryptocurrencies
  const defaultBalances: Record<string, CryptoBalance> = {
    BTC: { symbol: 'BTC', balance: 0, usdValue: 0, ngnValue: 0 },
    ETH: { symbol: 'ETH', balance: 0, usdValue: 0, ngnValue: 0 },
    USDT: { symbol: 'USDT', balance: 0, usdValue: 0, ngnValue: 0 },
    USDC: { symbol: 'USDC', balance: 0, usdValue: 0, ngnValue: 0 },
    XRP: { symbol: 'XRP', balance: 0, usdValue: 0, ngnValue: 0 },
    SOL: { symbol: 'SOL', balance: 0, usdValue: 0, ngnValue: 0 },
  };

  if (!userId) {
    return { balances: defaultBalances, error: null };
  }

  try {
    // Check session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { balances: defaultBalances, error: 'Not authenticated' };
    }

    // Initialize balances
    const balances: Record<string, CryptoBalance> = {
      BTC: { symbol: 'BTC', balance: 0, usdValue: 0, ngnValue: 0 },
      ETH: { symbol: 'ETH', balance: 0, usdValue: 0, ngnValue: 0 },
      USDT: { symbol: 'USDT', balance: 0, usdValue: 0, ngnValue: 0 },
      USDC: { symbol: 'USDC', balance: 0, usdValue: 0, ngnValue: 0 },
      XRP: { symbol: 'XRP', balance: 0, usdValue: 0, ngnValue: 0 },
      SOL: { symbol: 'SOL', balance: 0, usdValue: 0, ngnValue: 0 },
    };

    // OPTIMIZED: Try user_wallets first (fastest - single row query)
    // This is updated by instant_sell_crypto_v2 and is the most up-to-date source
    const fetchUserWallets = async () => {
      try {
        const { data, error } = await supabase
          .from('user_wallets')
          .select('btc_balance, eth_balance, usdt_balance, usdc_balance, xrp_balance, sol_balance')
          .eq('user_id', userId)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        return data;
      } catch (err: any) {
        return null;
      }
    };

    // OPTIMIZED: Fallback to wallet_balances (single query, 6 rows max)
    const fetchWalletBalances = async () => {
      try {
        const { data, error } = await supabase
          .from('wallet_balances')
          .select('currency, balance, locked')
          .eq('user_id', userId)
          .in('currency', ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL']);
        
        if (error) throw error;
        return data || [];
      } catch (err: any) {
        return [];
      }
    };

    // Fetch both sources in parallel with short timeout (3 seconds each)
    const [userWallet, walletBalances] = await Promise.allSettled([
      Promise.race([
        fetchUserWallets(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
      ]),
      Promise.race([
        fetchWalletBalances(),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3000))
      ])
    ]);

    const userWalletData = userWallet.status === 'fulfilled' ? userWallet.value : null;
    const walletBalancesData = walletBalances.status === 'fulfilled' ? walletBalances.value : [];

    // Priority 1: Use user_wallets if available (fastest, most up-to-date)
    if (userWalletData) {
      console.log('📦 Using user_wallets data:', userWalletData);
      balances.BTC.balance = parseFloat(userWalletData.btc_balance?.toString() || '0') || 0;
      balances.ETH.balance = parseFloat(userWalletData.eth_balance?.toString() || '0') || 0;
      balances.USDT.balance = parseFloat(userWalletData.usdt_balance?.toString() || '0') || 0;
      balances.USDC.balance = parseFloat(userWalletData.usdc_balance?.toString() || '0') || 0;
      balances.XRP.balance = parseFloat(userWalletData.xrp_balance?.toString() || '0') || 0;
      balances.SOL.balance = parseFloat(userWalletData.sol_balance?.toString() || '0') || 0;
      console.log(`✅ ETH balance from user_wallets: ${balances.ETH.balance}`);
    } 
    // Priority 2: Use wallet_balances if user_wallets not available
    else if (Array.isArray(walletBalancesData) && walletBalancesData.length > 0) {
      console.log('📦 Using wallet_balances fallback. Data:', walletBalancesData);
      for (const wb of walletBalancesData) {
        const symbol = wb.currency?.toUpperCase();
        console.log(`🔍 Processing wallet_balance: currency=${wb.currency}, symbol=${symbol}, balance=${wb.balance}, locked=${wb.locked}`);
        
        if (!symbol) {
          console.warn(`⚠️ Invalid currency in wallet_balance:`, wb.currency);
          continue;
        }
        
        if (balances[symbol] === undefined) {
          console.warn(`⚠️ Symbol ${symbol} not found in balances object. Available:`, Object.keys(balances));
          continue;
        }
        
        let balanceValue = 0;
        let lockedValue = 0;
        
        if (wb.balance !== null && wb.balance !== undefined) {
          balanceValue = parseFloat(String(wb.balance).trim()) || 0;
        }
        
        if (wb.locked !== null && wb.locked !== undefined) {
          lockedValue = parseFloat(String(wb.locked).trim()) || 0;
        }
        
        const finalBalance = Math.max(0, balanceValue - lockedValue);
        balances[symbol].balance = finalBalance;
        console.log(`✅ Set balance for ${symbol}: ${finalBalance} (balance: ${balanceValue}, locked: ${lockedValue})`);
      }
    }

    // Fetch prices from pricing engine (static rates)
    // Prices are optional - balances are returned even if prices fail
    try {
      const allCurrencies = Object.keys(balances);
      const pricePromise = getLunoPrices(allCurrencies);
      const PRICE_FETCH_TIMEOUT_MS = 12000;
      const priceTimeout = new Promise<{ prices: Record<string, CryptoPrice>; error: any }>((resolve) => 
        setTimeout(() => resolve({ prices: {}, error: null }), PRICE_FETCH_TIMEOUT_MS)
      );

      const priceResult = await Promise.race([pricePromise, priceTimeout]);
      
      if (priceResult.prices && Object.keys(priceResult.prices).length > 0 && !priceResult.error) {
        for (const symbol of Object.keys(balances)) {
          const balance = balances[symbol];
          if (!balance) continue;
          
          const price = priceResult.prices[symbol];
          if (price && price.price_usd > 0) {
            balance.usdValue = balance.balance * price.price_usd;
            balance.ngnValue = balance.balance * price.price_ngn;
            (balance as any).price_usd = price.price_usd;
            (balance as any).price_ngn = price.price_ngn;
          }
        }
      }
    } catch (priceErr: any) {
      // Silently fail - prices are optional, balances are still valid
    }

    // Final verification - ensure all balances are set
    console.log('📊 Final balances before return:', {
      ETH: balances.ETH,
      BTC: balances.BTC,
      SOL: balances.SOL,
      allSymbols: Object.keys(balances),
    });
    
    // Ensure ETH balance exists even if it's 0
    if (balances.ETH === undefined) {
      console.warn('⚠️ ETH balance is undefined! Creating default.');
      balances.ETH = { symbol: 'ETH', balance: 0, usdValue: 0, ngnValue: 0 };
    }
    
    return { balances, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching user crypto balances:', error);
    // Always return default balances on error to prevent UI from hanging
    return { balances: defaultBalances, error: error.message || 'Failed to fetch balances' };
  }
}

/**
 * Format crypto balance for display
 */
export function formatCryptoBalance(balance: number, symbol: string): string {
  // Use more precision for SOL to show exact balance
  const decimals = symbol === 'BTC' || symbol === 'ETH' ? 8 : symbol === 'SOL' ? 8 : symbol === 'XRP' ? 6 : 2;
  return balance.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format USD value for display
 */
export function formatUsdValue(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format NGN value for display
 * Shows more precision for small amounts (< 100 NGN) to display exact value
 */
export function formatNgnValue(value: number): string {
  // For small amounts, show more precision (4 decimals) to display exact value
  const decimals = value < 100 ? 4 : 2;
  return `₦${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Refresh prices from pricing engine (backward compatibility).
 */
export async function fetchPricesFromLuno(): Promise<{ success: boolean; error: any }> {
  try {
    const { prices, error } = await getCryptoPrices();
    if (error || Object.keys(prices).length === 0) {
      return { success: false, error: error || 'Failed to fetch prices' };
    }
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error refreshing prices:', error);
    return { success: false, error: error.message || 'Failed to refresh prices' };
  }
}

/**
 * Sync SOL balance from blockchain to database
 * This function triggers deposit detection and reconciles balance
 */
export async function syncSolBalanceFromBlockchain(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔄 Syncing SOL balance from blockchain...', { userId });

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    // Get session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Step 1: Trigger deposit detection to pick up any missed deposits
    console.log('🔍 Triggering deposit detection...');
    const detectResponse = await fetch(`${supabaseUrl}/functions/v1/detect-solana-deposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
    });

    if (!detectResponse.ok) {
      console.warn('⚠️ Deposit detection failed, continuing with reconciliation...');
    } else {
      console.log('✅ Deposit detection triggered');
    }

    // Step 2: Reconcile blockchain balances
    console.log('🔄 Reconciling blockchain balances...');
    const reconcileResponse = await fetch(`${supabaseUrl}/functions/v1/reconcile-blockchain-balances`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
    });

    if (!reconcileResponse.ok) {
      const errorText = await reconcileResponse.text();
      console.error('❌ Error reconciling balance:', errorText);
      return { success: false, error: errorText || 'Failed to sync balance' };
    }

    const result = await reconcileResponse.json();
    console.log('✅ SOL balance synced:', result);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception syncing SOL balance:', error);
    return { success: false, error: error.message || 'Failed to sync balance' };
  }
}

/**
 * Credit a specific SOL deposit transaction
 * Use this when you know a transaction hash that needs to be credited
 */
export async function creditSolDepositTransaction(
  userId: string,
  transactionHash: string,
  amount: number,
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('💰 Crediting SOL deposit...', { userId, transactionHash, amount });

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    // Get session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if transaction already exists
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_hash', transactionHash)
      .maybeSingle();

    if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'CONFIRMED')) {
      return { success: true }; // Already processed
    }

    // Credit balance using RPC call to credit_crypto_wallet function
    const { data: creditResult, error: creditError } = await supabase.rpc('credit_crypto_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_currency: 'SOL',
    });

    if (creditError) {
      console.error('❌ Error crediting balance:', creditError);
      // Fallback: direct update
      const { data: currentBalance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'SOL')
        .maybeSingle();

      const currentSolBalance = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
      const newSolBalance = currentSolBalance + amount;

      const { error: updateError } = await supabase
        .from('wallet_balances')
        .upsert({
          user_id: userId,
          currency: 'SOL',
          balance: newSolBalance,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,currency',
        });

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    // Record transaction if it doesn't exist
    if (!existingTx) {
      await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'RECEIVE',
        crypto_currency: 'SOL',
        crypto_amount: amount,
        status: 'CONFIRMED',
        to_address: walletAddress,
        transaction_hash: transactionHash,
        confirmations: 32,
        metadata: {
          detected_at: new Date().toISOString(),
          detected_via: 'manual_credit',
          confirmation_status: 'finalized',
        },
      });
    }

    console.log('✅ SOL deposit credited successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception crediting SOL deposit:', error);
    return { success: false, error: error.message || 'Failed to credit deposit' };
  }
}


