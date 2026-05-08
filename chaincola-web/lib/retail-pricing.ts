/**
 * Busha-style retail spread (holdings / buy ↔ sell quotes).
 */

export const WALLET_MARKUP_OVER_SELL = 1.052;

const STABLE_SYMBOLS = new Set(['USDT', 'USDC']);

export function retailMarkupMultiplier(symbol: string): number {
  if (STABLE_SYMBOLS.has(symbol.toUpperCase())) {
    return 1.003;
  }
  return WALLET_MARKUP_OVER_SELL;
}

export interface EngineBuySellPartial {
  buy?: number | null;
  sell?: number | null;
  /** Admin retail margin: buy_quote ≈ sell_quote * (1 + fraction) when inferring one side. */
  retail_markup_fraction?: number | null;
}

export function markupMultiplierFromEngine(symbol: string, engine: EngineBuySellPartial | null): number {
  const f = engine?.retail_markup_fraction;
  if (f != null && Number.isFinite(Number(f)) && Number(f) >= 0 && Number(f) <= 0.5) {
    return 1 + Number(f);
  }
  return retailMarkupMultiplier(symbol);
}

export function extractEngineBuySell(config: Record<string, unknown> | undefined | null): EngineBuySellPartial | null {
  if (!config) return null;
  const frozen = Boolean(config.price_frozen);
  let buy = 0;
  let sell = 0;
  if (frozen) {
    buy = parseFloat(String(config.frozen_buy_price_ngn ?? '0')) || 0;
    sell = parseFloat(String(config.frozen_sell_price_ngn ?? '0')) || 0;
  } else {
    buy = parseFloat(String(config.override_buy_price_ngn ?? '0')) || 0;
    sell = parseFloat(String(config.override_sell_price_ngn ?? '0')) || 0;
  }
  const rmRaw = config.retail_markup_fraction;
  const rm = rmRaw != null && rmRaw !== '' ? parseFloat(String(rmRaw)) : NaN;
  if (buy <= 0 && sell <= 0 && !Number.isFinite(rm)) return null;
  return {
    buy: buy > 0 ? buy : null,
    sell: sell > 0 ? sell : null,
    retail_markup_fraction: Number.isFinite(rm) && rm >= 0 && rm <= 0.5 ? rm : null,
  };
}

export interface PricingRowLike {
  crypto_symbol: string;
  price_ngn: number;
  price_usd: number;
  bid?: number;
  ask?: number;
  last_updated: string;
  volume_24h?: number;
  change_24h_pct?: number;
  source?: string;
}

export function applyRetailSpreadToRow(row: PricingRowLike, engine: EngineBuySellPartial | null, symbol: string): PricingRowLike {
  const mult = markupMultiplierFromEngine(symbol, engine);
  let eBuy = engine?.buy != null ? Number(engine.buy) : 0;
  let eSell = engine?.sell != null ? Number(engine.sell) : 0;
  if (eBuy > 0 && eSell > 0 && eBuy < eSell) {
    const t = eBuy;
    eBuy = eSell;
    eSell = t;
  }
  if (eBuy > 0 && eSell > 0 && eBuy >= eSell) {
    return {
      ...row,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: eBuy,
      bid: eSell,
      ask: eBuy,
      price_usd: eBuy > 0 ? eBuy / 1650 : row.price_usd,
    };
  }
  if (eBuy > 0) {
    const sell = Math.max(eBuy / mult, 0);
    return {
      ...row,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: eBuy,
      bid: sell,
      ask: eBuy,
      price_usd: eBuy > 0 ? eBuy / 1650 : row.price_usd,
    };
  }
  if (eSell > 0) {
    const buy = eSell * mult;
    return {
      ...row,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: buy,
      bid: eSell,
      ask: buy,
      price_usd: buy > 0 ? buy / 1650 : row.price_usd,
    };
  }

  const mid = Number(row.price_ngn);
  let bid = row.bid != null ? Number(row.bid) : 0;
  let ask = row.ask != null ? Number(row.ask) : 0;
  if (mid <= 0) return { ...row, crypto_symbol: row.crypto_symbol || symbol };

  if (bid > 0 && ask > 0 && ask > bid && (ask - bid) / ask > 0.0005) {
    return {
      ...row,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: ask,
      bid,
      ask,
      price_usd: ask > 0 ? ask / 1650 : row.price_usd,
    };
  }

  const sellAnchor = bid > 0 && bid <= mid ? bid : mid;
  const buyNgn = sellAnchor * mult;
  return {
    ...row,
    crypto_symbol: row.crypto_symbol || symbol,
    bid: sellAnchor,
    ask: buyNgn,
    price_ngn: buyNgn,
    price_usd: buyNgn > 0 ? buyNgn / 1650 : row.price_usd,
  };
}
