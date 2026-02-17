'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, updateUserProfile, UserProfile } from '@/lib/user-service';
import Navbar from '../../components/Navbar';

export default function EditProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    fetchUserData();
  }, [user, router]);

  const fetchUserData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const profile = await getUserProfile(user.id);
      
      if (profile) {
        setFullName(profile.name || profile.full_name || '');
        setEmail(profile.email || user.email || '');
        setPhoneNumber(profile.phone || profile.phone_number || '');
        setAddress(profile.address || '');
      } else {
        setFullName(user.metadata?.full_name || user.metadata?.name || '');
        setEmail(user.email || '');
        setPhoneNumber(user.metadata?.phone_number || user.metadata?.phone || '');
        setAddress(user.metadata?.address || '');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching user data:', msg);
      setFullName(user?.metadata?.full_name || user?.metadata?.name || '');
      setEmail(user?.email || '');
      setPhoneNumber(user?.metadata?.phone_number || user?.metadata?.phone || '');
      setAddress(user?.metadata?.address || '');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      setError('User not found. Please sign in again.');
      return;
    }

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateUserProfile(user.id, {
        name: fullName.trim(),
        full_name: fullName.trim(),
        phone: phoneNumber.trim() || undefined,
        phone_number: phoneNumber.trim() || undefined,
        address: address.trim() || undefined,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to update profile');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/profile');
      }, 1500);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setError(msg || 'Failed to update profile');
    } finally {
      setSaving(false);
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
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Profile</h1>
            <p className="text-gray-600">Update your personal information</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Profile updated successfully! Redirecting...
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                placeholder="Enter your full name"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder="your@email.com"
              />
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            </div>

            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                placeholder="Enter your phone number"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition resize-none"
                placeholder="Enter your address"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={handleSave}
                disabled={saving || success}
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : success ? 'Saved!' : 'Save Changes'}
              </button>
              <Link
                href="/profile"
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
