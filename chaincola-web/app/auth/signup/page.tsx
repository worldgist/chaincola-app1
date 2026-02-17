'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { validateReferralCode } from '@/lib/referral-service';
import Navbar from '../../components/Navbar';

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [referralStatus, setReferralStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [referralError, setReferralError] = useState<string>('');
  const referralValidationTimeout = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const { signUp, user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      router.push('/');
      router.refresh();
    }
  }, [user, loading, router]);

  // Validate referral code as user types (with debounce)
  useEffect(() => {
    if (formData.referralCode.trim().length === 0) {
      setReferralStatus('idle');
      setReferralError('');
      return;
    }

    // Clear previous timeout
    if (referralValidationTimeout.current) {
      clearTimeout(referralValidationTimeout.current);
    }

    // Set status to validating
    setReferralStatus('idle');
    setReferralError('');

    // Debounce validation
    referralValidationTimeout.current = setTimeout(async () => {
      if (formData.referralCode.trim().length > 0) {
        setValidatingReferral(true);
        const validation = await validateReferralCode(formData.referralCode.trim());
        setValidatingReferral(false);

        if (validation.isValid) {
          setReferralStatus('valid');
          setReferralError('');
        } else {
          setReferralStatus('invalid');
          setReferralError(validation.error || 'Invalid referral code');
        }
      }
    }, 500); // 500ms debounce

    return () => {
      if (referralValidationTimeout.current) {
        clearTimeout(referralValidationTimeout.current);
      }
    };
  }, [formData.referralCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.name.trim()) {
      setError('Please enter your full name');
      setLoading(false);
      return;
    }
    if (!formData.email.trim()) {
      setError('Please enter your email');
      setLoading(false);
      return;
    }
    if (!formData.phone.trim()) {
      setError('Please enter your phone number');
      setLoading(false);
      return;
    }
    if (!formData.password.trim()) {
      setError('Please enter a password');
      setLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Validate referral code if provided
    if (formData.referralCode.trim().length > 0) {
      if (referralStatus === 'invalid') {
        setError(referralError || 'Please enter a valid referral code or leave it empty.');
        setLoading(false);
        return;
      }

      // If still validating, wait a bit
      if (validatingReferral) {
        setError('Please wait, validating referral code...');
        setLoading(false);
        return;
      }

      // Final validation check
      const validation = await validateReferralCode(formData.referralCode.trim());
      if (!validation.isValid) {
        setError(validation.error || 'Please enter a valid referral code or leave it empty.');
        setLoading(false);
        return;
      }
    }

    try {
      const { error: signUpError } = await signUp(formData.email.trim(), formData.password, {
        fullName: formData.name.trim(),
        phoneNumber: formData.phone.trim(),
        referralCode: formData.referralCode.trim() || undefined,
      });

      if (signUpError) {
        let errorMessage = 'Sign up failed. Please try again.';
        
        if (signUpError.message?.includes('User already registered') || 
            signUpError.message?.includes('already registered')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (signUpError.message?.includes('Password') || 
                   signUpError.message?.includes('password')) {
          errorMessage = 'Password does not meet requirements. Please use a stronger password.';
        } else if (signUpError.message?.includes('Invalid referral code')) {
          errorMessage = signUpError.message;
        } else if (signUpError.message) {
          errorMessage = signUpError.message;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Success - show success message and redirect to email verification
      setSuccess(true);
      setTimeout(() => {
        router.push(`/auth/verify-email?flow=signup&email=${encodeURIComponent(formData.email.trim())}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen pt-16 px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-2">
              Create Account
            </h2>
            <p className="text-gray-600">
              Sign up to start using ChainCola
            </p>
          </div>

          <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-xl" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Enter your phone number"
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
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Create a password"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition"
                  placeholder="Confirm your password"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label htmlFor="referralCode" className="block text-sm font-medium text-gray-700">
                    Referral Code
                  </label>
                  <span className="text-xs text-gray-500 italic">(Optional)</span>
                </div>
                <div className="relative">
                  <input
                    id="referralCode"
                    name="referralCode"
                    type="text"
                    maxLength={7}
                    value={formData.referralCode}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      setFormData({ ...formData, referralCode: value });
                    }}
                    className={`w-full px-4 py-3 pr-10 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition ${
                      referralStatus === 'valid' 
                        ? 'border-green-500 border-2' 
                        : referralStatus === 'invalid' 
                        ? 'border-red-500 border-2' 
                        : 'border-gray-300'
                    }`}
                    placeholder="Enter referral code"
                  />
                  {validatingReferral && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                    </div>
                  )}
                  {referralStatus === 'valid' && !validatingReferral && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {referralStatus === 'invalid' && !validatingReferral && formData.referralCode.trim().length > 0 && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
                {referralStatus === 'invalid' && referralError && (
                  <p className="mt-1 text-sm text-red-600">{referralError}</p>
                )}
                {referralStatus === 'valid' && (
                  <p className="mt-1 text-sm text-green-600">Valid referral code</p>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Account created successfully! Please check your email to verify your account.
              </div>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-gradient-purple text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : success ? 'Account Created!' : 'Sign Up'}
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/auth/signin" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign In
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}


