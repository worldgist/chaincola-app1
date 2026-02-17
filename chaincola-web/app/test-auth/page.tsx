'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TestAuthPage() {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError(error.message);
      } else {
        setUser(null);
        setSession(null);
        router.push('/auth/signin');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Supabase Authentication Test
            </h1>
            <p className="text-gray-600">
              Test page to verify Supabase authentication is working
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
              {user ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium text-green-700">Authenticated</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div>
                      <strong className="text-gray-700">User ID:</strong>
                      <p className="text-gray-900 font-mono text-sm">{user.id}</p>
                    </div>
                    <div>
                      <strong className="text-gray-700">Email:</strong>
                      <p className="text-gray-900">{user.email}</p>
                    </div>
                    <div>
                      <strong className="text-gray-700">Email Verified:</strong>
                      <p className="text-gray-900">{user.email_confirmed_at ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <strong className="text-gray-700">Created At:</strong>
                      <p className="text-gray-900">{new Date(user.created_at).toLocaleString()}</p>
                    </div>
                    {user.user_metadata && Object.keys(user.user_metadata).length > 0 && (
                      <div>
                        <strong className="text-gray-700">Metadata:</strong>
                        <pre className="bg-gray-100 p-3 rounded mt-2 text-xs overflow-auto">
                          {JSON.stringify(user.user_metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="font-medium text-red-700">Not Authenticated</span>
                  </div>
                  <p className="text-gray-600">You are not logged in.</p>
                </div>
              )}
            </div>

            {session && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Session Info</h2>
                <div className="space-y-2">
                  <div>
                    <strong className="text-gray-700">Access Token:</strong>
                    <p className="text-gray-900 font-mono text-xs break-all">
                      {session.access_token.substring(0, 50)}...
                    </p>
                  </div>
                  <div>
                    <strong className="text-gray-700">Expires At:</strong>
                    <p className="text-gray-900">
                      {new Date(session.expires_at! * 1000).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Supabase Configuration</h2>
              <div className="space-y-2">
                <div>
                  <strong className="text-gray-700">Supabase URL:</strong>
                  <p className="text-gray-900 font-mono text-sm">
                    {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set'}
                  </p>
                </div>
                <div>
                  <strong className="text-gray-700">Anon Key:</strong>
                  <p className="text-gray-900 font-mono text-xs break-all">
                    {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY 
                      ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 30)}...` 
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              {user ? (
                <>
                  <button
                    onClick={handleSignOut}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                  >
                    Sign Out
                  </button>
                  <Link
                    href="/"
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition inline-block text-center"
                  >
                    Go to Home
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/signin"
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition inline-block text-center"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition inline-block text-center"
                  >
                    Sign Up
                  </Link>
                </>
              )}
              <button
                onClick={checkAuth}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



















