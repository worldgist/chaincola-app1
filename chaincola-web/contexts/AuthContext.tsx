'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { createReferralRelationship, validateReferralCode } from '@/lib/referral-service';
import { getUserProfile, updateUserProfile } from '@/lib/user-service';

// Use Supabase types
interface User {
  id: string;
  email?: string;
  metadata?: {
    full_name?: string;
    name?: string;
    phone?: string;
    phone_number?: string;
    address?: string;
  };
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, metadata?: { fullName?: string; phoneNumber?: string; referralCode?: string }) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  resendVerificationEmail: (email: string, type?: 'signup' | 'recovery') => Promise<{ error: any }>;
  verifyOTP: (email: string, token: string, type: 'signup' | 'email_change' | 'recovery') => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  // Track if we're currently in a signup process to prevent onAuthStateChange from interfering
  const isSigningUpRef = useRef(false);
  const signupUserIdsRef = useRef<Set<string>>(new Set());

  // Convert Supabase user to our User type
  const convertSupabaseUser = useCallback((supabaseUser: SupabaseUser | null): User | null => {
    if (!supabaseUser) return null;
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      metadata: supabaseUser.user_metadata || {},
    };
  }, []);

  // Helper to ensure user profile exists
  const ensureUserProfile = async (user: User) => {
    try {
      // Get current session from Supabase directly
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !currentSession) {
        console.warn('⚠️ No session available, skipping user profile check');
        return;
      }

      // Check if profile exists
      const profile = await getUserProfile(user.id);
      
      if (!profile) {
        // Profile doesn't exist - wait a bit for database trigger to create it
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check again after delay
        const profileAfterDelay = await getUserProfile(user.id);
        if (!profileAfterDelay) {
          // Still doesn't exist - create it manually (for edge cases)
          const result = await updateUserProfile(user.id, {
            full_name: user.metadata?.full_name || user.email?.split('@')[0] || 'User',
            email: user.email || undefined,
            phone_number: user.metadata?.phone_number || user.metadata?.phone || undefined,
          });
          
          if (result.error) {
            if (result.error.code === '23505' && result.error.message?.includes('email')) {
              console.log('ℹ️ Profile likely created by database trigger');
            } else {
              console.error('Error creating user profile:', result.error);
            }
          } else {
            console.log('✅ User profile created/updated after auth event');
          }
        }
      } else {
        // Profile exists - only update missing fields
        const updateData: any = {};
        let needsUpdate = false;
        
        if (!profile.full_name && user.metadata?.full_name) {
          updateData.full_name = user.metadata.full_name;
          needsUpdate = true;
        }
        
        if (!profile.email && user.email) {
          updateData.email = user.email;
          needsUpdate = true;
        }
        
        if (!profile.phone_number && (user.metadata?.phone_number || user.metadata?.phone)) {
          updateData.phone_number = user.metadata?.phone_number || user.metadata?.phone;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          const result = await updateUserProfile(user.id, updateData);
          
          if (result.error) {
            if (result.error.code === '23505' && result.error.message?.includes('email')) {
              console.log('ℹ️ Email already exists - profile is up to date');
            } else {
              console.error('Error updating user profile:', result.error);
            }
          } else {
            console.log('✅ User profile updated with latest metadata');
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring user profile:', error);
    }
  };

  useEffect(() => {
    // Initialize session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        const convertedUser = convertSupabaseUser(session.user);
        setUser(convertedUser);
      }
      setLoading(false);
    });

    // Set up Supabase auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      // Skip processing during signup to avoid infinite loops
      if (isSigningUpRef.current) {
        console.log('⏭️ Skipping auth state change during signup');
        return;
      }

      const userId = currentSession?.user?.id;
      if (userId && signupUserIdsRef.current.has(userId)) {
        console.log('⏭️ Skipping auth state change for newly signed up user');
        return;
      }

      console.log('🔄 Auth state changed:', event, currentSession?.user?.email);

      if (currentSession) {
        setSession(currentSession);
        const convertedUser = convertSupabaseUser(currentSession.user);
        setUser(convertedUser);
        
        // Ensure user profile exists (but not during signup). Supabase typings omit legacy 'SIGNED_UP' in some versions.
        if (convertedUser && (event as string) !== 'SIGNED_UP') {
          setTimeout(async () => {
            try {
              await ensureUserProfile(convertedUser);
            } catch (error) {
              console.error('Error ensuring user profile after auth state change:', error);
            }
          }, 500);
        }
      } else {
        setSession(null);
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [convertSupabaseUser]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        // Only log unexpected errors, not authentication errors
        if (error.name !== 'AuthApiError' && error.message !== 'Invalid login credentials') {
          console.error('Sign in exception:', error);
        }
        return { error };
      }

      if (data.session && data.user) {
        setSession(data.session);
        const convertedUser = convertSupabaseUser(data.user);
        setUser(convertedUser);
        
        // Ensure user profile exists after sign-in
        if (convertedUser) {
          setTimeout(async () => {
            try {
              await ensureUserProfile(convertedUser);
            } catch (error) {
              console.error('Error ensuring user profile after signin:', error);
            }
          }, 500);
        }
      }

      return { error: null };
    } catch (error: any) {
      // Only log unexpected errors
      if (error?.name !== 'AuthApiError' && error?.message !== 'Invalid login credentials') {
        console.error('Sign in exception:', error);
      }
      return { error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    metadata?: { fullName?: string; phoneNumber?: string; referralCode?: string }
  ) => {
    try {
      // Set flag to prevent onAuthStateChange from processing during signup
      isSigningUpRef.current = true;

      // Validate referral code if provided
      if (metadata?.referralCode && metadata.referralCode.trim().length > 0) {
        const validation = await validateReferralCode(metadata.referralCode.trim());
        if (!validation.isValid) {
          isSigningUpRef.current = false;
          return { error: { message: validation.error || 'Invalid referral code' } };
        }
      }

      const emailRedirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/signin` : undefined;

      // Sign up with Supabase (emailRedirectTo must match Dashboard → Auth → URL allow list)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: metadata?.fullName || '',
            phone_number: metadata?.phoneNumber || '',
          },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });

      if (error) {
        isSigningUpRef.current = false;
        return { error };
      }

      if (data.user) {
        const newUserId = data.user.id;
        // Track this user ID FIRST to prevent onAuthStateChange from processing it
        signupUserIdsRef.current.add(newUserId);
        
        // Process referral if provided (after profile is created by trigger)
        if (metadata?.referralCode && metadata.referralCode.trim().length > 0) {
          const referralCodeNormalized = metadata.referralCode.trim();
          // Wait for trigger to create profile, then process referral
          setTimeout(async () => {
            try {
              // First, validate the referral code to get the referrer's user ID
              const validation = await validateReferralCode(referralCodeNormalized);
              if (!validation.isValid || !validation.userId) {
                console.error('Invalid referral code during signup:', validation.error);
                return;
              }
              
              // Create referral relationship
              const { error: referralError } = await createReferralRelationship(
                validation.userId, // Referrer's user ID (from validation)
                newUserId, // Referred user ID (new user)
                referralCodeNormalized.toUpperCase() // Referral code
              );
              
              if (referralError) {
                console.error('Error creating referral relationship:', referralError);
              } else {
                console.log('✅ Referral relationship created successfully');
              }
            } catch (referralError) {
              console.error('Exception creating referral relationship:', referralError);
            }
          }, 3000);
        }

        // Set session if available (may not be available if email confirmation is required)
        if (data.session) {
          setSession(data.session);
          const convertedUser = convertSupabaseUser(data.user);
          setUser(convertedUser);
        } else {
          // Email confirmation required - user will need to verify email
          // Don't set session yet
        }
      }

      isSigningUpRef.current = false;
      return { error: null };
    } catch (error: any) {
      isSigningUpRef.current = false;
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Error signing out from Supabase:', error);
      }
      
      setSession(null);
      setUser(null);
      console.log('✅ Signed out');
    } catch (error) {
      console.error('Error signing out:', error);
      // Clear local state even if signOut fails
      setSession(null);
      setUser(null);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: undefined, // We'll handle password reset in-app
      });
      
      if (error) {
        return { error };
      }
      
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const resendVerificationEmail = async (email: string, type: 'signup' | 'recovery' = 'signup') => {
    try {
      const emailRedirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/signin` : undefined;
      // GoTrue `resend` only supports signup / email_change; recovery uses password reset email.
      if (type === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: emailRedirectTo,
        });
        return { error: error ?? null };
      }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        ...(emailRedirectTo
          ? { options: { emailRedirectTo } }
          : {}),
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const verifyOTP = async (email: string, token: string, type: 'signup' | 'email_change' | 'recovery') => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedToken = token.trim();

      // GoTrue: email OTP from "Confirm signup" uses verifyOtp type `email`, not `signup` (length set in Supabase Auth).
      let supabaseType: 'email' | 'email_change' | 'recovery' = 'email';
      if (type === 'email_change') {
        supabaseType = 'email_change';
      } else if (type === 'recovery') {
        supabaseType = 'recovery';
      } else {
        supabaseType = 'email';
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: supabaseType,
      });

      if (error) {
        return { error };
      }

      let activeSession = data.session ?? null;
      let activeUser = data.user ?? null;

      if (!activeSession) {
        await new Promise((r) => setTimeout(r, 150));
        const { data: refreshed, error: refreshErr } = await supabase.auth.getSession();
        if (!refreshErr && refreshed.session) {
          activeSession = refreshed.session;
          activeUser = refreshed.session.user;
        }
      }

      if (!activeSession || !activeUser) {
        return {
          error: {
            message:
              'Verification succeeded but no session was created. Try again, or open the link in your email to continue.',
          },
        };
      }

      setSession(activeSession);
      const convertedUser = convertSupabaseUser(activeUser);
      setUser(convertedUser);

      signupUserIdsRef.current.delete(activeUser.id);

      if (convertedUser) {
        setTimeout(async () => {
          try {
            await ensureUserProfile(convertedUser);
          } catch (err) {
            console.error('Error ensuring user profile after OTP verification:', err);
          }
        }, 2000);
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        resendVerificationEmail,
        verifyOTP,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}










