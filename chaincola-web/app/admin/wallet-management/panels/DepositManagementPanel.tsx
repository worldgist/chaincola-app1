'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  mapTransactionStatusToDepositMonitor,
  transactionsApi,
  type CryptoDepositMonitorBucket,
  type Transaction,
} from '@/lib/admin-api';

const BUCKET_LABEL: Record<CryptoDepositMonitorBucket, string> = {
  incoming: 'Incoming',
  delivered: 'Delivered',
  failed: 'Failed',
};

function bucketBadgeClass(bucket: CryptoDepositMonitorBucket) {
  switch (bucket) {
    case 'delivered':
      return 'bg-emerald-100 text-emerald-900';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-amber-100 text-amber-900';
  }
}

function formatCryptoAmount(sym: string | undefined, n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = (sym || '').toUpperCase();
  const max = u === 'BTC' ? 8 : u === 'ETH' || u === 'SOL' ? 6 : 4;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 })} ${u || ''}`.trim();
}

function shortenHash(h: string | null | undefined, len = 10) {
  if (!h) return '—';
  if (h.length <= len * 2) return h;
  return `${h.slice(0, len)}…${h.slice(-len)}`;
}

type FilterTab = 'all' | CryptoDepositMonitorBucket;

const STATUS_IN: Record<CryptoDepositMonitorBucket, string[]> = {
  incoming: ['PENDING', 'CONFIRMING', 'PROCESSING'],
  delivered: ['CONFIRMED', 'COMPLETED', 'SUCCESS'],
  failed: ['FAILED', 'CANCELLED', 'REJECTED', 'ERROR'],
};

export default function DepositManagementPanel() {
  const [stats, setStats] = useState<{ incoming: number; delivered: number; failed: number; total: number } | null>(
    null,
  );
  const [statsError, setStatsError] = useState<string | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>('all');
  const [currency, setCurrency] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const limit = 30;

  const loadStats = useCallback(async () => {
    setStatsError(null);
    const res = await transactionsApi.getCryptoDepositMonitorStats();
    if (res.success && res.data) {
      setStats(res.data);
    } else {
      setStats(null);
      setStatsError(res.error || 'Could not load deposit counts');
    }
  }, []);

  const loadList = useCallback(async () => {
    setListError(null);
    const params: Parameters<typeof transactionsApi.getTransactions>[0] = {
      page,
      limit,
      crypto_receive_only: true,
      sort_by: 'created_at',
      sort_order: 'desc',
    };
    if (tab !== 'all') {
      params.status_in = STATUS_IN[tab];
    }
    if (currency.trim()) {
      params.currency_filter = currency.trim().toUpperCase();
    }
    if (appliedSearch.trim()) {
      params.search_query = appliedSearch.trim();
    }
    const res = await transactionsApi.getTransactions(params);
    if (res.success && res.data && !Array.isArray(res.data)) {
      const d = res.data as { transactions?: Transaction[]; pagination?: { pages: number; total: number } };
      setRows(d.transactions ?? []);
      setPages(d.pagination?.pages ?? 0);
      setTotal(d.pagination?.total ?? 0);
    } else {
      setRows([]);
      setPages(0);
      setTotal(0);
      setListError(res.error || 'Failed to load transactions');
    }
  }, [page, tab, currency, appliedSearch, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadStats(), loadList()]);
    } finally {
      setLoading(false);
    }
  }, [loadList, loadStats]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, currency, appliedSearch]);

  const tabs = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'All deposits', count: stats?.total },
        { id: 'incoming' as const, label: 'Incoming', count: stats?.incoming },
        { id: 'delivered' as const, label: 'Delivered', count: stats?.delivered },
        { id: 'failed' as const, label: 'Failed', count: stats?.failed },
      ] as const,
    [stats],
  );

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 text-[13px] leading-snug">
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
          <div className="text-[10px] text-gray-600">Incoming</div>
          <div className="text-lg font-bold text-amber-900 leading-tight">{loading && !stats ? '…' : stats?.incoming ?? '—'}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">PENDING, CONFIRMING, PROCESSING</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
          <div className="text-[10px] text-gray-600">Delivered</div>
          <div className="text-lg font-bold text-emerald-900 leading-tight">{loading && !stats ? '…' : stats?.delivered ?? '—'}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">CONFIRMED, COMPLETED, SUCCESS</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
          <div className="text-[10px] text-gray-600">Failed</div>
          <div className="text-lg font-bold text-red-900 leading-tight">{loading && !stats ? '…' : stats?.failed ?? '—'}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">FAILED, CANCELLED, REJECTED, ERROR</div>
        </div>
      </div>

      {statsError && (
        <div className="shrink-0 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{statsError}</div>
      )}

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-purple-100/80 bg-white shadow-sm overflow-hidden">
        <div className="shrink-0 p-2 border-b border-purple-100/60 bg-purple-50/40 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  tab === t.id
                    ? 'bg-purple-700 text-white border-purple-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
                {typeof t.count === 'number' ? (
                  <span className={`ml-1.5 tabular-nums ${tab === t.id ? 'text-purple-100' : 'text-gray-500'}`}>
                    ({t.count})
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <input
              type="text"
              placeholder="Ticker (e.g. BTC)"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="px-2 py-1 border border-gray-200 rounded text-xs w-full sm:w-24 font-mono uppercase"
            />
            <input
              type="search"
              placeholder="Search tx hash / id…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAppliedSearch(searchDraft.trim());
                }
              }}
              className="px-2 py-1 border border-gray-200 rounded text-xs w-full sm:w-48"
            />
            <button
              type="button"
              onClick={() => setAppliedSearch(searchDraft.trim())}
              disabled={loading}
              className="px-2 py-1 rounded text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              Apply search
            </button>
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

        {listError && (
          <div className="shrink-0 mx-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{listError}</div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Monitor</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Detected</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">User</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wide">Conf.</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Network</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide min-w-[200px]">
                  Hash / to address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-gray-500 text-xs">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-gray-500 text-xs">
                    No crypto deposit rows match this view.
                  </td>
                </tr>
              ) : (
                rows.map((tx) => {
                  const statusRaw = (tx.status || '').toUpperCase();
                  const bucket = mapTransactionStatusToDepositMonitor(statusRaw);
                  const conf = (tx as { confirmations?: number | null }).confirmations;
                  const net = (tx as { network?: string | null }).network;
                  const cryptoSym = (tx as { crypto_currency?: string }).crypto_currency;
                  const cryptoAmt = (tx as { crypto_amount?: number | string | null }).crypto_amount;
                  const amtNum =
                    typeof cryptoAmt === 'number' ? cryptoAmt : parseFloat(String(cryptoAmt ?? tx.amount ?? 0)) || 0;
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${bucketBadgeClass(bucket)}`}
                        >
                          {BUCKET_LABEL[bucket]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="text-gray-900 font-medium text-[11px] leading-tight">{tx.user_profile?.full_name || '—'}</div>
                        <div className="text-[10px] text-gray-500 truncate max-w-[180px]">{tx.user_profile?.email || tx.user_id}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-900">{formatCryptoAmount(cryptoSym, amtNum)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{conf != null ? conf : '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 font-mono text-xs">{net || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-mono text-xs text-gray-800">{statusRaw || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <div className="font-mono text-xs text-gray-800 break-all">{shortenHash(tx.transaction_hash, 12)}</div>
                        {(tx as { to_address?: string | null }).to_address ? (
                          <div className="text-[10px] text-gray-500 mt-1 break-all">
                            To: {(tx as { to_address?: string }).to_address}
                          </div>
                        ) : null}
                        {(tx as { error_message?: string | null }).error_message ? (
                          <div className="text-xs text-red-700 mt-1">{(tx as { error_message?: string }).error_message}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="px-2 py-1.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {page} of {pages} · {total} rows
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="shrink-0 text-[10px] text-gray-500 line-clamp-2" title="RECEIVE on-chain rows; detector jobs update status.">
        Rows are <code className="bg-gray-100 px-1 rounded">transactions</code> with{' '}
        <code className="bg-gray-100 px-1 rounded">transaction_type = RECEIVE</code> and on-chain assets (NGN / USD / FIAT
        receipt rows excluded). Detector jobs (e.g. detect-bitcoin-deposits) create and update these records; monitor lanes
        group raw <code className="bg-gray-100 px-1 rounded">status</code> for operations.
      </p>
    </div>
  );
}
