'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { transactionsApi } from '@/lib/admin-api';

interface DisplayTransaction {
  id: string;
  user: string;
  type: string;
  amount: string;
  crypto: string;
  status: 'Completed' | 'Pending' | 'Failed' | 'Refunded';
  date: string;
  fee: string;
  originalTx?: any; // Store original transaction data for refund
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<DisplayTransaction[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    revenue: 0,
    pending: 0,
  });
  const [refundingTxId, setRefundingTxId] = useState<string | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [showAllRefundButtons, setShowAllRefundButtons] = useState(false); // Debug mode
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    admin_email?: string;
    target_email?: string;
    action_type: string;
    action_details: Record<string, unknown>;
    created_at: string;
  }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<DisplayTransaction | null>(null);
  const [transactionAuditLogs, setTransactionAuditLogs] = useState<Array<{
    id: string;
    admin_email?: string;
    action_type: string;
    action_details: Record<string, unknown>;
    created_at: string;
  }>>([]);
  const [transactionAuditLoading, setTransactionAuditLoading] = useState(false);

  const fetchTransactions = async (pageNum: number = 1, statusFilter?: string) => {
    setLoading(true);
    try {
      const response = await transactionsApi.getTransactions({
        page: pageNum,
        limit: 50,
        status_filter: statusFilter && statusFilter !== 'all' ? statusFilter.toUpperCase() : undefined,
        search_query: searchQuery || undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      
      // Debug: Log failed transactions count
      if (statusFilter === 'failed' && response.success && response.data) {
        const raw = response.data as { transactions?: unknown[] } | unknown[] | undefined;
        const transactionsArray = Array.isArray(raw) ? raw : raw?.transactions ?? [];
        const failedCount = transactionsArray.filter((tx: any) => 
          (tx.status || '').toLowerCase() === 'failed'
        ).length;
        console.log(`Found ${failedCount} failed transactions`);
      }

      if (response.success && response.data) {
        // Get transactions array - support both old and new structure
        const raw = response.data as { transactions?: unknown[] } | unknown[] | undefined;
        const transactionsArray = Array.isArray(raw) ? raw : raw?.transactions ?? [];
        
        // Transform API transactions to display format
        const displayTransactions: DisplayTransaction[] = transactionsArray.map((tx: any) => {
          const statusMap: Record<string, 'Completed' | 'Pending' | 'Failed' | 'Refunded'> = {
            'completed': 'Completed',
            'pending': 'Pending',
            'failed': 'Failed',
            'refunded': 'Refunded',
            'cancelled': 'Failed',
            'confirming': 'Pending',
            'confirmed': 'Completed',
          };

          const typeMap: Record<string, string> = {
            'buy': 'Buy',
            'sell': 'Sell',
            'send': 'Send',
            'receive': 'Receive',
            'deposit': 'Deposit',
            'withdrawal': 'Withdraw',
            'transfer': 'Transfer',
            'swap': 'Swap',
          };

          const amount = tx.amount || 0;
          const fee = tx.fee || 0;
          // Currency should now be correctly set to NGN for BUY/SELL transactions by the API
          const currency = tx.currency || 'NGN';
          const currencySymbol = currency === 'NGN' ? '₦' : '$';
          
          const userName = tx.user_profile?.full_name || 
                           tx.user_profile?.email || 
                           'Unknown User';

          const date = tx.created_at 
            ? new Date(tx.created_at).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'N/A';

          // Get status from transaction - handle both lowercase and uppercase
          const txStatus = (tx.status || 'pending').toLowerCase();
          const normalizedStatus = statusMap[txStatus] || 'Pending';
          
          // For crypto field, use crypto_currency if available (for BUY/SELL transactions)
          // Otherwise fall back to currency
          const cryptoCurrency = tx.crypto_currency || (currency !== 'NGN' ? currency : undefined);
          
          return {
            id: tx.id,
            user: userName,
            type: typeMap[tx.type?.toLowerCase() || ''] || tx.type || 'Unknown',
            amount: `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            crypto: cryptoCurrency || currency,
            status: normalizedStatus,
            date: date,
            fee: `${currencySymbol}${fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            originalTx: tx, // Store original transaction for refund
          };
        });

        setTransactions(displayTransactions);
        
        // Debug: Log transaction statuses
        console.log('📊 Transactions loaded:', {
          total: displayTransactions.length,
          statuses: displayTransactions.map(t => ({
            id: t.id.substring(0, 8),
            status: t.status,
            originalStatus: t.originalTx?.status,
            type: t.type
          })),
          failedCount: displayTransactions.filter(t => 
            t.status === 'Failed' || t.originalTx?.status?.toLowerCase() === 'failed'
          ).length
        });
        
        // Support both old and new pagination structure
        const pagSource = response.data as { pagination?: { total?: number; pages?: number; page?: number } } | undefined;
        const pagination = pagSource?.pagination || response.pagination;
        setTotal(pagination?.total || response.total || 0);
        setTotalPages(pagination?.pages || response.pages || 1);
        setPage(pagination?.page || response.page || 1);

        // Calculate stats
        const completedTransactions = displayTransactions.filter(t => t.status === 'Completed');
        const revenue = completedTransactions.reduce((sum, t) => {
          const feeValue = parseFloat(t.fee.replace(/[₦$,]/g, ''));
          return sum + feeValue;
        }, 0);
        const pendingCount = displayTransactions.filter(t => t.status === 'Pending').length;

        setStats({
          total: response.total || 0,
          revenue,
          pending: pendingCount,
        });
      } else {
        console.error('Failed to fetch transactions:', response.error);
        alert(response.error || 'Failed to fetch transactions');
      }
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      alert('Error fetching transactions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await transactionsApi.getTransactionStats();
      if (response.success && response.data) {
        const feeRev = response.data.fee_revenue_ngn ?? 0;
        setStats({
          total: response.data.total,
          revenue: feeRev,
          pending: response.data.by_status.pending,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchAuditLogs = async (pageNum: number = 1) => {
    setAuditLoading(true);
    try {
      const response = await transactionsApi.getTransactionAuditLogs({
        page: pageNum,
        limit: 20,
      });
      if (response.success && response.data) {
        setAuditLogs(response.data.logs || []);
        setAuditTotalPages(response.data.pagination?.pages || 1);
        setAuditPage(pageNum);
      }
    } catch (error: unknown) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleViewTransaction = async (transaction: DisplayTransaction) => {
    setSelectedTransaction(transaction);
    setTransactionAuditLoading(true);
    try {
      const response = await transactionsApi.getTransactionAuditLogs({
        page: 1,
        limit: 50,
        transaction_id: transaction.id,
      });
      if (response.success && response.data) {
        setTransactionAuditLogs(response.data.logs || []);
      } else {
        setTransactionAuditLogs([]);
      }
    } catch {
      setTransactionAuditLogs([]);
    } finally {
      setTransactionAuditLoading(false);
    }
  };

  useEffect(() => {
    const auth = localStorage.getItem('adminAuthenticated');
    if (auth !== 'true') {
      router.push('/admin/login');
      return;
    }

    fetchTransactions(page, filter);
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, page, filter]);

  const handleSearch = () => {
    setPage(1);
    fetchTransactions(1, filter);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Failed':
        return 'bg-red-100 text-red-800';
      case 'Refunded':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleRefund = (transactionId: string) => {
    setSelectedTransactionId(transactionId);
    setShowRefundDialog(true);
    setRefundReason('');
  };

  const confirmRefund = async () => {
    if (!selectedTransactionId) return;

    setRefundingTxId(selectedTransactionId);
    try {
      const response = await transactionsApi.refundTransaction(
        selectedTransactionId,
        refundReason || undefined
      );

      if (response.success && response.data) {
        // Show success message with formatted amounts
        const formattedAmount = response.data.refunded_amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 8
        });
        const formattedBalance = response.data.new_balance.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 8
        });
        
        alert(
          `✅ Refund Successful!\n\n` +
          `Refunded: ${formattedAmount} ${response.data.refunded_currency}\n` +
          `User's new balance: ${formattedBalance} ${response.data.refunded_currency}`
        );
        
        setShowRefundDialog(false);
        setSelectedTransactionId(null);
        setRefundReason('');
        // Refresh transactions to show updated status
        await fetchTransactions(page, filter);
      } else {
        alert(`❌ Refund Failed\n\n${response.error || 'Failed to refund transaction'}`);
      }
    } catch (error: any) {
      console.error('Error refunding transaction:', error);
      alert('Error refunding transaction: ' + error.message);
    } finally {
      setRefundingTxId(null);
    }
  };

  const cancelRefund = () => {
    setShowRefundDialog(false);
    setSelectedTransactionId(null);
    setRefundReason('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Transaction Management</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Total Transactions</div>
            {loading ? (
              <div className="text-3xl font-bold text-gray-400">Loading...</div>
            ) : (
              <div className="text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Total Revenue</div>
            {loading ? (
              <div className="text-3xl font-bold text-gray-400">Loading...</div>
            ) : (
              <div className="text-3xl font-bold text-gray-900">₦{stats.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Pending Transactions</div>
            {loading ? (
              <div className="text-3xl font-bold text-gray-400">Loading...</div>
            ) : (
              <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
            )}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex flex-wrap gap-2 flex-1">
              <button
                onClick={() => {
                  setFilter('all');
                  setPage(1);
                  fetchTransactions(1, 'all');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-gradient-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  setFilter('completed');
                  setPage(1);
                  fetchTransactions(1, 'completed');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'completed'
                    ? 'bg-gradient-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Completed
              </button>
              <button
                onClick={() => {
                  setFilter('pending');
                  setPage(1);
                  fetchTransactions(1, 'pending');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'pending'
                    ? 'bg-gradient-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => {
                  setFilter('failed');
                  setPage(1);
                  fetchTransactions(1, 'failed');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'failed'
                    ? 'bg-gradient-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Failed
              </button>
              <button
                onClick={() => {
                  setFilter('refunded');
                  setPage(1);
                  fetchTransactions(1, 'refunded');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'refunded'
                    ? 'bg-gradient-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Refunded
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-gradient-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Search
              </button>
              {/* Audit Log toggle */}
              <button
                onClick={() => {
                  const next = !showAuditLog;
                  setShowAuditLog(next);
                  if (next) fetchAuditLogs(1);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  showAuditLog
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="View admin audit log for transactions"
              >
                {showAuditLog ? '▼ Hide Audit' : '▶ Show Audit'}
              </button>
              {/* Debug toggle - remove after testing */}
              <button
                onClick={() => {
                  setShowAllRefundButtons(!showAllRefundButtons);
                  console.log('Debug mode:', !showAllRefundButtons);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-opacity ${
                  showAllRefundButtons
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="Toggle debug mode to show refund button on all transactions"
              >
                {showAllRefundButtons ? '🔴 Debug ON' : '⚪ Debug OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Audit Log Section */}
        {showAuditLog && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Audit Log</h2>
            <p className="text-sm text-gray-500 mb-4">Admin actions on transactions (refunds, status updates)</p>
            {auditLoading ? (
              <div className="py-8 text-center text-gray-500">Loading audit logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No audit logs found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Target User</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-gray-900">{log.admin_email || log.id?.slice(0, 8)}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.action_type === 'refund' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {log.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">{log.target_email || '-'}</td>
                          <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={JSON.stringify(log.action_details)}>
                            {log.action_details?.transaction_id != null && log.action_details.transaction_id !== ''
                              ? `Tx: ${String(log.action_details.transaction_id).slice(0, 8)}...`
                              : null}
                            {log.action_details?.refund_amount != null
                              ? ` • ${String(log.action_details.refund_amount)} ${String(log.action_details.refund_currency || '')}`
                              : null}
                            {log.action_details?.old_status && log.action_details?.new_status ? (
                              <> • {String(log.action_details.old_status)} → {String(log.action_details.new_status)}</>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditTotalPages > 1 && (
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-sm text-gray-600">Page {auditPage} of {auditTotalPages}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchAuditLogs(auditPage - 1)}
                        disabled={auditPage <= 1}
                        className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => fetchAuditLogs(auditPage + 1)}
                        disabled={auditPage >= auditTotalPages}
                        className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <p className="mt-4 text-gray-600">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No transactions found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">#{transaction.id.substring(0, 8)}...</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{transaction.user}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{transaction.type}</div>
                          <div className="text-xs text-gray-500">{transaction.crypto}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{transaction.amount}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{transaction.fee}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transaction.status)}`}>
                            {transaction.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewTransaction(transaction)}
                              className="text-purple-600 hover:text-purple-900"
                            >
                              View
                            </button>
                            {/* Refund button - simplified condition */}
                            {(() => {
                              const displayStatus = transaction.status || '';
                              const originalStatus = transaction.originalTx?.status || '';
                              
                              // Combine all possible status sources and normalize
                              const allStatuses = [displayStatus, originalStatus]
                                .filter(Boolean)
                                .map(s => s.toString().toLowerCase());
                              
                              const statusStr = allStatuses.join(' ');
                              
                              // Check for refunded status
                              if (statusStr.includes('refund')) {
                                return (
                                  <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg">
                                    Refunded
                                  </span>
                                );
                              }
                              
                              // Check for failed status (more lenient - includes cancelled)
                              if (statusStr.includes('fail') || statusStr.includes('cancel')) {
                                return (
                                  <button
                                    onClick={() => handleRefund(transaction.id)}
                                    disabled={refundingTxId === transaction.id}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                      refundingTxId === transaction.id
                                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                                    title={`Refund transaction (Status: ${displayStatus || originalStatus || 'Unknown'})`}
                                  >
                                    {refundingTxId === transaction.id ? 'Processing...' : 'Refund'}
                                  </button>
                                );
                              }
                              
                              return null;
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {page} of {totalPages} ({total} total transactions)
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const newPage = page - 1;
                        if (newPage >= 1) {
                          setPage(newPage);
                          fetchTransactions(newPage, filter);
                        }
                      }}
                      disabled={page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        const newPage = page + 1;
                        if (newPage <= totalPages) {
                          setPage(newPage);
                          fetchTransactions(newPage, filter);
                        }
                      }}
                      disabled={page === totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Refund Confirmation Dialog */}
      {showRefundDialog && selectedTransactionId && (() => {
        const selectedTx = transactions.find(tx => tx.id === selectedTransactionId);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Refund</h2>
              
              {/* Transaction Details */}
              {selectedTx && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm space-y-1">
                    <div><span className="font-medium">Transaction ID:</span> {selectedTx.id.substring(0, 8)}...</div>
                    <div><span className="font-medium">User:</span> {selectedTx.user}</div>
                    <div><span className="font-medium">Type:</span> {selectedTx.type}</div>
                    <div><span className="font-medium">Amount:</span> {selectedTx.amount}</div>
                    <div><span className="font-medium">Status:</span> {selectedTx.status}</div>
                  </div>
                </div>
              )}
              
              <p className="text-gray-600 mb-4">
                Are you sure you want to refund this failed transaction? The user's balance will be credited automatically based on the transaction type.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refund Reason (Optional)
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund (e.g., Payment gateway error, Network issue, etc.)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none resize-none"
                  rows={3}
                  disabled={refundingTxId !== null}
                />
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelRefund}
                  disabled={refundingTxId !== null}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRefund}
                  disabled={refundingTxId !== null}
                  className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                    refundingTxId !== null
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {refundingTxId !== null ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Processing...
                    </span>
                  ) : (
                    'Confirm Refund'
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Transaction Detail Modal with Audit Log */}
      {selectedTransaction && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">Transaction Details</h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Transaction Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
                <div><span className="font-medium text-gray-600">ID:</span> {selectedTransaction.id}</div>
                <div><span className="font-medium text-gray-600">User:</span> {selectedTransaction.user}</div>
                <div><span className="font-medium text-gray-600">Type:</span> {selectedTransaction.type}</div>
                <div><span className="font-medium text-gray-600">Amount:</span> {selectedTransaction.amount}</div>
                <div><span className="font-medium text-gray-600">Fee:</span> {selectedTransaction.fee}</div>
                <div><span className="font-medium text-gray-600">Status:</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedTransaction.status)}`}>
                    {selectedTransaction.status}
                  </span>
                </div>
                <div><span className="font-medium text-gray-600">Date:</span> {selectedTransaction.date}</div>
              </div>

              {/* Audit Log for this transaction */}
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Audit Trail</h3>
              {transactionAuditLoading ? (
                <div className="py-4 text-center text-gray-500 text-sm">Loading audit log...</div>
              ) : transactionAuditLogs.length === 0 ? (
                <div className="py-4 text-center text-gray-500 text-sm">No audit logs for this transaction</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {transactionAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex justify-between items-start gap-4 p-3 bg-gray-50 rounded text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          log.action_type === 'refund' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {log.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="ml-2 text-gray-600">{log.admin_email}</span>
                        {log.action_details?.refund_amount != null && (
                          <div className="mt-1 text-gray-600">
                            Refunded {String(log.action_details.refund_amount)}{' '}
                            {String(log.action_details.refund_currency || '')}
                          </div>
                        )}
                        {log.action_details?.old_status != null && log.action_details?.new_status != null ? (
                          <div className="mt-1 text-gray-600">
                            Status: {String(log.action_details.old_status)} → {String(log.action_details.new_status)}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


