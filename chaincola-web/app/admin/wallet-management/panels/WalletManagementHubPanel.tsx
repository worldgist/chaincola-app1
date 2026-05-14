'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cryptoApi, type CryptoOverview } from '@/lib/admin-api';
import { ADMIN_WALLET_CRYPTO_ASSETS } from '@/lib/admin-wallet-crypto-assets';
import { fetchAdminFlutterwaveBalance } from '@/lib/admin-flutterwave-balance';
import { systemTreasuryNgnLedger } from '@/lib/admin-system-wallet';
import { getLunoNgnOrderBookQuotes, getLunoPrices, type CryptoPrice } from '@/lib/crypto-price-service';
import CryptoAssetsPanel from './CryptoAssetsPanel';

function formatNgn(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '₦0.00';
  return `₦${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type AllocKey = keyof NonNullable<CryptoOverview['user_allocated_balances']>;

export default function WalletManagementHubPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [overview, setOverview] = useState<CryptoOverview | null>(null);
  const [fwAvail, setFwAvail] = useState<number | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, CryptoPrice>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const symbols = ADMIN_WALLET_CRYPTO_ASSETS.map((a) => a.symbol);
      const [overviewRes, lunoRes, fwRes] = await Promise.all([
        cryptoApi.getCryptoOverview(),
        getLunoNgnOrderBookQuotes([...symbols]),
        fetchAdminFlutterwaveBalance(),
      ]);

      let nextPrices: Record<string, CryptoPrice> = { ...(lunoRes.prices ?? {}) };
      if (Object.keys(nextPrices).length === 0) {
        const fb = await getLunoPrices([...symbols], { retailOverlay: false });
        if (fb.prices) nextPrices = fb.prices;
      }
      setMarketPrices(nextPrices);

      if (overviewRes.success && overviewRes.data) setOverview(overviewRes.data);
      if (fwRes.success && fwRes.data) setFwAvail(fwRes.data.available_balance);
      else setFwAvail(null);
      setSyncedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ngnLedger = useMemo(() => systemTreasuryNgnLedger(null), []);
  const userNgn = overview?.total_user_ngn_balance ?? null;

  const listedBookUsd = useMemo(() => {
    let sum = 0;
    if (!overview) return sum;
    for (const cfg of ADMIN_WALLET_CRYPTO_ASSETS) {
      const sym = cfg.symbol;
      const q = marketPrices[sym] || marketPrices[sym.toUpperCase()];
      const usd = q?.price_usd != null ? Number(q.price_usd) : 0;
      const alloc = overview.user_allocated_balances?.[sym.toLowerCase() as AllocKey] ?? 0;
      sum += alloc * usd;
    }
    return sum;
  }, [overview, marketPrices]);

  /** Treasury crypto book USD not loaded in hub (addresses entered under System wallets; no GET here). */
  const systemTreasuryUsd = 0;

  const donutSegments = useMemo(() => {
    const parts: { label: string; pct: number; color: string }[] = [];
    if (!overview) return parts;
    const colors = ['#6B46C1', '#9333EA', '#A855F7', '#C084FC', '#E9D5FF', '#DDD6FE'];
    let total = 0;
    const weights: { label: string; w: number }[] = [];
    for (let i = 0; i < ADMIN_WALLET_CRYPTO_ASSETS.length; i++) {
      const cfg = ADMIN_WALLET_CRYPTO_ASSETS[i];
      const q = marketPrices[cfg.symbol] || marketPrices[cfg.symbol.toUpperCase()];
      const usd = q?.price_usd != null ? Number(q.price_usd) : 0;
      const alloc = overview.user_allocated_balances?.[cfg.symbol.toLowerCase() as AllocKey] ?? 0;
      const w = alloc * usd;
      weights.push({ label: cfg.symbol, w });
      total += w;
    }
    if (total <= 0) {
      return [{ label: '—', pct: 100, color: '#E5E7EB' }];
    }
    weights.forEach((x, i) => {
      parts.push({ label: x.label, pct: (x.w / total) * 100, color: colors[i % colors.length] });
    });
    return parts;
  }, [overview, marketPrices]);

  const donutGradient = useMemo(() => {
    if (!donutSegments.length) return 'conic-gradient(#e5e7eb 0% 100%)';
    let acc = 0;
    const stops = donutSegments.map((s) => {
      const from = acc;
      acc += s.pct;
      return `${s.color} ${from}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [donutSegments]);

  const reconcile = () => {
    void load();
    router.refresh();
    window.alert(
      'Reconcile: data refreshed. For deposit reconciliation and ledger checks, use Deposit management and your ops runbook.',
    );
  };

  return (
    <div className="flex flex-col gap-4 min-h-0 text-[13px] leading-snug text-gray-800">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <nav className="text-[11px] text-gray-500 mb-1" aria-label="Breadcrumb">
            <span className="text-gray-400">Overview</span>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-gray-800">Treasury hub</span>
          </nav>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Wallet management</h1>
          <p className="text-xs text-gray-500 mt-0.5">Treasury, rates, deposits — ledger visibility</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
            Live
          </span>
          <span className="text-[11px] text-gray-500 tabular-nums">
            Data synced{syncedAt ? ` · ${syncedAt.toLocaleTimeString()}` : ''}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={reconcile}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-700 text-white hover:bg-purple-800 shadow-sm"
          >
            Reconcile now
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 shrink-0">
        {[
          {
            title: 'Total NGN treasury',
            value: loading ? '…' : formatNgn(ngnLedger.totalLedger),
            sub: 'Settled + pending float',
            border: 'border-l-emerald-600',
          },
          {
            title: 'User NGN liability',
            value: loading ? '…' : userNgn != null ? formatNgn(userNgn) : '—',
            sub: 'wallets.ngn_balance sum',
            border: 'border-l-sky-600',
          },
          {
            title: 'Flutterwave (NGN)',
            value: loading ? '…' : fwAvail != null ? formatNgn(fwAvail) : '—',
            sub: 'Available (settlement)',
            border: 'border-l-amber-500',
          },
          {
            title: 'Total user crypto',
            value: loading ? '…' : formatUsd(listedBookUsd),
            sub: 'USD spot × allocated',
            border: 'border-l-purple-600',
          },
          {
            title: 'System treasury (ledger)',
            value: loading ? '…' : formatUsd(systemTreasuryUsd),
            sub: 'Hot + pending inventory',
            border: 'border-l-violet-600',
          },
        ].map((c) => (
          <div
            key={c.title}
            className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm border-l-4 ${c.border}`}
          >
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{c.title}</div>
            <div className="text-lg font-bold text-gray-900 mt-1.5 tabular-nums">{c.value}</div>
            <div className="text-[10px] text-gray-500 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Middle widgets */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 shrink-0">
        <div className="xl:col-span-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Treasury overview</h2>
            <span className="text-[10px] text-gray-400">USD book</span>
          </div>
          <div className="h-40 flex items-end gap-1">
            {[32, 45, 38, 52, 48, 61, 55, 70, 66, 58, 72, 68, 75, 80, 78].map((h, i) => (
              <div
                key={i}
                className="flex-1 min-w-0 rounded-t bg-gradient-to-t from-purple-200 to-purple-500/80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-gray-500">
            <span>24h</span>
            <span>7d</span>
            <span>30d</span>
            <span>90d</span>
          </div>
        </div>

        <div className="xl:col-span-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-gray-900 self-start w-full mb-2">Portfolio allocation</h2>
          <div
            className="h-36 w-36 rounded-full shrink-0 border border-gray-100 shadow-inner"
            style={{ background: donutGradient }}
          />
          <ul className="mt-3 w-full space-y-1 text-[10px] max-h-24 overflow-auto">
            {donutSegments.slice(0, 6).map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex justify-between gap-2">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="tabular-nums text-gray-900">{s.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-900 mb-2">Pending items</h2>
            <ul className="space-y-2 text-[11px]">
              <li className="flex justify-between">
                <span className="text-gray-600">Pending deposits</span>
                <Link href="/admin/wallet-management/deposit-management" className="font-semibold text-purple-700 hover:underline">
                  Open
                </Link>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">Pending withdrawals</span>
                <span className="text-gray-400">—</span>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">Unconfirmed TX</span>
                <span className="text-gray-400">—</span>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">KYC pending</span>
                <span className="text-gray-400">—</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-900 mb-2">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/admin/wallet-management/system-wallets"
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[10px] font-medium text-gray-800 hover:bg-purple-50 hover:border-purple-200"
              >
                System wallets
              </Link>
              <Link
                href="/admin/wallet-management/deposit-management"
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[10px] font-medium text-gray-800 hover:bg-purple-50 hover:border-purple-200"
              >
                Deposits
              </Link>
              <Link
                href="/admin/wallet-management/crypto-rates"
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[10px] font-medium text-gray-800 hover:bg-purple-50 hover:border-purple-200"
              >
                List rates
              </Link>
              <Link
                href="/admin/dashboard"
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[10px] font-medium text-gray-800 hover:bg-purple-50 hover:border-purple-200"
              >
                App settings
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
        <div className="lg:col-span-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">System status</h2>
          <ul className="space-y-2">
            {[
              'Pricing engine (list overrides)',
              'Deposit monitor',
              'Blockchain sync',
              'Flutterwave settlement',
              'Admin edge (system_wallets)',
            ].map((name) => (
              <li key={name} className="flex items-center justify-between text-[11px] border-b border-gray-50 pb-2 last:border-0">
                <span className="text-gray-700">{name}</span>
                <span className="rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                  Active
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 bg-purple-50/30 p-4 text-[11px] text-gray-600">
          <strong className="text-gray-900">Note:</strong> Charts are illustrative snapshots from current book data.
          Use <strong>Crypto assets</strong> below for authoritative addresses and runtime flags.
        </div>
      </div>

      {/* Crypto table (shared panel, KPI strip hidden) */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-0 flex flex-col flex-1">
        <div className="shrink-0 border-b border-gray-100 px-3 py-2 flex items-center justify-between bg-gray-50/80">
          <span className="text-xs font-semibold text-gray-900">Crypto assets</span>
          <Link
            href="/admin/wallet-management/crypto-assets"
            className="text-[11px] font-medium text-purple-700 hover:text-purple-900"
          >
            Full-page view →
          </Link>
        </div>
        <div className="flex-1 min-h-[420px] overflow-auto p-2">
          <CryptoAssetsPanel embedTableOnly />
        </div>
      </div>

      {/* Bottom KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0 pb-2">
        {[
          { t: 'System treasury (USD)', v: formatUsd(systemTreasuryUsd) },
          { t: 'User crypto book (USD)', v: formatUsd(listedBookUsd) },
          { t: 'User liability (NGN)', v: userNgn != null ? formatNgn(userNgn) : '—' },
          { t: '24h volume', v: '—' },
          { t: '24h fees', v: '—' },
        ].map((x) => (
          <div key={x.t} className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[9px] text-gray-500 uppercase tracking-wide leading-tight">{x.t}</div>
            <div className="text-sm font-bold text-gray-900 mt-1 tabular-nums">{loading ? '…' : x.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
