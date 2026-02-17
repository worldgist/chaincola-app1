// Sync Withdrawal Transactions Edge Function
// Updates transaction status based on withdrawal status
// Called by cron job every minute to keep transaction statuses in sync

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

    console.log('🔄 Starting withdrawal transaction sync...');

    // Find all withdrawal transactions that are PENDING or CONFIRMING
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, status, metadata, created_at')
      .eq('transaction_type', 'WITHDRAWAL')
      .in('status', ['PENDING', 'CONFIRMING'])
      .order('created_at', { ascending: true })
      .limit(100); // Process max 100 at a time

    if (fetchError) {
      console.error('❌ Error fetching pending withdrawal transactions:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      console.log('✅ No pending withdrawal transactions to sync');
      return new Response(
        JSON.stringify({ success: true, synced: 0, updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingTransactions.length} pending withdrawal transactions to check`);

    let syncedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    // Process each transaction
    for (const transaction of pendingTransactions) {
      try {
        const withdrawalId = transaction.metadata?.withdrawal_id;
        
        if (!withdrawalId) {
          console.log(`⚠️ Transaction ${transaction.id} has no withdrawal_id in metadata, skipping`);
          continue;
        }

        // Fetch the corresponding withdrawal
        const { data: withdrawal, error: withdrawalError } = await supabase
          .from('withdrawals')
          .select('id, status, updated_at, metadata')
          .eq('id', withdrawalId)
          .single();

        if (withdrawalError || !withdrawal) {
          console.error(`❌ Error fetching withdrawal ${withdrawalId}:`, withdrawalError);
          errors.push(`Withdrawal ${withdrawalId}: ${withdrawalError?.message || 'Not found'}`);
          continue;
        }

        syncedCount++;

        // Map withdrawal status to transaction status
        let newTransactionStatus: string;
        let shouldUpdate = false;

        switch (withdrawal.status?.toLowerCase()) {
          case 'completed':
            newTransactionStatus = 'COMPLETED';
            shouldUpdate = transaction.status !== 'COMPLETED';
            break;
          case 'failed':
            newTransactionStatus = 'FAILED';
            shouldUpdate = transaction.status !== 'FAILED';
            break;
          case 'cancelled':
            newTransactionStatus = 'CANCELLED';
            shouldUpdate = transaction.status !== 'CANCELLED';
            break;
          case 'processing':
            newTransactionStatus = 'CONFIRMING';
            shouldUpdate = transaction.status === 'PENDING';
            break;
          default:
            // Keep current status if withdrawal status is unknown
            continue;
        }

        if (shouldUpdate) {
          const updateData: any = {
            status: newTransactionStatus,
            updated_at: new Date().toISOString(),
          };

          // Set completed_at if status is COMPLETED
          if (newTransactionStatus === 'COMPLETED') {
            updateData.completed_at = withdrawal.updated_at || new Date().toISOString();
          }

          // Set error_message if status is FAILED
          if (newTransactionStatus === 'FAILED') {
            updateData.error_message = withdrawal.metadata?.error || 'Withdrawal failed';
          }

          // Update the transaction
          const { error: updateError } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', transaction.id);

          if (updateError) {
            console.error(`❌ Error updating transaction ${transaction.id}:`, updateError);
            errors.push(`Transaction ${transaction.id}: ${updateError.message}`);
          } else {
            updatedCount++;
            console.log(`✅ Updated transaction ${transaction.id} from ${transaction.status} to ${newTransactionStatus} (withdrawal ${withdrawalId} status: ${withdrawal.status})`);
          }
        } else {
          console.log(`⏭️ Transaction ${transaction.id} already has correct status (${transaction.status}), skipping`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing transaction ${transaction.id}:`, error);
        errors.push(`Transaction ${transaction.id}: ${error.message}`);
      }
    }

    const result = {
      success: true,
      synced: syncedCount,
      updated: updatedCount,
      total: pendingTransactions.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`✅ Sync complete: ${updatedCount}/${syncedCount} transactions updated`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error in sync-withdrawal-transactions:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});









