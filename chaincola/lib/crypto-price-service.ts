// Prices: Supabase `get-luno-ngn-quotes` (Luno NGN tickers + SOL via Alchemy) merged with `get-token-prices` (Alchemy all symbols). Prefer Luno when sane so wallet/home stay live even if Alchemy-only path fails. Use `getLunoPrices(..., { retailOverlay: false })` for spot display; default applies retail spread on top of spot/static fallbacks.

import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';
import { applyRetailSpreadToRow, retailMarkupMultiplier, type RetailMovementContext } from './retail-pricing';

/** NGN per 1 USD — default before any live feed; updated from `get-token-prices` `usd_to_ngn`. */
export const USD_TO_NGN_RATE = 1650;

let lastResolvedNgnPerUsd = USD_TO_NGN_RATE;

/** Latest NGN/USD from the token price edge response (or initial default). */
export function getLastResolvedNgnPerUsd(): number {
  return lastResolvedNgnPerUsd;
}

/** Ignore corrupt stablecoin rows / bad admin overrides (e.g. ₦1 per USDT). */
const MIN_SANE_STABLE_NGN_PER_USD = 400;
const MAX_SANE_STABLE_NGN_PER_USD = 5000;

/**
 * Implied NGN per 1 USD from a USDT/USDC quote (price_usd ≈ 1).
 * Prefer ngn/usd when both are present; else use ask/bid if in sane band.
 */
export function impliedNgnPerUsdFromStableQuote(
  price: CryptoPrice | null | undefined,
  side: 'buy' | 'sell',
): number | null {
  if (!price) return null;
  const usd = Number(price.price_usd);
  const ngnRaw = side === 'buy' ? (price.ask ?? price.price_ngn) : (price.bid ?? price.price_ngn);
  const ngn = Number(ngnRaw ?? 0);
  if (usd > 0 && ngn > 0) {
    const perUsd = ngn / usd;
    if (perUsd >= MIN_SANE_STABLE_NGN_PER_USD && perUsd <= MAX_SANE_STABLE_NGN_PER_USD) {
      return perUsd;
    }
  }
  if (ngn >= MIN_SANE_STABLE_NGN_PER_USD && ngn <= MAX_SANE_STABLE_NGN_PER_USD && usd > 0 && Math.abs(usd - 1) < 0.05) {
    return ngn;
  }
  const rowFx = price.ngn_per_usd;
  if (rowFx != null && Number.isFinite(rowFx) && rowFx >= MIN_SANE_STABLE_NGN_PER_USD && rowFx <= MAX_SANE_STABLE_NGN_PER_USD) {
    return rowFx;
  }
  return null;
}

export function getDisplayBuyRateNgnPerUsd(usdtQuote: CryptoPrice | null | undefined): number {
  return impliedNgnPerUsdFromStableQuote(usdtQuote, 'buy') ?? getLastResolvedNgnPerUsd();
}

export function getDisplaySellRateNgnPerUsd(usdtQuote: CryptoPrice | null | undefined): number {
  return impliedNgnPerUsdFromStableQuote(usdtQuote, 'sell') ?? getLastResolvedNgnPerUsd();
}

/** Supported crypto symbols for pricing */
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
  SOL: 250_000,
  TRX: 250,
};

const CACHE_DURATION_MS = 2500;

/** Last edge spot mid (NGN) per symbol for volatility-aware retail spread. */
const lastSpotMidNgnBySymbol: Record<string, number> = {};

interface CachedPrices {
  prices: Record<string, CryptoPrice>;
  timestamp: number;
  pendingRequest?: Promise<{ prices: Record<string, CryptoPrice>; error: any }>;
}

/** Separate caches so spot (display) and retail (quotes) never mix stale rows. */
let priceCacheRetail: CachedPrices | null = null;
let priceCacheSpot: CachedPrices | null = null;

