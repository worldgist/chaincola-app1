'use client';

import Link from 'next/link';
import Navbar from '../../components/Navbar';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms and Conditions</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 prose max-w-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 mb-6">
              By accessing and using ChainCola, you accept and agree to be bound by the terms and provision of this agreement.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Use License</h2>
            <p className="text-gray-700 mb-6">
              Permission is granted to temporarily use ChainCola for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
            <p className="text-gray-700 mb-6">
              You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Cryptocurrency Transactions</h2>
            <p className="text-gray-700 mb-6">
              All cryptocurrency transactions are final and irreversible. ChainCola is not responsible for any losses resulting from user error, including but not limited to sending to incorrect addresses.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Fees</h2>
            <p className="text-gray-700 mb-6">
              ChainCola charges fees for certain services. All fees are clearly displayed before you complete a transaction. By completing a transaction, you agree to pay the applicable fees.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Limitation of Liability</h2>
            <p className="text-gray-700 mb-6">
              In no event shall ChainCola or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use ChainCola.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Changes to Terms</h2>
            <p className="text-gray-700 mb-6">
              ChainCola reserves the right to revise these terms at any time without notice. By using this service you are agreeing to be bound by the then current version of these Terms and Conditions.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
