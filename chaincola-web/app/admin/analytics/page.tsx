'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = localStorage.getItem('adminAuthenticated');
    if (auth !== 'true') {
      router.push('/admin/login');
    }
  }, [router]);

  const analyticsData = {
    totalUsers: 125430,
    activeUsers: 98234,
    totalTransactions: 2450000,
    totalRevenue: 145000,
    growthRate: 12.5,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Total Users</div>
            <div className="text-3xl font-bold text-gray-900">{analyticsData.totalUsers.toLocaleString()}</div>
            <div className="text-sm text-green-600 mt-2">+{analyticsData.growthRate}% from last month</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Active Users</div>
            <div className="text-3xl font-bold text-gray-900">{analyticsData.activeUsers.toLocaleString()}</div>
            <div className="text-sm text-green-600 mt-2">+8.2% from last month</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Total Transactions</div>
            <div className="text-3xl font-bold text-gray-900">${(analyticsData.totalTransactions / 1000).toFixed(0)}K</div>
            <div className="text-sm text-green-600 mt-2">+15.3% from last month</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm text-gray-600 mb-2">Total Revenue</div>
            <div className="text-3xl font-bold text-gray-900">${(analyticsData.totalRevenue / 1000).toFixed(0)}K</div>
            <div className="text-sm text-green-600 mt-2">+20.1% from last month</div>
          </div>
        </div>

        {/* Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">User Growth</h2>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">Chart visualization would go here</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction Volume</h2>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">Chart visualization would go here</p>
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Platform Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600 mb-1">Average Transaction Value</div>
              <div className="text-2xl font-bold text-gray-900">$1,245</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Daily Active Users</div>
              <div className="text-2xl font-bold text-gray-900">45,230</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
              <div className="text-2xl font-bold text-gray-900">3.2%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


