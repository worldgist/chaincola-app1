'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Sign in with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        setError(authError.message || 'Invalid email or password');
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Authentication failed. Please try again.');
        setLoading(false);
        return;
      }

      // First, ensure admin profile exists using RPC function (bypasses RLS)
      // This is safer than querying first and handles the case where profile doesn't exist
      console.log('Ensuring admin profile exists via RPC...');
      const { data: grantResult, error: grantError } = await supabase.rpc('grant_admin_access', {
        user_email: authData.user.email || email.trim()
      });

      console.log('RPC grant_admin_access result:', { grantResult, grantError });

      // Wait a moment for database to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now fetch the profile
      let { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_admin, role, email, full_name')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      // Log for debugging
      console.log('Profile fetch result:', { 
        profile, 
        profileError, 
        hasError: !!profileError,
        errorKeys: profileError ? Object.keys(profileError) : [],
        errorString: profileError ? JSON.stringify(profileError) : 'no error',
        userId: authData.user.id 
      });

      // If profile doesn't exist (PGRST116 = no rows returned) or profile is null
      // RPC was already called at the start, so just retry fetching
      if ((profileError && profileError.code === 'PGRST116') || !profile) {
        // RPC was already called, wait a bit more and retry
        console.log('Profile not found after RPC, retrying fetch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: retryProfile, error: retryError } = await supabase
          .from('user_profiles')
          .select('is_admin, role, email, full_name')
          .eq('user_id', authData.user.id)
          .maybeSingle();

        console.log('Retry profile fetch:', { retryProfile, retryError });

        if (retryProfile) {
          profile = retryProfile;
        } else if (retryError && retryError.code !== 'PGRST116') {
          // Real error occurred
          console.error('Error on retry:', retryError);
          setError(`Error: ${retryError.message || "Failed to verify admin profile. Please run: SELECT public.grant_admin_access('chaincolawallet@gmail.com'); in Supabase SQL Editor."}`);
          await supabase.auth.signOut();
          setLoading(false);
          return;
        } else {
          // Still no profile - RPC might have failed
          console.error('Profile still not found after RPC and retry');
          if (grantError) {
            setError(`RPC failed: ${grantError.message || "Unknown error"}. Please run: SELECT public.grant_admin_access('chaincolawallet@gmail.com'); in Supabase SQL Editor.`);
          } else {
            setError('Admin profile could not be created. Please run: SELECT public.grant_admin_access(\'chaincolawallet@gmail.com\'); in Supabase SQL Editor.');
          }
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      } else if (profileError && profileError.code && profileError.code !== 'PGRST116') {
        // Other error occurred (not "not found" error)
        console.error('Error fetching profile:', profileError);
        console.log('Error details:', JSON.stringify(profileError, null, 2));
        setError(`Error checking admin privileges: ${profileError.message || 'Unknown error'}. Please try again or contact administrator.`);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // If profile exists but doesn't have admin privileges, grant them
      if (profile && (!profile.is_admin && profile.role !== 'admin')) {
        // Try to grant admin access using the function
        const { error: grantError } = await supabase.rpc('grant_admin_access', {
          user_email: authData.user.email || email.trim()
        });

        if (grantError) {
          // If RPC fails, try direct update
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              is_admin: true,
              role: 'admin',
            })
            .eq('user_id', authData.user.id);

          if (updateError) {
            console.error('Error granting admin access:', updateError);
            setError('Failed to grant admin privileges. Please contact administrator.');
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }
        }

        // Refresh profile after granting admin access
        const { data: updatedProfile } = await supabase
          .from('user_profiles')
          .select('is_admin, role')
          .eq('user_id', authData.user.id)
          .single();

        if (updatedProfile) {
          profile = updatedProfile;
        }
      }

      // Final check: ensure user has admin privileges
      if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
        setError('Access denied. Admin privileges required.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Store admin authentication in localStorage
      localStorage.setItem('adminAuthenticated', 'true');
      localStorage.setItem('adminUserId', authData.user.id);
      localStorage.setItem('adminEmail', email.trim());

      // Redirect to dashboard
      router.push('/admin/dashboard');
      router.refresh();
    } catch (err: any) {
      console.error('Admin login error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-50 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ChainCola Admin</h1>
            <p className="text-gray-600">Sign in to access the admin dashboard</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                placeholder="admin@chaincola.com"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-purple-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Forgot your password? Contact system administrator
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            🔒 Secure admin access only. Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}

