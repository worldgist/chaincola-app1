// Admin Control Center API
// Handles Settlement, Limits, Reconciliations, and Audit Logs

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, ...params } = body;

    // Helper function to create audit log
    const createAuditLog = async (
      actionType: string,
      description: string,
      targetUserId?: string,
      targetEntityType?: string,
      targetEntityId?: string,
      oldValue?: any,
      newValue?: any,
      changes?: any
    ) => {
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        performed_by: user.id,
        target_user_id: targetUserId,
        target_entity_type: targetEntityType,
        target_entity_id: targetEntityId,
        description,
        old_value: oldValue,
        new_value: newValue,
        changes: changes || {},
        metadata: {
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown',
        },
      });
    };

    switch (action) {
      // ========================================================================
      // SETTLEMENTS
      // ========================================================================
      case 'getSettlements': {
        const { status, limit = 50, offset = 0 } = params;
        let query = supabase
          .from('settlements')
          .select('*')
          .order('settlement_date', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'createSettlement': {
        const { settlement_type, settlement_date, period_start, period_end, notes } = params;

        // Calculate settlement amounts from transactions in period
        const { data: transactions } = await supabase
          .from('transactions')
          .select('fiat_amount, crypto_amount, transaction_type, crypto_currency')
          .gte('created_at', period_start)
          .lte('created_at', period_end)
          .in('transaction_type', ['SELL', 'BUY', 'DEPOSIT', 'WITHDRAWAL']);

        // Calculate totals
        let totalAmount = 0;
        let feesCollected = 0;
        let transactionCount = transactions?.length || 0;
        const userSet = new Set<string>();

        transactions?.forEach((tx: any) => {
          if (tx.fiat_amount) {
            totalAmount += parseFloat(tx.fiat_amount.toString());
          }
          if (tx.metadata?.platform_fee) {
            feesCollected += parseFloat(tx.metadata.platform_fee.toString());
          }
          if (tx.user_id) {
            userSet.add(tx.user_id);
          }
        });

        const settlementReference = `SETTLE-${settlement_date}-${Date.now()}`;

        const { data: settlement, error } = await supabase
          .from('settlements')
          .insert({
            settlement_type,
            settlement_date,
            period_start,
            period_end,
            total_amount: totalAmount,
            fees_collected: feesCollected,
            net_amount: totalAmount - feesCollected,
            transaction_count: transactionCount,
            user_count: userSet.size,
            settlement_reference: settlementReference,
            notes,
            status: 'PENDING',
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'SETTLEMENT_PROCESSED',
          `Created settlement ${settlementReference} for period ${period_start} to ${period_end}`,
          undefined,
          'SETTLEMENT',
          settlement.id,
          undefined,
          settlement
        );

        return new Response(
          JSON.stringify({ success: true, data: settlement }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'processSettlement': {
        const { settlement_id } = params;

        const { data: settlement, error: fetchError } = await supabase
          .from('settlements')
          .select('*')
          .eq('id', settlement_id)
          .single();

        if (fetchError || !settlement) {
          return new Response(
            JSON.stringify({ success: false, error: 'Settlement not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: updated, error } = await supabase
          .from('settlements')
          .update({
            status: 'COMPLETED',
            processed_by: user.id,
            processed_at: new Date().toISOString(),
          })
          .eq('id', settlement_id)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'SETTLEMENT_PROCESSED',
          `Processed settlement ${settlement.settlement_reference}`,
          undefined,
          'SETTLEMENT',
          settlement_id,
          settlement,
          updated
        );

        return new Response(
          JSON.stringify({ success: true, data: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ========================================================================
      // LIMITS
      // ========================================================================
      case 'getLimits': {
        const { limit_type, currency, user_id, is_active } = params;
        let query = supabase
          .from('system_limits')
          .select('*')
          .order('created_at', { ascending: false });

        if (limit_type) query = query.eq('limit_type', limit_type);
        if (currency) query = query.eq('currency', currency);
        if (user_id) query = query.eq('user_id', user_id);
        if (is_active !== undefined) query = query.eq('is_active', is_active);

        const { data, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'createLimit': {
        const { limit_type, currency, amount, user_type, user_id, description, effective_from, effective_until } = params;

        const { data: limit, error } = await supabase
          .from('system_limits')
          .insert({
            limit_type,
            currency,
            amount,
            user_type: user_type || 'ALL',
            user_id: user_id || null,
            description,
            effective_from: effective_from || new Date().toISOString(),
            effective_until: effective_until || null,
            created_by: user.id,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'LIMIT_CREATED',
          `Created ${limit_type} limit: ${amount} ${currency}`,
          user_id,
          'LIMIT',
          limit.id,
          undefined,
          limit
        );

        return new Response(
          JSON.stringify({ success: true, data: limit }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateLimit': {
        const { limit_id, amount, is_active, effective_until, description } = params;

        const { data: oldLimit } = await supabase
          .from('system_limits')
          .select('*')
          .eq('id', limit_id)
          .single();

        const updateData: any = {};
        if (amount !== undefined) updateData.amount = amount;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (effective_until !== undefined) updateData.effective_until = effective_until;
        if (description !== undefined) updateData.description = description;
        updateData.updated_by = user.id;

        const { data: updated, error } = await supabase
          .from('system_limits')
          .update(updateData)
          .eq('id', limit_id)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'LIMIT_UPDATED',
          `Updated limit ${limit_id}`,
          oldLimit?.user_id,
          'LIMIT',
          limit_id,
          oldLimit,
          updated
        );

        return new Response(
          JSON.stringify({ success: true, data: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deleteLimit': {
        const { limit_id } = params;

        const { data: oldLimit } = await supabase
          .from('system_limits')
          .select('*')
          .eq('id', limit_id)
          .single();

        const { error } = await supabase
          .from('system_limits')
          .delete()
          .eq('id', limit_id);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'LIMIT_DELETED',
          `Deleted limit ${limit_id}`,
          oldLimit?.user_id,
          'LIMIT',
          limit_id,
          oldLimit,
          undefined
        );

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ========================================================================
      // RECONCILIATIONS
      // ========================================================================
      case 'getReconciliations': {
        const { status, reconciliation_type, limit = 50, offset = 0 } = params;
        let query = supabase
          .from('reconciliations')
          .select('*')
          .order('reconciliation_date', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq('status', status);
        if (reconciliation_type) query = query.eq('reconciliation_type', reconciliation_type);

        const { data, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'runReconciliation': {
        const { reconciliation_type, period_start, period_end, currency } = params;

        // Start reconciliation
        const { data: reconciliation, error: createError } = await supabase
          .from('reconciliations')
          .insert({
            reconciliation_type,
            period_start: period_start || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            period_end: period_end || new Date().toISOString(),
            currency: currency || 'NGN',
            status: 'IN_PROGRESS',
            initiated_by: user.id,
          })
          .select()
          .single();

        if (createError) {
          return new Response(
            JSON.stringify({ success: false, error: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Perform reconciliation based on type
        let expectedAmount = 0;
        let actualAmount = 0;
        let transactionsChecked = 0;
        const discrepancies: any[] = [];

        if (reconciliation_type === 'BALANCE' || reconciliation_type === 'NGN_FLOAT') {
          // Reconcile NGN float balance
          const { data: systemWallet } = await supabase
            .from('system_wallets')
            .select('ngn_float_balance')
            .eq('id', 1)
            .single();

          const { data: userBalances } = await supabase
            .from('wallet_balances')
            .select('balance')
            .eq('currency', 'NGN');

          const totalUserBalances = userBalances?.reduce((sum, b) => sum + parseFloat(b.balance?.toString() || '0'), 0) || 0;
          actualAmount = parseFloat(systemWallet?.ngn_float_balance?.toString() || '0');
          expectedAmount = totalUserBalances;

          if (Math.abs(actualAmount - expectedAmount) > 0.01) {
            discrepancies.push({
              type: 'BALANCE_MISMATCH',
              expected: expectedAmount,
              actual: actualAmount,
              difference: actualAmount - expectedAmount,
            });
          }
        } else if (reconciliation_type === 'TRANSACTION') {
          // Reconcile transactions
          const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .gte('created_at', reconciliation.period_start)
            .lte('created_at', reconciliation.period_end);

          transactionsChecked = transactions?.length || 0;

          // Check for missing transactions, duplicates, etc.
          // This is a simplified version - can be expanded
        }

        const discrepancyAmount = actualAmount - expectedAmount;

        const { data: updated, error: updateError } = await supabase
          .from('reconciliations')
          .update({
            status: discrepancies.length > 0 ? 'DISCREPANCY_FOUND' : 'COMPLETED',
            expected_amount: expectedAmount,
            actual_amount: actualAmount,
            discrepancy_amount: discrepancyAmount,
            transactions_checked: transactionsChecked,
            discrepancies_found: discrepancies.length,
            discrepancies: discrepancies,
            completed_by: user.id,
            completed_at: new Date().toISOString(),
          })
          .eq('id', reconciliation.id)
          .select()
          .single();

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await createAuditLog(
          'RECONCILIATION_RUN',
          `Ran ${reconciliation_type} reconciliation`,
          undefined,
          'RECONCILIATION',
          reconciliation.id,
          undefined,
          updated
        );

        return new Response(
          JSON.stringify({ success: true, data: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ========================================================================
      // AUDIT LOGS
      // ========================================================================
      case 'getAuditLogs': {
        const { action_type, target_user_id, target_entity_type, limit = 100, offset = 0, start_date, end_date } = params;
        
        let query = supabase
          .from('audit_logs')
          .select('*, performed_by_user:user_profiles!audit_logs_performed_by_fkey(email, full_name)')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (action_type) query = query.eq('action_type', action_type);
        if (target_user_id) query = query.eq('target_user_id', target_user_id);
        if (target_entity_type) query = query.eq('target_entity_type', target_entity_type);
        if (start_date) query = query.gte('created_at', start_date);
        if (end_date) query = query.lte('created_at', end_date);

        const { data, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Admin control center error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
