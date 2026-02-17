/**
 * Utility function to retroactively create transaction records for withdrawals
 * that don't have corresponding transaction records
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WITHDRAWAL_FEE_PERCENTAGE = 0.03;

function calculateWithdrawalFee(amount: number): number {
  return Math.round(amount * WITHDRAWAL_FEE_PERCENTAGE * 100) / 100;
}

/**
 * Create transaction record for a specific withdrawal
 */
export async function createTransactionForWithdrawal(
  withdrawalId: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get withdrawal details
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (withdrawalError || !withdrawal) {
      return { success: false, error: 'Withdrawal not found' };
    }

    // Check if transaction already exists
    const { data: existingTransaction } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', withdrawal.user_id)
      .eq('metadata->>withdrawal_id', withdrawalId)
      .maybeSingle();

    if (existingTransaction) {
      console.log('✅ Transaction already exists for withdrawal:', withdrawalId);
      return { success: true, transactionId: existingTransaction.id };
    }

    // Calculate fee if not present
    const feeAmount = withdrawal.fee_amount || calculateWithdrawalFee(withdrawal.amount);
    
    // Map withdrawal status to transaction status
    const transactionStatus = withdrawal.status === 'completed' ? 'COMPLETED'
      : withdrawal.status === 'failed' ? 'FAILED'
      : withdrawal.status === 'cancelled' ? 'CANCELLED'
      : withdrawal.status === 'processing' ? 'CONFIRMING'
      : 'PENDING';

    // Create transaction record
    const { data: transactionData, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: withdrawal.user_id,
        transaction_type: 'WITHDRAWAL',
        crypto_currency: 'FIAT',
        fiat_amount: withdrawal.amount,
        fiat_currency: withdrawal.currency || 'NGN',
        fee_amount: feeAmount,
        fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
        fee_currency: withdrawal.currency || 'NGN',
        status: transactionStatus,
        external_transaction_id: withdrawal.transfer_id || null,
        external_reference: withdrawal.transfer_reference || null,
        notes: `Withdrawal to ${withdrawal.bank_name} - ${withdrawal.account_name}`,
        completed_at: withdrawal.status === 'completed' ? withdrawal.updated_at : null,
        metadata: {
          withdrawal_id: withdrawal.id,
          bank_name: withdrawal.bank_name,
          account_number: withdrawal.account_number,
          account_name: withdrawal.account_name,
          bank_code: withdrawal.bank_code,
          withdrawal_type: 'bank_transfer',
          created_retroactively: true,
        },
      })
      .select('id')
      .single();

    if (transactionError) {
      console.error('❌ Error creating transaction for withdrawal:', transactionError);
      return {
        success: false,
        error: transactionError.message || 'Failed to create transaction record',
      };
    }

    console.log('✅ Transaction record created for withdrawal:', withdrawalId);
    return { success: true, transactionId: transactionData.id };
  } catch (error: any) {
    console.error('❌ Error creating transaction for withdrawal:', error);
    return {
      success: false,
      error: error.message || 'Failed to create transaction record',
    };
  }
}

/**
 * Fix all withdrawals that don't have transaction records
 * This should be run by an admin or as a one-time migration
 */
export async function fixMissingWithdrawalTransactions(
  userId?: string
): Promise<{ success: boolean; fixed: number; errors: number; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, fixed: 0, errors: 0, error: 'Not authenticated' };
    }

    // Get all withdrawals (optionally filtered by user)
    let query = supabase
      .from('withdrawals')
      .select('id, user_id, amount, fee_amount, currency, status, bank_name, account_name, transfer_id, transfer_reference, updated_at')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: withdrawals, error: withdrawalsError } = await query;

    if (withdrawalsError) {
      return { success: false, fixed: 0, errors: 0, error: withdrawalsError.message };
    }

    if (!withdrawals || withdrawals.length === 0) {
      return { success: true, fixed: 0, errors: 0 };
    }

    let fixed = 0;
    let errors = 0;

    // Check each withdrawal for missing transaction
    for (const withdrawal of withdrawals) {
      const { data: existingTransaction } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', withdrawal.user_id)
        .eq('metadata->>withdrawal_id', withdrawal.id)
        .maybeSingle();

      if (!existingTransaction) {
        // Create transaction for this withdrawal
        const result = await createTransactionForWithdrawal(withdrawal.id);
        if (result.success) {
          fixed++;
        } else {
          errors++;
          console.error(`Failed to create transaction for withdrawal ${withdrawal.id}:`, result.error);
        }
      }
    }

    console.log(`✅ Fixed ${fixed} missing transactions, ${errors} errors`);
    return { success: true, fixed, errors };
  } catch (error: any) {
    console.error('❌ Error fixing missing withdrawal transactions:', error);
    return {
      success: false,
      fixed: 0,
      errors: 0,
      error: error.message || 'Failed to fix missing transactions',
    };
  }
}

