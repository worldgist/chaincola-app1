'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getMarketSpotPrices, type CryptoPrice } from '@/lib/crypto-price-service';
import {
  getAllPricingEngineConfigs,
  setPricingEngineConfig,
  freezePricingGlobally,
  type PricingEngineConfig,
  type SetPricingEngineConfigRequest,
} from '@/lib/admin-pricing-engine-service';
import {
  PRICING_ASSET_REFERENCE,
  getPricingReference,
  validatePricingRates,
  resolveEffectiveBuyNgn,
  resolveEffectiveSellNgn,
} from '@/lib/pricing-engine-reference';
import { appSettingsApi, type AppSettings } from '@/lib/admin-api';

interface ConfigFormData {
  asset: string;
  buy_rate_ngn: string;
  sell_rate_ngn: string;
  /** Percent (e.g. 5.2) → stored as fraction in DB */
  retail_markup_percent: string;
  /** Reserved market skew vs mid, percent */
  market_buy_spread_percent: string;
  market_sell_spread_percent: string;
  trading_enabled: boolean;
  price_frozen: boolean;
  notes: string;
}

const STABLE_ASSETS = new Set(['USDT', 'USDC']);

function defaultRetailFraction(symbol: string): number {
  return STABLE_ASSETS.has(symbol.toUpperCase()) ? 0.003 : 0.052;
}

function fractionToPercentField(fraction: number | undefined | null, symbol: string): string {
  const f = fraction != null && Number.isFinite(fraction) ? fraction : defaultRetailFraction(symbol);
  const pct = f * 100;
  return pct < 0.01 ? pct.toFixed(4) : pct.toFixed(2);
}

const ASSET_OPTIONS = PRICING_ASSET_REFERENCE.map((r) => ({ symbol: r.symbol, name: r.name }));

/** Symbols supported by `get-luno-prices` — same set as pricing engine assets */
const MARKET_SYMBOLS = PRICING_ASSET_REFERENCE.map((r) => r.symbol);

