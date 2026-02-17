// Get Luno Live Market Prices Edge Function
// Fetches real-time cryptocurrency prices from Luno API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Luno API base URL
const LUNO_API_BASE = 'https://api.luno.com';

// Mapping from crypto symbols to Luno currency pairs
const LUNO_PAIRS: Record<string, string> = {
  BTC: 'XBTNGN',  // Bitcoin/NGN (Luno uses XBT for Bitcoin)
  ETH: 'ETHNGN',  // Ethereum/NGN
  SOL: 'SOLNGN',  // Solana/NGN
  USDT: 'USDTNGN', // Tether/NGN (if available)
  USDC: 'USDCNGN', // USD Coin/NGN (if available)
  TRX: 'TRXNGN',  // Tron/NGN (if available)
  XRP: 'XRPNGN',  // Ripple/NGN (if available)
};

// Reverse mapping from Luno pairs to symbols
const LUNO_PAIR_TO_SYMBOL: Record<string, string> = {
  XBTNGN: 'BTC',
  ETHNGN: 'ETH',
  SOLNGN: 'SOL',
  USDTNGN: 'USDT',
  USDCNGN: 'USDC',
  TRXNGN: 'TRX',
  XRPNGN: 'XRP',
};

interface LunoTicker {
  pair: string;
  timestamp: number;
  bid: string;
  ask: string;
  last_trade: string;
  rolling_24_hour_volume: string;
  status: string;
}

interface LunoTickersResponse {
  tickers: LunoTicker[];
}

interface PriceResponse {
  crypto_symbol: string;
  price_ngn: number;
  price_usd: number;
  bid: number;
  ask: number;
  last_updated: string;
  volume_24h: number;
}

// USD to NGN exchange rate (can be fetched dynamically or use a reasonable default)
const USD_TO_NGN_RATE = 1650;

// CoinGecko id for fallback when Luno does not return a pair (e.g. SOL, USDT, USDC, XRP on NGN)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDT: 'tether',
  USDC: 'usd-coin',
  XRP: 'ripple',
};

/** Fetch USD/NGN rate from exchangerate-api for fallback prices */
async function getUsdToNgnRate(): Promise<number> {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data.rates?.NGN) return data.rates.NGN;
    }
  } catch (e) {
    console.warn('⚠️ Exchange rate fetch failed, using default:', e);
  }
  return USD_TO_NGN_RATE;
}

/** Fill missing symbols from CoinGecko (USD only, then convert to NGN) */
async function fetchCoinGeckoFallback(
  missingSymbols: string[],
  timestamp: string,
  usdToNgn: number
): Promise<Record<string, PriceResponse>> {
  const ids = missingSymbols
    .map((s) => COINGECKO_IDS[s])
    .filter(Boolean);
  if (ids.length === 0) return {};

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};

    const data = await res.json();
    const out: Record<string, PriceResponse> = {};
    const idToSymbol: Record<string, string> = {};
    for (const sym of missingSymbols) {
      const id = COINGECKO_IDS[sym];
      if (id) idToSymbol[id] = sym;
    }
    for (const [id, val] of Object.entries(data)) {
      const symbol = idToSymbol[id];
      const usd = (val as { usd?: number }).usd;
      if (!symbol || typeof usd !== 'number' || usd <= 0) continue;
      const priceNgn = usd * usdToNgn;
      out[symbol] = {
        crypto_symbol: symbol,
        price_ngn: Math.round(priceNgn * 100) / 100,
        price_usd: usd,
        bid: usd,
        ask: usd,
        last_updated: timestamp,
        volume_24h: 0,
      };
    }
    if (Object.keys(out).length > 0) {
      console.log(`✅ CoinGecko fallback: ${Object.keys(out).join(', ')}`);
    }
    return out;
  } catch (e) {
    console.warn('⚠️ CoinGecko fallback failed:', e);
    return {};
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // This is a public endpoint - no user authentication required
    // Only requires apikey header (handled by Supabase infrastructure)
    
    // Get requested symbols from query params (optional, defaults to all supported)
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');
    const requestedSymbols = symbolsParam ? symbolsParam.split(',') : Object.keys(LUNO_PAIRS);

    // Normalize and support all known symbols (Luno + CoinGecko fallback)
    const supportedSymbols = requestedSymbols
      .map((symbol) => symbol.toUpperCase().trim())
      .filter((symbol) => LUNO_PAIRS[symbol] || COINGECKO_IDS[symbol]);

    if (supportedSymbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid symbols provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build list of pairs to request from Luno (only symbols that have a Luno pair)
    const pairs = supportedSymbols
      .filter((symbol) => LUNO_PAIRS[symbol])
      .map((symbol) => LUNO_PAIRS[symbol]) as string[];

    const prices: Record<string, PriceResponse> = {};
    const timestamp = new Date().toISOString();

    // 1) Fetch from Luno when we have pairs
    if (pairs.length > 0) {
      const pairParams = pairs.map((pair) => `pair=${pair}`).join('&');
      const lunoUrl = `${LUNO_API_BASE}/api/1/tickers?${pairParams}`;
      console.log(`📊 Fetching Luno prices for pairs: ${pairs.join(', ')}`);

      const response = await fetch(lunoUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data: LunoTickersResponse = await response.json();
        const tickers = data.tickers || [];
        console.log(`✅ Received ${tickers.length} tickers from Luno`);

        for (const ticker of tickers) {
          const symbol = LUNO_PAIR_TO_SYMBOL[ticker.pair];
          if (!symbol) continue;
          if (ticker.status !== 'ACTIVE') continue;
          const ngnPrice = parseFloat(ticker.last_trade || ticker.bid || '0');
          if (ngnPrice <= 0) continue;

          const usdPrice = ngnPrice / USD_TO_NGN_RATE;
          prices[symbol] = {
            crypto_symbol: symbol,
            price_ngn: ngnPrice,
            price_usd: usdPrice,
            bid: parseFloat(ticker.bid || '0'),
            ask: parseFloat(ticker.ask || '0'),
            last_updated: ticker.timestamp ? new Date(ticker.timestamp).toISOString() : timestamp,
            volume_24h: parseFloat(ticker.rolling_24_hour_volume || '0'),
          };
        }
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Luno API error:', response.status, errorText);
      }
    }

    // 2) Fill missing symbols from CoinGecko so market prices always show
    const missing = supportedSymbols.filter((s) => !prices[s]);
    if (missing.length > 0) {
      const usdToNgn = await getUsdToNgnRate();
      const fallback = await fetchCoinGeckoFallback(missing, timestamp, usdToNgn);
      for (const [symbol, p] of Object.entries(fallback)) {
        prices[symbol] = p;
      }
    }

    console.log(`✅ Processed prices for ${Object.keys(prices).length} cryptocurrencies`);

    return new Response(
      JSON.stringify({
        success: true,
        prices,
        timestamp,
      }),
      { 
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Error fetching Luno prices:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Failed to fetch prices',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

