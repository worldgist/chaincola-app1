'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  appSettingsApi,
  cryptoApi,
  cryptoAssetStatusToDisplay,
  normalizeCryptoAssetStatusMap,
  parseAdminCryptoPriceOverrides,
  type AdminCryptoPriceOverrideRow,
  type CryptoAssetRuntimeStatus,
  type CryptoOverview,
} from '@/lib/admin-api';
import {
  ADMIN_WALLET_CRYPTO_ASSETS,
  type AdminWalletCryptoSymbol,
} from '@/lib/admin-wallet-crypto-assets';
import {
  getLunoNgnOrderBookQuotes,
  getLunoPrices,
  type CryptoPrice,
} from '@/lib/crypto-price-service';
import { fetchAdminFlutterwaveBalance } from '@/lib/admin-flutterwave-balance';
import {
  formatSystemWalletAddressLines,
  systemTreasuryCryptoTotalQty,
  systemTreasuryNgnLedger,
  updateAdminSystemWalletAddresses,
  type SystemWalletRow,
} from '@/lib/admin-system-wallet';

type AllocKey = keyof NonNullable<CryptoOverview['user_allocated_balances']>;

function formatNgn(n: number, maxFraction = 2) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₦${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFraction,
  })}`;
}

function formatNgnNonNegative(n: number, maxFraction = 2) {
  if (!Number.isFinite(n) || n < 0) return '—';
  return `₦${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFraction,
  })}`;
}

function formatUsd(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function spreadCell(spreadNgn: number, midNgn: number, symbol: string) {
  const frac = symbol === 'BTC' || symbol === 'ETH' ? 2 : 4;
  if (!Number.isFinite(midNgn) || midNgn <= 0) {
    return <span className="text-gray-400">—</span>;
  }
  const adj = Number.isFinite(spreadNgn) ? Math.max(0, spreadNgn) : 0;
  const line = `₦${adj.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
  const bps = (adj / midNgn) * 10000;
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="font-mono text-[11px] text-gray-900">{line}</span>
      <span className="text-[9px] text-gray-500">{bps.toFixed(1)} bps</span>
    </div>
  );
}

function decimalsForSymbol(symbol: string) {
  if (symbol === 'BTC') return 8;
  if (symbol === 'ETH' || symbol === 'SOL') return 6;
  return 2;
}

type SystemAddressField = { column: keyof SystemWalletRow; label: string };