export default function PricingEnginePage() {
  const [configs, setConfigs] = useState<PricingEngineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<PricingEngineConfig | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [globalFreezeLoading, setGlobalFreezeLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [marketPrices, setMarketPrices] = useState<Record<string, CryptoPrice>>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketFetchedAt, setMarketFetchedAt] = useState<string | null>(null);
  const [feeSettings, setFeeSettings] = useState<Pick<AppSettings, 'transaction_fee'> | null>(null);
  const [formData, setFormData] = useState<ConfigFormData>({
    asset: '',
    buy_rate_ngn: '',
    sell_rate_ngn: '',
    retail_markup_percent: '',
    market_buy_spread_percent: '',
    market_sell_spread_percent: '',
    trading_enabled: true,
    price_frozen: false,
    notes: '',
  });

  const fetchMarketPrices = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const { prices, error } = await getMarketSpotPrices(MARKET_SYMBOLS, { timeoutMs: 25_000 });
      if (error) {
        setMarketError(error);
        setMarketPrices(prices);
      } else {
        setMarketPrices(prices);
      }
      setMarketFetchedAt(new Date().toISOString());
    } catch (e: any) {
      setMarketError(e?.message || 'Failed to load market prices');
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    fetchMarketPrices();
  }, [fetchMarketPrices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await appSettingsApi.getAppSettings();
      if (!cancelled && res.success && res.data) {
        setFeeSettings({ transaction_fee: res.data.transaction_fee });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedConfigs = await getAllPricingEngineConfigs();
      setConfigs(fetchedConfigs);
    } catch (err: any) {
      console.error('Error fetching configs:', err);
      setError(err.message || 'Failed to fetch pricing engine configs');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ConfigFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = (config: PricingEngineConfig) => {
    setEditingConfig(config);
    setFormData({
      asset: config.asset,
      buy_rate_ngn: config.override_buy_price_ngn != null ? config.override_buy_price_ngn.toString() : '',
      sell_rate_ngn: config.override_sell_price_ngn != null ? config.override_sell_price_ngn.toString() : '',
      retail_markup_percent: fractionToPercentField(config.retail_markup_fraction, config.asset),
      market_buy_spread_percent: (config.buy_spread_percentage * 100).toFixed(2),
      market_sell_spread_percent: (config.sell_spread_percentage * 100).toFixed(2),
      trading_enabled: config.trading_enabled,
      price_frozen: config.price_frozen,
      notes: config.notes || '',
    });
    setShowAddForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditingConfig(null);
    setShowAddForm(false);
    setFormData({
      asset: '',
      buy_rate_ngn: '',
      sell_rate_ngn: '',
      retail_markup_percent: '',
      market_buy_spread_percent: '',
      market_sell_spread_percent: '',
      trading_enabled: true,
      price_frozen: false,
      notes: '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.asset) {
        setError('Please select an asset');
        setSaving(false);
        return;
      }

      const buyRateRaw = formData.buy_rate_ngn.trim();
      const sellRateRaw = formData.sell_rate_ngn.trim();
      const buyRate = buyRateRaw ? parseFloat(buyRateRaw) : null;
      const sellRate = sellRateRaw ? parseFloat(sellRateRaw) : null;
      if (buyRateRaw) {
        const b = parseFloat(buyRateRaw);
        if (isNaN(b) || b <= 0) {
          setError('Buy rate must be a valid positive number');
          setSaving(false);
          return;
        }
      }
      if (sellRateRaw) {
        const s = parseFloat(sellRateRaw);
        if (isNaN(s) || s <= 0) {
          setError('Sell rate must be a valid positive number');
          setSaving(false);
          return;
        }
      }

      const validationError = validatePricingRates(formData.asset, buyRate, sellRate);
      if (validationError) {
        setError(validationError);
        setSaving(false);
        return;
      }

      const retailPctRaw = formData.retail_markup_percent.trim();
      let retailFrac: number | undefined;
      if (retailPctRaw) {
        const p = parseFloat(retailPctRaw);
        if (isNaN(p) || p < 0 || p > 50) {
          setError('Retail margin % must be between 0 and 50 (buy vs sell wedge for in-app quotes).');
          setSaving(false);
          return;
        }
        retailFrac = p / 100;
      }

      const buySkewRaw = formData.market_buy_spread_percent.trim();
      let buySkewFrac: number | undefined;
      if (buySkewRaw) {
        const p = parseFloat(buySkewRaw);
        if (isNaN(p) || p < 0 || p > 100) {
          setError('Market buy skew % must be between 0 and 100.');
          setSaving(false);
          return;
        }
        buySkewFrac = p / 100;
      }

      const sellSkewRaw = formData.market_sell_spread_percent.trim();
      let sellSkewFrac: number | undefined;
      if (sellSkewRaw) {
        const p = parseFloat(sellSkewRaw);
        if (isNaN(p) || p < 0 || p > 100) {
          setError('Market sell skew % must be between 0 and 100.');
          setSaving(false);
          return;
        }
        sellSkewFrac = p / 100;
      }

      const request: SetPricingEngineConfigRequest = {
        asset: formData.asset,
        override_buy_price_ngn: buyRate,
        override_sell_price_ngn: sellRate,
        trading_enabled: formData.trading_enabled,
        price_frozen: formData.price_frozen,
        notes: formData.notes || undefined,
      };
      if (retailFrac !== undefined) request.retail_markup_fraction = retailFrac;
      if (buySkewFrac !== undefined) request.buy_spread_percentage = buySkewFrac;
      if (sellSkewFrac !== undefined) request.sell_spread_percentage = sellSkewFrac;

      const result = await setPricingEngineConfig(request);

      if (result.success) {
        setSuccess(editingConfig ? 'Configuration updated successfully' : 'Configuration created successfully');
        setEditingConfig(null);
        setShowAddForm(false);
        setFormData({
          asset: '',
          buy_rate_ngn: '',
          sell_rate_ngn: '',
          retail_markup_percent: '',
          market_buy_spread_percent: '',
          market_sell_spread_percent: '',
          trading_enabled: true,
          price_frozen: false,
          notes: '',
        });
        await fetchConfigs();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedRecommendedRates = async () => {
    if (
      !confirm(
        'This will set Buy/Sell NGN prices for BTC, ETH, USDT, USDC, XRP, SOL, and TRX to the built-in recommended values (~market placeholders). Existing overrides for those assets will be replaced. Continue?',
      )
    ) {
      return;
    }
    setSeedLoading(true);
    setError(null);
    setSuccess(null);
    try {
      for (const row of PRICING_ASSET_REFERENCE) {
        const err = validatePricingRates(row.symbol, row.buyNgn, row.sellNgn);
        if (err) {
          setError(err);
          setSeedLoading(false);
          return;
        }
        const seedFrac = Math.min(0.5, Math.max(0, row.buyNgn / row.sellNgn - 1));
        const result = await setPricingEngineConfig({
          asset: row.symbol,
          override_buy_price_ngn: row.buyNgn,
          override_sell_price_ngn: row.sellNgn,
          retail_markup_fraction: seedFrac,
          trading_enabled: true,
          price_frozen: false,
          notes: 'Recommended reference rates (admin seed)',
        });
        if (!result.success) {
          setError(`${row.symbol}: ${result.error || 'save failed'}`);
          setSeedLoading(false);
          return;
        }
      }
      setSuccess('All assets updated with recommended NGN buy/sell rates.');
      await fetchConfigs();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to seed rates');
    } finally {
      setSeedLoading(false);
    }
  };

  const handleGlobalFreeze = async (freeze: boolean) => {
    if (!confirm(`Are you sure you want to ${freeze ? 'freeze' : 'unfreeze'} prices globally for all assets?`)) {
      return;
    }

    setGlobalFreezeLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await freezePricingGlobally(freeze);
      
      if (result.success) {
        setSuccess(`Prices ${freeze ? 'frozen' : 'unfrozen'} globally for ${result.updatedCount || 0} assets`);
        await fetchConfigs();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || `Failed to ${freeze ? 'freeze' : 'unfreeze'} prices`);
      }
    } catch (err: any) {
      console.error('Error freezing/unfreezing prices:', err);
      setError(err.message || `Failed to ${freeze ? 'freeze' : 'unfreeze'} prices`);
    } finally {
      setGlobalFreezeLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatUsd = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatCompactNgn = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 10_000) return `₦${(value / 1_000).toFixed(1)}k`;
    return formatCurrency(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isGlobalFreezeActive = configs.some(c => c.price_frozen);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pricing Engine Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Set <strong className="font-medium text-gray-700">NGN per 1 full coin</strong> for instant buy/sell —
                totals must match asset scale (e.g. BTC is millions of ₦, not ~1 500).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/admin/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSeedRecommendedRates}
                disabled={seedLoading || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {seedLoading ? 'Applying…' : 'Apply recommended rates (all assets)'}
              </button>
              {isGlobalFreezeActive ? (
                <button
                  onClick={() => handleGlobalFreeze(false)}
                  disabled={globalFreezeLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {globalFreezeLoading ? 'Unfreezing...' : 'Unfreeze Prices Globally'}
                </button>
              ) : (
                <button
                  onClick={() => handleGlobalFreeze(true)}
                  disabled={globalFreezeLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {globalFreezeLoading ? 'Freezing...' : 'Freeze Prices Globally'}
                </button>
              )}
              {!showAddForm && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingConfig(null);
                    setFormData({
                      asset: '',
                      buy_rate_ngn: '',
                      sell_rate_ngn: '',
                      retail_markup_percent: '',
                      market_buy_spread_percent: '',
                      market_sell_spread_percent: '',
                      trading_enabled: true,
                      price_frozen: false,
                      notes: '',
                    });
                    setShowAddForm(true);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                >
                  Add New Configuration
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
            {success}
          </div>
        )}

        {feeSettings && (
          <div className="mb-8 bg-slate-50 border border-slate-200 rounded-lg shadow-sm p-5 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-sm font-semibold text-slate-900">Platform transaction fee</h2>
              <p className="mt-1 text-sm text-slate-600">
                Global flat fee (currently {feeSettings.transaction_fee}) is separate from per-asset NGN rates and
                retail margin. Change it under app settings.
              </p>
            </div>
            <Link
              href="/admin/settings"
              className="shrink-0 text-sm font-medium text-purple-700 hover:text-purple-900"
            >
              Open Settings →
            </Link>
          </div>
        )}

        <div className="mb-8 bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">How pricing works</h2>
          <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
            <li>
              <strong className="text-gray-800">Unit</strong> — All NGN amounts are per <strong>1 full coin</strong>{' '}
              (1 BTC, 1 ETH, not “per kobo”). Wrong scale breaks instant buy.
            </li>
            <li>
              <strong className="text-gray-800">Buy / sell overrides</strong> — Instant buy and wallet display use the{' '}
              <em>buy</em> side; sells use the <em>sell</em> side. Buy should be higher than sell.
            </li>
            <li>
              <strong className="text-gray-800">Retail margin %</strong> — When only one override is set, or when merging
              live bids/asks, we apply this wedge (~5.2% majors, ~0.3% USDT/USDC by default). You can tune it per asset
              here; it is stored as a fraction on the row.
            </li>
            <li>
              <strong className="text-gray-800">Market skew %</strong> — Reserved for mid-based quoting (fraction of price).
              Stored for future pipelines; overrides still win for instant flows today.
            </li>
            <li>
              <strong className="text-gray-800">Resolution order</strong> — Override prices → frozen snapshot (if freeze
              on) → server defaults / seed. Inventory in <code className="text-xs bg-gray-100 px-1 rounded">system_wallets</code>{' '}
              still gates instant buy.
            </li>
          </ul>
        </div>

        <div className="mb-8 bg-white border border-emerald-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Live market reference</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Spot-style NGN per 1 coin from the price service (not your admin overrides).
                {marketFetchedAt && (
                  <span className="ml-2 text-gray-500">
                    Updated {formatDate(marketFetchedAt)}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchMarketPrices()}
              disabled={marketLoading}
              className="px-4 py-2 text-sm font-medium text-emerald-800 bg-white border border-emerald-300 rounded-md hover:bg-emerald-50 disabled:opacity-50"
            >
              {marketLoading ? 'Refreshing…' : 'Refresh market'}
            </button>
          </div>
          {marketError && (
            <div className="mx-6 mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              Partial or failed fetch: {marketError}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mid ₦</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bid ₦</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ask ₦</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spot USD</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quote time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin buy vs ask</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {MARKET_SYMBOLS.map((sym) => {
                  const row = marketPrices[sym];
                  const cfg = configs.find((c) => c.asset === sym);
                  const adminBuy = cfg ? resolveEffectiveBuyNgn(cfg) : null;
                  const bid = row?.bid;
                  const ask = row?.ask;
                  const mid = row?.price_ngn;
                  let versus = '—';
                  if (adminBuy != null && ask != null && ask > 0) {
                    const pct = ((adminBuy - ask) / ask) * 100;
                    versus =
                      pct === 0
                        ? 'Matches ask'
                        : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}% vs ask`;
                  } else if (adminBuy != null && mid != null && mid > 0) {
                    const pct = ((adminBuy - mid) / mid) * 100;
                    versus = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}% vs mid`;
                  } else if (adminBuy != null && !row) {
                    versus = 'No market row';
                  }
                  return (
                    <tr key={sym}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{sym}</td>
                      <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap" title={mid ? String(mid) : ''}>
                        {mid != null && mid > 0 ? formatCompactNgn(mid) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" title={bid != null ? String(bid) : ''}>
                        {bid != null && bid > 0 ? formatCompactNgn(bid) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" title={ask != null ? String(ask) : ''}>
                        {ask != null && ask > 0 ? formatCompactNgn(ask) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {row?.price_usd != null && row.price_usd > 0 ? formatUsd(row.price_usd) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap max-w-[9rem]">
                        {row?.last_updated ? formatDate(row.last_updated) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" title="Effective admin buy vs market ask (or mid if no ask)">
                        {versus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Freeze Warning */}
        {isGlobalFreezeActive && (
          <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-md">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">Prices are currently frozen globally. All assets will use frozen prices instead of live market data.</span>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingConfig ? 'Edit Configuration' : 'Add New Configuration'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.asset}
                    onChange={(e) => handleInputChange('asset', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                    disabled={!!editingConfig}
                  >
                    <option value="">Select asset</option>
                    {ASSET_OPTIONS.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name} ({asset.symbol})
                      </option>
                    ))}
                  </select>
                  {formData.asset && getPricingReference(formData.asset) && (
                    <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                      {getPricingReference(formData.asset)!.unitHint}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trading Status
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.trading_enabled}
                      onChange={(e) => handleInputChange('trading_enabled', e.target.checked)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {formData.trading_enabled ? 'Trading Enabled' : 'Trading Disabled'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Buy price (₦ per 1 {formData.asset || 'coin'})
                    </label>
                    {formData.asset && getPricingReference(formData.asset) && (
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                        onClick={() => {
                          const r = getPricingReference(formData.asset);
                          if (!r) return;
                          const frac = Math.min(0.5, Math.max(0, r.buyNgn / r.sellNgn - 1));
                          setFormData((prev) => ({
                            ...prev,
                            buy_rate_ngn: String(r.buyNgn),
                            sell_rate_ngn: String(r.sellNgn),
                            retail_markup_percent: fractionToPercentField(frac, formData.asset),
                          }));
                        }}
                      >
                        Fill suggested
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.buy_rate_ngn}
                    onChange={(e) => handleInputChange('buy_rate_ngn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={
                      formData.asset && getPricingReference(formData.asset)
                        ? `e.g. ${getPricingReference(formData.asset)!.buyNgn.toLocaleString('en-NG')}`
                        : 'Select asset first'
                    }
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Override used by instant buy. Leave empty only if you rely on freeze snapshot or server defaults.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sell price (₦ per 1 {formData.asset || 'coin'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.sell_rate_ngn}
                    onChange={(e) => handleInputChange('sell_rate_ngn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={
                      formData.asset && getPricingReference(formData.asset)
                        ? `e.g. ${getPricingReference(formData.asset)!.sellNgn.toLocaleString('en-NG')}`
                        : 'Select asset first'
                    }
                  />
                  <p className="mt-1 text-xs text-gray-500">Used when users sell; usually slightly below buy.</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/80 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Spread and margin</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Retail margin (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="50"
                      value={formData.retail_markup_percent}
                      onChange={(e) => handleInputChange('retail_markup_percent', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={
                        formData.asset
                          ? `default ~${(defaultRetailFraction(formData.asset) * 100).toFixed(2)}%`
                          : 'Select asset'
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Buy vs sell gap when one side is inferred (empty = DB default on new row; unchanged field omitted on save).
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Market buy skew (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.market_buy_spread_percent}
                      onChange={(e) => handleInputChange('market_buy_spread_percent', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g. 1 = 1%"
                    />
                    <p className="mt-1 text-xs text-gray-500">Stored as decimal; reserved for mid-based routing.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Market sell skew (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.market_sell_spread_percent}
                      onChange={(e) => handleInputChange('market_sell_spread_percent', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g. 1 = 1%"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={() => {
                      const buy = parseFloat(formData.buy_rate_ngn);
                      if (!formData.buy_rate_ngn.trim() || isNaN(buy) || buy <= 0) {
                        setError('Set a valid buy price first.');
                        return;
                      }
                      const sym = formData.asset || 'BTC';
                      const raw = formData.retail_markup_percent.trim();
                      const pct = raw ? parseFloat(raw) : defaultRetailFraction(sym) * 100;
                      if (isNaN(pct) || pct < 0 || pct > 50) {
                        setError('Retail margin % must be between 0 and 50.');
                        return;
                      }
                      const sell = buy / (1 + pct / 100);
                      setError(null);
                      setFormData((prev) => ({ ...prev, sell_rate_ngn: sell.toFixed(4) }));
                    }}
                  >
                    Derive sell from buy + margin
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={() => {
                      const sell = parseFloat(formData.sell_rate_ngn);
                      if (!formData.sell_rate_ngn.trim() || isNaN(sell) || sell <= 0) {
                        setError('Set a valid sell price first.');
                        return;
                      }
                      const sym = formData.asset || 'BTC';
                      const raw = formData.retail_markup_percent.trim();
                      const pct = raw ? parseFloat(raw) : defaultRetailFraction(sym) * 100;
                      if (isNaN(pct) || pct < 0 || pct > 50) {
                        setError('Retail margin % must be between 0 and 50.');
                        return;
                      }
                      const buy = sell * (1 + pct / 100);
                      setError(null);
                      setFormData((prev) => ({ ...prev, buy_rate_ngn: buy.toFixed(4) }));
                    }}
                  >
                    Derive buy from sell + margin
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Freeze Price for This Asset
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.price_frozen}
                      onChange={(e) => handleInputChange('price_frozen', e.target.checked)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {formData.price_frozen ? 'Price Frozen' : 'Price Active'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    When frozen, instant buy prefers <strong>frozen_*</strong> snapshot over server defaults if no
                    override is set. Set overrides first, then enable freeze to lock them in.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Add any notes about this configuration..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingConfig ? 'Update Configuration' : 'Create Configuration'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Configurations Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Asset Configurations</h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading configurations...</p>
            </div>
          ) : configs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">No configurations found. Click "Add New Configuration" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Asset
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Effective buy ₦
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Effective sell ₦
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Retail margin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Market skew
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stored override
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Frozen snapshot
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trading
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {configs.map((config) => (
                    <tr key={config.id} className={!config.trading_enabled ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{config.asset}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {resolveEffectiveBuyNgn(config) != null ? (
                            formatCurrency(resolveEffectiveBuyNgn(config)!)
                          ) : (
                            <span className="text-gray-400 italic" title="No override/frozen snapshot — instant buy uses built-in static default">
                              Built-in default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {resolveEffectiveSellNgn(config) != null ? (
                            formatCurrency(resolveEffectiveSellNgn(config)!)
                          ) : (
                            <span className="text-gray-400 italic" title="No override/frozen snapshot">
                              Built-in default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        {(
                          (config.retail_markup_fraction ?? defaultRetailFraction(config.asset)) * 100
                        ).toFixed(2)}
                        %
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <span title="Buy spread / sell spread vs mid (stored as fractions)">
                          {(config.buy_spread_percentage * 100).toFixed(2)}% /{' '}
                          {(config.sell_spread_percentage * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div>
                          Buy:{' '}
                          {config.override_buy_price_ngn != null ? (
                            formatCurrency(config.override_buy_price_ngn)
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5">
                          Sell:{' '}
                          {config.override_sell_price_ngn != null ? (
                            formatCurrency(config.override_sell_price_ngn)
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-[10rem]">
                        {config.price_frozen || config.frozen_buy_price_ngn || config.frozen_sell_price_ngn ? (
                          <div className="text-xs space-y-0.5">
                            <div>
                              Buy:{' '}
                              {config.frozen_buy_price_ngn != null
                                ? formatCurrency(config.frozen_buy_price_ngn)
                                : '—'}
                            </div>
                            <div>
                              Sell:{' '}
                              {config.frozen_sell_price_ngn != null
                                ? formatCurrency(config.frozen_sell_price_ngn)
                                : '—'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            config.trading_enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {config.trading_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            config.price_frozen
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {config.price_frozen ? 'Frozen' : 'Active'}
                        </span>
                        {config.frozen_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(config.frozen_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(config.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(config)}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
