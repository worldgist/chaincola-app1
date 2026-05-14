'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminTreasuryNgnMoveBetweenBuckets,
  fetchTreasuryNgnBuckets,
  fetchTreasuryNgnLedger,
  TREASURY_NGN_BUCKET_LABEL,
  type TreasuryNgnBucketCode,
  type TreasuryNgnBucketRow,
  type TreasuryNgnLedgerRow,
} from '@/lib/admin-treasury-ngn-ledger';

function fmtNgn(n: number) {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BUCKET_OPTIONS: TreasuryNgnBucketCode[] = ['PAYOUT_RESERVE', 'FEE_REVENUE', 'OPERATING_FLOAT'];

export default function TreasuryNgnLedgerPanel() {
  const [buckets, setBuckets] = useState<TreasuryNgnBucketRow[] | null>(null);
  const [ledger, setLedger] = useState<TreasuryNgnLedgerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromBucket, setFromBucket] = useState<TreasuryNgnBucketCode>('PAYOUT_RESERVE');
  const [toBucket, setToBucket] = useState<TreasuryNgnBucketCode>('OPERATING_FLOAT');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [bRes, lRes] = await Promise.all([fetchTreasuryNgnBuckets(), fetchTreasuryNgnLedger(120)]);
    const err = bRes.error || lRes.error;
    if (err) setError(err);
    setBuckets(bRes.data);
    setLedger(lRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onMove = async () => {
    setMoveMsg(null);
    const amt = parseFloat(moveAmount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      setMoveMsg('Enter a valid amount.');
      return;
    }
    if (fromBucket === toBucket) {
      setMoveMsg('Choose two different buckets.');
      return;
    }
    setMoveBusy(true);
    const res = await adminTreasuryNgnMoveBetweenBuckets({
      fromBucket,
      toBucket,
      amount: Math.round(amt * 100) / 100,
      note: moveNote,
    });
    setMoveBusy(false);
    if (!res.success) {
      setMoveMsg(res.error || 'Move failed');
      return;
    }
    setMoveMsg('Moved successfully.');
    setMoveAmount('');
    setMoveNote('');
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Treasury NGN ledger</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">
          Bucket balances track how much NGN is reserved for bank payouts, booked as withdrawal fees, and held as
          operating float. Withdrawals debit users then credit{' '}
          <span className="font-semibold">Payout reserve</span> and <span className="font-semibold">Fee revenue</span>{' '}
          automatically. Use the form below to reallocate between buckets (admin only).
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {(buckets ?? []).map((b) => (
          <div
            key={b.bucket_code}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {(TREASURY_NGN_BUCKET_LABEL as Record<string, string>)[b.bucket_code] ?? b.bucket_code}
            </div>
            <div className="text-2xl font-bold text-purple-900 mt-1">{fmtNgn(b.balance)}</div>
            <div className="text-[11px] text-gray-400 mt-2 font-mono">{b.bucket_code}</div>
          </div>
        ))}
        {loading && !buckets?.length ? (
          <div className="col-span-full text-sm text-gray-500">Loading buckets…</div>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Move funds between buckets</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="text-gray-600">From</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={fromBucket}
              onChange={(e) => setFromBucket(e.target.value as TreasuryNgnBucketCode)}
            >
              {BUCKET_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {TREASURY_NGN_BUCKET_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">To</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toBucket}
              onChange={(e) => setToBucket(e.target.value as TreasuryNgnBucketCode)}
            >
              {BUCKET_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {TREASURY_NGN_BUCKET_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Amount (NGN)</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              inputMode="decimal"
              placeholder="0.00"
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={moveBusy}
              onClick={() => void onMove()}
              className="w-full rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-purple-800 disabled:opacity-50"
            >
              {moveBusy ? 'Moving…' : 'Move funds'}
            </button>
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Note (optional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Sweep excess payout reserve after FW settlement"
            value={moveNote}
            onChange={(e) => setMoveNote(e.target.value)}
          />
        </label>
        {moveMsg ? (
          <p className={`text-sm ${moveMsg.includes('success') ? 'text-emerald-700' : 'text-amber-800'}`}>{moveMsg}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Recent ledger lines</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">After</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Ref</th>
            </tr>
          </thead>
          <tbody>
            {(ledger ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-gray-800">
                  {(TREASURY_NGN_BUCKET_LABEL as Record<string, string>)[row.bucket_code] ?? row.bucket_code}
                </td>
                <td className={`px-3 py-2 font-medium ${row.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {row.delta >= 0 ? '+' : ''}
                  {fmtNgn(row.delta)}
                </td>
                <td className="px-3 py-2 text-gray-800">{fmtNgn(row.balance_after)}</td>
                <td className="px-3 py-2 text-gray-700">{row.category}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {row.reference_type ?? '—'} {row.reference_id ? row.reference_id.slice(0, 8) + '…' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && (ledger?.length ?? 0) === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No ledger rows yet.</div>
        ) : null}
        {loading ? <div className="px-4 py-6 text-sm text-gray-500">Loading…</div> : null}
      </div>
    </div>
  );
}
