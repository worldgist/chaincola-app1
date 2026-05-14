import { createClient } from './supabase/client';
import { applyRetailSpreadToRow, extractEngineBuySell, retailMarkupMultiplier, type RetailMovementContext } from '@/lib/retail-pricing';

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

/** Short cache so buy/sell UIs that poll see fresh spot; pair with `forceRefresh` on quote screens. */
const CACHE_DURATION_MS = 2500;

/** Last edge spot mid (NGN) per symbol — drives volatility-aware retail spread in `applyRetailSpreadToRow`. */
const lastSpotMidNgnBySymbol: Record<string, number> = {};

interface CachedPrices {
  prices: Record<string, CryptoPrice>;
  timestamp: number;
}

let priceCacheRetail: CachedPrices | null = null;
let priceCacheSpot: CachedPrices | null = null;

export type GetLunoPricesOptions = { retailOverlay?: boolean; forceRefresh?: boolean };

function spotNormalizeForDisplay(row: CryptoPrice, symbol: string): CryptoPrice {
  const usd = Number(row.price_usd);
  let ngn = Number(row.price_ngn);
  const fx = row.ngn_per_usd;
  if ((!Number.isFinite(ngn) || ngn <= 0) && Number.isFinite(usd) && usd > 0 && fx != null && Number.isFinite(fx) && fx > 0) {
    ngn = Math.round(usd * fx * 100) / 100;
  }
  return {
    ...row,
    crypto_symbol: row.crypto_symbol || symbol,
    price_ngn: ngn,
    price_usd: usd,
    bid: Number.isFinite(ngn) && ngn > 0 ? ngn : row.bid,
    ask: Number.isFinite(ngn) && ngn > 0 ? ngn : row.ask,
  };
}

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
  /** NGN per 1 USD from `get-token-prices` (`usd_to_ngn`); used with retail spread inverse USD. */
  ngn_per_usd?: number;
  /** `alchemy` | `luno` | `alchemy_spread` | `static` — used when merging feeds. */
  source?: string;
}

export interface CryptoBalance {
  symbol: string;
  balance: number;
  usdValue: number;
  ngnValue: number;
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

      const rawFx = (data as { usd_to_ngn?: unknown }).usd_to_ngn;
      const ngnPerUsd =
        typeof rawFx === 'number' && Number.isFinite(rawFx) && rawFx >= 400 && rawFx <= 5000
          ? rawFx
          : undefined;

