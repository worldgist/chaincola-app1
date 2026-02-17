import { supabase } from './supabase';
import Constants from 'expo-constants';

// Get Supabase URL from environment variables
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     'https://slleojsdpctxhlsoyenr.supabase.co';

// Flutterwave Transfer API URL (VPS)
const FLUTTERWAVE_TRANSFER_API = 'https://api.chaincola.com/api/transfer';

// Withdrawal fee percentage (3%)
const WITHDRAWAL_FEE_PERCENTAGE = 0.03;

/**
 * Calculate withdrawal fee (3% of amount)
 */
export function calculateWithdrawalFee(amount: number): number {
  return Math.round(amount * WITHDRAWAL_FEE_PERCENTAGE * 100) / 100; // Round to 2 decimal places
}

/**
 * Send push notification for withdrawal
 */
async function sendWithdrawalPushNotification(
  userId: string,
  amount: number,
  feeAmount: number,
  status: string,
  withdrawalId: string
): Promise<void> {
  try {
    const title = status === 'processing' 
      ? 'Withdrawal Submitted' 
      : status === 'completed' 
      ? 'Withdrawal Completed' 
      : 'Withdrawal Failed';
    
    const body = status === 'processing'
      ? `Your withdrawal of ₦${amount.toLocaleString()} has been submitted. Fee: ₦${feeAmount.toLocaleString()}`
      : status === 'completed'
      ? `Your withdrawal of ₦${amount.toLocaleString()} has been completed successfully.`
      : `Your withdrawal of ₦${amount.toLocaleString()} has failed. Please contact support.`;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        data: {
          type: 'withdrawal',
          withdrawal_id: withdrawalId,
          amount,
          fee_amount: feeAmount,
          status,
        },
        priority: 'high',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to send push notification:', error);
    } else {
      console.log('✅ Push notification sent for withdrawal');
    }
  } catch (error: any) {
    console.error('❌ Error sending push notification:', error);
    // Don't fail withdrawal if notification fails
  }
}

/**
 * Send email notification for withdrawal
 */
