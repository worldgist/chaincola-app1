'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  appSettingsApi,
  parseAdminCryptoPriceOverrides,
  type AdminCryptoPriceOverrideRow,
} from '@/lib/admin-api';
import { ADMIN_WALLET_CRYPTO_ASSETS, type AdminWalletCryptoSymbol } from '@/lib/admin-wallet-crypto-assets';
import { getLunoNgnOrderBookQuotes, getLunoPrices, type CryptoPrice } from '@/lib/crypto-price-service';

function formatNgn(n: number, maxFraction = 2) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₦${n.toLocaleString('en-US', {
    minimumFractionDigits: maxFraction,
    maximumFractionDigits: maxFraction,
  })}`;
}

function formatUsd(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function decimalsForSymbol(symbol: string) {
  if (symbol === 'BTC') return 8;
  if (symbol === 'ETH' || symbol === 'SOL') return 6;
  return 2;
}

export default function CryptoRatesPanel() {
  const [marketPrices, setMarketPrices] = useState<Record<string, CryptoPrice>>({});
  const [priceOverrides, setPriceOverrides] = useState<
    Partial<Record<string, AdminCryptoPriceOverrideRow>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceModal, setPriceModal] = useState<null | { symbol: string; buy: string; sell: string }>(null);
  const [savingPricesFor, setSavingPricesFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPriceNote(null);
    setPriceOverrides({});
    try {
      const symbols = ADMIN_WALLET_CRYPTO_ASSETS.map((a) => a.symbol);
      const [lunoRes, settingsRes] = await Promise.all([
        getLunoNgnOrderBookQuotes([...symbols]),
        appSettingsApi.getAppSettings(),
      ]);

      let nextPrices: Record<string, CryptoPrice> = { ...(lunoRes.prices ?? {}) };
      const partialMsg =
        lunoRes.quoteErrors && Object.keys(lunoRes.quoteErrors).length > 0
          ? `Missing quotes: ${Object.entries(lunoRes.quoteErrors)
              .map(([k, v]) => `${k} (${v})`)
              .join(', ')}.`
          : '';

      if (Object.keys(nextPrices).length === 0) {
        const fb = await getLunoPrices([...symbols], { retailOverlay: false });
        if (fb.prices && Object.keys(fb.prices).length > 0) {
          nextPrices = fb.prices;
          setPriceNote(
            (lunoRes.error ? `${lunoRes.error} ` : '') +
              'Fell back to Alchemy spot via get-token-prices.',
          );
        } else {
          setPriceNote(lunoRes.error || (fb.error != null ? String(fb.error) : null));
        }
      } else if (partialMsg) {
        setPriceNote(partialMsg);
      }

      setMarketPrices(nextPrices);

      if (settingsRes.success && settingsRes.data) {
        setPriceOverrides(parseAdminCryptoPriceOverrides(settingsRes.data.additional_settings ?? null));
      } else {
        setError(settingsRes.error || 'Failed to load app settings for overrides');
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return ADMIN_WALLET_CRYPTO_ASSETS.map((config) => {
      const quote = marketPrices[config.symbol] || marketPrices[config.symbol.toUpperCase()];
      const priceUsd = quote?.price_usd ?? 0;
      const rawBid = quote?.bid != null ? Number(quote.bid) : 0;
      const rawAsk = quote?.ask != null ? Number(quote.ask) : 0;
      const midFromQuote = quote?.price_ngn != null ? Number(quote.price_ngn) : 0;
      const sellNgn = rawBid > 0 ? rawBid : midFromQuote;
      const buyNgn = rawAsk > 0 ? rawAsk : midFromQuote;
      const midNgn =
        sellNgn > 0 && buyNgn > 0 ? (sellNgn + buyNgn) / 2 : midFromQuote || sellNgn || buyNgn;
      const ovr = priceOverrides[config.symbol];
      const hasListOverride = !!(
        ovr &&
        Number.isFinite(ovr.buy_ngn) &&
        Number.isFinite(ovr.sell_ngn) &&
        ovr.buy_ngn > 0 &&
        ovr.sell_ngn > 0
      );
      const listBuyNgn = hasListOverride ? ovr!.buy_ngn : buyNgn;
      const listSellNgn = hasListOverride ? ovr!.sell_ngn : sellNgn;
      const dec = decimalsForSymbol(config.symbol);
      const frac = config.symbol === 'BTC' || config.symbol === 'ETH' ? 2 : 4;
      return {
        ...config,
        priceUsd,
        marketBuyNgn: buyNgn,
        marketSellNgn: sellNgn,
        midNgn,
        listBuyNgn,
        listSellNgn,
        hasListPriceOverride: hasListOverride,
        dec,
        frac,
      };
    });
  }, [marketPrices, priceOverrides]);

  const openPriceModal = (symbol: string, listBuy: number, listSell: number) => {
    setPriceModal({
      symbol,
      buy: listBuy > 0 ? String(listBuy) : '',
      sell: listSell > 0 ? String(listSell) : '',
    });
  };

  const savePriceModal = async () => {
    if (!priceModal) return;
    const sym = priceModal.symbol.toUpperCase() as AdminWalletCryptoSymbol;
    const buy = Number.parseFloat(priceModal.buy.replace(/,/g, '').trim());
    const sell = Number.parseFloat(priceModal.sell.replace(/,/g, '').trim());
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      alert('Enter positive numbers for buy and sell (NGN per 1 coin).');
      return;
    }
    if (buy < sell) {
      alert('Buy (NGN) should usually be ≥ sell (NGN) — buy is the ask, sell is the bid.');
    }
    setSavingPricesFor(sym);
    try {
      const res = await appSettingsApi.mergeAdminCryptoPriceOverrides({
        [sym]: { buy_ngn: buy, sell_ngn: sell },
      });
      if (res.success && res.data?.overrides) {
        setPriceOverrides(res.data.overrides);
        setPriceModal(null);
      } else {
        alert(res.error || 'Failed to save list prices');
      }
    } catch (e) {
      alert((e as Error)?.message || 'Failed to save');
    } finally {
      setSavingPricesFor(null);
    }
  };

  const clearListPriceOverride = async (symbol: string) => {
    const sym = symbol.toUpperCase() as AdminWalletCryptoSymbol;
    setSavingPricesFor(sym);
    try {
      const res = await appSettingsApi.mergeAdminCryptoPriceOverrides({ [sym]: null });
      if (res.success && res.data?.overrides) {
        setPriceOverrides(res.data.overrides);
        setPriceModal(null);
      } else {
        alert(res.error || 'Failed to clear override');
      }
    } catch (e) {
      alert((e as Error)?.message || 'Failed to clear');
    } finally {
      setSavingPricesFor(null);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 text-[13px] leading-snug">
      {error && (
        <div className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</div>
      )}
      {priceNote && (
        <div className="shrink-0 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {priceNote}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-purple-100/80 bg-white shadow-sm overflow-hidden">
        <div className="shrink-0 p-2 border-b border-purple-100/60 bg-purple-50/40 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-900">Crypto rates</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Market: live Luno / Alchemy (read-only). <strong>List</strong> prices are saved in{' '}
              <code className="bg-gray-100 px-0.5 rounded">app_settings</code> and override displayed buy/sell where the
              app applies admin list pricing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 px-2 py-1 rounded text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Asset
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Spot (USD)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Market buy (₦)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Market sell (₦)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  List buy (₦)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  List sell (₦)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Edit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-gray-500 text-xs">
                    Loading…
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.symbol} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {typeof r.logo === 'string' && r.logo.startsWith('/') ? (
                          <Image
                            src={r.logo}
                            alt={r.name}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-full object-contain"
                          />
                        ) : (
                          <span className="text-base">{r.logo}</span>
                        )}
                        <div>
                          <div className="text-[11px] font-medium text-gray-900 leading-tight">{r.name}</div>
                          <div className="text-[10px] text-gray-500">{r.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-900">
                      {formatUsd(r.priceUsd)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-900">
                      {formatNgn(r.marketBuyNgn, r.frac)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-900">
                      {formatNgn(r.marketSellNgn, r.frac)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-900">
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{formatNgn(r.listBuyNgn, r.frac)}</span>
                        {r.hasListPriceOverride && (
                          <span className="text-[9px] font-medium text-purple-700">Override</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-900">
                      {formatNgn(r.listSellNgn, r.frac)}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 px-1.5 py-0.5 rounded border border-purple-200 hover:bg-purple-50"
                        onClick={() => openPriceModal(r.symbol, r.listBuyNgn, r.listSellNgn)}
                        disabled={savingPricesFor === r.symbol}
                      >
                        {savingPricesFor === r.symbol ? '…' : 'Edit'}
                      </button>
                      {r.hasListPriceOverride && (
                        <button
                          type="button"
                          className="text-[10px] text-amber-800 hover:underline"
                          onClick={() => void clearListPriceOverride(r.symbol)}
                          disabled={savingPricesFor === r.symbol}
                        >
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {priceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crypto-rates-modal-title"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3 border border-gray-200">
            <h4 id="crypto-rates-modal-title" className="text-sm font-semibold text-gray-900">
              Edit list rates (NGN) — {priceModal.symbol}
            </h4>
            <p className="text-xs text-gray-500">
              NGN per 1 {priceModal.symbol}. Buy (ask) should be ≥ sell (bid). Saving updates{' '}
              <code className="bg-gray-100 px-0.5 rounded text-[10px]">admin_crypto_price_overrides_ngn</code>. Use
              Clear on the table to revert this asset to live market list prices.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Buy (NGN)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                  value={priceModal.buy}
                  onChange={(e) => setPriceModal((m) => (m ? { ...m, buy: e.target.value } : m))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Sell (NGN)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                  value={priceModal.sell}
                  onChange={(e) => setPriceModal((m) => (m ? { ...m, sell: e.target.value } : m))}
                />
              </label>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => setPriceModal(null)}
                disabled={!!savingPricesFor}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm border border-amber-200 text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                onClick={() => void clearListPriceOverride(priceModal.symbol)}
                disabled={!!savingPricesFor}
              >
                Use live market
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
                onClick={() => void savePriceModal()}
                disabled={!!savingPricesFor}
              >
                {savingPricesFor ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