      if (data.prices) {
        for (const symbol in data.prices) {
          const priceData = data.prices[symbol];
          const priceUsd = Number(priceData.price_usd) || 0;
          let priceNgn = Number(priceData.price_ngn) || 0;
          if (priceNgn <= 0 && priceUsd > 0 && ngnPerUsd != null) {
            priceNgn = Math.round(priceUsd * ngnPerUsd * 100) / 100;
          }
          const edgeSrc = String((priceData as { source?: string }).source || '').toLowerCase();
          const rowSource: string =
            edgeSrc === 'public_spot' ? 'public_spot' : 'alchemy';
          prices[symbol] = {
            crypto_symbol: priceData.crypto_symbol || symbol,
            price_usd: priceUsd,
            price_ngn: priceNgn,
            bid: priceData.bid != null ? Number(priceData.bid) : undefined,
            ask: priceData.ask != null ? Number(priceData.ask) : undefined,
            last_updated: priceData.last_updated || new Date().toISOString(),
            volume_24h: priceData.volume_24h != null ? Number(priceData.volume_24h) : undefined,
            change_24h_pct: priceData.change_24h_pct != null ? Number(priceData.change_24h_pct) : undefined,
            source: rowSource,
            ...(ngnPerUsd != null ? { ngn_per_usd: ngnPerUsd } : {}),
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
 * Static NGN rates when the edge feed returns nothing (offline / Alchemy outage).
 * `price_usd` uses a conservative FX divisor so UI still shows coherent numbers.
 */
const STATIC_CRYPTO_RATES_NGN: Record<string, number> = {
  BTC: 70_000_000,
  ETH: 4_000_000,
  USDT: 1_650,
  USDC: 1_650,
  XRP: 1_000,
  SOL: 250_000,
  TRX: 250,
};

const STATIC_FX_FALLBACK = 1650;

function getStaticCryptoRates(symbols: string[]): { prices: Record<string, CryptoPrice>; error: null } {
  const prices: Record<string, CryptoPrice> = {};
  const now = new Date().toISOString();
  for (const symbol of symbols) {
    const sym = symbol.toUpperCase();
    const rateNgn = STATIC_CRYPTO_RATES_NGN[sym];
    if (rateNgn == null || rateNgn <= 0) continue;
    const mult = retailMarkupMultiplier(sym);
    const buyNgn = rateNgn;
    const sellNgn = buyNgn / mult;
    prices[sym] = {
      crypto_symbol: sym,
      price_usd: buyNgn / STATIC_FX_FALLBACK,
      price_ngn: buyNgn,
      bid: sellNgn,
      ask: buyNgn,
      last_updated: now,
      source: 'static',
      ngn_per_usd: STATIC_FX_FALLBACK,
    };
  }
  return { prices, error: null };
}

function isSaneEdgeQuote(p: CryptoPrice | undefined): boolean {
  if (!p) return false;
  if (p.source === 'static') return false;
  const usd = Number(p.price_usd);
  const ngn = Number(p.price_ngn);
  return Number.isFinite(usd) && usd > 0 && Number.isFinite(ngn) && ngn > 0;
}

/**
 * Get market prices for buy/sell flows: `get-luno-ngn-quotes` merged with `get-token-prices`, then static fallback.
 * Retail overlay applies default bid/ask spread from `retail-pricing` when no DB overrides are loaded here.
 */
export async function getLunoPrices(
  symbols: string[],
  options?: GetLunoPricesOptions,
): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  const retailOverlay = options?.retailOverlay !== false;
  const forceRefresh = Boolean(options?.forceRefresh);
  try {
    const normalizedSymbols = symbols.map((s) => s.toUpperCase());
    const cacheLayer = retailOverlay ? priceCacheRetail : priceCacheSpot;
    if (!forceRefresh && cacheLayer && Date.now() - cacheLayer.timestamp < CACHE_DURATION_MS) {
      const cachedSubset: Record<string, CryptoPrice> = {};
      for (const symbol of normalizedSymbols) {
        if (cacheLayer.prices[symbol]) {
          cachedSubset[symbol] = cacheLayer.prices[symbol];
        }
      }
      if (Object.keys(cachedSubset).length === normalizedSymbols.length) {
        return { prices: cachedSubset, error: null };
      }
    }

    const finalPrices: Record<string, CryptoPrice> = {};

    const [lunoRes, marketResult] = await Promise.all([
      getLunoNgnOrderBookQuotes(normalizedSymbols),
      fetchPricesFromLunoAPI(normalizedSymbols),
    ]);

    for (const s of normalizedSymbols) {
      const L = lunoRes.prices[s];
      const A = marketResult.prices[s];
      if (isSaneEdgeQuote(L)) finalPrices[s] = { ...L };
      else if (isSaneEdgeQuote(A)) finalPrices[s] = { ...A };
    }

    const missingAfterEdge = normalizedSymbols.filter((s) => !isSaneEdgeQuote(finalPrices[s]));
    if (missingAfterEdge.length > 0) {
      const { prices: staticPrices } = getStaticCryptoRates(missingAfterEdge);
      Object.assign(finalPrices, staticPrices);
    }

    const retailedPrices: Record<string, CryptoPrice> = {};
    for (const symbol of normalizedSymbols) {
      const row = finalPrices[symbol];
      if (!row) continue;
      const spotMid = Number(row.price_ngn);
      const prev = lastSpotMidNgnBySymbol[symbol];
      const movement: RetailMovementContext | undefined =
        prev != null && prev > 0 && spotMid > 0 ? { prevSpotMidNgn: prev } : undefined;
      retailedPrices[symbol] = retailOverlay
        ? (applyRetailSpreadToRow(row, extractEngineBuySell(null), symbol, movement) as CryptoPrice)
        : spotNormalizeForDisplay(row, symbol);
      if (spotMid > 0) {
        lastSpotMidNgnBySymbol[symbol] = spotMid;
      }
    }

    if (Object.keys(retailedPrices).length === 0) {
      return {
        prices: {},
        error:
          marketResult.error ||
          lunoRes.error ||
          'No live or fallback prices for requested symbols',
      };
    }

    const nextCache: CachedPrices = {
      prices: { ...(cacheLayer?.prices ?? {}), ...retailedPrices },
      timestamp: Date.now(),
    };
    if (retailOverlay) {
      priceCacheRetail = nextCache;
    } else {
      priceCacheSpot = nextCache;
    }

    return { prices: retailedPrices, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error getting market prices:', msg);
    return { prices: {}, error: msg || 'Failed to fetch prices' };
  }
}

export type LunoNgnQuotesResult = {
  prices: Record<string, CryptoPrice>;
  error: string | null;
  /** Per-symbol failures when others succeeded */
  quoteErrors?: Record<string, string>;
};

/**
 * Luno public NGN tickers (bid = sell-to-book, ask = buy-from-book) via Edge Function
 * `get-luno-ngn-quotes`. SOL uses Alchemy USD × FX with a small synthetic spread (no Luno pair).
 */
export async function getLunoNgnOrderBookQuotes(
  symbols: string[],
  options?: { timeoutMs?: number },
): Promise<LunoNgnQuotesResult> {
  const timeoutMs = options?.timeoutMs ?? 12_000;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      prices: {},
      error: 'Supabase not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)',
    };
  }
  const normalized = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return { prices: {}, error: null };
  }

  const functionUrl = `${SUPABASE_URL}/functions/v1/get-luno-ngn-quotes?symbols=${encodeURIComponent(
    normalized.join(','),
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(functionUrl, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        prices: {},
        error: `get-luno-ngn-quotes HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      prices?: Record<string, CryptoPrice & { source?: string }>;
      errors?: Record<string, string>;
      error?: string;
    };