async function fetchMarketPricesFromEdge(
  symbols: string[]
): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { prices: {}, error: 'Supabase not configured' };
    }
    const normalized = symbols.map((s) => s.toUpperCase());
    const functionUrl = `${SUPABASE_URL}/functions/v1/get-token-prices?symbols=${encodeURIComponent(normalized.join(','))}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      return { prices: {}, error: `Price service HTTP ${response.status}` };
    }

    const data = await response.json();
    if (!data.success || !data.prices) {
      return { prices: {}, error: data.error || 'Price service error' };
    }

    const rawFx = (data as { usd_to_ngn?: unknown }).usd_to_ngn;
    const ngnPerUsd =
      typeof rawFx === 'number' && Number.isFinite(rawFx) && rawFx >= 400 && rawFx <= 5000
        ? rawFx
        : undefined;
    if (ngnPerUsd != null) {
      lastResolvedNgnPerUsd = ngnPerUsd;
    }

    const prices: Record<string, CryptoPrice> = {};
    for (const symbol of Object.keys(data.prices)) {
      const p = data.prices[symbol] as {
        crypto_symbol?: string;
        price_usd?: number;
        price_ngn?: number;
        bid?: number;
        ask?: number;
        last_updated?: string;
        volume_24h?: number;
        change_24h_pct?: number;
        source?: string;
      };
      const symU = symbol.toUpperCase();
      const priceUsd = Number(p.price_usd) || 0;
      let priceNgn = Number(p.price_ngn) || 0;
      if (priceNgn <= 0 && priceUsd > 0 && ngnPerUsd != null) {
        priceNgn = Math.round(priceUsd * ngnPerUsd * 100) / 100;
      }
      const edgeSrc = String(p.source || '').toLowerCase();
      const rowSource: string =
        edgeSrc === 'public_spot' ? 'public_spot' : 'alchemy';
      prices[symU] = {
        crypto_symbol: p.crypto_symbol || symU,
        price_usd: priceUsd,
        price_ngn: priceNgn,
        bid: p.bid != null ? Number(p.bid) : undefined,
        ask: p.ask != null ? Number(p.ask) : undefined,
        last_updated: p.last_updated || new Date().toISOString(),
        volume_24h: p.volume_24h != null ? Number(p.volume_24h) : undefined,
        source: rowSource,
        change_24h_pct: p.change_24h_pct != null ? Number(p.change_24h_pct) : undefined,
        ...(ngnPerUsd != null ? { ngn_per_usd: ngnPerUsd } : {}),
      };
    }
    return { prices, error: null };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { prices: {}, error: 'Price request timeout' };
    }
    return { prices: {}, error: e?.message || 'Price fetch failed' };
  }
}

/** Row from edge with usable NGN (venue book or mid). USD may be 0 on NGN-only books (e.g. Luno). */
function isSaneEdgeQuote(p: CryptoPrice | undefined): boolean {
  if (!p) return false;
  if (p.source === 'static') return false;
  const ngn = Number(p.price_ngn);
  const bid = Number(p.bid);
  const ask = Number(p.ask);
  return (
    (Number.isFinite(ngn) && ngn > 0) ||
    (Number.isFinite(bid) && bid > 0) ||
    (Number.isFinite(ask) && ask > 0)
  );
}

/** Ensure `price_ngn` mid and USD exist when the venue only sent bid/ask (common on NGN books). */
function fillMissingMidAndUsdFromBook(row: CryptoPrice): CryptoPrice {
  const out = { ...row };
  let ngn = Number(out.price_ngn);
  const bid = Number(out.bid ?? 0);
  const ask = Number(out.ask ?? 0);
  if (!Number.isFinite(ngn) || ngn <= 0) {
    if (bid > 0 && ask > 0) ngn = (bid + ask) / 2;
    else if (ask > 0) ngn = ask;
    else if (bid > 0) ngn = bid;
    if (Number.isFinite(ngn) && ngn > 0) out.price_ngn = ngn;
  }
  let usd = Number(out.price_usd);
  if (!Number.isFinite(usd) || usd <= 0) {
    const fx = out.ngn_per_usd ?? getLastResolvedNgnPerUsd();
    const n = Number(out.price_ngn);
    if (fx > 0 && n > 0) out.price_usd = Math.round((n / fx) * 1e8) / 1e8;
  }
  return out;
}

/**
 * Luno public NGN tickers (+ SOL spot on the edge: Alchemy or Binance SOL/USDT × FX).
 */
async function fetchLunoNgnQuotesFromEdge(
  symbols: string[],
): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { prices: {}, error: 'Supabase not configured' };
    }
    const normalized = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];
    if (normalized.length === 0) return { prices: {}, error: null };

    const functionUrl = `${SUPABASE_URL}/functions/v1/get-luno-ngn-quotes?symbols=${encodeURIComponent(
      normalized.join(','),
    )}`;

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(functionUrl, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = undefined;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        prices: {},
        error: `get-luno-ngn-quotes HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      prices?: Record<
        string,
        {
          crypto_symbol?: string;
          price_usd?: number;
          price_ngn?: number;
          bid?: number;
          ask?: number;
          last_updated?: string;
          volume_24h?: number;
          change_24h_pct?: number;
          source?: string;
        }
      >;
      errors?: Record<string, string>;
      error?: string;
      usd_to_ngn?: unknown;
    };

    if (data.error && !data.prices) {
      return { prices: {}, error: String(data.error) };
    }

    const rawFx = data.usd_to_ngn;
    const ngnPerUsd =
      typeof rawFx === 'number' && Number.isFinite(rawFx) && rawFx >= 400 && rawFx <= 5000
        ? rawFx
        : undefined;
    if (ngnPerUsd != null) {
      lastResolvedNgnPerUsd = ngnPerUsd;
    }

    const raw = data.prices ?? {};
    const prices: Record<string, CryptoPrice> = {};
    for (const sym of normalized) {
      const row = raw[sym];
      if (!row) continue;
      const bid = row.bid != null ? Number(row.bid) : 0;
      const ask = row.ask != null ? Number(row.ask) : 0;
      const priceNgn = Number(row.price_ngn) || 0;
      const priceUsd = Number(row.price_usd) || 0;
      const mid =
        priceNgn > 0 ? priceNgn : bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
      const src =
        row.source === 'luno' || row.source === 'alchemy_spread' || row.source === 'public_spread'
          ? row.source
          : 'luno';
      prices[sym] = {
        crypto_symbol: row.crypto_symbol || sym,
        price_usd: priceUsd,
        price_ngn: mid,
        bid: bid > 0 ? bid : undefined,
        ask: ask > 0 ? ask : undefined,
        last_updated: row.last_updated || new Date().toISOString(),
        volume_24h: row.volume_24h != null ? Number(row.volume_24h) : undefined,
        change_24h_pct: row.change_24h_pct != null ? Number(row.change_24h_pct) : undefined,
        source: src,
        ...(ngnPerUsd != null ? { ngn_per_usd: ngnPerUsd } : {}),
      };
    }

    return {
      prices,
      error: Object.keys(prices).length === 0 ? data.error || 'No Luno NGN quotes' : null,
    };
  } catch (e: unknown) {
    if (timeoutId) clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      return { prices: {}, error: 'Luno quotes request timeout' };
    }
    return { prices: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface CryptoPrice {
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  last_updated: string;
  bid?: number;
  ask?: number;
  volume_24h?: number;
  /** Spot source label (e.g. alchemy, static) */
  source?: string;
  /** 24h % change when provided by price service */
  change_24h_pct?: number;
  /** NGN per 1 USD from `get-token-prices` (`usd_to_ngn`). */
  ngn_per_usd?: number;
}

export interface CryptoBalance {
  symbol: string;
  balance: number;
  usdValue: number;
  ngnValue: number;
}

/** When false, callers get live spot (edge FX × USD). When true (default), retail spread applies on spot/static — for buy/sell quotes. */
export type GetLunoPricesOptions = { retailOverlay?: boolean; forceRefresh?: boolean };

/**
 * Single-symbol quote. Default `retailOverlay: true` matches buy/sell engine quotes.
 * Use `retailOverlay: false` for screens that should show live spot (charts, holdings context).
 */
export async function getCryptoPrice(
  symbol: string,
  opts?: Pick<GetLunoPricesOptions, 'retailOverlay' | 'forceRefresh'>,
): Promise<{ price: CryptoPrice | null; error: any }> {
  const symbolUpper = symbol.toUpperCase();
  const retailOverlay = opts?.retailOverlay !== false;
  const forceRefresh = Boolean(opts?.forceRefresh);
  if (!SUPPORTED_SYMBOLS.includes(symbolUpper)) {
    return { price: null, error: `Unsupported cryptocurrency: ${symbol}` };
  }
  const layer = retailOverlay ? priceCacheRetail : priceCacheSpot;
  if (
    !forceRefresh &&
    layer?.prices?.[symbolUpper] &&
    Date.now() - layer.timestamp < CACHE_DURATION_MS
  ) {
    return { price: layer.prices[symbolUpper], error: null };
  }
  const { prices, error } = await getLunoPrices([symbolUpper], { retailOverlay, forceRefresh });
  if (error || !prices[symbolUpper]) {
    return { price: null, error: error || `Price not found for ${symbol}` };
  }
  return { price: prices[symbolUpper], error: null };
}

/**
 * Get static crypto rates (fallback when the edge price feed has no row).
 * Uses in-app constants only.
 */
export function getStaticCryptoRates(symbols?: string[]): { prices: Record<string, CryptoPrice>; error: null } {
  const symbolsToUse = symbols || SUPPORTED_SYMBOLS;
  const prices: Record<string, CryptoPrice> = {};
  const now = new Date().toISOString();
  const fx = getLastResolvedNgnPerUsd();
  for (const symbol of symbolsToUse) {
    const symbolUpper = symbol.toUpperCase();
    const rateNgn = STATIC_CRYPTO_RATES_NGN[symbolUpper];
    if (rateNgn != null && rateNgn > 0) {
      const mult = retailMarkupMultiplier(symbolUpper);
      const buyNgn = rateNgn;
      const sellNgn = buyNgn / mult;
      prices[symbolUpper] = {
        crypto_symbol: symbolUpper,
        price_usd: buyNgn / fx,
        price_ngn: buyNgn,
        bid: sellNgn,
        ask: buyNgn,
        last_updated: now,
        source: 'static',
        ngn_per_usd: fx,
      };
    }
  }
  return { prices, error: null };
}

/**
 * Get crypto market prices (edge function, then fallbacks).
 */
export async function getCryptoPrices(): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  return getLunoPrices(SUPPORTED_SYMBOLS, { retailOverlay: false });
}

