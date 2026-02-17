import Constants from 'expo-constants';
import { supabase } from './supabase';

export interface InitializePaymentParams {
  amount: number;
  currency?: string;
  redirectUrl?: string;
  purpose?: 'wallet-funding' | 'gift-card-purchase';
  giftCardData?: {
    recipient_email?: string;
    recipient_name?: string;
    message?: string;
    expires_in_days?: number;
  };
  metadata?: {
    deposit_amount?: number;
    fee_amount?: number;
    fee_percentage?: number;
  };
}

export interface InitializePaymentResponse {
  success: boolean;
  checkout_link?: string;
  tx_ref?: string;
  amount?: number;
  currency?: string;
  transaction_id?: string;
  error?: string;
  details?: string;
}

export interface VerifyPaymentParams {
  tx_ref: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  verified: boolean;
  transaction_id?: string;
  amount?: number;
  status?: string;
  error?: string;
}

/**
 * Initialize a Flutterwave payment
 * Calls the Supabase Edge Function to create a payment link
 */
export async function initializePayment(
  params: InitializePaymentParams
): Promise<InitializePaymentResponse> {
  try {
    const { amount, currency = 'NGN', redirectUrl } = params;

    if (!amount || amount <= 0) {
      return {
        success: false,
        error: 'Invalid amount',
        details: 'Amount must be greater than 0',
      };
    }

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated',
        details: 'Please sign in to continue',
      };
    }

    console.log('💳 Initializing Flutterwave payment...', { amount, currency });

    // Get Supabase URL from environment (React Native compatible)
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
        details: 'Please configure Supabase credentials',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/flutterwave-initialize-payment`;

    // Call the Supabase Edge Function
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency,
        redirect_url: redirectUrl || 'chaincola://home?payment=successful',
        purpose: params.purpose || 'wallet-funding',
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Payment initialization error:', response.status, errorText);
      
      let errorMessage = `Payment initialization failed: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: 'Payment initialization failed',
        details: errorMessage,
      };
    }

    const data = await response.json();
    const error = data.error ? { message: data.error } : null;

    if (error || !data || !data.success) {
      console.error('❌ Payment initialization failed:', data);
      return {
        success: false,
        error: data?.error || error?.message || 'Payment initialization failed',
        details: data?.details || 'Unknown error',
      };
    }

    console.log('✅ Payment initialized successfully:', data.tx_ref);

    return {
      success: true,
      checkout_link: data.checkout_link,
      tx_ref: data.tx_ref,
      amount: data.amount,
      currency: data.currency,
      transaction_id: data.transaction_id,
    };
  } catch (error: any) {
    console.error('❌ Exception initializing payment:', error);
    return {
      success: false,
      error: 'Payment initialization failed',
      details: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Verify a payment transaction
 * Calls Flutterwave API to verify payment and automatically processes if successful
 */
export async function verifyPayment(
  params: VerifyPaymentParams
): Promise<VerifyPaymentResponse> {
  try {
    const { tx_ref } = params;

    if (!tx_ref) {
      return {
        success: false,
        verified: false,
        error: 'Transaction reference is required',
      };
    }

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return {
        success: false,
        verified: false,
        error: 'Not authenticated',
      };
    }

    console.log('🔍 Verifying payment transaction with Flutterwave...', { tx_ref });

    // Get Supabase URL from environment
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        verified: false,
        error: 'Supabase anon key not configured',
      };
    }

    // Call the verification Edge Function which queries Flutterwave API
    const functionUrl = `${supabaseUrl}/functions/v1/flutterwave-verify-payment`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tx_ref }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Verification error:', response.status, errorText);
      return {
        success: false,
        verified: false,
        error: `Verification failed: ${response.status}`,
      };
    }

    const result = await response.json();

    console.log('✅ Payment verification result:', {
      tx_ref,
      verified: result.verified,
      status: result.status,
    });

    return {
      success: result.success || false,
      verified: result.verified || false,
      transaction_id: result.transaction_id,
      amount: result.amount,
      status: result.status,
      error: result.error,
    };
  } catch (error: any) {
    console.error('❌ Exception verifying payment:', error);
    return {
      success: false,
      verified: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Poll for payment status
 * Continuously verifies payment with Flutterwave API until it's completed or failed
 */
export async function pollPaymentStatus(
  txRef: string,
  maxAttempts: number = 15,
  intervalMs: number = 3000
): Promise<VerifyPaymentResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await verifyPayment({ tx_ref: txRef });

    if (result.success && result.verified) {
      return result;
    }

    if (result.status === 'FAILED' || result.status === 'CANCELLED') {
      return {
        ...result,
        verified: false,
      };
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    success: false,
    verified: false,
    error: 'Payment verification timeout',
  };
}






