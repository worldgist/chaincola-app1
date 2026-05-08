'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  listAccountDeletionsWithProfiles,
  fetchAccountDeletionAuditSnapshot,
  openAccountDeletionReportPrint,
  type AccountDeletionAuditSnapshot,
  type AccountDeletionRow,
  type UserProfileBrief,
} from '@/lib/admin-account-deletions';

type DeletionListRow = AccountDeletionRow & { profile: UserProfileBrief | null };

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminAccountDeletionsPage() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [rows, setRows] = useState<DeletionListRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DeletionListRow | null>(null);
  const [snapshot, setSnapshot] = useState<AccountDeletionAuditSnapshot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDeletions = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const { rows: nextRows, error } = await listAccountDeletionsWithProfiles({
      status: statusFilter,
      limit: 200,
    });
    if (error) {
      setListError(error);
      setRows([]);
    } else {
      setRows(nextRows);
    }
    setListLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/admin/login');
        if (!cancelled) setAuthChecking(false);
        return;
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_admin, role')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
        await supabase.auth.signOut();
        router.push('/admin/login');
        if (!cancelled) setAuthChecking(false);
        return;
      }
      if (!cancelled) {
        setInitialized(true);
        setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!initialized) return;
    void loadDeletions();
  }, [initialized, loadDeletions]);

  const openDetail = async (row: DeletionListRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
    setSnapshot(null);
    setDetailError(null);
    setDetailLoading(true);
    const { snapshot: snap, error } = await fetchAccountDeletionAuditSnapshot(row.id);
    if (error || !snap) {
      setDetailError(error || 'Could not load audit data');
      setDetailLoading(false);
      return;
    }
    setSnapshot(snap);
    setDetailLoading(false);
  };

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedRow(null);
    setSnapshot(null);
    setDetailError(null);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailOpen, closeDetail]);

  const handlePrintPdf = () => {
    if (!snapshot) return;
    openAccountDeletionReportPrint(snapshot);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          <p className="mt-3 text-sm text-gray-600">Checking access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Account deletions</h1>
              <p className="mt-1 text-sm text-gray-500">
                Review deletion requests, user profile data, and activity captured up to the request time. Export a PDF
                from the detail view.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-600">
                Status{' '}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="ml-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void loadDeletions()}
                disabled={listLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
              >
                {listLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {listError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{listError}</div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requested
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scheduled removal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Processed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {listLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      <span className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mr-2 align-middle" />
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      No deletion requests found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDateTime(r.requested_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{r.profile?.full_name || '—'}</div>
                        <div className="text-xs text-gray-500">{r.profile?.email || r.user_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-50 text-purple-800 capitalize">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(r.scheduled_deletion_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(r.processed_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(r)}
                          className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                          View audit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          onClick={closeDetail}
          role="presentation"
        >
          <div
            className="bg-white w-full sm:max-w-4xl sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col border border-gray-200"
            role="dialog"
            aria-labelledby="deletion-audit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <h2 id="deletion-audit-title" className="text-lg font-bold text-gray-900">
                  Deletion audit
                </h2>
                {selectedRow && (
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedRow.profile?.email || selectedRow.user_id}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={!snapshot || detailLoading}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 text-sm">
              {detailLoading && (
                <div className="py-16 text-center text-gray-500">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-2" />
                  <p>Loading activity snapshot…</p>
                </div>
              )}

              {detailError && !detailLoading && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{detailError}</div>
              )}

              {snapshot && !detailLoading && (
                <div className="space-y-6">
                  {snapshot.fetchWarnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs">
                      <strong>Partial data:</strong> {snapshot.fetchWarnings.join(' · ')}
                    </div>
                  )}

                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 space-y-1">
                    <p className="font-semibold text-gray-900">Deletion timeline</p>
                    <p>
                      <span className="text-gray-600">Requested:</span>{' '}
                      <strong>{formatDateTime(snapshot.deletion.requested_at)}</strong>
                    </p>
                    <p>
                      <span className="text-gray-600">Scheduled account removal:</span>{' '}
                      {formatDateTime(snapshot.deletion.scheduled_deletion_at)}
                    </p>
                    {snapshot.deletion.processed_at && (
                      <p>
                        <span className="text-gray-600">Processed (deleted):</span>{' '}
                        <strong>{formatDateTime(snapshot.deletion.processed_at)}</strong>
                      </p>
                    )}
                    <p>
                      <span className="text-gray-600">Status:</span>{' '}
                      <span className="capitalize font-medium">{snapshot.deletion.status}</span>
                    </p>
                    <p>
                      <span className="text-gray-600">Reason:</span> {snapshot.deletion.reason || '—'}
                    </p>
                    <p className="text-xs text-gray-500 pt-1">
                      Activity in this report is limited to on or before the request time (
                      {formatDateTime(snapshot.activityCutoffIso)}).
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 space-y-1">
                    <p className="font-semibold text-gray-900">Profile at audit</p>
                    <p>
                      Name: {snapshot.profile?.full_name || '—'}
                    </p>
                    <p>Email: {snapshot.profile?.email || '—'}</p>
                    <p>Phone: {snapshot.profile?.phone_number || '—'}</p>
                    <p className="text-xs text-gray-500 font-mono break-all">User ID: {snapshot.deletion.user_id}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      ['Transactions', snapshot.transactions.length],
                      ['Withdrawals', snapshot.withdrawals.length],
                      ['Support tickets', snapshot.supportTickets.length],
                      ['Support messages', snapshot.supportMessages.length],
                      ['Referrals (out)', snapshot.referralsAsReferrer.length],
                      ['Referrals (in)', snapshot.referralsAsReferred.length],
                      ['Gift card sales', snapshot.giftCardSales.length],
                      ['Notifications', snapshot.notifications.length],
                      ['Wallets', snapshot.cryptoWallets.length],
                      ['Balance rows', snapshot.walletBalances.length],
                      ['Admin actions', snapshot.adminActionsOnUser.length],
                    ].map(([label, n]) => (
                      <div key={String(label)} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                        <div className="text-gray-500">{label}</div>
                        <div className="text-lg font-semibold text-gray-900">{n}</div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500">
                    Open <strong>Print / Save as PDF</strong> for full tables (transactions, messages, wallets, ledger
                    balances, and admin actions).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
