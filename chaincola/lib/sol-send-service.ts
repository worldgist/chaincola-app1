import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

/**
 * Request interface for sending SOL
 */
export interface SendSOLRequest {
  destination_address: string;  // Solana address to send to
  amount_sol: string;           // Amount in SOL (as string, e.g., "0.1")
}

/**
 * Response interface for SOL send operation
 */
export interface SendSOLResponse {
  success: boolean;
  transaction_hash?: string;
  amount?: string;
  fee?: string;
  error?: string;
  message?: string;
}

/**
 * Send SOL to a destination address
 * 
 * This function sends Solana (SOL) from the authenticated user's wallet
 * to the specified destination address using the Supabase Edge Function.
 * 
 * @param request - SendSOLRequest containing destination_address and amount_sol
 * @returns Promise<SendSOLResponse> with transaction details or error
 * 
 * @example
 * ```typescript
 * const result = await sendSOL({
 *   destination_address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
 *   amount_sol: '0.1'
 * });
 * 
 * if (result.success) {
 *   console.log('Transaction hash:', result.transaction_hash);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export async function sendSOL(request: SendSOLRequest): Promise<SendSOLResponse> {
  try {
    // Validate request
    if (!request.destination_address || !request.amount_sol) {
      return {
        success: false,
        error: 'destination_address and amount_sol are required',
      };
    }

    // Validate Solana address format (base58, 32-44 characters)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(request.destination_address)) {
      return {
        success: false,
        error: 'Invalid Solana address format',
      };
    }

    // Validate amount is positive
    const amount = parseFloat(request.amount_sol);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: 'Amount must be a positive number',
      };
    }

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated. Please log in to continue.',
      };
    }

    // Get Supabase configuration
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       SUPABASE_URL;

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    // Call Supabase Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/send-solana-transaction`;

    console.log('📤 Sending SOL:', {
      to: request.destination_address,
      amount: request.amount_sol,
    });

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destination_address: request.destination_address.trim(),
          amount_sol: request.amount_sol,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout. The transaction is taking too long. Please try again or check your network connection.',
        };
      }
      // Network error or other fetch error
      return {
        success: false,
        error: fetchError.message || 'Network error. Please check your internet connection and try again.',
      };
    }

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error sending SOL:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      
      // Handle specific HTTP status codes
      if (response.status === 502) {
        errorMessage = 'Service temporarily unavailable. The transaction service is experiencing issues. Please try again in a few moments.';
      } else if (response.status === 503) {
        errorMessage = 'Service unavailable. Please try again later.';
      } else if (response.status === 504) {
        errorMessage = 'Request timeout. The transaction is taking too long. Please try again with a smaller amount or check your network connection.';
      } else if (response.status === 500) {
        errorMessage = 'Internal server error. Please try again or contact support if the issue persists.';
      } else if (response.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (response.status === 403) {
        errorMessage = 'Access denied. You do not have permission to perform this action.';
      }
      
      // Try to parse error response
      try {
        const errorJson = JSON.parse(errorText);
        const serverError = errorJson.error || errorJson.message;
        
        if (serverError && response.status !== 502 && response.status !== 503 && response.status !== 504) {
          errorMessage = serverError;
        }
        
        // Provide user-friendly error messages for specific errors
        if (errorMessage.toLowerCase().includes('insufficient balance')) {
          // Keep detailed error message from server
        } else if (errorMessage.toLowerCase().includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please check your wallet balance.';
        } else if (errorMessage.toLowerCase().includes('invalid address') ||
                   errorMessage.toLowerCase().includes('invalid destination')) {
          errorMessage = 'Invalid destination address. Please check the address and try again.';
        } else if (errorMessage.toLowerCase().includes('wallet not found')) {
          errorMessage = 'Solana wallet not found. Please set up your wallet first.';
        } else if (errorMessage.toLowerCase().includes('not authenticated')) {
          errorMessage = 'Please log in to continue.';
        } else if (errorMessage.toLowerCase().includes('timeout') || 
                   errorMessage.toLowerCase().includes('timed out')) {
          errorMessage = 'Transaction timeout. Please try again with a smaller amount or check your network connection.';
        }
      } catch {
        // If error text is HTML (like 502 Bad Gateway page), use our custom message
        if (errorText.includes('<html>') || errorText.includes('Bad Gateway')) {
          if (response.status === 502) {
            errorMessage = 'Service temporarily unavailable. The transaction service is experiencing issues. Please try again in a few moments.';
          } else {
            errorMessage = errorText.substring(0, 200) || errorMessage;
          }
        } else if (errorText && errorText.length < 500) {
          errorMessage = errorText;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ SOL sent successfully:', result);

    return {
      success: result.success !== false,
      transaction_hash: result.transaction_hash,
      amount: result.amount,
      fee: result.fee,
      error: result.error,
      message: result.message || 'SOL sent successfully',
    };
  } catch (error: any) {
    console.error('❌ Exception sending SOL:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SOL. Please try again.',
    };
  }
}
