import { createClient } from './supabase/client';
import { applyRetailSpreadToRow, extractEngineBuySell } from '@/lib/retail-pricing';

const supabase = createClient();

// Get Supabase URL and key at module level (same as Supabase client)
// These are available at build time in Next.js client components
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Luno pairs mapping (for reference, actual fetching done via Edge Function)
const LUNO_PAIRS: Record<string, string> = {
  BTC: 'XBTNGN',
  ETH: 'ETHNGN',
  USDT: 'USDTNGN',
  USDC: 'USDCNGN',
};

const USD_TO_NGN_RATE = 1650;
const CACHE_DURATION_MS = 10000;

interface CachedPrices {
  prices: Record<string, CryptoPrice>;
  timestamp: number;
}

let priceCache: CachedPrices | null = null;

/** Market / admin price row */
export interface CryptoPrice {
  crypto_symbol: string;
  price_usd: number;
  /** NGN spot or admin buy rate when from pricing engine */
  price_ngn: number;
  last_updated: string;
  bid?: number;
  ask?: number;
  volume_24h?: number;
  change_24h_pct?: number;
}

export interface CryptoBalance {
  symbol: string;
  balance: number;
  usdValue: number;
  ngnValue: number;
}

async function getUsdToNgnRate(): Promise<number> {
  return USD_TO_NGN_RATE;
}

async function fetchPricesFromLunoAPI(
  symbols: string[],
  options?: { timeoutMs?: number },
): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const errorMsg = 'Supabase not configured. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.';
      console.error(errorMsg, { 
        hasUrl: !!SUPABASE_URL, 
        hasKey: !!SUPABASE_ANON_KEY,
      });
      throw new Error(errorMsg);
    }

    // Use Edge Function instead of direct API call to avoid CORS issues
    // Now backed by Alchemy Prices API for all supported tokens
    const functionUrl = `${SUPABASE_URL}/functions/v1/get-token-prices?symbols=${symbols.join(',')}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `HTTP ${response.status} ${response.statusText}`;
        }
        console.error('❌ Edge Function error:', response.status, errorText);
        throw new Error(`Failed to fetch prices: ${response.status} - ${errorText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('❌ Failed to parse response:', e);
        throw new Error('Invalid response from price service');
      }
      
      if (!data.success) {
        console.error('❌ Edge Function returned error:', data.error);
        throw new Error(data.error || 'Failed to fetch prices');
      }

      // Transform Edge Function response to our format
      const prices: Record<string, CryptoPrice> = {};
      
      if (data.prices) {
        for (const symbol in data.prices) {
          const priceData = data.prices[symbol];
          prices[symbol] = {
            crypto_symbol: priceData.crypto_symbol || symbol,
            price_usd: priceData.price_usd || 0,
            price_ngn: priceData.price_ngn || 0,
            bid: priceData.bid,
            ask: priceData.ask,
            last_updated: priceData.last_updated || new Date().toISOString(),
            volume_24h: priceData.volume_24h,
            change_24h_pct: priceData.change_24h_pct,
          };
        }
      }

      return { prices, error: null };
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
      // Check if it's an abort error (timeout)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn(`⚠️ Price fetch timeout after ${timeoutMs}ms`);
        return { prices: {}, error: 'Request timeout' };
      }
      
      // Re-throw to be caught by outer catch
      throw fetchError;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    
    // Handle network errors gracefully
    if (error instanceof TypeError && (msg.includes('Failed to fetch') || msg.includes('Network request failed'))) {
      console.warn('⚠️ Luno price fetch failed: Network request failed');
      return { prices: {}, error: 'Network error' };
    }
    
    console.error('❌ Error fetching prices from Luno:', msg);
    return { prices: {}, error: msg || 'Failed to fetch prices' };
  }
}

/**
 * Live spot from `get-luno-prices` only (Alchemy USD → NGN + Luno NGN pairs).
 * Does not merge admin pricing-engine overrides — use for dashboards / comparing to overrides.
 */
export async function getMarketSpotPrices(
  symbols: string[],
  options?: { timeoutMs?: number },
): Promise<{ prices: Record<string, CryptoPrice>; error: string | null }> {
  const normalized = symbols.map((s) => s.toUpperCase().trim()).filter(Boolean);
  const result = await fetchPricesFromLunoAPI(normalized, {
    timeoutMs: options?.timeoutMs ?? 20_000,
  });
  return {
    prices: result.prices || {},
    error: result.error != null ? String(result.error) : null,
  };
}

/**
 * Get market prices for buy/sell flows.
 * Priority: edge function (Alchemy + Luno), then admin pricing-engine static.
 */