    if (data.error && !data.prices) {
      return { prices: {}, error: String(data.error) };
    }

    const rawFx = (data as { usd_to_ngn?: unknown }).usd_to_ngn;
    const ngnPerUsd =
      typeof rawFx === 'number' && Number.isFinite(rawFx) && rawFx >= 400 && rawFx <= 5000
        ? rawFx
        : undefined;

    const raw = data.prices ?? {};
    const prices: Record<string, CryptoPrice> = {};
    for (const sym of normalized) {
      const row = raw[sym];
      if (!row) continue;
      const bid = row.bid != null ? Number(row.bid) : 0;
      const ask = row.ask != null ? Number(row.ask) : 0;
      const priceNgn = Number(row.price_ngn) || 0;
      const priceUsd = Number(row.price_usd) || 0;
      const src =
        row.source === 'luno' || row.source === 'alchemy_spread' || row.source === 'public_spread'
          ? row.source
          : 'luno';
      prices[sym] = {
        crypto_symbol: row.crypto_symbol || sym,
        price_usd: priceUsd,
        price_ngn: priceNgn > 0 ? priceNgn : bid > 0 && ask > 0 ? (bid + ask) / 2 : 0,
        bid: bid > 0 ? bid : undefined,
        ask: ask > 0 ? ask : undefined,
        last_updated: row.last_updated || new Date().toISOString(),
        volume_24h: row.volume_24h,
        change_24h_pct: row.change_24h_pct,
        source: src,
        ...(ngnPerUsd != null ? { ngn_per_usd: ngnPerUsd } : {}),
      };
    }

    const quoteErrors = data.errors && Object.keys(data.errors).length > 0 ? data.errors : undefined;
    if (Object.keys(prices).length === 0) {
      return {
        prices: {},
        error: data.error ? String(data.error) : 'No Luno NGN quotes returned',
        quoteErrors,
      };
    }

    return {
      prices,
      error: null,
      quoteErrors,
    };
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      return { prices: {}, error: `Luno quotes request timed out after ${timeoutMs}ms` };
    }
    return { prices: {}, error: e instanceof Error ? e.message : String(e) };
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
      const pricePromise = getLunoPrices(allCurrencies, { retailOverlay: false });
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