/** Mid market row for holdings / ticker display (no admin overrides, no retail markup). */
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

/**
 * Live market prices: `get-luno-ngn-quotes` (Luno NGN + SOL on server) merged with `get-token-prices` (Alchemy),
 * then static fallbacks, then retail markup when `retailOverlay` is true.
 */
export async function getLunoPrices(
  symbols?: string[],
  options?: GetLunoPricesOptions,
): Promise<{ prices: Record<string, CryptoPrice>; error: any }> {
  const retailOverlay = options?.retailOverlay !== false;
  const forceRefresh = Boolean(options?.forceRefresh);

  try {
    const symbolsToUse = (symbols || SUPPORTED_SYMBOLS).map((s) => s.toUpperCase());
    const priceCache = retailOverlay ? priceCacheRetail : priceCacheSpot;

    if (!forceRefresh && priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION_MS) {
      const cached: Record<string, CryptoPrice> = {};
      let allHit = true;
      for (const s of symbolsToUse) {
        if (priceCache.prices[s]) {
          cached[s] = priceCache.prices[s];
        } else {
          allHit = false;
          break;
        }
      }
      if (allHit) {
        return { prices: cached, error: null };
      }
    }

    const merged: Record<string, CryptoPrice> = {};

    const [lunoEdge, tokenEdge] = await Promise.all([
      fetchLunoNgnQuotesFromEdge(symbolsToUse),
      fetchMarketPricesFromEdge(symbolsToUse),
    ]);

    for (const s of symbolsToUse) {
      const L = lunoEdge.prices[s];
      const A = tokenEdge.prices[s];
      if (isSaneEdgeQuote(L)) merged[s] = fillMissingMidAndUsdFromBook({ ...L });
      else if (isSaneEdgeQuote(A)) merged[s] = fillMissingMidAndUsdFromBook({ ...A });
    }

    const missingAfterEdge = symbolsToUse.filter((s) => !isSaneEdgeQuote(merged[s]));
    if (missingAfterEdge.length > 0) {
      const { prices: hardcoded } = getStaticCryptoRates(missingAfterEdge);
      Object.assign(merged, hardcoded);
    }

    const out: Record<string, CryptoPrice> = {};
    for (const s of symbolsToUse) {
      if (!merged[s]) continue;
      const spotMid = Number(merged[s].price_ngn);
      const prev = lastSpotMidNgnBySymbol[s];
      const movement: RetailMovementContext | undefined =
        prev != null && prev > 0 && spotMid > 0 ? { prevSpotMidNgn: prev } : undefined;
      out[s] = retailOverlay
        ? (applyRetailSpreadToRow(merged[s], null, s, movement) as CryptoPrice)
        : spotNormalizeForDisplay(merged[s], s);
      if (spotMid > 0) {
        lastSpotMidNgnBySymbol[s] = spotMid;
      }
    }

    if (Object.keys(out).length === 0) {
      return {
        prices: {},
        error:
          tokenEdge.error ||
          lunoEdge.error ||
          'No live or fallback prices for requested symbols',
      };
    }

    const nextCache: CachedPrices = {
      prices: { ...(priceCache?.prices ?? {}), ...out },
      timestamp: Date.now(),
    };
    if (retailOverlay) {
      priceCacheRetail = nextCache;
    } else {
      priceCacheSpot = nextCache;
    }

    return { prices: out, error: null };
  } catch (error: any) {
    console.error('❌ Error fetching market prices:', error);
    const fallbackCache = retailOverlay ? priceCacheRetail : priceCacheSpot;
    if (fallbackCache?.prices && Object.keys(fallbackCache.prices).length > 0) {
      const symbolsToUse = (symbols || SUPPORTED_SYMBOLS).map((s) => s.toUpperCase());
      const fallback: Record<string, CryptoPrice> = {};
      for (const s of symbolsToUse) {
        if (fallbackCache.prices[s]) fallback[s] = fallbackCache.prices[s];
      }
      if (Object.keys(fallback).length > 0) return { prices: fallback, error: null };
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

    // Live prices (do not race with an empty timeout — that often wins and drops real prices)
    try {
      const allCurrencies = Object.keys(balances);
      const priceResult = await getLunoPrices(allCurrencies, { retailOverlay: false });

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
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       SUPABASE_URL;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

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
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       SUPABASE_URL;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

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


