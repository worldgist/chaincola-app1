'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserVerificationStatus } from '@/lib/verification-service';
import { createClient } from '@/lib/supabase/client';
import Navbar from '../../components/Navbar';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { signIn, user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      router.push('/');
      router.refresh();
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!email.trim()) {
      setError('Please enter your email');
      setLoading(false);
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      setLoading(false);
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await signIn(email.trim(), password);

      if (signInError) {
        let errorMessage = 'Sign in failed. Please try again.';
        
        // Handle specific error cases
        if (signInError.message?.includes('Email not confirmed') || 
            signInError.message?.includes('email not confirmed') ||
            signInError.message?.includes('Email not verified')) {
          // Redirect to email verification page
          router.push(`/auth/verify-email?flow=signup&email=${encodeURIComponent(email.trim())}&autoResend=true`);
          return;
        }
        
        // Handle network errors
        if (signInError.message?.includes('Network request failed') || 
            signInError.message?.includes('Network connection failed') ||
            signInError.message?.includes('Failed to fetch') ||
            signInError.name === 'AuthRetryableFetchError' ||
            signInError.message?.includes('timeout')) {
          errorMessage = 'Network connection failed. Please check your internet connection and try again.';
        } else if (signInError.message?.includes('Invalid login credentials') || 
                   signInError.message?.includes('Invalid login') ||
                   signInError.status === 400 ||
                   signInError.name === 'AuthApiError') {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        } else if (signInError.message) {
          errorMessage = signInError.message;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Success - check verification status before redirecting
      try {
        // Wait a moment for user to be set in context
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get user ID from auth context or session
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user?.id) {
          const verificationStatus = await getUserVerificationStatus(session.user.id);
          
          // If user is not verified, redirect to verification page
          if (verificationStatus !== 'approved') {
            router.push('/profile/verify?prompt=true');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking verification status:', error);
        // Continue to home even if check fails
      }

      // User is verified or check failed - redirect to home
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen pt-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-2">
              Welcome Back
            </h2>
            <p className="text-gray-600">
              Sign in to continue to ChainCola
            </p>
          </div>

          <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-xl" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>

              <Link href="/auth/forgot-password" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                Forgot Password?
              </Link>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-purple text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link href="/auth/signup" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign Up
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}


