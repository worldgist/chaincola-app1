'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, UserProfile } from '@/lib/user-service';
import { getWalletBalances, formatBalance } from '@/lib/wallet-service';
import { getUserCryptoBalances } from '@/lib/crypto-price-service';
import { getUserVerificationStatus } from '@/lib/verification-service';
import VerificationGuard from '@/components/VerificationGuard';
import Navbar from '../components/Navbar';
import BottomTabBar from '../components/BottomTabBar';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [nairaBalance, setNairaBalance] = useState('0.00');
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    // Check verification status
    const checkVerification = async () => {
      try {
        const status = await getUserVerificationStatus(user.id);
        if (status !== 'approved') {
          // Redirect to verification page with prompt
          router.push('/profile/verify?prompt=true');
          return;
        }
      } catch (error) {
        console.error('Error checking verification:', error);
      }
      
      // If verified, fetch user data
      fetchUserData();
    };
    
    checkVerification();
  }, [user, router]);

  // Helper function to add timeout to promises
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  };

  // Safety timeout: Always stop loading after 5 seconds to prevent infinite loading
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⚠️ Safety timeout: Forcing loading to false after 5 seconds');
        setLoading(false);
      }
    }, 5000);

    return () => clearTimeout(safetyTimeout);
  }, [loading]);

  const fetchBalances = async () => {
    if (!user?.id) return;
    
    setBalanceLoading(true);
    try {
      // Add timeout to prevent hanging (3 seconds - increased from 2s for slow networks)
      const walletBalances = await withTimeout(
        getWalletBalances(user.id),
        3000,
        'getWalletBalances'
      );
      setNairaBalance(formatBalance(walletBalances.ngn, 'NGN'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('timeout')) {
        console.warn('Could not fetch wallet balances (using defaults):', msg);
      } else {
        console.error('Error fetching balances:', msg);
      }
      setNairaBalance('0.00');
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchUserData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch profile with timeout (3 seconds)
      try {
        const profile = await withTimeout(
          getUserProfile(user.id),
          3000,
          'getUserProfile'
        );
        if (profile) {
          setUserProfile(profile);
        }
      } catch (profileError: unknown) {
        const msg = profileError instanceof Error ? profileError.message : String(profileError);
        if (msg.includes('timeout')) {
          console.warn('Could not fetch user profile (continuing):', msg);
        } else {
          console.error('Error fetching user profile:', msg);
        }
        // Continue even if profile fetch fails
      }

      // Fetch balances - it has its own timeout handling, so just call it directly
      // Don't wrap in another timeout to avoid double-wrapping
      await fetchBalances();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching user data:', msg);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = () => {
    if (userProfile?.name || userProfile?.full_name) {
      const fullName = (userProfile.name || userProfile.full_name || '').trim();
      if (fullName) return fullName.split(' ')[0];
    }
    if (user?.metadata?.full_name || user?.metadata?.name) {
      const fullName = (user.metadata.full_name || user.metadata.name || '').trim();
      if (fullName) return fullName.split(' ')[0];
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User';
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
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {getUserName()}!</h1>
              <p className="text-gray-600">Your wallet balance</p>
            </div>
            <div className="ml-4">
              <button
                aria-label="Notifications"
                className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>
          </div>

          {/* Balance Card */}
          <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-8 mb-8 shadow-xl">
            <div className="mb-6">
              <p className="text-purple-200 text-sm font-medium mb-2">NGN Balance</p>
              {balanceLoading ? (
                <div className="animate-pulse h-10 bg-purple-500 rounded w-48"></div>
              ) : (
                <h2 className="text-4xl font-bold text-white">₦{nairaBalance}</h2>
              )}
            </div>

            <div className="flex gap-4 mt-4">
              <Link
                href="/fund-wallet"
                className="flex-1 bg-white text-purple-600 px-6 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors text-center"
              >
                Fund Wallet
              </Link>
              <Link
                href="/withdraw"
                className="flex-1 bg-transparent border-2 border-white/70 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors text-center"
              >
                Withdraw
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-3 gap-4">
              <Link href="/send-crypto" className="bg-white p-4 rounded-xl border border-gray-100 hover:shadow-md transition-all text-center">
                <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                </div>
                <p className="font-medium text-gray-900">Send</p>
              </Link>

              <Link href="/receive-crypto" className="bg-white p-4 rounded-xl border border-gray-100 hover:shadow-md transition-all text-center">
                <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m0 0l-4-4m4 4l4-4" />
                    </svg>
                  </div>
                </div>
                <p className="font-medium text-gray-900">Receive</p>
              </Link>

              <Link href="/all-services" className="bg-white p-4 rounded-xl border border-gray-100 hover:shadow-md transition-all text-center">
                <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                </div>
                <p className="font-medium text-gray-900">All Services</p>
              </Link>
            </div>
          </div>
            {/* Spacer for bottom nav / safe area on mobile */}
            <div className="h-24" />

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/assets"
              className="bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <h4 className="font-semibold text-gray-900 mb-2">Assets</h4>
              <p className="text-sm text-gray-600">View your cryptocurrency assets</p>
            </Link>

            <Link
              href="/transactions"
              className="bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <h4 className="font-semibold text-gray-900 mb-2">Transactions</h4>
              <p className="text-sm text-gray-600">View your transaction history</p>
            </Link>
          </div>
        </div>
      </div>
        <BottomTabBar current="home" />
    </main>
  );
}










