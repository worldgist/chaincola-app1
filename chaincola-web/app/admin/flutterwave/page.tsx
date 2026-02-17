'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FlutterwaveBalance {
  available_balance: number;
  ledger_balance: number;
  currency: string;
}

interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  charged_amount: number;
  app_fee: number;
  merchant_fee: number;
  status: string;
  payment_type: string;
  created_at: string;
  amount_settled: number;
  customer: {
    id: number;
    name: string;
    phone_number: string;
    email: string;
  };
  meta?: any;
}

interface FlutterwaveTransactionsData {
  transactions: FlutterwaveTransaction[];
  page_info: {
    total: number;
    current_page: number;
    total_pages: number;
  };
}

export default function FlutterwaveManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<FlutterwaveBalance | null>(null);
  const [transactions, setTransactions] = useState<FlutterwaveTransaction[]>([]);
  const [pageInfo, setPageInfo] = useState({
    total: 0,
    current_page: 1,
    total_pages: 1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    status: '',
    from: '',
    to: '',
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<number>>(new Set());
  const [selectedTransaction, setSelectedTransaction] = useState<FlutterwaveTransaction | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  // Fetch Flutterwave data
  const fetchFlutterwaveData = async (page: number = 1, filterParams?: typeof filters) => {
    try {
      setLoading(true);
      
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/admin/login');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl) {
        console.error('NEXT_PUBLIC_SUPABASE_URL is not configured');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const functionUrl = `${supabaseUrl}/functions/v1/flutterwave-management`;

      // Fetch balance
      const balanceResponse = await fetch(`${functionUrl}?action=balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      if (balanceResponse.ok) {
        const balanceResult = await balanceResponse.json();
        if (balanceResult.success && balanceResult.data) {
          // Ensure balance values are numbers
          const balanceData = {
            ...balanceResult.data,
            available_balance: parseFloat(String(balanceResult.data.available_balance || 0)) || 0,
            ledger_balance: parseFloat(String(balanceResult.data.ledger_balance || 0)) || 0,
            currency: balanceResult.data.currency || 'NGN',
          };
          setBalance(balanceData);
        } else if (balanceResult.error) {
          console.warn('Balance fetch returned error:', balanceResult.error);
          setError(`Balance: ${balanceResult.error}${balanceResult.details ? ` - ${balanceResult.details}` : ''}`);
          // Set default balance if error
          setBalance({
            available_balance: 0,
            ledger_balance: 0,
            currency: 'NGN',
            error: balanceResult.error,
          });
        } else {
          console.warn('Balance fetch returned unexpected format:', balanceResult);
        }
      } else {
        const errorText = await balanceResponse.text().catch(() => 'Unknown error');
        console.error('Balance fetch failed:', balanceResponse.status, errorText);
        setError(`Failed to fetch balance (${balanceResponse.status})`);
      }

      // Fetch transactions
      let transactionsUrl = `${functionUrl}?action=transactions&page=${page}&per_page=50`;
      if (filters.status) {
        transactionsUrl += `&status=${filters.status}`;
      }
      if (filters.from) {
        transactionsUrl += `&from=${filters.from}`;
      }
      if (filters.to) {
        transactionsUrl += `&to=${filters.to}`;
      }

      const transactionsResponse = await fetch(transactionsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      if (transactionsResponse.ok) {
        const transactionsResult = await transactionsResponse.json();
        if (transactionsResult.success && transactionsResult.data) {
          setTransactions(transactionsResult.data.transactions || []);
          setPageInfo(transactionsResult.data.page_info || {
            total: 0,
            current_page: parseInt(String(page)),
            total_pages: 1,
          });
          setError(null); // Clear any previous errors
        } else {
          const errorMsg = transactionsResult.error || 'Failed to fetch transactions';
          console.warn('Transactions fetch returned error:', errorMsg);
          setError(`Transactions: ${errorMsg}`);
          setTransactions([]);
        }
      } else {
        const errorText = await transactionsResponse.text().catch(() => 'Unknown error');
        console.error('Transactions fetch failed:', transactionsResponse.status, errorText);
        setError(`Failed to fetch transactions (${transactionsResponse.status})`);
        setTransactions([]);
      }
    } catch (error: any) {
      console.error('Error fetching Flutterwave data:', error);
      if (error.message?.includes('Failed to fetch')) {
        console.error('Network error - check if Edge Function is deployed and accessible');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFlutterwaveData(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFlutterwaveData(currentPage);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setCurrentPage(1);
    fetchFlutterwaveData(1, filters);
  };

  const formatCurrency = (amount: number | string | null | undefined, currency: string = 'NGN') => {
    // Handle null, undefined, or invalid values
    if (amount === null || amount === undefined || amount === '') {
      return '₦0.00';
    }
    
    // Convert to number if it's a string
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    // Check if it's a valid number
    if (isNaN(numAmount) || !isFinite(numAmount)) {
      return '₦0.00';
    }
    
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numAmount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'successful':
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'fail':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const toggleTransactionExpansion = (txId: number) => {
    setExpandedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(txId)) {
        newSet.delete(txId);
      } else {
        newSet.add(txId);
      }
      return newSet;
    });
  };

  const openTransactionModal = (tx: FlutterwaveTransaction) => {
    setSelectedTransaction(tx);
    setShowTransactionModal(true);
  };

  const closeTransactionModal = () => {
    setSelectedTransaction(null);
    setShowTransactionModal(false);
  };

  const exportTransactions = () => {
    if (transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    const csvHeaders = [
      'Transaction Ref',
      'Flutterwave Ref',
      'Customer Name',
      'Customer Email',
      'Amount',
      'Currency',
      'Charged Amount',
      'App Fee',
      'Merchant Fee',
      'Amount Settled',
      'Status',
      'Payment Type',
      'Created At'
    ];

    const csvRows = transactions.map(tx => [
      tx.tx_ref || '',
      tx.flw_ref || '',
      tx.customer?.name || '',
      tx.customer?.email || '',
      tx.amount || 0,
      tx.currency || 'NGN',
      tx.charged_amount || 0,
      tx.app_fee || 0,
      tx.merchant_fee || 0,
      tx.amount_settled || 0,
      tx.status || '',
      tx.payment_type || '',
      tx.created_at || ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `flutterwave-transactions-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate incoming and outgoing amounts
  const calculateTransactionTotals = () => {
    const currency = transactions.length > 0 ? transactions[0].currency : 'NGN';
    
    // Amount In: Successful transactions (money coming into Flutterwave account)
    const amountIn = transactions
      .filter(tx => {
        const status = (tx.status || '').toLowerCase();
        return status === 'successful' || status === 'success';
      })
      .reduce((sum, tx) => {
        // Use amount_settled if available, otherwise use amount
        const amount = tx.amount_settled || tx.amount || 0;
        return sum + (typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0);
      }, 0);

    // Amount Out: Transfers/withdrawals (money going out of Flutterwave account)
    // Check for transfer types or negative amounts
    const amountOut = transactions
      .filter(tx => {
        const paymentType = (tx.payment_type || '').toLowerCase();
        const status = (tx.status || '').toLowerCase();
        // Consider transfers, withdrawals, or bank transfers as outgoing
        return (
          paymentType.includes('transfer') ||
          paymentType.includes('withdrawal') ||
          paymentType.includes('bank') ||
          (status === 'successful' && (tx.amount || 0) < 0) // Negative amounts indicate outgoing
        );
      })
      .reduce((sum, tx) => {
        // Use absolute value for outgoing amounts
        const amount = Math.abs(tx.amount_settled || tx.amount || 0);
        return sum + (typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0);
      }, 0);

    return { amountIn, amountOut, currency };
  };

  const { amountIn, amountOut, currency: summaryCurrency } = calculateTransactionTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Flutterwave Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Monitor account balances and transaction activities
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-yellow-800">{error}</p>
            </div>
          </div>
        )}
        {loading && !refreshing ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <>
            {/* Account Balances */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Balances</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Available Balance */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Available Balance</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {balance ? formatCurrency(balance.available_balance, balance.currency) : 'Loading...'}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Ledger Balance */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Ledger Balance</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {balance ? formatCurrency(balance.ledger_balance, balance.currency) : 'Loading...'}
                      </p>
                      {balance?.note && (
                        <p className="mt-1 text-xs text-gray-500">{balance.note}</p>
                      )}
                      {balance?.error && (
                        <p className="mt-1 text-xs text-red-500">{balance.error}</p>
                      )}
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Flow Summary */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Transaction Flow</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Amount In */}
                <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Amount In</p>
                      <p className="mt-2 text-3xl font-bold text-green-600">
                        {formatCurrency(amountIn, summaryCurrency)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Total successful transactions
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Amount Out */}
                <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Amount Out</p>
                      <p className="mt-2 text-3xl font-bold text-red-600">
                        {formatCurrency(amountOut, summaryCurrency)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Total transfers & withdrawals
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Activities */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Transaction Activities</h2>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-500">
                    Total: {pageInfo.total} transactions
                  </div>
                  {transactions.length > 0 && (
                    <button
                      onClick={exportTransactions}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">All Status</option>
                      <option value="successful">Successful</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => handleFilterChange('from', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => handleFilterChange('to', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={applyFilters}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transaction Ref
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fees
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            No transactions found
                          </td>
                        </tr>
                      ) : (
                        transactions.map((tx) => (
                          <>
                            <tr 
                              key={tx.id} 
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleTransactionExpansion(tx.id)}
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTransactionExpansion(tx.id);
                                    }}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    {expandedTransactions.has(tx.id) ? (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                  </button>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{tx.tx_ref}</div>
                                    <div className="text-xs text-gray-500">{tx.flw_ref}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{tx.customer?.name || 'N/A'}</div>
                                <div className="text-xs text-gray-500">{tx.customer?.email || 'N/A'}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {formatCurrency(tx.amount, tx.currency)}
                                </div>
                                {tx.amount_settled && tx.amount_settled !== tx.amount && (
                                  <div className="text-xs text-gray-500">
                                    Settled: {formatCurrency(tx.amount_settled, tx.currency)}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  App: {formatCurrency(tx.app_fee, tx.currency)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Merchant: {formatCurrency(tx.merchant_fee, tx.currency)}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(tx.status)}`}>
                                  {tx.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {tx.payment_type || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {formatDate(tx.created_at)}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTransactionModal(tx);
                                  }}
                                  className="mt-1 text-xs text-purple-600 hover:text-purple-800"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                            {expandedTransactions.has(tx.id) && (
                              <tr key={`${tx.id}-expanded`} className="bg-gray-50">
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <p className="text-gray-500 font-medium">Transaction ID</p>
                                      <p className="text-gray-900">{tx.id}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500 font-medium">Charged Amount</p>
                                      <p className="text-gray-900">{formatCurrency(tx.charged_amount, tx.currency)}</p>
                                    </div>
                                    {tx.customer?.phone_number && (
                                      <div>
                                        <p className="text-gray-500 font-medium">Phone</p>
                                        <p className="text-gray-900">{tx.customer.phone_number}</p>
                                      </div>
                                    )}
                                    {tx.meta && typeof tx.meta === 'object' && (
                                      <div>
                                        <p className="text-gray-500 font-medium">Metadata</p>
                                        <p className="text-gray-900 text-xs break-all">
                                          {JSON.stringify(tx.meta, null, 2).substring(0, 100)}...
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pageInfo.total_pages > 1 && (
                  <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                    <div className="text-sm text-gray-700">
                      Showing page {pageInfo.current_page} of {pageInfo.total_pages}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(pageInfo.total_pages, prev + 1))}
                        disabled={currentPage >= pageInfo.total_pages}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction Details Modal */}
      {showTransactionModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Transaction Details</h3>
              <button
                onClick={closeTransactionModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-gray-500">Transaction Reference</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedTransaction.tx_ref}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Flutterwave Reference</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedTransaction.flw_ref}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Transaction ID</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedTransaction.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Status</dt>
                      <dd>
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(selectedTransaction.status)}`}>
                          {selectedTransaction.status}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Payment Type</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedTransaction.payment_type || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Created At</dt>
                      <dd className="text-sm font-medium text-gray-900">{formatDate(selectedTransaction.created_at)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Amount Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Amount Information</h4>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-gray-500">Amount</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {formatCurrency(selectedTransaction.amount, selectedTransaction.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Charged Amount</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {formatCurrency(selectedTransaction.charged_amount, selectedTransaction.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Amount Settled</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {formatCurrency(selectedTransaction.amount_settled, selectedTransaction.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">App Fee</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {formatCurrency(selectedTransaction.app_fee, selectedTransaction.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Merchant Fee</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {formatCurrency(selectedTransaction.merchant_fee, selectedTransaction.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Currency</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedTransaction.currency}</dd>
                    </div>
                  </dl>
                </div>

                {/* Customer Information */}
                {selectedTransaction.customer && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Customer Information</h4>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-sm text-gray-500">Name</dt>
                        <dd className="text-sm font-medium text-gray-900">{selectedTransaction.customer.name || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Email</dt>
                        <dd className="text-sm font-medium text-gray-900">{selectedTransaction.customer.email || 'N/A'}</dd>
                      </div>
                      {selectedTransaction.customer.phone_number && (
                        <div>
                          <dt className="text-sm text-gray-500">Phone</dt>
                          <dd className="text-sm font-medium text-gray-900">{selectedTransaction.customer.phone_number}</dd>
                        </div>
                      )}
                      {selectedTransaction.customer.id && (
                        <div>
                          <dt className="text-sm text-gray-500">Customer ID</dt>
                          <dd className="text-sm font-medium text-gray-900">{selectedTransaction.customer.id}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {/* Metadata */}
                {selectedTransaction.meta && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Metadata</h4>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64">
                      {JSON.stringify(selectedTransaction.meta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={closeTransactionModal}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
