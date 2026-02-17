/**
 * Edge Function to fix missing withdrawal transactions
 * This function creates transaction records for withdrawals that don't have them
 * 
 * Usage:
 *   curl -X POST https://your-project.supabase.co/functions/v1/fix-withdrawal-transactions \
 *     -H "Authorization: Bearer YOUR_ANON_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"user_id": "optional-user-id"}'
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WITHDRAWAL_FEE_PERCENTAGE = 0.03;

function calculateWithdrawalFee(amount: number): number {
  return Math.round(amount * WITHDRAWAL_FEE_PERCENTAGE * 100) / 100;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body (optional user_id filter)
    const body = await req.json().catch(() => ({}));
    const { user_id } = body;

    // Get all withdrawals (optionally filtered by user)
    let query = supabase
      .from('withdrawals')
      .select('id, user_id, amount, fee_amount, currency, status, bank_name, account_name, account_number, bank_code, transfer_id, transfer_reference, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data: withdrawals, error: withdrawalsError } = await query;

    if (withdrawalsError) {
      console.error('Error fetching withdrawals:', withdrawalsError);
      return new Response(
        JSON.stringify({ success: false, error: withdrawalsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!withdrawals || withdrawals.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No withdrawals found',
          fixed: 0,
          alreadyExists: 0,
          errors: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let fixed = 0;
    let alreadyExists = 0;
    let errors = 0;
    const errorDetails: Array<{ withdrawalId: string; error: string }> = [];

    // Process each withdrawal
    for (const withdrawal of withdrawals) {
      // Check if transaction already exists
      const { data: existingTransaction } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', withdrawal.user_id)
        .eq('metadata->>withdrawal_id', withdrawal.id)
        .maybeSingle();

      if (existingTransaction) {
        alreadyExists++;
        continue;
      }

      // Calculate fee if not present
      const feeAmount = withdrawal.fee_amount || calculateWithdrawalFee(parseFloat(withdrawal.amount.toString()));
      
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
          fiat_amount: parseFloat(withdrawal.amount.toString()),
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
            fixed_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single();

      if (transactionError) {
        errors++;
        errorDetails.push({
          withdrawalId: withdrawal.id,
          error: transactionError.message || 'Unknown error',
        });
        console.error(`Failed to create transaction for withdrawal ${withdrawal.id}:`, transactionError);
      } else if (transactionData) {
        fixed++;
        console.log(`Created transaction ${transactionData.id} for withdrawal ${withdrawal.id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: withdrawals.length,
        fixed,
        alreadyExists,
        errors,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});









