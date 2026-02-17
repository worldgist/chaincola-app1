"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function DeleteAccountPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
  // avoid synchronous setState in effect
  setTimeout(() => setLoading(false), 0);
  }, [user, router]);

  const handleRequestDeletion = () => {
    const subject = encodeURIComponent('Account Deletion Request');
    const body = encodeURIComponent(`Please delete my account.\n\nUser: ${user?.email || 'unknown'}\nUser ID: ${user?.id || 'unknown'}`);
    window.location.href = `mailto:support@chaincola.com?subject=${subject}&body=${body}`;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Delete Account</h1>
            <p className="text-gray-600">Request permanent deletion of your account.</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <p className="text-gray-700">Deleting your account is permanent and will remove all personal data associated with your account.</p>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-gray-700">I understand that this action is permanent.</span>
            </label>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleRequestDeletion}
                disabled={!confirmed}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Request Account Deletion
              </button>
              <Link href="/profile" className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold text-center hover:bg-gray-200 transition-all">Cancel</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
