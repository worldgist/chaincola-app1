import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getSupabaseAuthRedirectTo } from '@/lib/supabase-auth-redirect';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { deleteBiometricCredentials } from '@/lib/biometric-service';
import { createReferralRelationship, validateReferralCode } from '@/lib/referral-service';
import { getUserProfile, updateUserProfile } from '@/lib/user-service';
import { ensureUserWallets } from '@/lib/crypto-wallet-service';

/** Stale AsyncStorage session (revoked user, rotated project, cleared server sessions). */
function isInvalidStoredSessionError(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message).toLowerCase()
      : '';
  return (
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    (msg.includes('refresh token') && msg.includes('not found'))
  );
}

// Use Supabase types
interface User {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
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
  /** Updates password for the current session (e.g. after recovery OTP or magic link). */
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Track if we're currently in a signup process to prevent onAuthStateChange from interfering
  const isSigningUpRef = useRef(false);

  // Convert Supabase user to our User type
  const convertSupabaseUser = useCallback((supabaseUser: SupabaseUser | null): User | null => {
    if (!supabaseUser) return null;
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      email_confirmed_at: supabaseUser.email_confirmed_at ?? null,
      metadata: supabaseUser.user_metadata || {},
    };
  }, []);

  // Helper to clear invalid session
  const clearInvalidSession = useCallback(async () => {
    try {
      // Local-only: avoids another failing network refresh
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setSession(null);
      setUser(null);
      await AsyncStorage.multiRemove([
        'auth_session',
        'auth_token',
      ]);
      // Only delete biometric credentials if session is invalid due to auth error
      // This helps prevent using stale credentials
      await deleteBiometricCredentials();
      console.log('⚠️ Cleared invalid session and biometric credentials');
    } catch (error) {
      // Even if signOut fails, clear local state
      setSession(null);
      setUser(null);
      await AsyncStorage.multiRemove([
        'auth_session',
        'auth_token',
      ]).catch(() => {});
      console.error('Error clearing invalid session:', error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: { session: existing }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        if (isInvalidStoredSessionError(error)) {
          console.warn('⚠️ Stored Supabase session is invalid; clearing local auth.');
          await clearInvalidSession();
        } else {
          console.warn('⚠️ Supabase getSession:', error.message);
        }
      } else if (existing?.user) {
        setSession(existing);
        setUser(convertSupabaseUser(existing.user));
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      // Skip processing during signup to avoid infinite loops
      if (isSigningUpRef.current) {
        console.log('⏭️ Skipping auth state change during signup');
        return;
      }

      console.log('🔄 Auth state changed:', event, currentSession?.user?.email);

      if (currentSession) {
        setSession(currentSession);
        const convertedUser = convertSupabaseUser(currentSession.user);
        setUser(convertedUser);

        // Deposit addresses + profile: on real session events only (not every TOKEN_REFRESHED).
        // `SIGNED_UP` is emitted by GoTrue but not always present on older @supabase auth-js typings.
        const ev = event as string;
        const shouldProvision =
          ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'SIGNED_UP';
        if (convertedUser && shouldProvision) {
          setTimeout(() => {
            void ensureProfileAndDepositWallets(convertedUser);
          }, 500);
        }
      } else {
        setSession(null);
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [convertSupabaseUser]);

  // Helper to ensure user profile exists
  // This should only be called for existing users, not during signup
  const ensureUserProfile = async (user: User) => {
    try {
      // Get current session from Supabase directly instead of relying on state
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        if (isInvalidStoredSessionError(sessionError)) {
          await clearInvalidSession();
        }
        console.warn('⚠️ No session available, skipping user profile check');
        return;
      }
      if (!currentSession) {
        console.warn('⚠️ No session available, skipping user profile check');
        return;
      }

      // Check if profile exists
      const profile = await getUserProfile(user.id);
      
      if (!profile) {
        // Profile doesn't exist - wait a bit for database trigger to create it
        // For new signups, the trigger should create it automatically
        // Only create manually if trigger didn't run (e.g., for very old users)
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
            // Safely check error properties
            const errorObj = result.error && typeof result.error === 'object' ? result.error : {};
            const errorCode = (errorObj as any).code;
            const errorMessage = (errorObj as any).message;
            
            // If error is about duplicate email, profile was likely created by trigger
            if (errorCode === '23505' && errorMessage?.includes('email')) {
              console.log('ℹ️ Profile likely created by database trigger');
            } else {
              // Log error with meaningful information
              const errorDetails: any = { userId: user.id };
              if (errorCode) errorDetails.code = errorCode;
              if (errorMessage) errorDetails.message = errorMessage;
              if ((errorObj as any).details) errorDetails.details = (errorObj as any).details;
              
              if (errorCode || errorMessage) {
                console.error('Error creating user profile:', errorDetails);
              } else {
                console.warn('Error creating user profile (empty error object):', { userId: user.id });
              }
            }
          } else {
            console.log('✅ User profile created/updated after auth event');
          }
        }
      } else {
        // Profile exists - only update missing fields, don't change existing email
        const updateData: any = {};
        let needsUpdate = false;
        
        if (!profile.full_name && user.metadata?.full_name) {
          updateData.full_name = user.metadata.full_name;
          needsUpdate = true;
        }
        
        // Only update email if profile doesn't have one AND user has one
        // Don't update if profile already has an email (to avoid conflicts)
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
            // Safely check error properties
            const errorObj = result.error && typeof result.error === 'object' ? result.error : {};
            const errorCode = (errorObj as any).code;
            const errorMessage = (errorObj as any).message;
            
            // If error is about duplicate email, it's likely fine - profile already has correct email
            if (errorCode === '23505' && errorMessage?.includes('email')) {
              console.log('ℹ️ Email already exists - profile is up to date');
            } else {
              // Log error with meaningful information
              const errorDetails: any = { userId: user.id };
              if (errorCode) errorDetails.code = errorCode;
              if (errorMessage) errorDetails.message = errorMessage;
              if ((errorObj as any).details) errorDetails.details = (errorObj as any).details;
              
              if (errorCode || errorMessage) {
                console.error('Error updating user profile:', errorDetails);
              } else {
                console.warn('Error updating user profile (empty error object):', { userId: user.id });
              }
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

  /** Profile + missing BTC/ETH/SOL/XRP deposit addresses (crypto_wallets). Safe to call repeatedly. */
  const ensureProfileAndDepositWallets = async (userLike: User) => {
    try {
      await ensureUserProfile(userLike);
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (sessErr || !session) {
        console.warn('⚠️ Skipping deposit wallets: no session', sessErr?.message);
        return;
      }
      const result = await ensureUserWallets('mainnet');
      if (result.created > 0) {
        console.log(`✅ Provisioned ${result.created} missing deposit wallet(s)`);
      }
      if (!result.success && result.errors.length > 0) {
        console.warn('⚠️ Deposit wallet provisioning issues:', result.errors);
      }
    } catch (e) {
      console.error('ensureProfileAndDepositWallets:', e);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        // Only log unexpected errors, not authentication errors (which are handled by the UI)
        if (error.name !== 'AuthApiError' && error.message !== 'Invalid login credentials') {
          console.error('Sign in exception:', error);
        }
        return { error };
      }

      if (data.session && data.user) {
        setSession(data.session);
        const convertedUser = convertSupabaseUser(data.user);
        setUser(convertedUser);
        
        if (convertedUser) {
          setTimeout(() => {
            void ensureProfileAndDepositWallets(convertedUser);
          }, 600);
        }
      }

      return { error: null };
    } catch (error: any) {
      // Only log unexpected errors, not authentication errors (which are handled by the UI)
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

      // Sign up with Supabase
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: metadata?.fullName || '',
            phone_number: metadata?.phoneNumber || '',
          },
          emailRedirectTo: getSupabaseAuthRedirectTo('auth/callback'),
        },
      });

      if (error) {
        isSigningUpRef.current = false;
        return { error };
      }

      if (data.user) {
        // The database trigger (handle_new_user) automatically creates the user profile
        // We don't need to manually create it - this avoids RLS issues
        
        // Process referral if provided (after profile is created by trigger)
        if (metadata?.referralCode && metadata.referralCode.trim().length > 0) {
          // Wait for trigger to create profile, then process referral
          setTimeout(async () => {
            try {
              // First, validate the referral code to get the referrer's user ID
              const validation = await validateReferralCode(metadata.referralCode.trim());
              if (!validation.isValid || !validation.userId) {
                console.error('Invalid referral code during signup:', validation.error);
                return;
              }
              
              // Create referral relationship with correct parameters:
              // referrerUserId: The user who owns the referral code
              // referredUserId: The new user who signed up
              // referralCode: The referral code that was used
              const { error: referralError } = await createReferralRelationship(
                validation.userId, // Referrer's user ID (from validation)
                data.user.id,      // Referred user ID (new user)
                metadata.referralCode.trim().toUpperCase() // Referral code
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

        // With session: provision deposit addresses after auth + profile settle
        if (data.session) {
          const u = convertSupabaseUser(data.user);
          if (u) {
            setTimeout(() => {
              void ensureProfileAndDepositWallets(u);
            }, 2500);
          }
        } else {
          console.log('ℹ️ Deposit wallets will be created after email verification or first sign-in');
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
      // Check if there's an active session before trying to sign out
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.warn('⚠️ No active session found (may already be signed out):', sessionError.message);
        // Continue to clear local state even if no session
      } else if (currentSession) {
        // Sign out from Supabase only if session exists
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          // Handle AuthSessionMissingError gracefully
          if (error.message?.includes('session') || error.message?.includes('Session')) {
            console.warn('⚠️ Session already expired or missing, clearing local state');
          } else {
            console.error('Error signing out from Supabase:', error);
          }
        }
      } else {
        console.log('ℹ️ No active session to sign out from');
      }
      
      // Always clear local state regardless of session status
      setSession(null);
      setUser(null);
      
      try {
        await AsyncStorage.multiRemove([
          'auth_session',
          'auth_token',
        ]);
      } catch (storageError) {
        console.warn('⚠️ Error clearing AsyncStorage (non-critical):', storageError);
      }
      
      // NOTE: We do NOT delete biometric credentials on logout
      // Biometric credentials should persist across logout/login cycles
      // They will only be deleted if:
      // 1. User explicitly disables biometric in settings
      // 2. Credentials are invalid (wrong password)
      // 3. User changes password (handled separately)
      console.log('✅ Signed out (biometric credentials preserved)');
    } catch (error: any) {
      console.error('Error signing out:', error);
      // Clear local state even if signOut fails
      setSession(null);
      setUser(null);
      try {
        await AsyncStorage.multiRemove([
          'auth_session',
          'auth_token',
        ]);
      } catch (storageError) {
        // Ignore storage errors during error handling
      }
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getSupabaseAuthRedirectTo('auth/callback'),
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
      const emailRedirectTo = getSupabaseAuthRedirectTo('auth/callback');
      const normalizedEmail = email.trim().toLowerCase();

      // Drop any local session from a pending sign-up (or another tab). Without this, GoTrue
      // can treat repeated resend as the same pending user and keep sending the same OTP until it expires.
      const { error: signOutErr } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutErr) {
        console.warn('resendVerificationEmail: local signOut before resend:', signOutErr.message);
      }

      // Let AsyncStorage / auth listener flush so the next request is not tied to a stale JWT.
      await new Promise((resolve) => setTimeout(resolve, 320));

      // Password recovery is not a valid `resend()` type (only signup, email_change, sms, phone_change).
      // Resend recovery mail by triggering the same flow as "Forgot password".
      if (type === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: emailRedirectTo,
        });
        if (error) {
          return { error };
        }
        return { error: null };
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
          emailRedirectTo,
        },
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

      // GoTrue email OTP types (see EmailOtpType in @supabase/auth-js):
      // - After signUp(), the email OTP (6 digits; see chaincola-web/supabase/config.toml [auth.email] otp_length) is verified with type `email`, not `signup`.
      // - Using `signup` here often fails with confusing "expired / invalid" errors.
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

      if (convertedUser) {
        setTimeout(() => {
          void ensureProfileAndDepositWallets(convertedUser);
        }, 1200);
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        return { error };
      }
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  // Ensure context value is always defined
  const contextValue: AuthContextType = {
    session,
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    resendVerificationEmail,
    verifyOTP,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
