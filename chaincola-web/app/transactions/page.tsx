'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getUserTransactions, TransactionListItem } from '@/lib/transaction-service';
import Navbar from '../components/Navbar';
import BottomActionBar from '../components/BottomActionBar';
import BottomTabBar from '../components/BottomTabBar';

export default function TransactionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    fetchTransactions();
  }, [user, router]);

  const fetchTransactions = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const { transactions: fetchedTransactions, error: fetchError } = await getUserTransactions(user.id, 100);

      if (fetchError) {
        setError('Failed to load transactions. Please try again.');
        setTransactions([]);
      } else {
        setTransactions(fetchedTransactions);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching transactions:', msg);
      setError('An error occurred. Please try again.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    const isIncoming = type === 'buy' || type === 'fund' || type === 'receive';
    return isIncoming ? (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ) : (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    );
  };

  const getTransactionTypeLabel = (type: string, crypto: string, bankName?: string) => {
    const labels: Record<string, string> = {
      buy: 'Bought',
      sell: 'Sold',
      fund: 'Funded Wallet',
      'withdraw-bank': 'Withdraw to Bank',
      send: 'Sent',
      receive: 'Received',
      withdraw: 'Withdrawn from Wallet',
    };
    
    const label = labels[type] || 'Transaction';
    if (type !== 'fund' && type !== 'withdraw' && type !== 'withdraw-bank') {
      return `${label} ${crypto}`;
    }
    if (type === 'withdraw-bank' && bankName) {
      return `${label} - ${bankName}`;
    }
    return label;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading transactions...</p>
          </div>
        </div>
        <BottomActionBar
          actions={[
            { href: '/send-crypto', label: 'Send', variant: 'primary' },
            { href: '/receive-crypto', label: 'Receive', variant: 'secondary' },
          ]}
        />
        <BottomTabBar current="transactions" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Transactions</h1>
            <p className="text-gray-600">Your transaction history</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
              <button
                onClick={fetchTransactions}
                className="ml-auto bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {!error && transactions.length === 0 && (
            <div className="bg-white p-12 rounded-xl border border-gray-200 text-center">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Transactions Yet</h3>
              <p className="text-gray-600">
                Your transaction history will appear here once you start trading or funding your wallet.
              </p>
            </div>
          )}

          {!error && transactions.length > 0 && (
            <div className="space-y-4">
              {transactions.map((transaction) => {
                const isIncoming = transaction.type === 'buy' || transaction.type === 'fund' || transaction.type === 'receive';
                return (
                  <Link
                    key={transaction.id}
                    href={`/transaction-detail?id=${transaction.id}`}
                    className="block bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isIncoming ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {getTransactionIcon(transaction.type)}
                        </div>
                        {transaction.logo && (
                          <div className="relative w-10 h-10">
                            <Image
                              src={transaction.logo}
                              alt={transaction.crypto}
                              fill
                              className="object-contain"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">
                            {getTransactionTypeLabel(transaction.type, transaction.crypto, transaction.bankName)}
                          </p>
                          <p className="text-sm text-gray-600">{transaction.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${isIncoming ? 'text-green-600' : 'text-red-600'}`}>
                          {isIncoming ? '+' : '-'}{transaction.amount} {transaction.symbol}
                        </p>
                        <p className="text-sm font-bold text-gray-900">{transaction.total}</p>
                        {transaction.status === 'pending' && (
                          <span className="inline-block mt-1 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                            Pending
                          </span>
                        )}
                        {transaction.status === 'failed' && (
                          <span className="inline-block mt-1 bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                            Failed
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}