function getSystemAddressEditFields(symbol: string): SystemAddressField[] {
  const s = symbol.toUpperCase();
  switch (s) {
    case 'BTC':
      return [{ column: 'btc_main_address', label: 'Bitcoin main (on-chain receive)' }];
    case 'ETH':
      return [{ column: 'eth_main_address', label: 'Ethereum main (native ETH)' }];
    case 'SOL':
      return [{ column: 'sol_main_address', label: 'Solana main' }];
    case 'XRP':
      return [{ column: 'xrp_main_address', label: 'XRP main' }];
    case 'USDT':
      return [
        { column: 'usdt_eth_main_address', label: 'USDT — Ethereum (ERC-20)' },
        { column: 'usdt_tron_main_address', label: 'USDT — TRON (TRC-20)' },
        { column: 'usdt_sol_main_address', label: 'USDT — Solana (SPL)' },
      ];
    case 'USDC':
      return [
        { column: 'usdc_eth_main_address', label: 'USDC — Ethereum (ERC-20)' },
        { column: 'usdc_sol_main_address', label: 'USDC — Solana (SPL)' },
      ];
    default:
      return [];
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'Active':
      return 'bg-green-100 text-green-800';
    case 'Inactive':
      return 'bg-red-100 text-red-800';
    case 'Maintenance':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function CryptoAssetsPanel({ embedTableOnly = false }: { embedTableOnly?: boolean }) {
  const [overview, setOverview] = useState<CryptoOverview | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, CryptoPrice>>({});
  const [assetStatusBySymbol, setAssetStatusBySymbol] = useState<
    Record<string, CryptoAssetRuntimeStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [systemWallet, setSystemWallet] = useState<SystemWalletRow | null>(null);
  const [priceOverrides, setPriceOverrides] = useState<
    Partial<Record<string, AdminCryptoPriceOverrideRow>>
  >({});
  const [priceModal, setPriceModal] = useState<null | { symbol: string; buy: string; sell: string }>(null);
  const [savingPricesFor, setSavingPricesFor] = useState<string | null>(null);
  const [systemAddressModal, setSystemAddressModal] = useState<null | {
    symbol: string;
    fields: { column: keyof SystemWalletRow; label: string; value: string }[];
  }>(null);
  const [savingSystemAddresses, setSavingSystemAddresses] = useState(false);
  const [systemWalletAddressSuccess, setSystemWalletAddressSuccess] = useState<null | { symbol: string }>(null);
  const [fwBalance, setFwBalance] = useState<{
    available: number;
    ledger: number;
    currency: string;
  } | null>(null);
  const [fwBalanceError, setFwBalanceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPriceNote(null);
    setPriceOverrides({});
    setFwBalance(null);
    setFwBalanceError(null);
    try {
      const symbols = ADMIN_WALLET_CRYPTO_ASSETS.map((a) => a.symbol);
      const [overviewRes, lunoRes, settingsRes, fwResInitial] = await Promise.all([
        cryptoApi.getCryptoOverview(),
        getLunoNgnOrderBookQuotes([...symbols]),
        appSettingsApi.getAppSettings(),
        fetchAdminFlutterwaveBalance(),
      ]);

      let fwRes = fwResInitial;
      if (!fwRes.success || !fwRes.data) {
        fwRes = await fetchAdminFlutterwaveBalance();
      }

      if (fwRes.success && fwRes.data) {
        setFwBalance({
          available: fwRes.data.available_balance,
          ledger: fwRes.data.ledger_balance,
          currency: fwRes.data.currency,
        });
        setFwBalanceError(null);
      } else {
        setFwBalance(null);
        setFwBalanceError(fwRes.error);
      }

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
              'Fell back to Alchemy spot via get-token-prices (buy/sell may match until Luno edge is deployed).',
          );
        } else {
          setPriceNote(lunoRes.error || (fb.error != null ? String(fb.error) : null));
        }
      } else if (partialMsg) {
        setPriceNote(partialMsg);
      }

      setMarketPrices(nextPrices);

      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
      } else {
        setError(overviewRes.error || 'Failed to load crypto overview');
      }

      if (settingsRes.success && settingsRes.data) {
        setAssetStatusBySymbol(
          normalizeCryptoAssetStatusMap(settingsRes.data.additional_settings ?? null)
        );
        setPriceOverrides(
          parseAdminCryptoPriceOverrides(settingsRes.data.additional_settings ?? null),
        );
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return ADMIN_WALLET_CRYPTO_ASSETS.map((config) => {
      const symbolLower = config.symbol.toLowerCase() as AllocKey;
      const userAllocated = overview?.user_allocated_balances?.[symbolLower] ?? 0;
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
      const listMidNgn =
        listSellNgn > 0 && listBuyNgn > 0
          ? (listBuyNgn + listSellNgn) / 2
          : midNgn;
      const marketSpreadNgn =
        buyNgn > 0 && sellNgn > 0 ? Math.max(0, buyNgn - sellNgn) : 0;
      const listSpreadNgn =
        listBuyNgn > 0 && listSellNgn > 0 ? Math.max(0, listBuyNgn - listSellNgn) : 0;
      const dec = decimalsForSymbol(config.symbol);
      const runtimeStatus = assetStatusBySymbol[config.symbol] ?? 'active';
      const addrLines = formatSystemWalletAddressLines(systemWallet, config.symbol);
      const systemInventoryQty = systemTreasuryCryptoTotalQty(systemWallet, config.symbol);
      return {
        ...config,
        userAllocated,
        systemInventoryQty,
        priceUsd,
        marketBuyNgn: buyNgn,
        marketSellNgn: sellNgn,
        listBuyNgn,
        listSellNgn,
        hasListPriceOverride: hasListOverride,
        midNgn,
        listMidNgn,
        marketSpreadNgn,
        listSpreadNgn,
        dec,
        status: cryptoAssetStatusToDisplay(runtimeStatus),
        totalValueNgn: userAllocated * listMidNgn,
        systemAddressPrimary: addrLines.primary,
        systemAddressSecondary: addrLines.secondary,
      };
    });
  }, [overview, marketPrices, assetStatusBySymbol, priceOverrides, systemWallet]);

  /** Spot USD × user-allocated balance for the six listed rows (missing USD quote → 0 for that row). */
  const listedBookUsd = useMemo(() => {
    let sum = 0;
    let missingUsdForHeld = false;
    for (const r of rows) {
      const usd = Number.isFinite(r.priceUsd) && r.priceUsd > 0 ? r.priceUsd : 0;
      if (r.userAllocated > 0 && usd <= 0) missingUsdForHeld = true;
      sum += r.userAllocated * usd;
    }
    return { sum, missingUsdForHeld };
  }, [rows]);

  /** Ledger inventory on `system_wallets` × spot / list mid (treasury book). */
  const systemTreasuryBook = useMemo(() => {
    let usdSum = 0;
    let ngnSum = 0;
    let missingUsdForHeld = false;
    let anyInventory = false;
    if (!systemWallet) return { usdSum, ngnSum, missingUsdForHeld, anyInventory };
    for (const r of rows) {
      const qty = systemTreasuryCryptoTotalQty(systemWallet, r.symbol);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      anyInventory = true;
      const usd = Number.isFinite(r.priceUsd) && r.priceUsd > 0 ? r.priceUsd : 0;
      if (usd <= 0) missingUsdForHeld = true;
      usdSum += qty * usd;
      const listMidNgn =
        r.listSellNgn > 0 && r.listBuyNgn > 0 ? (r.listBuyNgn + r.listSellNgn) / 2 : r.midNgn;
      ngnSum += qty * listMidNgn;
    }
    return { usdSum, ngnSum, missingUsdForHeld, anyInventory };
  }, [rows, systemWallet]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const handleAction = async (symbol: string, action: string) => {
    const sym = symbol.toUpperCase();
    let next: CryptoAssetRuntimeStatus | null = null;
    if (action === 'activate') next = 'active';
    else if (action === 'deactivate') next = 'inactive';
    else if (action === 'maintenance') next = 'maintenance';
    if (!next) return;
    setSavingId(sym);
    try {
      const response = await appSettingsApi.mergeCryptoAssetStatuses({
        [sym as AdminWalletCryptoSymbol]: next,
      });
      if (response.success && response.data) {
        setAssetStatusBySymbol(response.data.crypto_asset_status);
      } else {
        alert(response.error || 'Failed to update asset status');
      }
    } catch (e) {
      alert('Error: ' + ((e as Error)?.message || 'Unknown'));
    } finally {
      setSavingId(null);
    }
  };

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

  const openSystemAddressModal = (symbol: string) => {
    const defs = getSystemAddressEditFields(symbol);
    if (defs.length === 0) return;
    const sw = systemWallet as Record<string, unknown> | null;
    const fields = defs.map((d) => ({
      ...d,
      value: sw ? String(sw[d.column as string] ?? '').trim() : '',
    }));
    setSystemAddressModal({ symbol, fields });
  };

  const saveSystemAddressModal = async () => {
    if (!systemAddressModal) return;
    setSavingSystemAddresses(true);
    setError(null);
    try {
      const addresses: Record<string, string> = {};
      for (const f of systemAddressModal.fields) {
        addresses[f.column as string] = f.value.trim();
      }
      const res = await updateAdminSystemWalletAddresses(addresses);
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to save treasury addresses');
        return;
      }
      const sym = systemAddressModal.symbol;
      setSystemWallet(res.data);
      setSystemAddressModal(null);
      setSystemWalletAddressSuccess({ symbol: sym });
    } catch (e) {
      setError((e as Error)?.message || 'Failed to save addresses');
    } finally {
      setSavingSystemAddresses(false);
    }
  };

  const totalUserNgnBalance = overview?.total_user_ngn_balance;

  const listedNgnTotal = rows.reduce((s, r) => s + r.totalValueNgn, 0);

  const systemNgnLedger = useMemo(() => systemTreasuryNgnLedger(systemWallet), [systemWallet]);

  /** Compare system NGN ledger to Flutterwave available (payout rail). */
  const ngnFwRailCheck = useMemo(() => {
    const EPS = 0.01;
    if (loading) return { kind: 'loading' as const };
    if (!systemWallet) return { kind: 'no_system' as const };
    if (fwBalance == null) {
      return {
        kind: 'no_fw' as const,
        message: fwBalanceError || 'Flutterwave balance not loaded',
      };
    }
    const fwAvail = fwBalance.available;
    if (!Number.isFinite(fwAvail) || fwAvail < 0) {
      return { kind: 'no_fw' as const, message: 'Invalid Flutterwave available balance' };
    }
    const { settledFloat, totalLedger } = systemNgnLedger;
    const shortfallSettled = settledFloat - fwAvail;
    const shortfallTotal = totalLedger - fwAvail;
    if (shortfallSettled > EPS) {
      return {
        kind: 'shortfall_settled' as const,
        fwAvail,
        settledFloat,
        totalLedger,
        shortfall: shortfallSettled,
      };
    }
    if (shortfallTotal > EPS) {
      return {
        kind: 'shortfall_total' as const,
        fwAvail,
        settledFloat,
        totalLedger,
        shortfall: shortfallTotal,
      };
    }
    return { kind: 'ok' as const, fwAvail, settledFloat, totalLedger };
  }, [loading, systemWallet, fwBalance, fwBalanceError, systemNgnLedger]);

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

      {!embedTableOnly && (
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-emerald-600 p-3 sm:p-4 xl:col-span-2">
          <div className="text-xs font-semibold text-gray-900 mb-2">NGN wallets</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                Treasury NGN (system ledger)
              </div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">
                {loading
                  ? '…'
                  : systemWallet != null
                    ? formatNgnNonNegative(systemNgnLedger.totalLedger)
                    : '—'}
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                Total = settled float + pending (
                <code className="bg-gray-100 px-0.5 rounded text-[9px]">system_wallets</code> id=1). Shown after you save
                addresses from this page or System wallets (not fetched on load).
              </p>
              {systemWallet != null && !loading ? (
                <p className="text-[10px] text-gray-600 mt-1 tabular-nums leading-snug">
                  Settled{' '}
                  <code className="bg-gray-100 px-0.5 rounded text-[9px]">ngn_float_balance</code>:{' '}
                  {formatNgnNonNegative(systemNgnLedger.settledFloat)}
                  {systemNgnLedger.pendingFloat > 0 ? (
                    <>
                      {' · '}
                      Pending <code className="bg-gray-100 px-0.5 rounded text-[9px]">ngn_pending_float</code>:{' '}
                      {formatNgnNonNegative(systemNgnLedger.pendingFloat)}
                    </>
                  ) : null}
                </p>
              ) : null}
              {!loading && systemWallet != null ? (
                <>
                  {ngnFwRailCheck.kind === 'no_fw' ? (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
                      <span className="font-semibold">Flutterwave check:</span> {ngnFwRailCheck.message}. System NGN
                      cannot be verified against payout rail.
                    </div>
                  ) : ngnFwRailCheck.kind === 'shortfall_settled' ? (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] leading-snug text-red-900">
                      <span className="font-semibold">Shortfall:</span> settled ledger float (
                      {formatNgnNonNegative(ngnFwRailCheck.settledFloat)}) exceeds Flutterwave{' '}
                      <span className="whitespace-nowrap">available ({formatNgnNonNegative(ngnFwRailCheck.fwAvail)})</span>{' '}
                      by {formatNgnNonNegative(ngnFwRailCheck.shortfall)}.
                    </div>
                  ) : ngnFwRailCheck.kind === 'shortfall_total' ? (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
                      <span className="font-semibold">Heads-up:</span> total system NGN (incl. pending) is above
                      Flutterwave available by {formatNgnNonNegative(ngnFwRailCheck.shortfall)}. Settled float is within
                      FW available.
                    </div>
                  ) : ngnFwRailCheck.kind === 'ok' ? (
                    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] leading-snug text-emerald-900">
                      <span className="font-semibold">Flutterwave:</span> available balance covers system NGN ledger (
                      settled + pending). FW avail {formatNgnNonNegative(ngnFwRailCheck.fwAvail)}.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="md:border-l md:border-gray-100 md:pl-4">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Users NGN (liability)</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">
                {loading
                  ? '…'
                  : totalUserNgnBalance != null
                    ? formatNgnNonNegative(totalUserNgnBalance)
                    : '—'}
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                <code className="bg-gray-100 px-0.5 rounded text-[9px]">wallets.ngn_balance</code> sum.
              </p>
            </div>
            <div className="md:border-l md:border-gray-100 md:pl-4">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Flutterwave (NGN)</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">
                {loading ? '…' : fwBalance ? formatNgnNonNegative(fwBalance.available) : '—'}
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                {fwBalance ? (
                  <>
                    Avail · Ledger {formatNgnNonNegative(fwBalance.ledger)} · {fwBalance.currency}{' '}
                    <code className="bg-gray-100 px-0.5 rounded text-[9px]">flutterwave-management</code>
                  </>
                ) : fwBalanceError ? (
                  <span className="text-amber-800">
                    {fwBalanceError.length > 120 ? `${fwBalanceError.slice(0, 120)}…` : fwBalanceError}
                  </span>
                ) : (
                  'Merchant settlement balance (reference).'
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-purple-600 p-3 sm:p-4 xl:col-span-2">
          <div className="text-xs font-semibold text-gray-900 mb-2">Listed crypto</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Total user crypto</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">
                {loading
                  ? '…'
                  : `$${listedBookUsd.sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <div className="text-xs font-semibold text-gray-800 mt-1 tabular-nums">
                {!loading ? formatNgnNonNegative(listedNgnTotal) : ''}
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                Six tickers · USD spot × allocated · NGN list mid.
                {listedBookUsd.missingUsdForHeld ? ' Missing USD on some rows.' : ''}
              </p>
            </div>
            <div className="md:border-l md:border-gray-100 md:pl-4">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">System treasury (ledger)</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">
                {loading
                  ? '…'
                  : !systemTreasuryBook.anyInventory
                    ? '—'
                    : `$${systemTreasuryBook.usdSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <div className="text-xs font-semibold text-gray-800 mt-1 tabular-nums">
                {!loading && systemTreasuryBook.anyInventory ? formatNgnNonNegative(systemTreasuryBook.ngnSum) : ''}
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                <code className="bg-gray-100 px-0.5 rounded text-[9px]">system_wallets</code> hot inventory + pending deposit bucket · NGN list mid.
                {systemTreasuryBook.missingUsdForHeld ? ' Missing USD on some rows.' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className={`flex-1 min-h-0 flex flex-col rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden ${embedTableOnly ? 'min-h-[320px]' : ''}`}>
        <div className="shrink-0 p-2 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-900">Crypto assets</h3>
            <p
              className="text-[10px] text-gray-500 mt-0.5 line-clamp-2"
              title="wallet_balances (6 symbols). Market: Luno / Alchemy. Treasury addresses: enter manually (Save) — not pre-fetched."
            >
              <code className="bg-gray-100 px-0.5 rounded">wallet_balances</code> · Luno/Alchemy market · list in{' '}
              <code className="bg-gray-100 px-0.5 rounded">app_settings</code> ·{' '}
              <code className="bg-gray-100 px-0.5 rounded">system_wallets</code> addresses (after save) + ledger inventory when loaded.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 sm:w-44 px-2 py-1 border border-gray-200 rounded text-xs"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="px-2 py-1 rounded text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Asset
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[220px]">
                  System wallet address
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  User allocated
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Treasury (inv+pend)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Spot (USD)
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[108px]">
                  Market (₦)
                </th>
                <th
                  className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[100px]"
                  title="Buy minus sell in NGN per 1 coin; basis points vs market mid."
                >
                  Mkt spread
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[120px]">
                  List (₦)
                </th>
                <th
                  className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[100px]"
                  title="List buy minus list sell; basis points vs list mid."
                >
                  List spread
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Total (NGN)
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Runtime
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-gray-500 text-xs">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-gray-500 text-xs">
                    No rows match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((crypto) => (
                  <tr key={crypto.symbol} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {typeof crypto.logo === 'string' && crypto.logo.startsWith('/') ? (
                          <Image
                            src={crypto.logo}
                            alt={crypto.name}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-full object-contain"
                          />
                        ) : (
                          <span className="text-base">{crypto.logo}</span>
                        )}
                        <div>
                          <div className="text-[11px] font-medium text-gray-900 leading-tight">{crypto.name}</div>
                          <div className="text-[10px] text-gray-500">{crypto.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {crypto.systemAddressPrimary ? (
                        <div className="flex flex-col gap-1 max-w-[min(100vw-8rem,320px)]">
                          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                            <span
                              className="font-mono text-xs text-gray-900 break-all flex-1 leading-snug whitespace-pre-wrap"
                              title={crypto.systemAddressPrimary}
                            >
                              {crypto.systemAddressPrimary}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-xs font-medium text-purple-700 hover:text-purple-900"
                              onClick={() =>
                                void navigator.clipboard.writeText(
                                  [crypto.systemAddressPrimary, crypto.systemAddressSecondary]
                                    .filter(Boolean)
                                    .join('\n'),
                                )
                              }
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              className="shrink-0 text-xs font-medium text-purple-800 hover:text-purple-950"
                              onClick={() => openSystemAddressModal(crypto.symbol)}
                              disabled={savingSystemAddresses}
                            >
                              Edit
                            </button>
                          </div>
                          {crypto.systemAddressSecondary && (
                            <span className="font-mono text-[10px] text-gray-600 break-all whitespace-pre-wrap leading-snug">
                              {crypto.systemAddressSecondary}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500">Treasury main (on-chain)</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 max-w-[min(100vw-8rem,320px)]">
                          <span className="text-xs text-gray-500 leading-snug block max-w-[240px]">
                            No address in this session — use System wallets or Set address.
                          </span>
                          <button
                            type="button"
                            className="self-start text-xs font-medium text-purple-800 hover:text-purple-950"
                            onClick={() => openSystemAddressModal(crypto.symbol)}
                            disabled={savingSystemAddresses}
                          >
                            Set address
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900 font-mono">
                      {crypto.userAllocated.toFixed(crypto.userAllocated > 0 ? crypto.dec : 0)}{' '}
                      {crypto.symbol}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900 font-mono align-top">
                      {systemWallet && crypto.systemInventoryQty > 0 ? (
                        <span>
                          {crypto.systemInventoryQty.toFixed(crypto.dec)} {crypto.symbol}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900 font-mono">
                      {formatUsd(crypto.priceUsd)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900 align-top">
                      <div className="flex flex-col items-end gap-0.5 leading-snug">
                        <span className="text-[10px] text-gray-500 uppercase">Buy</span>
                        <span>
                          {formatNgn(crypto.marketBuyNgn, crypto.symbol === 'BTC' || crypto.symbol === 'ETH' ? 2 : 4)}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase mt-0.5">Sell</span>
                        <span>
                          {formatNgn(crypto.marketSellNgn, crypto.symbol === 'BTC' || crypto.symbol === 'ETH' ? 2 : 4)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      {spreadCell(crypto.marketSpreadNgn, crypto.midNgn, crypto.symbol)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900 align-top">
                      <div className="flex flex-col items-end gap-1 leading-snug">
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block text-right">Buy</span>
                          <span>
                            {formatNgn(crypto.listBuyNgn, crypto.symbol === 'BTC' || crypto.symbol === 'ETH' ? 2 : 4)}
                          </span>
                          <span className="text-[10px] text-gray-500 uppercase block text-right mt-0.5">Sell</span>
                          <span>
                            {formatNgn(crypto.listSellNgn, crypto.symbol === 'BTC' || crypto.symbol === 'ETH' ? 2 : 4)}
                          </span>
                        </div>
                        {crypto.hasListPriceOverride && (
                          <span className="text-[10px] font-medium text-purple-700">Override</span>
                        )}
                        <button
                          type="button"
                          className="text-[10px] font-medium text-purple-700 hover:text-purple-900"
                          onClick={() =>
                            openPriceModal(crypto.symbol, crypto.listBuyNgn, crypto.listSellNgn)
                          }
                          disabled={savingPricesFor === crypto.symbol}
                        >
                          {savingPricesFor === crypto.symbol ? '…' : 'Edit'}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      {spreadCell(crypto.listSpreadNgn, crypto.listMidNgn, crypto.symbol)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-gray-900">
                      {crypto.totalValueNgn > 0
                        ? `₦${crypto.totalValueNgn.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusColor(
                          crypto.status
                        )}`}
                      >
                        {crypto.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] space-x-1.5 whitespace-nowrap">
                      {(crypto.status === 'Active' || crypto.status === 'Maintenance') && (
                        <>
                          <button
                            type="button"
                            className="text-[10px] text-yellow-800 hover:underline disabled:opacity-50"
                            onClick={() => handleAction(crypto.symbol, 'maintenance')}
                            disabled={savingId === crypto.symbol}
                          >
                            {savingId === crypto.symbol ? '…' : 'Maintenance'}
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-red-700 hover:underline disabled:opacity-50"
                            onClick={() => handleAction(crypto.symbol, 'deactivate')}
                            disabled={savingId === crypto.symbol}
                          >
                            Deactivate
                          </button>
                        </>
                      )}
                      {crypto.status !== 'Active' && (
                        <button
                          type="button"
                          className="text-[10px] text-green-700 hover:underline disabled:opacity-50"
                          onClick={() => handleAction(crypto.symbol, 'activate')}
                          disabled={savingId === crypto.symbol}
                        >
                          Activate
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

      {systemAddressModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-address-modal-title"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3 border border-gray-200">
            <h4 id="system-address-modal-title" className="text-sm font-semibold text-gray-900">
              Treasury addresses — {systemAddressModal.symbol}
            </h4>
            <p className="text-xs text-gray-500">
              Saved to <code className="bg-gray-100 px-0.5 rounded">system_wallets</code> id=1. Use the correct
              network for each field. Clearing a field saves an empty value (not recommended for production receive
              paths).
            </p>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {systemAddressModal.fields.map((f) => (
                <label key={f.column as string} className="block">
                  <span className="text-xs font-medium text-gray-600">{f.label}</span>
                  <textarea
                    rows={2}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono resize-y min-h-[2.5rem]"
                    value={f.value}
                    onChange={(e) =>
                      setSystemAddressModal((m) =>
                        m
                          ? {
                              ...m,
                              fields: m.fields.map((row) =>
                                row.column === f.column ? { ...row, value: e.target.value } : row,
                              ),
                            }
                          : m,
                      )
                    }
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => setSystemAddressModal(null)}
                disabled={savingSystemAddresses}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
                onClick={() => void saveSystemAddressModal()}
                disabled={savingSystemAddresses}
              >
                {savingSystemAddresses ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {systemWalletAddressSuccess && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-wallet-address-success-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h4 id="system-wallet-address-success-title" className="text-lg font-semibold text-gray-900">
                Changes saved
              </h4>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Treasury system wallet addresses for <strong>{systemWalletAddressSuccess.symbol}</strong> were saved to{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">system_wallets</code> (id=1).
              </p>
            </div>
            <button
              type="button"
              className="w-full sm:w-auto min-w-[120px] px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-700 text-white hover:bg-purple-800"
              onClick={() => setSystemWalletAddressSuccess(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {priceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="price-modal-title"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3 border border-gray-200">
            <h4 id="price-modal-title" className="text-sm font-semibold text-gray-900">
              List prices (NGN) — {priceModal.symbol}
            </h4>
            <p className="text-xs text-gray-500">
              NGN per 1 {priceModal.symbol}. Buy should be ≥ sell (ask vs bid). Clearing reverts this asset to
              live market quotes for the list column.
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
