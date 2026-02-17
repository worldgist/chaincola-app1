'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserReferralCode, generateReferralCode, getReferralStats, getRecentReferrals } from '@/lib/referral-service';
import Navbar from '../../components/Navbar';

export default function ReferralPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    totalEarnings: 0,
    totalRewards: 0,
  });
  const [recentReferrals, setRecentReferrals] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    fetchReferralData();
  }, [user, router]);

  const fetchReferralData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get or generate referral code
      const { code: existingCode, error: codeError } = await getUserReferralCode(user.id);
      
      let code = existingCode;
      
      if (!code && !codeError) {
        const { code: newCode, error: generateError } = await generateReferralCode(user.id);
        if (newCode && !generateError) {
          code = newCode;
        }
      }

      if (code) {
        setReferralCode(code);
        setReferralLink(`${window.location.origin}/auth/signup?ref=${code}`);
      }

      // Fetch stats
      const referralStats = await getReferralStats(user.id);
      if (!referralStats.error) {
        setStats({
          totalReferrals: referralStats.totalReferrals,
          activeReferrals: referralStats.totalReferrals - referralStats.pendingReferrals,
          totalEarnings: referralStats.totalEarnings,
          totalRewards: referralStats.paidEarnings,
        });
      }

      // Fetch recent referrals
      const { referrals, error: referralsError } = await getRecentReferrals(user.id);
      if (referrals && !referralsError) {
        setRecentReferrals(referrals);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching referral data:', msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shareReferralLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join ChainCola',
          text: 'Sign up with my referral code and get rewards!',
          url: referralLink,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      copyToClipboard(referralLink);
    }
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
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Referral Program</h1>
            <p className="text-gray-600">Invite friends and earn rewards</p>
          </div>

          {/* Referral Code Card */}
          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-8 mb-8 text-white">
            <h2 className="text-xl font-semibold mb-4">Your Referral Code</h2>
            {referralCode ? (
              <div className="space-y-4">
                <div className="bg-white/20 rounded-lg p-4 flex items-center justify-between">
                  <span className="text-2xl font-bold">{referralCode}</span>
                  <button
                    onClick={() => copyToClipboard(referralCode)}
                    className="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-white/20 rounded-lg p-4">
                  <p className="text-sm mb-2">Referral Link</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={referralLink}
                      readOnly
                      className="flex-1 bg-white/30 text-white px-3 py-2 rounded border border-white/30"
                    />
                    <button
                      onClick={shareReferralLink}
                      className="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-purple-200">Generating your referral code...</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <p className="text-sm text-gray-600 mb-2">Total Referrals</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <p className="text-sm text-gray-600 mb-2">Active Referrals</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeReferrals}</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <p className="text-sm text-gray-600 mb-2">Total Earnings</p>
              <p className="text-2xl font-bold text-purple-600">₦{stats.totalEarnings.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <p className="text-sm text-gray-600 mb-2">Total Rewards</p>
              <p className="text-2xl font-bold text-green-600">₦{stats.totalRewards.toLocaleString()}</p>
            </div>
          </div>

          {/* Recent Referrals */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Referrals</h3>
            {recentReferrals.length > 0 ? (
              <div className="space-y-3">
                {recentReferrals.map((referral) => (
                  <div key={referral.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Referral #{referral.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(referral.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">₦{referral.reward_amount?.toLocaleString() || '0'}</p>
                      <p className={`text-xs ${
                        referral.reward_status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {referral.reward_status || 'pending'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No referrals yet. Start sharing your code!</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
