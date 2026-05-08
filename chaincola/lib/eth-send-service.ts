import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

/**
 * Request interface for sending ETH
 */
export interface SendETHRequest {
  destination_address: string;  // Ethereum address to send to (0x...)
  amount_eth: string;           // Amount in ETH (as string, e.g., "0.1")
}

/**
 * Response interface for ETH send operation
 */
export interface SendETHResponse {
  success: boolean;
  transaction_hash?: string;
  amount?: string;
  fee?: string;
  error?: string;
  message?: string;
}

/**
 * Send ETH to a destination address
 * 
 * This function sends Ethereum (ETH) from the authenticated user's wallet
 * to the specified destination address using the Supabase Edge Function.
 * 
 * @param request - SendETHRequest containing destination_address and amount_eth
 * @returns Promise<SendETHResponse> with transaction details or error
 * 
 * @example
 * ```typescript
 * const result = await sendETH({
 *   destination_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
 *   amount_eth: '0.1'
 * });
 * 
 * if (result.success) {
 *   console.log('Transaction hash:', result.transaction_hash);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export async function sendETH(request: SendETHRequest): Promise<SendETHResponse> {
  try {
    // Validate request
    if (!request.destination_address || !request.amount_eth) {
      return {
        success: false,
        error: 'destination_address and amount_eth are required',
      };
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(request.destination_address)) {
      return {
        success: false,
        error: 'Invalid Ethereum address format',
      };
    }

    // Validate amount is positive
    const amount = parseFloat(request.amount_eth);
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
    const functionUrl = `${supabaseUrl}/functions/v1/send-ethereum-transaction`;

    console.log('📤 Sending ETH:', {
      to: request.destination_address,
      amount: request.amount_eth,
    });

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination_address: request.destination_address.trim(),
        amount_eth: request.amount_eth,
      }),
    });

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error sending ETH:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
        
        // Provide user-friendly error messages
        if (errorMessage.toLowerCase().includes('insufficient balance')) {
          // Keep detailed error message from server
        } else if (errorMessage.toLowerCase().includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please check your wallet balance.';
        } else if (errorMessage.toLowerCase().includes('invalid address') ||
                   errorMessage.toLowerCase().includes('invalid destination')) {
          errorMessage = 'Invalid destination address. Please check the address and try again.';
        } else if (errorMessage.toLowerCase().includes('wallet not found')) {
          errorMessage = 'Ethereum wallet not found. Please set up your wallet first.';
        } else if (errorMessage.toLowerCase().includes('not authenticated')) {
          errorMessage = 'Please log in to continue.';
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ ETH sent successfully:', result);

    return {
      success: result.success !== false,
      transaction_hash: result.transaction_hash,
      amount: result.amount,
      fee: result.fee,
      error: result.error,
      message: result.message || 'ETH sent successfully',
    };
  } catch (error: any) {
    console.error('❌ Exception sending ETH:', error);
    return {
      success: false,
      error: error.message || 'Failed to send ETH. Please try again.',
    };
  }
}











