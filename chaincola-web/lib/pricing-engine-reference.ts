/**
 * Reference NGN rates for admin pricing UI and sanity checks.
 * Must stay aligned with `instant-buy-crypto` STATIC_BUY_RATES_NGN / MIN_SANE_BUY_RATE_NGN
 * so miskeyed overrides (e.g. BTC priced like USDT) are caught early.
 */

import { retailMarkupMultiplier } from './retail-pricing';

function refRow(symbol: string, name: string, buyNgn: number, unitHint: string): AssetPricingReference {
  const sellNgn = Math.round(buyNgn / retailMarkupMultiplier(symbol));
  return { symbol, name, buyNgn, sellNgn, unitHint };
}

export interface AssetPricingReference {
  symbol: string;
  name: string;
  /** Suggested ₦ charged per 1 full unit when user buys (instant buy / quotes). */
  buyNgn: number;
  /** Suggested ₦ paid per 1 full unit when user sells (should be ≤ buy). */
  sellNgn: number;
  /** Human hint for placeholders and docs. */
  unitHint: string;
}

/** Buy ≈ holdings/buy-quote; sell from buy ÷ retailer spread (volatile ~5.2%, stablecoins ~0.3%). */
export const PRICING_ASSET_REFERENCE: AssetPricingReference[] = [
  refRow(
    'BTC',
    'Bitcoin',
    70_000_000,
    'Per 1 BTC — tens of millions of ₦ (not thousands). Recommended sell spread vs buy follows Busha-style retail.',
  ),
  refRow('ETH', 'Ethereum', 4_000_000, 'Per 1 ETH — millions of ₦.'),
  refRow('USDT', 'Tether', 1_650, 'Per 1 USDT (~₦ / USD peg); tight bid/ask.'),
  refRow('USDC', 'USD Coin', 1_650, 'Per 1 USDC (~₦ / USD peg); tight bid/ask.'),
  refRow('XRP', 'Ripple', 1_000, 'Per 1 XRP.'),
  refRow('SOL', 'Solana', 250_000, 'Per 1 SOL — hundreds of thousands of ₦.'),
  refRow('TRX', 'Tron', 250, 'Per 1 TRX.'),
];

/** Minimum plausible buy ₦ per 1 unit — below this, admin Save is rejected (same idea as instant-buy sanity floors). */
export const MIN_SANE_BUY_NGN: Record<string, number> = {
  BTC: 5_000_000,
  ETH: 200_000,
  USDT: 500,
  USDC: 500,
  XRP: 20,
  SOL: 5_000,
  TRX: 50,
};

const refBySymbol: Record<string, AssetPricingReference> = Object.fromEntries(
  PRICING_ASSET_REFERENCE.map((r) => [r.symbol, r]),
);

export function getPricingReference(symbol: string): AssetPricingReference | undefined {
  return refBySymbol[symbol.toUpperCase()];
}

/** Returns null if valid; otherwise English error message. */
export function validatePricingRates(
  asset: string,
  buy: number | null | undefined,
  sell: number | null | undefined,
): string | null {
  const upper = asset.toUpperCase();

  if (buy != null && buy > 0) {
    const min = MIN_SANE_BUY_NGN[upper];
    if (min != null && buy < min) {
      const hint = refBySymbol[upper];
      return (
        `${upper} buy price ₦${buy.toLocaleString('en-NG')} is unrealistically low (min sanity check ₦${min.toLocaleString('en-NG')}). ` +
        (hint ? `Example: ₦${hint.buyNgn.toLocaleString('en-NG')} per 1 ${upper}.` : 'Check decimals — price is per 1 full coin.')
      );
    }
  }

  if (sell != null && sell > 0 && buy != null && buy > 0 && sell > buy + 1e-6) {
    return `Sell price (₦${sell}) should not be greater than buy price (₦${buy}) for ${upper}.`;
  }

  return null;
}

/**
 * Effective buy price as the app resolves it today: admin override wins, else frozen snapshot if frozen flag + value, else null (server/static).
 */
export function resolveEffectiveBuyNgn(config: {
  override_buy_price_ngn?: number | null;
  price_frozen: boolean;
  frozen_buy_price_ngn?: number | null;
}): number | null {
  if (config.override_buy_price_ngn != null && config.override_buy_price_ngn > 0) {
    return Number(config.override_buy_price_ngn);
  }
  if (config.price_frozen && config.frozen_buy_price_ngn != null && config.frozen_buy_price_ngn > 0) {
    return Number(config.frozen_buy_price_ngn);
  }
  return null;
}

export function resolveEffectiveSellNgn(config: {
  override_sell_price_ngn?: number | null;
  price_frozen: boolean;
  frozen_sell_price_ngn?: number | null;
}): number | null {
  if (config.override_sell_price_ngn != null && config.override_sell_price_ngn > 0) {
    return Number(config.override_sell_price_ngn);
  }
  if (config.price_frozen && config.frozen_sell_price_ngn != null && config.frozen_sell_price_ngn > 0) {
    return Number(config.frozen_sell_price_ngn);
  }
  return null;
}