export async function getLunoPrices(symbols: string[]): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  try {
    const normalizedSymbols = symbols.map((s) => s.toUpperCase());
    if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION_MS) {
      const cachedSubset: Record<string, CryptoPrice> = {};
      for (const symbol of normalizedSymbols) {
        if (priceCache.prices[symbol]) {
          cachedSubset[symbol] = priceCache.prices[symbol];
        }
      }
      if (Object.keys(cachedSubset).length === normalizedSymbols.length) {
        return { prices: cachedSubset, error: null };
      }
    }

    const finalPrices: Record<string, CryptoPrice> = {};

    // 1) Edge function: Alchemy + Luno
    const marketResult = await fetchPricesFromLunoAPI(normalizedSymbols);
    if (marketResult.prices) {
      Object.assign(finalPrices, marketResult.prices);
    }

    // 2) Admin pricing-engine fallback for any symbols still missing.
    const missingSymbols = normalizedSymbols.filter((symbol) => {
      const price = finalPrices[symbol];
      return !price || !price.price_ngn || price.price_ngn <= 0;
    });

    if (missingSymbols.length > 0) {
      let configMap: Record<string, any> = {};
      try {
        const { getPricingEngineConfigsBatch } = await import('@/lib/admin-pricing-engine-service');
        const configPromise = getPricingEngineConfigsBatch(missingSymbols);
        const configTimeout = new Promise<Record<string, any>>((resolve) =>
          setTimeout(() => resolve({}), 1500)
        );
        configMap = await Promise.race([configPromise, configTimeout]).catch(() => ({}));
      } catch (e) {
        console.warn('Pricing engine fallback unavailable:', e);
      }

      const USD_TO_NGN = 1650;
      const now = new Date().toISOString();

      for (const symbol of missingSymbols) {
        const config = configMap[symbol];
        let buyPrice = 0;
        let sellPrice = 0;
        if (config) {
          if (config.price_frozen) {
            buyPrice = config.frozen_buy_price_ngn ?? 0;
            sellPrice = config.frozen_sell_price_ngn ?? 0;
          } else {
            buyPrice = config.override_buy_price_ngn ?? 0;
            sellPrice = config.override_sell_price_ngn ?? 0;
          }
        }
        finalPrices[symbol] = {
          crypto_symbol: symbol,
          price_usd: buyPrice > 0 ? buyPrice / USD_TO_NGN : 0,
          price_ngn: buyPrice,
          bid: sellPrice,
          ask: buyPrice,
          last_updated: now,
        };
      }
    }

    const now = new Date().toISOString();
    for (const symbol of normalizedSymbols) {
      if (!finalPrices[symbol]) {
        finalPrices[symbol] = {
          crypto_symbol: symbol,
          price_usd: 0,
          price_ngn: 0,
          bid: 0,
          ask: 0,
          last_updated: now,
        };
      }
    }

    let batchConfigs: Record<string, Record<string, unknown> | null> = {};
    try {
      const { getPricingEngineConfigsBatch } = await import('@/lib/admin-pricing-engine-service');
      const raw = await getPricingEngineConfigsBatch(normalizedSymbols).catch(() => ({}));
      for (const sym of normalizedSymbols) {
        const c = raw[sym];
        batchConfigs[sym] = c ? (c as unknown as Record<string, unknown>) : null;
      }
    } catch {
      batchConfigs = {};
    }

    const retailedPrices: Record<string, CryptoPrice> = {};
    for (const symbol of normalizedSymbols) {
      const engine = extractEngineBuySell(batchConfigs[symbol]);
      retailedPrices[symbol] = applyRetailSpreadToRow(finalPrices[symbol], engine, symbol) as CryptoPrice;
    }

    priceCache = { prices: retailedPrices, timestamp: Date.now() };
    return { prices: retailedPrices, error: marketResult.error ?? null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error getting market prices:', msg);
    return { prices: {}, error: msg || 'Failed to fetch prices' };
  }
}

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
      balances.BTC.balance = parseFloat(userWalletData.btc_balance?.toString() || '0') || 0;
      balances.ETH.balance = parseFloat(userWalletData.eth_balance?.toString() || '0') || 0;
      balances.USDT.balance = parseFloat(userWalletData.usdt_balance?.toString() || '0') || 0;
      balances.USDC.balance = parseFloat(userWalletData.usdc_balance?.toString() || '0') || 0;
      balances.XRP.balance = parseFloat(userWalletData.xrp_balance?.toString() || '0') || 0;
      balances.SOL.balance = parseFloat(userWalletData.sol_balance?.toString() || '0') || 0;
    } 
    // Priority 2: Use wallet_balances if user_wallets not available
    else if (Array.isArray(walletBalancesData) && walletBalancesData.length > 0) {
      for (const wb of walletBalancesData) {
        const symbol = wb.currency?.toUpperCase();
        if (!symbol || balances[symbol] === undefined) continue;
        
        let balanceValue = 0;
        let lockedValue = 0;
        
        if (wb.balance !== null && wb.balance !== undefined) {
          balanceValue = parseFloat(String(wb.balance).trim()) || 0;
        }
        
        if (wb.locked !== null && wb.locked !== undefined) {
          lockedValue = parseFloat(String(wb.locked).trim()) || 0;
        }
        
        balances[symbol].balance = Math.max(0, balanceValue - lockedValue);
      }
    }

    // OPTIMIZED: Fetch prices with short timeout (3 seconds)
    // Prices are optional - balances are returned even if prices fail
    try {
      const allCurrencies = Object.keys(balances);
      const pricePromise = getLunoPrices(allCurrencies);
      const priceTimeout = new Promise<{ prices: Record<string, CryptoPrice>; error: any }>((resolve) => 
        setTimeout(() => resolve({ prices: {}, error: null }), 3000)
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

    return { balances, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching user crypto balances:', error);
    // Always return default balances on error to prevent UI from hanging
    return { balances: defaultBalances, error: error.message || 'Failed to fetch balances' };
  }
}

export function formatCryptoBalance(amount: number, symbol: string): string {
  // Use more precision for SOL to show exact balance
  const decimals = symbol === 'BTC' || symbol === 'ETH' ? 8 : symbol === 'SOL' ? 8 : symbol === 'XRP' ? 6 : 2;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatUsdValue(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNgnValue(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