async function sendWithdrawalEmailNotification(
  userId: string,
  userEmail: string,
  amount: number,
  feeAmount: number,
  status: string,
  withdrawalId: string,
  bankName: string,
  accountNumber: string
): Promise<void> {
  try {
    const subject = status === 'processing'
      ? 'Withdrawal Request Submitted'
      : status === 'completed'
      ? 'Withdrawal Completed Successfully'
      : 'Withdrawal Request Failed';

    const statusText = status === 'processing'
      ? 'submitted and is being processed'
      : status === 'completed'
      ? 'completed successfully'
      : 'failed';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #FFFFFF; margin: 0;">ChainCola</h1>
          </div>
          <div style="background: #FFFFFF; padding: 30px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #11181C; margin-top: 0;">${subject}</h2>
            <p>Hello,</p>
            <p>Your withdrawal request has been ${statusText}.</p>
            <div style="background: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6B7280;"><strong>Amount:</strong></td>
                  <td style="padding: 8px 0; text-align: right; color: #11181C;"><strong>₦${amount.toLocaleString()}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280;">Fee:</td>
                  <td style="padding: 8px 0; text-align: right; color: #11181C;">₦${feeAmount.toLocaleString()}</td>
                </tr>
                <tr style="border-top: 1px solid #E5E7EB;">
                  <td style="padding: 8px 0; color: #6B7280;"><strong>Total Deducted:</strong></td>
                  <td style="padding: 8px 0; text-align: right; color: #11181C;"><strong>₦${(amount + feeAmount).toLocaleString()}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280;">Bank:</td>
                  <td style="padding: 8px 0; text-align: right; color: #11181C;">${bankName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280;">Account Number:</td>
                  <td style="padding: 8px 0; text-align: right; color: #11181C;">${accountNumber.substring(0, 4)}****${accountNumber.substring(accountNumber.length - 4)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B7280;">Status:</td>
                  <td style="padding: 8px 0; text-align: right;">
                    <span style="padding: 4px 12px; border-radius: 4px; background: ${status === 'completed' ? '#D1FAE5' : status === 'processing' ? '#DBEAFE' : '#FEE2E2'}; color: ${status === 'completed' ? '#065F46' : status === 'processing' ? '#1E40AF' : '#991B1B'};">
                      ${status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              </table>
            </div>
            ${status === 'processing' ? '<p>Your withdrawal is being processed and will be completed within 1-5 minutes.</p>' : ''}
            ${status === 'failed' ? '<p>If you have any questions or concerns, please contact our support team.</p>' : ''}
            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; color: #6B7280; font-size: 14px;">
              Best regards,<br>
              The ChainCola Team
            </p>
          </div>
        </body>
      </html>
    `;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
      body: JSON.stringify({
        to: userEmail,
        subject,
        html,
        userId,
        type: 'transaction',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to send email notification:', error);
    } else {
      console.log('✅ Email notification sent for withdrawal');
    }
  } catch (error: any) {
    console.error('❌ Error sending email notification:', error);
    // Don't fail withdrawal if notification fails
  }
}

export interface Bank {
  code: string;
  name: string;
  id?: number;
}

export interface BankAccountVerification {
  account_number: string;
  account_name: string;
  bank_code: string;
  bank_name: string;
}

export interface WithdrawalRequest {
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  bank_code?: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee_amount?: number;
  total_amount?: number; // amount + fee
  currency: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  created_at: string;
  updated_at?: string;
  transfer_id?: string;
  transfer_reference?: string;
  metadata?: any;
}

export interface FlutterwaveTransferResponse {
  success: boolean;
  message?: string;
  data?: {
    id: number;
    account_number: string;
    bank_code: string;
    full_name: string;
    currency: string;
    amount: number;
    fee: number;
    status: string;
    reference: string;
    narration: string;
    created_at: string;
  };
  error?: string;
  details?: any;
}

export interface UserBankAccount {
  id: string;
  user_id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  is_default: boolean;
  is_verified: boolean;
  verified_at?: string;
  created_at: string;
  updated_at?: string;
  metadata?: any;
}

export interface SaveBankAccountRequest {
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  is_default?: boolean;
}

/**
 * Get list of banks from Flutterwave API via Edge Function
 * @param countryCode - Two-letter country code (default: 'NG' for Nigeria)
 * @returns List of banks with codes and names
 */
export async function getBanks(
  countryCode: string = 'NG'
): Promise<{ success: boolean; data?: Bank[]; error?: string }> {
  try {
    console.log('🔍 Fetching banks:', { countryCode });

    // Get current session (optional - endpoint can work without auth)
    const { data: { session } } = await supabase.auth.getSession();

    // Call the get-banks Edge Function
    const url = new URL(`${SUPABASE_URL}/functions/v1/get-banks`);
    url.searchParams.set('country', countryCode);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
      },
    });

    const result = await response.json();

    if (!response.ok || result.status === 'error') {
      console.error('❌ Failed to fetch banks:', result);
      return {
        success: false,
        error: result.message || 'Failed to fetch banks. Please try again later.',
      };
    }

    if (result.status === 'success' && result.data) {
      console.log(`✅ Fetched ${result.data.length} banks`);
      return {
        success: true,
        data: result.data as Bank[],
      };
    }

    return { success: false, error: 'Invalid response from banks service' };
  } catch (error: any) {
    console.error('❌ Error fetching banks:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please check your connection and try again.',
    };
  }
}

/**
 * Verify bank account using Flutterwave API via Edge Function
 * This validates the account number and returns the account name
 */
export async function verifyBankAccount(
  accountNumber: string,
  bankCode: string
): Promise<{ success: boolean; data?: BankAccountVerification; error?: string }> {
  try {
    console.log('🔍 Verifying bank account:', { accountNumber, bankCode });

    // Validate account number format (Nigerian accounts are typically 10 digits)
    if (!accountNumber || accountNumber.length < 10 || accountNumber.length > 10) {
      return {
        success: false,
        error: 'Account number must be exactly 10 digits',
      };
    }

    if (!/^\d+$/.test(accountNumber)) {
      return {
        success: false,
        error: 'Account number must contain only numbers',
      };
    }

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Call the verify-account Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        account_number: accountNumber,
        bank_code: bankCode,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.status === 'error') {
      console.error('❌ Account verification failed:', result);
      return {
        success: false,
        error: result.message || 'Failed to verify account. Please check the details and try again.',
      };
    }

    if (result.status === 'success' && result.data) {
      console.log('✅ Account verified:', result.data);
      return {
        success: true,
        data: {
          account_number: result.data.account_number,
          account_name: result.data.account_name,
          bank_code: result.data.bank_code,
          bank_name: result.data.bank_name || '',
        },
      };
    }

    return { success: false, error: 'Invalid response from verification service' };
  } catch (error: any) {
    console.error('❌ Error verifying bank account:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please check your connection and try again.',
    };
  }
}

/**
 * Validate account number format (basic validation)
 */
export function validateAccountNumber(accountNumber: string): { valid: boolean; error?: string } {
  if (!accountNumber || accountNumber.trim().length === 0) {
    return { valid: false, error: 'Account number is required' };
  }

  // Nigerian bank accounts are typically 10 digits
  if (accountNumber.length < 10 || accountNumber.length > 10) {
    return { valid: false, error: 'Account number must be exactly 10 digits' };
  }

  // Must contain only numbers
  if (!/^\d+$/.test(accountNumber)) {
    return { valid: false, error: 'Account number must contain only numbers' };
  }

  return { valid: true };
}

/**
 * Save a bank account for the current user
 */
export async function saveBankAccount(
  bankAccount: SaveBankAccountRequest
): Promise<{ success: boolean; data?: UserBankAccount; error?: string }> {
  try {
    console.log('💾 Saving bank account:', bankAccount);

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Validate account number format
    const validation = validateAccountNumber(bankAccount.account_number);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Verify account first before saving
    const verification = await verifyBankAccount(bankAccount.account_number, bankAccount.bank_code);
    if (!verification.success || !verification.data) {
      return {
        success: false,
        error: verification.error || 'Account verification failed. Please check the details.',
      };
    }

    // Use verified account name
    const verifiedAccountName = verification.data.account_name;

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('user_bank_accounts')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('account_number', bankAccount.account_number)
      .eq('bank_code', bankAccount.bank_code)
      .maybeSingle();

    let savedAccount: UserBankAccount;

    if (existingAccount) {
      // Update existing account
      const { data: updated, error: updateError } = await supabase
        .from('user_bank_accounts')
        .update({
          account_name: verifiedAccountName,
          bank_name: bankAccount.bank_name,
          is_default: bankAccount.is_default ?? false,
          is_verified: true,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error updating bank account:', updateError);
        return {
          success: false,
          error: updateError.message || 'Failed to update bank account',
        };
      }

      savedAccount = updated as UserBankAccount;
    } else {
      // Insert new account
      const { data: inserted, error: insertError } = await supabase
        .from('user_bank_accounts')
        .insert({
          user_id: session.user.id,
          account_name: verifiedAccountName,
          account_number: bankAccount.account_number,
          bank_name: bankAccount.bank_name,
          bank_code: bankAccount.bank_code,
          is_default: bankAccount.is_default ?? false,
          is_verified: true,
          verified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Error saving bank account:', insertError);
        return {
          success: false,
          error: insertError.message || 'Failed to save bank account',
        };
      }

      savedAccount = inserted as UserBankAccount;
    }

    console.log('✅ Bank account saved:', savedAccount.id);
    return { success: true, data: savedAccount };
  } catch (error: any) {
    console.error('❌ Error saving bank account:', error);
    return {
      success: false,
      error: error.message || 'Failed to save bank account',
    };
  }
}

/**
 * Fetch all bank accounts for the current user
 */
export async function getUserBankAccounts(): Promise<{
  success: boolean;
  data?: UserBankAccount[];
  error?: string;
}> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: bankAccounts, error: fetchError } = await supabase
      .from('user_bank_accounts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching bank accounts:', fetchError);
      return {
        success: false,
        error: fetchError.message || 'Failed to fetch bank accounts',
      };
    }

    return { success: true, data: (bankAccounts || []) as UserBankAccount[] };
  } catch (error: any) {
    console.error('❌ Error fetching bank accounts:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch bank accounts',
    };
  }
}

/**
 * Get a specific bank account by ID
 */
export async function getBankAccountById(
  accountId: string
): Promise<{ success: boolean; data?: UserBankAccount; error?: string }> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: bankAccount, error: fetchError } = await supabase
      .from('user_bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', session.user.id)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching bank account:', fetchError);
      return {
        success: false,
        error: fetchError.message || 'Failed to fetch bank account',
      };
    }

    return { success: true, data: bankAccount as UserBankAccount };
  } catch (error: any) {
    console.error('❌ Error fetching bank account:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch bank account',
    };
  }
}

/**
 * Set a bank account as default
 */
export async function setDefaultBankAccount(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // First verify the account belongs to the user
    const { data: account, error: accountError } = await supabase
      .from('user_bank_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', session.user.id)
      .single();

    if (accountError || !account) {
      return { success: false, error: 'Bank account not found' };
    }

    // Set this account as default (trigger will handle unsetting others)
    const { error: updateError } = await supabase
      .from('user_bank_accounts')
      .update({ is_default: true })
      .eq('id', accountId);

    if (updateError) {
      console.error('❌ Error setting default bank account:', updateError);
      return {
        success: false,
        error: updateError.message || 'Failed to set default bank account',
      };
    }

    console.log('✅ Default bank account set:', accountId);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error setting default bank account:', error);
    return {
      success: false,
      error: error.message || 'Failed to set default bank account',
    };
  }
}

/**
 * Delete a bank account
 */
export async function deleteBankAccount(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify the account belongs to the user before deleting
    const { data: account, error: accountError } = await supabase
      .from('user_bank_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', session.user.id)
      .single();

    if (accountError || !account) {
      return { success: false, error: 'Bank account not found' };
    }

    const { error: deleteError } = await supabase
      .from('user_bank_accounts')
      .delete()
      .eq('id', accountId);

    if (deleteError) {
      console.error('❌ Error deleting bank account:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Failed to delete bank account',
      };
    }

    console.log('✅ Bank account deleted:', accountId);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error deleting bank account:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete bank account',
    };
  }
}

/**
 * Initiate Flutterwave transfer via VPS API
 */
async function initiateFlutterwaveTransfer(
  withdrawalData: WithdrawalRequest,
  withdrawalId: string
): Promise<{ success: boolean; data?: FlutterwaveTransferResponse['data']; error?: string }> {
  try {
    console.log('🚀 Initiating Flutterwave transfer:', {
      withdrawalId,
      amount: withdrawalData.amount,
      bankCode: withdrawalData.bank_code,
      accountNumber: withdrawalData.account_number.substring(0, 4) + '****',
      apiEndpoint: FLUTTERWAVE_TRANSFER_API,
    });

    // Get current session for authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Prepare transfer request
    const transferRequest = {
      account_bank: withdrawalData.bank_code || '',
      account_number: withdrawalData.account_number,
      amount: Math.round(withdrawalData.amount), // Flutterwave expects whole numbers for NGN
      narration: `Withdrawal from ChainCola - ${withdrawalId}`,
      currency: 'NGN',
    };

    console.log('📤 Sending transfer request to VPS:', {
      url: FLUTTERWAVE_TRANSFER_API,
      request: {
        ...transferRequest,
        account_number: transferRequest.account_number.substring(0, 4) + '****',
      },
    });

    // Call Flutterwave Transfer API on VPS with timeout
    let response: Response;
    const timeoutMs = 30000; // 30 second timeout
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - transfer service did not respond within 30 seconds')), timeoutMs);
      });

      // Race between fetch and timeout
      response = await Promise.race([
        fetch(FLUTTERWAVE_TRANSFER_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Optionally include auth token if VPS requires it
            // 'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(transferRequest),
        }),
        timeoutPromise,
      ]) as Response;
    } catch (networkError: any) {
      console.error('❌ Network error calling Flutterwave transfer API:', {
        error: networkError.message,
        errorType: networkError.name,
        withdrawalId,
        url: FLUTTERWAVE_TRANSFER_API,
      });
      
      // Determine error type for better user messaging
      let errorMessage = 'Unable to connect to transfer service. ';
      if (networkError.message?.includes('timeout')) {
        errorMessage += 'The service took too long to respond. ';
      } else if (networkError.message?.includes('Network request failed')) {
        errorMessage += 'Please check your internet connection. ';
      } else {
        errorMessage += networkError.message || 'Network error occurred. ';
      }
      errorMessage += 'Your funds will be automatically refunded.';
      
      return {
        success: false,
        error: errorMessage,
      };
    }

    let result: FlutterwaveTransferResponse;
    try {
      const responseText = await response.text();
      if (!responseText) {
        return {
          success: false,
          error: 'Empty response from transfer service',
        };
      }
      result = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('❌ Error parsing Flutterwave transfer response:', parseError);
      return {
        success: false,
        error: `Invalid response from transfer service: ${parseError.message || 'Please try again later.'}`,
      };
    }

    if (!response.ok || !result.success) {
      console.error('❌ Flutterwave transfer failed:', { status: response.status, result });
      return {
        success: false,
        error: result.error || result.message || `Transfer failed with status ${response.status}. Please try again.`,
      };
    }

    // Validate response structure
    if (!result.data) {
      console.error('❌ Invalid response from transfer service - no data field:', result);
      return { success: false, error: 'Invalid response from transfer service - missing transfer data' };
    }

    // Check if transfer was actually successful
    const transferStatus = result.data.status?.toUpperCase() || '';
    const isSuccessful = transferStatus === 'SUCCESSFUL' || transferStatus === 'SUCCESS' || 
                        transferStatus === 'COMPLETED' || transferStatus === 'COMPLETE';

    if (!isSuccessful && transferStatus !== 'PENDING' && transferStatus !== 'NEW') {
      console.error('❌ Transfer not successful:', {
        status: transferStatus,
        data: result.data,
      });
      return {
        success: false,
        error: `Transfer failed with status: ${transferStatus}. ${result.data.reason || result.message || 'Please try again.'}`,
      };
    }

    console.log('✅ Flutterwave transfer initiated:', {
      transferId: result.data.id,
      reference: result.data.reference,
      status: transferStatus,
      amount: result.data.amount,
    });

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('❌ Error initiating Flutterwave transfer:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please check your connection and try again.',
    };
  }
}

/**
 * Submit a withdrawal request and initiate Flutterwave transfer
 */
export async function submitWithdrawal(
  withdrawalData: WithdrawalRequest
): Promise<{ success: boolean; data?: Withdrawal; error?: string }> {
  try {
    console.log('💰 Submitting withdrawal request:', withdrawalData);

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
      console.error('❌ No valid session:', sessionError);
      return { success: false, error: 'Not authenticated' };
    }

    const userId = session.user.id;
    console.log('👤 User ID for withdrawal:', userId);

    // Validate withdrawal data
    if (!withdrawalData.amount || withdrawalData.amount <= 0) {
      return { success: false, error: 'Invalid withdrawal amount' };
    }

    if (!withdrawalData.account_number || !withdrawalData.bank_name || !withdrawalData.account_name) {
      return { success: false, error: 'Missing required bank account details' };
    }

    if (!withdrawalData.bank_code) {
      return { success: false, error: 'Bank code is required for transfer' };
    }

    // Check user balance - try wallets table first, then wallet_balances
    let availableBalance = 0;
    
    // Try wallets table first
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    if (!walletError && wallet) {
      availableBalance = parseFloat(wallet.ngn_balance?.toString() || '0') || 0;
      console.log(`💰 Balance from wallets table: ${availableBalance} NGN`);
    } else {
      // Log wallet error for debugging
      if (walletError) {
        console.log(`⚠️ Wallets table query error (code: ${walletError.code}):`, walletError.message);
      }
      
      // Fallback to wallet_balances table
      const { data: balance, error: balanceError } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'NGN')
        .single();

      if (!balanceError && balance) {
        availableBalance = parseFloat(balance.balance?.toString() || '0') || 0;
        console.log(`💰 Balance from wallet_balances table: ${availableBalance} NGN`);
      } else {
        // If no balance record exists, treat as 0 balance
        if (balanceError) {
          console.warn(`⚠️ wallet_balances query error (code: ${balanceError.code}):`, balanceError.message);
        }
        console.warn(`⚠️ No balance record found for user ${userId}, treating as 0`);
        availableBalance = 0;
      }
    }
    // Calculate withdrawal fee (3%)
    const feeAmount = calculateWithdrawalFee(withdrawalData.amount);
    const totalAmount = withdrawalData.amount + feeAmount;

    // Check if balance is sufficient (amount + fee)
    if (totalAmount > availableBalance) {
      return { 
        success: false, 
        error: `Insufficient balance. Required: ₦${totalAmount.toLocaleString()} (Amount: ₦${withdrawalData.amount.toLocaleString()} + Fee: ₦${feeAmount.toLocaleString()})` 
      };
    }

    // Get user email for notifications
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userEmail = authUser?.email || '';

    // Insert withdrawal into database with explicit user_id
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: userId,
        amount: withdrawalData.amount,
        fee_amount: feeAmount,
        currency: 'NGN',
        bank_name: withdrawalData.bank_name,
        account_number: withdrawalData.account_number,
        account_name: withdrawalData.account_name,
        bank_code: withdrawalData.bank_code || null,
        status: 'processing', // Start as processing while we initiate transfer
        metadata: {
          fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
          total_deducted: totalAmount,
        },
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error('❌ Error creating withdrawal:', withdrawalError);
      return {
        success: false,
        error: withdrawalError.message || 'Failed to submit withdrawal request',
      };
    }

    console.log('✅ Withdrawal record created:', {
      withdrawalId: withdrawal.id,
      userId,
      amount: withdrawalData.amount,
      fee: feeAmount,
      total: totalAmount,
    });

    // NOTE: Transaction record will be created only when withdrawal is completed or failed
    // This ensures transaction history only shows successful or failed withdrawals

    // Deduct balance (amount + fee) before initiating transfer
    console.log(`💰 Debiting wallet: ₦${totalAmount.toLocaleString()} (Amount: ₦${withdrawalData.amount.toLocaleString()} + Fee: ₦${feeAmount.toLocaleString()})`);
    const { error: balanceError } = await supabase.rpc('debit_wallet', {
      p_user_id: userId,
      p_amount: totalAmount, // Deduct amount + fee
      p_currency: 'NGN',
    });

    if (balanceError) {
      console.error('❌ Error deducting balance:', {
        withdrawalId: withdrawal.id,
        userId,
        amount: totalAmount,
        error: balanceError,
      });
      // Update withdrawal status to failed
      await supabase
        .from('withdrawals')
        .update({ status: 'failed', metadata: { error: 'Failed to deduct balance' } })
        .eq('id', withdrawal.id);
      
      // Create FAILED transaction record
      await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'WITHDRAWAL',
          crypto_currency: 'FIAT',
          fiat_amount: withdrawalData.amount,
          fiat_currency: 'NGN',
          fee_amount: feeAmount,
          fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
          fee_currency: 'NGN',
          status: 'FAILED',
          error_message: 'Failed to deduct balance',
          notes: `Withdrawal to ${withdrawalData.bank_name} - ${withdrawalData.account_name}`,
          metadata: {
            withdrawal_id: withdrawal.id,
            bank_name: withdrawalData.bank_name,
            account_number: withdrawalData.account_number,
            account_name: withdrawalData.account_name,
            bank_code: withdrawalData.bank_code,
            withdrawal_type: 'bank_transfer',
          },
        });
      
      return {
        success: false,
        error: 'Failed to process withdrawal. Please try again.',
      };
    }

    // Initiate Flutterwave transfer
    const transferResult = await initiateFlutterwaveTransfer(withdrawalData, withdrawal.id);

    if (!transferResult.success || !transferResult.data) {
      console.error('❌ Transfer initiation failed, refunding user:', {
        withdrawalId: withdrawal.id,
        userId,
        amount: totalAmount,
        error: transferResult.error,
      });

      // Refund the balance (amount + fee) if transfer initiation failed
      console.log('💰 Attempting to refund user:', {
        userId,
        amount: totalAmount,
        currency: 'NGN',
        withdrawalId: withdrawal.id,
      });

      const { error: refundError, data: refundData } = await supabase.rpc('credit_wallet', {
        p_user_id: userId,
        p_amount: totalAmount, // Refund amount + fee
        p_currency: 'NGN',
      });

      if (refundError) {
        console.error('❌ CRITICAL: Failed to refund user after transfer failure:', {
          withdrawalId: withdrawal.id,
          userId,
          amount: totalAmount,
          error: refundError,
          errorCode: refundError.code,
          errorMessage: refundError.message,
          errorDetails: refundError.details,
        });
        // This is critical - user has been debited but transfer failed and refund failed
        // Log this for manual intervention
        await supabase
          .from('withdrawals')
          .update({
            status: 'failed',
            metadata: {
              error: transferResult.error || 'Transfer initiation failed',
              refund_failed: true,
              refund_error: refundError.message,
              refund_error_code: refundError.code,
              refund_error_details: refundError.details,
              requires_manual_refund: true,
            },
          })
          .eq('id', withdrawal.id);
      } else {
        console.log('✅ Successfully refunded user after transfer failure:', {
          withdrawalId: withdrawal.id,
          userId,
          amount: totalAmount,
          refundResult: refundData,
        });
        // Update withdrawal status
        await supabase
          .from('withdrawals')
          .update({
            status: 'failed',
            metadata: {
              error: transferResult.error || 'Transfer initiation failed',
              refunded: true,
              refunded_at: new Date().toISOString(),
              refund_amount: totalAmount,
            },
          })
          .eq('id', withdrawal.id);
      }

      // Always create FAILED transaction record (even if refund failed)
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'WITHDRAWAL',
          crypto_currency: 'FIAT',
          fiat_amount: withdrawalData.amount,
          fiat_currency: 'NGN',
          fee_amount: feeAmount,
          fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
          fee_currency: 'NGN',
          status: 'FAILED',
          error_message: transferResult.error || 'Transfer initiation failed',
          notes: `Withdrawal to ${withdrawalData.bank_name} - ${withdrawalData.account_name}`,
          metadata: {
            withdrawal_id: withdrawal.id,
            bank_name: withdrawalData.bank_name,
            account_number: withdrawalData.account_number,
            account_name: withdrawalData.account_name,
            bank_code: withdrawalData.bank_code,
            withdrawal_type: 'bank_transfer',
            refund_attempted: true,
            refund_succeeded: !refundError,
            refund_error: refundError?.message || null,
          },
        });

      if (transactionError) {
        console.error('❌ CRITICAL: Failed to create FAILED transaction record:', transactionError);
      } else {
        console.log('✅ Created FAILED transaction record for withdrawal');
      }

      return {
        success: false,
        error: refundError
          ? `Transfer failed and automatic refund failed. Please contact support. Error: ${transferResult.error || 'Transfer initiation failed'}`
          : transferResult.error || 'Failed to initiate transfer. Amount has been refunded to your wallet.',
      };
    }

    // Mark withdrawal as completed immediately when transfer is successfully initiated
    // Flutterwave bank transfers are instant, so if the transfer API call succeeds,
    // the withdrawal is considered completed
    const transferStatus = transferResult.data?.status?.toUpperCase() || '';
    
    // Update withdrawal with transfer details - mark as completed immediately
    const withdrawalStatus = 'completed';
    const { data: updatedWithdrawal, error: updateError } = await supabase
      .from('withdrawals')
      .update({
        status: withdrawalStatus,
        transfer_id: transferResult.data.id?.toString(),
        transfer_reference: transferResult.data.reference,
        metadata: {
          transfer_data: transferResult.data,
          initiated_at: new Date().toISOString(),
          fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
          total_deducted: totalAmount,
        },
      })
      .eq('id', withdrawal.id)
      .select()
      .single();

    // Create COMPLETED transaction record immediately since transfer was initiated successfully
    // Bank transfers via Flutterwave are instant, so we mark as completed immediately
    const { error: transactionError, data: transactionData } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type: 'WITHDRAWAL',
        crypto_currency: 'FIAT',
        fiat_amount: withdrawalData.amount,
        fiat_currency: 'NGN',
        fee_amount: feeAmount,
        fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
        fee_currency: 'NGN',
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        external_transaction_id: transferResult.data.id?.toString(),
        external_reference: transferResult.data.reference,
        notes: `Withdrawal to ${withdrawalData.bank_name} - ${withdrawalData.account_name}`,
        metadata: {
          withdrawal_id: withdrawal.id,
          bank_name: withdrawalData.bank_name,
          account_number: withdrawalData.account_number,
          account_name: withdrawalData.account_name,
          bank_code: withdrawalData.bank_code,
          withdrawal_type: 'bank_transfer',
          transfer_data: transferResult.data,
          transfer_status: transferStatus,
          created_when: 'completed',
        },
      })
      .select()
      .single();

    if (transactionError) {
      console.error('❌ CRITICAL: Failed to create COMPLETED transaction record:', transactionError);
      // Even though transaction record creation failed, the withdrawal was successful
      // Log this for manual intervention but don't fail the withdrawal
      await supabase
        .from('withdrawals')
        .update({
          metadata: {
            ...(updatedWithdrawal?.metadata || {}),
            transaction_record_failed: true,
            transaction_error: transactionError.message,
          },
        })
        .eq('id', withdrawal.id);
    } else {
      console.log('✅ Created COMPLETED transaction record for withdrawal:', transactionData?.id);
    }

    if (updateError) {
      console.error('❌ Error updating withdrawal with transfer details:', updateError);
      // Transfer was initiated but we couldn't update the record
      // This is not critical, the webhook will handle status updates
    }

    // Send notifications for withdrawal submission (marked as completed)
    try {
      await Promise.all([
        sendWithdrawalPushNotification(userId, withdrawalData.amount, feeAmount, 'completed', withdrawal.id),
        userEmail && sendWithdrawalEmailNotification(
          userId,
          userEmail,
          withdrawalData.amount,
          feeAmount,
          'completed',
          withdrawal.id,
          withdrawalData.bank_name,
          withdrawalData.account_number
        ),
      ]);
    } catch (notificationError) {
      console.error('⚠️ Error sending notifications (non-critical):', notificationError);
      // Don't fail withdrawal if notifications fail
    }

    console.log('✅ Withdrawal and transfer initiated successfully:', {
      withdrawalId: withdrawal.id,
      userId,
      transferId: transferResult.data.id,
      transferReference: transferResult.data.reference,
      amount: withdrawalData.amount,
      fee: feeAmount,
      transactionRecordId: transactionData?.id || 'NOT CREATED',
    });

    return {
      success: true,
      data: (updatedWithdrawal || withdrawal) as Withdrawal,
    };
  } catch (error: any) {
    console.error('❌ Error submitting withdrawal:', error);
    return {
      success: false,
      error: error.message || 'Failed to submit withdrawal request',
    };
  }
}

/**
 * Get user's withdrawal history
 */
export async function getWithdrawalHistory(
  limit: number = 50
): Promise<{ success: boolean; data?: Withdrawal[]; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: withdrawals, error: withdrawalsError } = await supabase
      .from('withdrawals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (withdrawalsError) {
      console.error('❌ Error fetching withdrawal history:', withdrawalsError);
      return {
        success: false,
        error: withdrawalsError.message || 'Failed to fetch withdrawal history',
      };
    }

    return { success: true, data: withdrawals as Withdrawal[] };
  } catch (error: any) {
    console.error('❌ Error fetching withdrawal history:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch withdrawal history',
    };
  }
}

/**
 * Get a specific withdrawal by ID
 */
export async function getWithdrawalById(
  withdrawalId: string
): Promise<{ success: boolean; data?: Withdrawal; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (withdrawalError) {
      console.error('❌ Error fetching withdrawal:', withdrawalError);
      return {
        success: false,
        error: withdrawalError.message || 'Failed to fetch withdrawal',
      };
    }

    return { success: true, data: withdrawal as Withdrawal };
  } catch (error: any) {
    console.error('❌ Error fetching withdrawal:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch withdrawal',
    };
  }
}

/**
 * Check Flutterwave transfer status via VPS API
 */
export async function checkTransferStatus(
  transferId: string
): Promise<{ success: boolean; data?: FlutterwaveTransferResponse['data']; error?: string }> {
  try {
    console.log('🔍 Checking transfer status:', transferId);

    // Get current session for authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Call Flutterwave Transfer API on VPS to get status
    const response = await fetch(`${FLUTTERWAVE_TRANSFER_API}/${transferId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Optionally include auth token if VPS requires it
        // 'Authorization': `Bearer ${session.access_token}`,
      },
    });

    const result: FlutterwaveTransferResponse = await response.json();

    if (!response.ok || !result.success) {
      console.error('❌ Failed to fetch transfer status:', result);
      return {
        success: false,
        error: result.error || result.message || 'Failed to fetch transfer status',
      };
    }

    if (result.data) {
      console.log('✅ Transfer status:', result.data.status);
      return {
        success: true,
        data: result.data,
      };
    }

    return { success: false, error: 'Invalid response from transfer service' };
  } catch (error: any) {
    console.error('❌ Error checking transfer status:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please check your connection and try again.',
    };
  }
}

/**
 * Update withdrawal status based on transfer status and send notifications
 */
export async function updateWithdrawalStatus(
  withdrawalId: string,
  transferStatus: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let status = 'processing';
    
    // Map Flutterwave transfer status to withdrawal status
    switch (transferStatus?.toUpperCase()) {
      case 'SUCCESSFUL':
      case 'SUCCESS':
        status = 'completed';
        break;
      case 'FAILED':
      case 'FAILURE':
        status = 'failed';
        break;
      case 'PENDING':
      case 'NEW':
        status = 'processing';
        break;
      default:
        status = 'processing';
    }

    // Get withdrawal details before updating
    const { data: withdrawal, error: fetchError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (fetchError || !withdrawal) {
      return {
        success: false,
        error: 'Withdrawal not found',
      };
    }

    // Update withdrawal status
    const { error } = await supabase
      .from('withdrawals')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId);

    if (error) {
      console.error('❌ Error updating withdrawal status:', error);
      return {
        success: false,
        error: error.message || 'Failed to update withdrawal status',
      };
    }

    // Create transaction record ONLY when withdrawal is completed or failed
    // This ensures transaction history only shows successful or failed withdrawals
    if (status === 'completed' || status === 'failed') {
      const feeAmount = withdrawal.fee_amount || calculateWithdrawalFee(withdrawal.amount);
      const transactionStatus = status === 'completed' ? 'COMPLETED' : 'FAILED';
      
      // Check if transaction already exists (to avoid duplicates)
      const { data: existingTransaction } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', withdrawal.user_id)
        .eq('metadata->>withdrawal_id', withdrawalId)
        .eq('transaction_type', 'WITHDRAWAL')
        .maybeSingle();

      if (!existingTransaction) {
        // Create new transaction record
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            user_id: withdrawal.user_id,
            transaction_type: 'WITHDRAWAL',
            crypto_currency: 'FIAT',
            fiat_amount: withdrawal.amount,
            fiat_currency: 'NGN',
            fee_amount: feeAmount,
            fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
            fee_currency: 'NGN',
            status: transactionStatus,
            completed_at: status === 'completed' ? new Date().toISOString() : null,
            error_message: status === 'failed' ? (withdrawal.metadata?.error || 'Withdrawal failed') : null,
            external_transaction_id: withdrawal.transfer_id,
            external_reference: withdrawal.transfer_reference,
            notes: `Withdrawal to ${withdrawal.bank_name} - ${withdrawal.account_name}`,
            metadata: {
              withdrawal_id: withdrawal.id,
              bank_name: withdrawal.bank_name,
              account_number: withdrawal.account_number,
              account_name: withdrawal.account_name,
              bank_code: withdrawal.bank_code,
              withdrawal_type: 'bank_transfer',
              transfer_data: withdrawal.metadata?.transfer_data,
              created_when: status === 'completed' ? 'completed' : 'failed',
            },
          });

        if (transactionError) {
          console.error('⚠️ Error creating withdrawal transaction record:', transactionError);
          // Don't fail withdrawal status update if transaction creation fails
        } else {
          console.log(`✅ Created transaction record for withdrawal ${withdrawalId} with status ${transactionStatus}`);
        }
      } else {
        console.log(`⏭️ Transaction record already exists for withdrawal ${withdrawalId}, skipping creation`);
      }
    }

    // Send notifications if status changed to completed or failed
    if (status === 'completed' || status === 'failed') {
      try {
        // Get user email from user_profiles or auth.users
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('user_id', withdrawal.user_id)
          .maybeSingle();
        
        // If not in profile, try to get from auth (this might require service role)
        let userEmail = profile?.email || '';
        if (!userEmail) {
          // Try to get from auth metadata if available
          const { data: { user } } = await supabase.auth.getUser();
          userEmail = user?.email || '';
        }

        const feeAmount = withdrawal.fee_amount || calculateWithdrawalFee(withdrawal.amount);

        await Promise.all([
          sendWithdrawalPushNotification(
            withdrawal.user_id,
            withdrawal.amount,
            feeAmount,
            status,
            withdrawalId
          ),
          userEmail && sendWithdrawalEmailNotification(
            withdrawal.user_id,
            userEmail,
            withdrawal.amount,
            feeAmount,
            status,
            withdrawalId,
            withdrawal.bank_name,
            withdrawal.account_number
          ),
        ]);
      } catch (notificationError) {
        console.error('⚠️ Error sending status change notifications (non-critical):', notificationError);
        // Don't fail status update if notifications fail
      }
    }

    console.log(`✅ Withdrawal ${withdrawalId} status updated to: ${status}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error updating withdrawal status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update withdrawal status',
    };
  }
}

