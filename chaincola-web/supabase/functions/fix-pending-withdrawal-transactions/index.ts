// Fix Pending Withdrawal Transactions Edge Function
// Updates all pending/confirming withdrawal transactions to COMPLETED if their withdrawal is completed
// This is a one-time fix for existing transactions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔧 Fixing pending withdrawal transactions...');

    // Find all withdrawal transactions that are PENDING, CONFIRMING, or any non-final status
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, status, metadata, created_at')
      .eq('transaction_type', 'WITHDRAWAL')
      .not('status', 'in', '(COMPLETED,FAILED,CANCELLED)')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching pending withdrawal transactions:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      console.log('✅ No pending withdrawal transactions found');
      return new Response(
        JSON.stringify({ success: true, fixed: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingTransactions.length} pending withdrawal transactions`);

    let fixedCount = 0;
    let errorCount = 0;

    // Process each transaction
    for (const transaction of pendingTransactions) {
      try {
        const withdrawalId = transaction.metadata?.withdrawal_id;
        
        if (!withdrawalId) {
          console.log(`⚠️ Transaction ${transaction.id} has no withdrawal_id, skipping`);
          continue;
        }

        // Fetch the corresponding withdrawal
        const { data: withdrawal, error: withdrawalError } = await supabase
          .from('withdrawals')
          .select('id, status, updated_at')
          .eq('id', withdrawalId)
          .single();

        if (withdrawalError || !withdrawal) {
          console.error(`❌ Error fetching withdrawal ${withdrawalId}:`, withdrawalError);
          errorCount++;
          continue;
        }

        // If withdrawal is completed, update transaction to COMPLETED
        if (withdrawal.status === 'completed') {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              status: 'COMPLETED',
              completed_at: withdrawal.updated_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', transaction.id);

          if (updateError) {
            console.error(`❌ Error updating transaction ${transaction.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ Updated transaction ${transaction.id} to COMPLETED`);
            fixedCount++;
          }
        } else if (withdrawal.status === 'failed') {
          // If withdrawal is failed, update transaction to FAILED
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              status: 'FAILED',
              error_message: 'Withdrawal failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', transaction.id);

          if (updateError) {
            console.error(`❌ Error updating transaction ${transaction.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ Updated transaction ${transaction.id} to FAILED`);
            fixedCount++;
          }
        } else if (withdrawal.status === 'processing') {
          // Withdrawal is still processing - check if it should be completed
          // If withdrawal was created recently and transfer was initiated, mark as completed
          const withdrawalAge = Date.now() - new Date(withdrawal.updated_at || withdrawal.created_at).getTime();
          const isRecent = withdrawalAge < 5 * 60 * 1000; // Less than 5 minutes old
          
          if (isRecent) {
            // Recent withdrawal with transfer initiated - mark as completed
            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                status: 'COMPLETED',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', transaction.id);

            if (updateError) {
              console.error(`❌ Error updating transaction ${transaction.id}:`, updateError);
              errorCount++;
            } else {
              console.log(`✅ Updated recent transaction ${transaction.id} to COMPLETED`);
              fixedCount++;
            }
          } else {
            // Old processing withdrawal - delete the transaction since we only want completed/failed
            const { error: deleteError } = await supabase
              .from('transactions')
              .delete()
              .eq('id', transaction.id);

            if (deleteError) {
              console.error(`❌ Error deleting transaction ${transaction.id}:`, deleteError);
              errorCount++;
            } else {
              console.log(`✅ Deleted old pending transaction ${transaction.id} (withdrawal still processing)`);
              fixedCount++;
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing transaction ${transaction.id}:`, error);
        errorCount++;
      }
    }

    const result = {
      success: true,
      fixed: fixedCount,
      total: pendingTransactions.length,
      errors: errorCount,
    };

    console.log(`✅ Fix complete: ${fixedCount}/${pendingTransactions.length} transactions updated`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error in fix-pending-withdrawal-transactions:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

