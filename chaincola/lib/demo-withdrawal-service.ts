/**
 * Demo Withdrawal Service
 * Simulates withdrawing money from wallet without actual Flutterwave transfer
 * For testing and demo purposes only
 */

import { supabase } from './supabase';

export interface DemoWithdrawalParams {
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  bank_code: string;
}

export interface DemoWithdrawalResponse {
  success: boolean;
  withdrawal_id?: string;
  amount?: number;
  error?: string;
}

/**
 * Calculate withdrawal fee (3% of amount)
 */
function calculateWithdrawalFee(amount: number): number {
  return Math.round(amount * 0.03 * 100) / 100; // Round to 2 decimal places
}

/**
 * Demo function to withdraw money from wallet
 * Creates a withdrawal record and debits wallet directly
 */
export async function demoWithdraw(
  params: DemoWithdrawalParams
): Promise<DemoWithdrawalResponse> {
  try {
    const { amount, bank_name, account_number, account_name, bank_code } = params;

    if (!amount || amount <= 0) {
      return {
        success: false,
        error: 'Invalid withdrawal amount',
      };
    }

    if (!account_number || !bank_name || !account_name) {
      return {
        success: false,
        error: 'Missing required bank account details',
      };
    }

    if (!bank_code) {
      return {
        success: false,
        error: 'Bank code is required',
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
    
    // CRITICAL: Only allow demo users to use instant withdrawal
    if (!userEmail || userEmail.toLowerCase() !== 'demo@chaincola.com') {
      return {
        success: false,
        error: 'Instant withdrawal is only available for demo accounts',
      };
    }
    
    console.log('🧪 Demo: Processing withdrawal...', { amount, userId });

    // Check user balance
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    if (walletError || !wallet) {
      return {
        success: false,
        error: 'Failed to fetch wallet balance',
      };
    }

    const availableBalance = parseFloat(wallet.ngn_balance || '0');
    const withdrawalFee = calculateWithdrawalFee(amount);
    const totalDeduction = amount + withdrawalFee;

    if (availableBalance < totalDeduction) {
      return {
        success: false,
        error: `Insufficient balance. Available: ₦${availableBalance.toLocaleString()}, Required: ₦${totalDeduction.toLocaleString()}`,
      };
    }

    // Create withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: userId,
        amount: amount.toString(),
        fee_amount: withdrawalFee,
        currency: 'NGN',
        bank_name,
        account_number,
        account_name,
        bank_code,
        status: 'completed', // Demo: mark as completed immediately
        transfer_reference: `DEMO-WD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          is_demo: true,
          withdrawal_fee: withdrawalFee,
          total_deduction: totalDeduction,
          processed_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error('❌ Demo: Error creating withdrawal:', withdrawalError);
      return {
        success: false,
        error: 'Failed to create withdrawal record',
      };
    }

    console.log('✅ Demo: Withdrawal created:', withdrawal.id);

    // Debit wallet
    const { error: debitError } = await supabase.rpc('debit_wallet', {
      p_user_id: userId,
      p_amount: totalDeduction,
      p_currency: 'NGN',
      p_ledger_ref_type: 'withdrawal',
      p_ledger_ref_id: withdrawal.id,
      p_ledger_payout_amount: amount,
      p_ledger_fee_amount: withdrawalFee,
    });

    if (debitError) {
      console.error('❌ Demo: Error debiting wallet:', debitError);
      // Update withdrawal status to failed
      await supabase
        .from('withdrawals')
        .update({ status: 'failed', metadata: { ...withdrawal.metadata, error: debitError.message } })
        .eq('id', withdrawal.id);

      return {
        success: false,
        error: 'Failed to debit wallet',
      };
    }

    // Create transaction record for withdrawal
    try {
      await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'WITHDRAWAL',
          crypto_currency: 'FIAT',
          network: 'mainnet',
          fiat_amount: totalDeduction.toString(),
          fiat_currency: 'NGN',
          status: 'COMPLETED',
          external_reference: withdrawal.transfer_reference,
          metadata: {
            withdrawal_id: withdrawal.id,
            withdrawal_amount: amount,
            withdrawal_fee: withdrawalFee,
            bank_name,
            account_number: account_number.substring(0, 4) + '****' + account_number.substring(account_number.length - 4),
            is_demo: true,
          },
        });
    } catch (txError) {
      console.warn('⚠️ Demo: Failed to create transaction record:', txError);
      // Don't fail withdrawal if transaction record fails
    }

    console.log('✅ Demo: Withdrawal completed successfully');

    return {
      success: true,
      withdrawal_id: withdrawal.id,
      amount,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception processing withdrawal:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
