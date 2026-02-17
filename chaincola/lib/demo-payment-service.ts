/**
 * Demo Payment Service
 * Simulates adding money to wallet without actual Flutterwave payment
 * For testing and demo purposes only
 */

import { supabase } from './supabase';

export interface DemoPaymentParams {
  amount: number;
  currency?: string;
}

export interface DemoPaymentResponse {
  success: boolean;
  transaction_id?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

/**
 * Demo function to add money to wallet
 * Creates a transaction record and credits wallet directly
 */
export async function demoAddMoney(
  params: DemoPaymentParams
): Promise<DemoPaymentResponse> {
  try {
    const { amount, currency = 'NGN' } = params;

    if (!amount || amount <= 0) {
      return {
        success: false,
        error: 'Invalid amount',
      };
    }

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session || !session.user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    
    // CRITICAL: Only allow demo users to use instant add money
    if (!userEmail || userEmail.toLowerCase() !== 'demo@chaincola.com') {
      return {
        success: false,
        error: 'Instant add money is only available for demo accounts',
      };
    }
    
    console.log('🧪 Demo: Adding money to wallet...', { amount, currency, userId });

    // Calculate deposit amount and fee (3% fee)
    const depositAmount = amount;
    const feeAmount = depositAmount * 0.03;
    const totalPayment = depositAmount + feeAmount;

    // Create transaction record
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type: 'DEPOSIT',
        crypto_currency: 'FIAT',
        network: 'mainnet',
        fiat_amount: totalPayment.toString(),
        fiat_currency: currency,
        status: 'COMPLETED',
        external_reference: `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          purpose: 'wallet-funding',
          source: 'demo',
          deposit_amount: depositAmount,
          fee_amount: feeAmount,
          fee_percentage: 3,
          credit_amount: depositAmount,
          total_payment: totalPayment,
          is_demo: true,
        },
      })
      .select()
      .single();

    if (txError) {
      console.error('❌ Demo: Error creating transaction:', txError);
      return {
        success: false,
        error: 'Failed to create transaction record',
      };
    }

    console.log('✅ Demo: Transaction created:', transaction.id);

    // Credit wallet with deposit amount (after fee deduction)
    const { error: creditError } = await supabase.rpc('credit_wallet', {
      p_user_id: userId,
      p_amount: depositAmount,
      p_currency: currency,
    });

    if (creditError) {
      console.error('❌ Demo: Error crediting wallet:', creditError);
      // Update transaction status to failed
      await supabase
        .from('transactions')
        .update({ status: 'FAILED', error_message: creditError.message })
        .eq('id', transaction.id);

      return {
        success: false,
        error: 'Failed to credit wallet',
      };
    }

    console.log('✅ Demo: Wallet credited successfully');

    return {
      success: true,
      transaction_id: transaction.id,
      amount: depositAmount,
      currency,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception adding money:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
