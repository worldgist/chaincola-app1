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
  /** NGN per 1 USD from the price feed (e.g. `get-token-prices` `usd_to_ngn`). Used when inferring USD from NGN. */
  ngn_per_usd?: number;
}

const FALLBACK_NGN_PER_USD = 1650;
const MIN_NGN_PER_USD = 400;
const MAX_NGN_PER_USD = 5000;

export function ngnPerUsdFromPricingRow(row: PricingRowLike): number {
  const v = row.ngn_per_usd;
  if (v != null && Number.isFinite(v) && v >= MIN_NGN_PER_USD && v <= MAX_NGN_PER_USD) return v;
  return FALLBACK_NGN_PER_USD;
}

/** Prior NGN spot mid from the same feed (before retail overlay), used to detect short-term moves. */
export interface RetailMovementContext {
  prevSpotMidNgn?: number | null;
}

/**
 * Widen buy-vs-sell markup when spot jumps between polls or when 24h move is elevated.
 * Caps keep stables near-peg; volatile assets stay within a bounded retail band.
 */
export function volatilityAdjustedMarkupMultiplier(
  symbol: string,
  baseMult: number,
  spotMidNgn: number,
  movement: RetailMovementContext | undefined,
  change24hPct: number | null | undefined,
): number {
  const sym = symbol.toUpperCase();
  const isStable = STABLE_SYMBOLS.has(sym);
  const maxMult = isStable ? 1.008 : Math.min(Math.max(baseMult * 1.12, 1.06), 1.18);
  if (!Number.isFinite(baseMult) || baseMult <= 0) return Math.min(1.052, maxMult);
  if (!Number.isFinite(spotMidNgn) || spotMidNgn <= 0) return Math.min(baseMult, maxMult);

  let stress = 0;
  const prev = movement?.prevSpotMidNgn;
  if (prev != null && prev > 0 && spotMidNgn > 0) {
    const tickMove = Math.abs(spotMidNgn - prev) / prev;
    stress = Math.max(stress, Math.min(tickMove * 25, 0.08));
  }
  if (change24hPct != null && Number.isFinite(change24hPct)) {
    const ch = Math.min(Math.abs(change24hPct) / 100, 0.35);
    stress = Math.max(stress, Math.min(ch * 0.1, 0.045));
  }
  if (stress <= 0) return Math.min(baseMult, maxMult);
  return Math.min(baseMult * (1 + stress), maxMult);
}

export function applyRetailSpreadToRow(
  row: PricingRowLike,
  engine: EngineBuySellPartial | null,
  symbol: string,
  movement?: RetailMovementContext,
): PricingRowLike {
  let eBuy = engine?.buy != null ? Number(engine.buy) : 0;
  let eSell = engine?.sell != null ? Number(engine.sell) : 0;
  if (eBuy > 0 && eSell > 0 && eBuy < eSell) {
    const t = eBuy;
    eBuy = eSell;
    eSell = t;
  }

  const fx0 = ngnPerUsdFromPricingRow(row);
  let baseRow: PricingRowLike = { ...row };
  const rNgn = Number(baseRow.price_ngn);
  const rUsd = Number(baseRow.price_usd);
  if ((!Number.isFinite(rNgn) || rNgn <= 0) && Number.isFinite(rUsd) && rUsd > 0 && fx0 > 0) {
    baseRow = {
      ...baseRow,
      price_ngn: Math.round(rUsd * fx0 * 100) / 100,
      ngn_per_usd: baseRow.ngn_per_usd ?? fx0,
    };
  }
  const ngnPerUsd = ngnPerUsdFromPricingRow(baseRow);

  if (eBuy > 0 && eSell > 0 && eBuy >= eSell) {
    return {
      ...baseRow,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: eBuy,
      bid: eSell,
      ask: eBuy,
      price_usd: eBuy > 0 ? eBuy / ngnPerUsd : baseRow.price_usd,
    };
  }

  const spotMid = Number(baseRow.price_ngn);
  const ch24 = row.change_24h_pct != null && Number.isFinite(Number(row.change_24h_pct)) ? Number(row.change_24h_pct) : null;

  function retailMult(): number {
    const base = markupMultiplierFromEngine(symbol, engine);
    if (!Number.isFinite(spotMid) || spotMid <= 0) return base;
    const hasPrev = movement?.prevSpotMidNgn != null && movement.prevSpotMidNgn > 0;
    const hasCh = ch24 != null && Number.isFinite(ch24);
    if (!hasPrev && !hasCh) return base;
    return volatilityAdjustedMarkupMultiplier(symbol, base, spotMid, movement, ch24);
  }

  const mult = retailMult();

  if (eBuy > 0) {
    const sell = Math.max(eBuy / mult, 0);
    return {
      ...baseRow,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: eBuy,
      bid: sell,
      ask: eBuy,
      price_usd: eBuy > 0 ? eBuy / ngnPerUsd : baseRow.price_usd,
    };
  }
  if (eSell > 0) {
    const buy = eSell * mult;
    return {
      ...baseRow,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: buy,
      bid: eSell,
      ask: buy,
      price_usd: buy > 0 ? buy / ngnPerUsd : baseRow.price_usd,
    };
  }

  const mid = spotMid;
  let bid = baseRow.bid != null ? Number(baseRow.bid) : 0;
  let ask = baseRow.ask != null ? Number(baseRow.ask) : 0;
  if (!Number.isFinite(mid) || mid <= 0) return { ...baseRow, crypto_symbol: row.crypto_symbol || symbol };

  if (bid > 0 && ask > 0 && ask > bid && (ask - bid) / ask > 0.0005) {
    return {
      ...baseRow,
      crypto_symbol: row.crypto_symbol || symbol,
      price_ngn: ask,
      bid,
      ask,
      price_usd: ask > 0 ? ask / ngnPerUsd : baseRow.price_usd,
    };
  }

  const sellAnchor = bid > 0 && bid <= mid ? bid : mid;
  const buyNgn = sellAnchor * mult;
  return {
    ...baseRow,
    crypto_symbol: row.crypto_symbol || symbol,
    bid: sellAnchor,
    ask: buyNgn,
    price_ngn: buyNgn,
    price_usd: buyNgn > 0 ? buyNgn / ngnPerUsd : baseRow.price_usd,
  };
}
