// Admin Treasury Management
// Comprehensive admin interface for managing system wallet and treasury

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAlchemyUsdPricesBySymbols,
  getAlchemyApiKey,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

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

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'getSystemWallet': {
        const { data: systemWallet, error } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: systemWallet }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'adjustLiquidity': {
        const { asset, amount, operation, reason, source } = body;

        if (!asset || amount === undefined || !operation || !reason) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get current system wallet
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate new balance
        let updateData: any = {};
        let newBalance = 0;

        if (asset === 'NGN') {
          newBalance = operation === 'add' 
            ? parseFloat(systemWallet.ngn_float_balance) + amount
            : parseFloat(systemWallet.ngn_float_balance) - amount;
          
          if (newBalance < 0) {
            return new Response(
              JSON.stringify({ success: false, error: 'Insufficient balance' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          updateData.ngn_float_balance = newBalance;
        } else {
          const inventoryField = `${asset.toLowerCase()}_inventory`;
          const currentInventory = parseFloat(systemWallet[inventoryField] || '0');
          newBalance = operation === 'add'
            ? currentInventory + amount
            : currentInventory - amount;
          
          if (newBalance < 0) {
            return new Response(
              JSON.stringify({ success: false, error: 'Insufficient inventory' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          updateData[inventoryField] = newBalance;
        }

        // Update system wallet
        const { data: updatedWallet, error: updateError } = await supabase
          .from('system_wallets')
          .update(updateData)
          .eq('id', 1)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating system wallet:', updateError);
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!updatedWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update system wallet' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log the adjustment in audit logs (with error handling)
        const description = source && asset === 'NGN' && operation === 'add'
          ? `${operation === 'add' ? 'Added' : 'Removed'} ${amount} ${asset} from ${source} - ${reason}`
          : `${operation === 'add' ? 'Added' : 'Removed'} ${amount} ${asset} - ${reason}`;

        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert({
            action_type: 'TREASURY_ADJUSTMENT',
            performed_by: user.id,
            target_entity_type: 'SYSTEM_WALLET',
            description,
            new_value: {
              asset,
              amount,
              operation,
              reason,
              source: source || null,
              new_balance: newBalance,
            },
          });

        // Log error but don't fail the operation (trigger will also log)
        if (auditError) {
          console.error('Failed to log to audit_logs (trigger will log instead):', auditError);
          // Also log to admin_action_logs as fallback
          await supabase
            .from('admin_action_logs')
            .insert({
              admin_user_id: user.id,
              action_type: operation === 'add' ? 'credit' : 'debit',
              action_details: {
                currency: asset,
                amount,
                reason,
                balance_after: newBalance,
                balance_before: asset === 'NGN' 
                  ? parseFloat(systemWallet.ngn_float_balance) 
                  : parseFloat(systemWallet[`${asset.toLowerCase()}_inventory`] || '0'),
              },
            })
            .catch(err => console.error('Failed to log to admin_action_logs:', err));
        }

        return new Response(
          JSON.stringify({ success: true, new_balance: newBalance }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getStats': {
        const { data: systemWallet, error: systemWalletError } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (systemWalletError || !systemWallet) {
          return new Response(
            JSON.stringify({
              success: false,
              error: systemWalletError?.message || 'System wallet not found',
            }),
            {
              status: systemWalletError ? 500 : 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const { data: userWallets, error: userWalletsError } = await supabase
          .from('user_wallets')
          .select('ngn_balance, btc_balance, eth_balance, usdt_balance, usdc_balance, xrp_balance, sol_balance');

        if (userWalletsError) {
          return new Response(
            JSON.stringify({ success: false, error: userWalletsError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: recentTransactions, error: recentTxError } = await supabase
          .from('transactions')
          .select('*')
          .eq('transaction_type', 'SELL')
          .order('created_at', { ascending: false })
          .limit(100);

        if (recentTxError) {
          return new Response(
            JSON.stringify({ success: false, error: recentTxError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const totalUserNgn = (userWallets || []).reduce(
          (sum, w) => sum + parseFloat(w.ngn_balance || '0'),
          0
        );

        const pricedAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const;
        const alchemyKey = getAlchemyApiKey();
        if (!alchemyKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'ALCHEMY_API_KEY not set (required for live prices)' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const usdToNgn = await getUsdToNgnRate();
        const alchemyMap = await fetchAlchemyUsdPricesBySymbols([...pricedAssets]);
        const prices: Record<string, number> = {};

        for (const sym of pricedAssets) {
          const row = alchemyMap.get(sym);
          if (!row?.usd || row.usd <= 0) continue;
          prices[sym] = row.usd * usdToNgn;
        }

        const missingPricing = pricedAssets.filter((a) => !(prices[a] > 0) || Number.isNaN(prices[a]));
        if (missingPricing.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Missing live prices for: ${missingPricing.join(', ')}. Check Alchemy Prices API availability.`,
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const cryptoInventoryValue =
          parseFloat(systemWallet.btc_inventory || '0') * prices['BTC'] +
          parseFloat(systemWallet.eth_inventory || '0') * prices['ETH'] +
          parseFloat(systemWallet.usdt_inventory || '0') * prices['USDT'] +
          parseFloat(systemWallet.usdc_inventory || '0') * prices['USDC'] +
          parseFloat(systemWallet.xrp_inventory || '0') * prices['XRP'] +
          parseFloat(systemWallet.sol_inventory || '0') * prices['SOL'];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { data: todaySells, error: todaySellsError } = await supabase
          .from('transactions')
          .select('fiat_amount')
          .eq('transaction_type', 'SELL')
          .eq('status', 'COMPLETED')
          .gte('created_at', today.toISOString())
          .lt('created_at', tomorrow.toISOString());

        if (todaySellsError) {
          return new Response(
            JSON.stringify({ success: false, error: todaySellsError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const dailySellVolume = (todaySells || []).reduce(
          (sum, t) => sum + parseFloat(t.fiat_amount || '0'),
          0
        );

        const stats = {
          total_ngn_float: parseFloat(systemWallet.ngn_float_balance || '0'),
          total_crypto_inventory_value_ngn: cryptoInventoryValue,
          total_user_balances_ngn: totalUserNgn,
          total_system_value:
            parseFloat(systemWallet.ngn_float_balance || '0') + cryptoInventoryValue,
          recent_transactions_count: recentTransactions?.length ?? 0,
          daily_sell_volume: dailySellVolume,
        };

        return new Response(
          JSON.stringify({ success: true, data: stats }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getUserWallet': {
        const { user_id } = body;
        if (!user_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'user_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: userWallet, error } = await supabase
          .from('user_wallets')
          .select('*')
          .eq('user_id', user_id)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: userWallet }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getSettlements': {
        const { data: settlements, error } = await supabase
          .from('settlements')
          .select('*')
          .order('settlement_date', { ascending: false })
          .limit(100);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: settlements }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'createSettlement': {
        const { settlement_type, period_start, period_end, notes } = body;

        if (!settlement_type || !period_start || !period_end) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate settlement amounts from transactions in period
        const { data: transactions } = await supabase
          .from('transactions')
          .select('fiat_amount, fees')
          .gte('created_at', period_start)
          .lte('created_at', period_end);

        const totalAmount = transactions?.reduce((sum, t) => sum + parseFloat(t.fiat_amount || '0'), 0) || 0;
        const feesCollected = transactions?.reduce((sum, t) => sum + parseFloat(t.fees || '0'), 0) || 0;
        const netAmount = totalAmount - feesCollected;
        const transactionCount = transactions?.length || 0;

        // Get unique user count
        const { data: uniqueUsers } = await supabase
          .from('transactions')
          .select('user_id')
          .gte('created_at', period_start)
          .lte('created_at', period_end);

        const userCount = new Set(uniqueUsers?.map(u => u.user_id) || []).size;

        const { data: settlement, error } = await supabase
          .from('settlements')
          .insert({
            settlement_type,
            settlement_date: new Date().toISOString().split('T')[0],
            status: 'PENDING',
            total_amount: totalAmount,
            currency: 'NGN',
            fees_collected: feesCollected,
            net_amount: netAmount,
            period_start,
            period_end,
            transaction_count: transactionCount,
            user_count: userCount,
            notes,
            processed_by: user.id,
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'SETTLEMENT_PROCESSED',
          performed_by: user.id,
          target_entity_type: 'SETTLEMENT',
          target_entity_id: settlement.id,
          description: `Created ${settlement_type} settlement for period ${period_start} to ${period_end}`,
          new_value: settlement,
        });

        return new Response(
          JSON.stringify({ success: true, data: settlement }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'processSettlement': {
        const { settlement_id } = body;

        if (!settlement_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'settlement_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: settlement, error: updateError } = await supabase
          .from('settlements')
          .update({
            status: 'COMPLETED',
            processed_by: user.id,
            processed_at: new Date().toISOString(),
          })
          .eq('id', settlement_id)
          .select()
          .single();

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'SETTLEMENT_PROCESSED',
          performed_by: user.id,
          target_entity_type: 'SETTLEMENT',
          target_entity_id: settlement_id,
          description: `Processed settlement ${settlement_id}`,
          new_value: settlement,
        });

        return new Response(
          JSON.stringify({ success: true, data: settlement }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getLimits': {
        const { data: limits, error } = await supabase
          .from('system_limits')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: limits }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'createLimit': {
        const { limit_type, currency, amount, user_type, user_id, description, effective_from, effective_until } = body;

        if (!limit_type || !currency || amount === undefined) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'LIMIT_CREATED',
          performed_by: user.id,
          target_entity_type: 'LIMIT',
          target_entity_id: limit.id,
          description: `Created limit: ${limit_type} for ${currency}`,
          new_value: limit,
        });

        return new Response(
          JSON.stringify({ success: true, data: limit }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateLimit': {
        const { limit_id, limit_type, currency, amount, user_type, user_id, description, effective_from, effective_until } = body;

        if (!limit_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'limit_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get old value for audit log
        const { data: oldLimit } = await supabase
          .from('system_limits')
          .select('*')
          .eq('id', limit_id)
          .single();

        const { data: limit, error } = await supabase
          .from('system_limits')
          .update({
            limit_type,
            currency,
            amount,
            user_type,
            user_id: user_id || null,
            description,
            effective_from,
            effective_until: effective_until || null,
            updated_by: user.id,
          })
          .eq('id', limit_id)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'LIMIT_UPDATED',
          performed_by: user.id,
          target_entity_type: 'LIMIT',
          target_entity_id: limit_id,
          description: `Updated limit: ${limit_type} for ${currency}`,
          old_value: oldLimit,
          new_value: limit,
        });

        return new Response(
          JSON.stringify({ success: true, data: limit }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deleteLimit': {
        const { limit_id } = body;

        if (!limit_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'limit_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get old value for audit log
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

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'LIMIT_DELETED',
          performed_by: user.id,
          target_entity_type: 'LIMIT',
          target_entity_id: limit_id,
          description: `Deleted limit: ${oldLimit?.limit_type} for ${oldLimit?.currency}`,
          old_value: oldLimit,
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getReconciliations': {
        const { data: reconciliations, error } = await supabase
          .from('reconciliations')
          .select('*')
          .order('reconciliation_date', { ascending: false })
          .limit(100);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: reconciliations }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'runReconciliation': {
        const { reconciliation_type, period_start, period_end } = body;

        if (!reconciliation_type) {
          return new Response(
            JSON.stringify({ success: false, error: 'reconciliation_type required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let expectedAmount = 0;
        let actualAmount = 0;
        let discrepancyAmount = 0;
        let transactionsChecked = 0;
        let discrepanciesFound = 0;
        const discrepancies: any[] = [];
        const details: any = {};

        // Run reconciliation based on type
        if (reconciliation_type === 'NGN_FLOAT' || reconciliation_type === 'FULL_SYSTEM') {
          // Get system wallet NGN balance
          const { data: systemWallet } = await supabase
            .from('system_wallets')
            .select('ngn_float_balance')
            .eq('id', 1)
            .single();

          actualAmount = parseFloat(systemWallet?.ngn_float_balance || '0');

          // Calculate expected from transactions
          const periodFilter: any = {};
          if (period_start) periodFilter.gte = period_start;
          if (period_end) periodFilter.lte = period_end;

          const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('transaction_type', 'SELL');

          if (period_start || period_end) {
            const query = supabase.from('transactions').select('*').eq('transaction_type', 'SELL');
            if (period_start) query.gte('created_at', period_start);
            if (period_end) query.lte('created_at', period_end);
            const result = await query;
            transactionsChecked = result.data?.length || 0;
            expectedAmount = result.data?.reduce((sum, t) => sum + parseFloat(t.fiat_amount || '0'), 0) || 0;
          } else {
            transactionsChecked = transactions?.length || 0;
            expectedAmount = transactions?.reduce((sum, t) => sum + parseFloat(t.fiat_amount || '0'), 0) || 0;
          }

          discrepancyAmount = actualAmount - expectedAmount;
          if (Math.abs(discrepancyAmount) > 0.01) {
            discrepanciesFound = 1;
            discrepancies.push({
              type: 'NGN_FLOAT_MISMATCH',
              expected: expectedAmount,
              actual: actualAmount,
              difference: discrepancyAmount,
            });
          }
        }

        const { data: reconciliation, error } = await supabase
          .from('reconciliations')
          .insert({
            reconciliation_type,
            status: 'COMPLETED',
            reconciliation_date: new Date().toISOString().split('T')[0],
            period_start: period_start || null,
            period_end: period_end || null,
            expected_amount: expectedAmount,
            actual_amount: actualAmount,
            discrepancy_amount: discrepancyAmount,
            currency: 'NGN',
            transactions_checked: transactionsChecked,
            discrepancies_found: discrepanciesFound,
            details,
            discrepancies,
            initiated_by: user.id,
            completed_by: user.id,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'RECONCILIATION_RUN',
          performed_by: user.id,
          target_entity_type: 'RECONCILIATION',
          target_entity_id: reconciliation.id,
          description: `Ran ${reconciliation_type} reconciliation`,
          new_value: reconciliation,
        });

        return new Response(
          JSON.stringify({ success: true, data: reconciliation }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getAuditLogs': {
        const { filters } = body;
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (filters?.action_type) {
          query = query.eq('action_type', filters.action_type);
        }
        if (filters?.start_date) {
          query = query.gte('created_at', filters.start_date);
        }
        if (filters?.end_date) {
          query = query.lte('created_at', filters.end_date);
        }
        if (filters?.target_user_id) {
          query = query.eq('target_user_id', filters.target_user_id);
        }

        const { data: logs, error } = await query;

        if (error) {
          console.error('Error fetching audit logs:', error);
          // Return empty array if table doesn't exist yet
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            return new Response(
              JSON.stringify({ success: true, data: [] }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: logs || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getPendingSettlements': {
        // Get crypto transactions that are pending settlement (sold but not yet credited)
        // This would typically come from exchange integration or a pending_settlements table
        // For now, we'll simulate with a query that finds SELL transactions that might be pending
        
        const { data: pendingTransactions } = await supabase
          .from('transactions')
          .select('*')
          .eq('transaction_type', 'SELL')
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
          .limit(50);

        // Transform to pending settlements format
        const pendingSettlements = pendingTransactions?.map((tx: any) => ({
          id: tx.id,
          asset: tx.asset || 'BTC',
          amount: parseFloat(tx.amount || '0'),
          exchange: tx.metadata?.exchange || 'Luno',
          status: 'PENDING',
          expected_ngn: parseFloat(tx.fiat_amount || '0'),
          created_at: tx.created_at,
        })) || [];

        return new Response(
          JSON.stringify({ success: true, data: pendingSettlements }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'confirmSettlement': {
        const { settlement_id } = body;

        if (!settlement_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'settlement_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the pending settlement transaction
        const { data: transaction } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', settlement_id)
          .single();

        if (!transaction) {
          return new Response(
            JSON.stringify({ success: false, error: 'Transaction not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update transaction status
        await supabase
          .from('transactions')
          .update({ status: 'COMPLETED' })
          .eq('id', settlement_id);

        // Credit NGN to system wallet
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        const ngnAmount = parseFloat(transaction.fiat_amount || '0');
        await supabase
          .from('system_wallets')
          .update({
            ngn_float_balance: parseFloat(systemWallet?.ngn_float_balance || '0') + ngnAmount,
          })
          .eq('id', 1);

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'SETTLEMENT_PROCESSED',
          performed_by: user.id,
          target_entity_type: 'TRANSACTION',
          target_entity_id: settlement_id,
          description: `Confirmed settlement and credited ₦${ngnAmount} to system wallet`,
          new_value: { ngn_credited: ngnAmount },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getTransactions': {
        const { filters } = body;
        let query = supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (filters?.transaction_type) {
          query = query.eq('transaction_type', filters.transaction_type);
        }
        if (filters?.asset) {
          query = query.eq('asset', filters.asset);
        }
        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.start_date) {
          query = query.gte('created_at', filters.start_date);
        }
        if (filters?.end_date) {
          query = query.lte('created_at', filters.end_date);
        }
        if (filters?.user_id) {
          query = query.eq('user_id', filters.user_id);
        }

        const { data: transactions, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: transactions }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getRiskSettings': {
        // Get risk settings from app_settings.additional_settings JSONB column
        const { data: settings, error: settingsError } = await supabase
          .from('app_settings')
          .select('additional_settings')
          .eq('id', 1)
          .single();

        const defaultSettings = {
          minimum_ngn_reserve: 1000000,
          max_sell_limits: {
            BTC: 0.1,
            ETH: 1.0,
            USDT: 10000,
            USDC: 10000,
            XRP: 10000,
            SOL: 100,
          },
          selling_enabled: {
            BTC: true,
            ETH: true,
            USDT: true,
            USDC: true,
            XRP: true,
            SOL: true,
          },
          buying_enabled: {
            BTC: true,
            ETH: true,
            USDT: true,
            USDC: true,
            XRP: true,
            SOL: true,
          },
        };

        const mergeRiskSettings = (raw: Record<string, unknown>) => ({
          minimum_ngn_reserve:
            typeof raw.minimum_ngn_reserve === 'number' && !Number.isNaN(raw.minimum_ngn_reserve)
              ? raw.minimum_ngn_reserve
              : defaultSettings.minimum_ngn_reserve,
          max_sell_limits: {
            ...defaultSettings.max_sell_limits,
            ...(raw.max_sell_limits as Record<string, number> | undefined),
          },
          selling_enabled: {
            ...defaultSettings.selling_enabled,
            ...(raw.selling_enabled as Record<string, boolean> | undefined),
          },
          buying_enabled: {
            ...defaultSettings.buying_enabled,
            ...(raw.buying_enabled as Record<string, boolean> | undefined),
          },
        });

        // If table doesn't exist or no settings found, return defaults
        if (settingsError) {
          console.error('Error fetching risk settings:', settingsError);
          if (settingsError.code === '42P01' || settingsError.message.includes('does not exist')) {
            return new Response(
              JSON.stringify({ success: true, data: defaultSettings }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const additionalSettings = settings?.additional_settings || {};
        const stored = (additionalSettings.risk_settings || {}) as Record<string, unknown>;
        const riskSettings = mergeRiskSettings(stored);

        return new Response(
          JSON.stringify({ success: true, data: riskSettings }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateRiskSettings': {
        const { minimum_ngn_reserve, max_sell_limits, selling_enabled, buying_enabled } = body;

        // Get current additional_settings
        const { data: currentSettings } = await supabase
          .from('app_settings')
          .select('additional_settings')
          .eq('id', 1)
          .single();

        const currentAdditionalSettings = currentSettings?.additional_settings || {};
        const prevRisk = (currentAdditionalSettings.risk_settings || {}) as Record<string, unknown>;

        const defaultBuying = {
          BTC: true,
          ETH: true,
          USDT: true,
          USDC: true,
          XRP: true,
          SOL: true,
        };
        const mergedBuying = {
          ...defaultBuying,
          ...(prevRisk.buying_enabled as Record<string, boolean> | undefined),
          ...(buying_enabled as Record<string, boolean> | undefined),
        };

        const defaultSelling = { ...defaultBuying };
        const mergedSelling = {
          ...defaultSelling,
          ...(prevRisk.selling_enabled as Record<string, boolean> | undefined),
          ...(selling_enabled as Record<string, boolean> | undefined),
        };

        const defaultLimits = {
          BTC: 0.1,
          ETH: 1.0,
          USDT: 10000,
          USDC: 10000,
          XRP: 10000,
          SOL: 100,
        };
        const mergedLimits = {
          ...defaultLimits,
          ...(prevRisk.max_sell_limits as Record<string, number> | undefined),
          ...(max_sell_limits as Record<string, number> | undefined),
        };

        const mergedMinimum =
          typeof minimum_ngn_reserve === 'number' && !Number.isNaN(minimum_ngn_reserve)
            ? minimum_ngn_reserve
            : typeof prevRisk.minimum_ngn_reserve === 'number'
              ? prevRisk.minimum_ngn_reserve
              : 1000000;

        const updatedAdditionalSettings = {
          ...currentAdditionalSettings,
          risk_settings: {
            minimum_ngn_reserve: mergedMinimum,
            max_sell_limits: mergedLimits,
            selling_enabled: mergedSelling,
            buying_enabled: mergedBuying,
          },
        };

        // Update app_settings with new additional_settings
        const { error } = await supabase
          .from('app_settings')
          .update({
            additional_settings: updatedAdditionalSettings,
            updated_by: user.id,
          })
          .eq('id', 1);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'SETTINGS_CHANGED',
          performed_by: user.id,
          target_entity_type: 'RISK_SETTINGS',
          description: 'Updated risk settings',
          new_value: {
            minimum_ngn_reserve: mergedMinimum,
            max_sell_limits: mergedLimits,
            selling_enabled: mergedSelling,
            buying_enabled: mergedBuying,
          },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getEmergencyControls': {
        const { data: row, error } = await supabase
          .from('emergency_controls')
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const tradingEnabled = row?.trading_enabled ?? true;
        const withdrawalsEnabled = row?.withdrawals_enabled ?? true;

        const data = {
          selling_paused: !tradingEnabled,
          withdrawals_paused: !withdrawalsEnabled,
          trading_enabled: tradingEnabled,
          withdrawals_enabled: withdrawalsEnabled,
          deposits_enabled: row?.deposits_enabled ?? true,
          is_system_frozen: row?.is_system_frozen ?? false,
          freeze_reason: row?.freeze_reason ?? null,
          frozen_at: row?.frozen_at ?? null,
          frozen_by: row?.frozen_by ?? null,
        };

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateEmergencyControls': {
        const { control, paused, reason } = body;

        if (control !== 'selling' && control !== 'withdrawals') {
          return new Response(
            JSON.stringify({ success: false, error: 'control must be "selling" or "withdrawals"' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (typeof paused !== 'boolean') {
          return new Response(
            JSON.stringify({ success: false, error: 'paused must be a boolean' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: row } = await supabase
          .from('emergency_controls')
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        let tradingEnabled = row?.trading_enabled ?? true;
        let withdrawalsEnabled = row?.withdrawals_enabled ?? true;

        if (control === 'selling') {
          tradingEnabled = !paused;
        } else {
          withdrawalsEnabled = !paused;
        }

        const { error: upsertError } = await supabase.from('emergency_controls').upsert(
          {
            id: 1,
            is_system_frozen: row?.is_system_frozen ?? false,
            freeze_reason: row?.freeze_reason ?? null,
            frozen_by: row?.frozen_by ?? null,
            frozen_at: row?.frozen_at ?? null,
            trading_enabled: tradingEnabled,
            withdrawals_enabled: withdrawalsEnabled,
            deposits_enabled: row?.deposits_enabled ?? true,
            maintenance_mode: row?.maintenance_mode ?? false,
            maintenance_message: row?.maintenance_message ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

        if (upsertError) {
          return new Response(
            JSON.stringify({ success: false, error: upsertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updatedControls = {
          selling_paused: !tradingEnabled,
          withdrawals_paused: !withdrawalsEnabled,
          trading_enabled: tradingEnabled,
          withdrawals_enabled: withdrawalsEnabled,
          deposits_enabled: row?.deposits_enabled ?? true,
          is_system_frozen: row?.is_system_frozen ?? false,
          freeze_reason: row?.freeze_reason ?? null,
          paused_at: paused ? new Date().toISOString() : null,
          paused_by: paused ? user.id : null,
          pause_reason: paused ? (typeof reason === 'string' ? reason : null) : null,
        };

        await supabase.from('audit_logs').insert({
          action_type: 'SETTINGS_CHANGED',
          performed_by: user.id,
          target_entity_type: 'EMERGENCY_CONTROLS',
          description: `${control === 'selling' ? 'Selling' : 'Withdrawals'} ${paused ? 'paused' : 'resumed'}${reason ? ` - ${reason}` : ''}`,
          new_value: updatedControls,
        });

        return new Response(
          JSON.stringify({ success: true, data: updatedControls }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getSellMonitorData': {
        const { filters } = body;
        const { asset, period, status } = filters || {};

        // Build date filter based on period
        let dateFilter: any = {};
        const now = new Date();
        if (period === 'today') {
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          dateFilter.gte = todayStart.toISOString();
        } else if (period === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateFilter.gte = weekAgo.toISOString();
        } else if (period === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          dateFilter.gte = monthAgo.toISOString();
        }
        // 'all' means no date filter

        // Build query for sell transactions
        let query = supabase
          .from('transactions')
          .select('*')
          .eq('transaction_type', 'SELL')
          .order('created_at', { ascending: false })
          .limit(100);

        if (asset) {
          query = query.eq('crypto_currency', asset);
        }
        if (status) {
          query = query.eq('status', status);
        }
        if (dateFilter.gte) {
          query = query.gte('created_at', dateFilter.gte);
        }

        const { data: transactions, error: txError } = await query;

        if (txError) {
          return new Response(
            JSON.stringify({ success: false, error: txError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate statistics
        const completedTxs = transactions?.filter(t => t.status === 'COMPLETED') || [];
        const failedTxs = transactions?.filter(t => t.status === 'FAILED') || [];
        
        const totalNgnVolume = completedTxs.reduce((sum, t) => sum + parseFloat(t.fiat_amount || '0'), 0);
        const totalTransactions = transactions?.length || 0;
        const totalFees = completedTxs.reduce((sum, t) => {
          const metadata = t.metadata || {};
          return sum + parseFloat(metadata.fee || '0');
        }, 0);
        const avgSellAmount = completedTxs.length > 0 ? totalNgnVolume / completedTxs.length : 0;
        const failedCount = failedTxs.length;
        const failedPercentage = totalTransactions > 0 ? (failedCount / totalTransactions) * 100 : 0;

        // Calculate volume by asset
        const volumeByAsset: Record<string, any> = {};
        completedTxs.forEach((tx) => {
          const assetSymbol = tx.crypto_currency || 'UNKNOWN';
          if (!volumeByAsset[assetSymbol]) {
            volumeByAsset[assetSymbol] = {
              count: 0,
              crypto_volume: 0,
              ngn_volume: 0,
              fees: 0,
            };
          }
          volumeByAsset[assetSymbol].count += 1;
          volumeByAsset[assetSymbol].crypto_volume += parseFloat(tx.crypto_amount || '0');
          volumeByAsset[assetSymbol].ngn_volume += parseFloat(tx.fiat_amount || '0');
          const metadata = tx.metadata || {};
          volumeByAsset[assetSymbol].fees += parseFloat(metadata.fee || '0');
        });

        const stats = {
          total_ngn_volume: totalNgnVolume,
          total_transactions: totalTransactions,
          total_fees: totalFees,
          fee_percentage: 1, // 1% platform fee
          avg_sell_amount: avgSellAmount,
          failed_count: failedCount,
          failed_percentage: failedPercentage,
          completed_count: completedTxs.length,
        };

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              stats,
              transactions: transactions || [],
              volumeByAsset,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getTreasuryWallets': {
        const { data: wallets, error } = await supabase
          .from('treasury_wallet_addresses')
          .select('*')
          .order('asset', { ascending: true })
          .order('network', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: wallets || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'createTreasuryWallet': {
        const { asset, network, address, label, notes, is_active } = body;

        if (!asset || !network || !address) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: asset, network, address' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: wallet, error } = await supabase
          .from('treasury_wallet_addresses')
          .insert({
            asset,
            network,
            address: address.trim(),
            label: label?.trim() || null,
            notes: notes?.trim() || null,
            is_active: is_active !== false,
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_WALLET_CREATED',
          performed_by: user.id,
          target_entity_type: 'TREASURY_WALLET',
          target_entity_id: wallet.id,
          description: `Created treasury wallet address for ${asset} on ${network}`,
          new_value: { asset, network, address, label, is_active },
        });

        return new Response(
          JSON.stringify({ success: true, data: wallet }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateTreasuryWallet': {
        const { id, asset, network, address, label, notes, is_active } = body;

        if (!id || !asset || !network || !address) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: id, asset, network, address' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get current wallet for audit log
        const { data: currentWallet } = await supabase
          .from('treasury_wallet_addresses')
          .select('*')
          .eq('id', id)
          .single();

        const { data: wallet, error } = await supabase
          .from('treasury_wallet_addresses')
          .update({
            asset,
            network,
            address: address.trim(),
            label: label?.trim() || null,
            notes: notes?.trim() || null,
            is_active: is_active !== false,
            updated_by: user.id,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_WALLET_UPDATED',
          performed_by: user.id,
          target_entity_type: 'TREASURY_WALLET',
          target_entity_id: id,
          description: `Updated treasury wallet address for ${asset} on ${network}`,
          old_value: currentWallet,
          new_value: wallet,
        });

        return new Response(
          JSON.stringify({ success: true, data: wallet }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deleteTreasuryWallet': {
        const { id } = body;

        if (!id) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required field: id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get wallet before deletion for audit log
        const { data: wallet } = await supabase
          .from('treasury_wallet_addresses')
          .select('*')
          .eq('id', id)
          .single();

        const { error } = await supabase
          .from('treasury_wallet_addresses')
          .delete()
          .eq('id', id);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_WALLET_DELETED',
          performed_by: user.id,
          target_entity_type: 'TREASURY_WALLET',
          target_entity_id: id,
          description: `Deleted treasury wallet address for ${wallet?.asset} on ${wallet?.network}`,
          old_value: wallet,
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getMainWalletAddresses': {
        const { data: systemWallet, error } = await supabase
          .from('system_wallets')
          .select('btc_main_address, eth_main_address, sol_main_address, xrp_main_address, usdt_eth_main_address, usdt_tron_main_address, usdc_eth_main_address, usdc_sol_main_address')
          .eq('id', 1)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: {
              btc_main_address: systemWallet?.btc_main_address || null,
              eth_main_address: systemWallet?.eth_main_address || null,
              sol_main_address: systemWallet?.sol_main_address || null,
              xrp_main_address: systemWallet?.xrp_main_address || null,
              usdt_eth_main_address: systemWallet?.usdt_eth_main_address || null,
              usdt_tron_main_address: systemWallet?.usdt_tron_main_address || null,
              usdc_eth_main_address: systemWallet?.usdc_eth_main_address || null,
              usdc_sol_main_address: systemWallet?.usdc_sol_main_address || null,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateMainWalletAddress': {
        const { asset, address } = body;

        if (!asset || !address) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: asset, address' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const validAssets = ['BTC', 'ETH', 'SOL', 'XRP', 'USDT_ETH', 'USDT_TRON', 'USDC_ETH', 'USDC_SOL'];
        if (!validAssets.includes(asset)) {
          return new Response(
            JSON.stringify({ success: false, error: `Invalid asset. Must be one of: ${validAssets.join(', ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let addressColumn: string;
        if (asset === 'USDT_ETH') {
          addressColumn = 'usdt_eth_main_address';
        } else if (asset === 'USDT_TRON') {
          addressColumn = 'usdt_tron_main_address';
        } else if (asset === 'USDC_ETH') {
          addressColumn = 'usdc_eth_main_address';
        } else if (asset === 'USDC_SOL') {
          addressColumn = 'usdc_sol_main_address';
        } else {
          addressColumn = `${asset.toLowerCase()}_main_address`;
        }
        
        // Get current address for audit log
        const { data: currentWallet } = await supabase
          .from('system_wallets')
          .select(addressColumn)
          .eq('id', 1)
          .single();

        const updateData: any = {};
        updateData[addressColumn] = address.trim();

        const { data: updatedWallet, error } = await supabase
          .from('system_wallets')
          .update(updateData)
          .eq('id', 1)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'MAIN_WALLET_ADDRESS_UPDATED',
          performed_by: user.id,
          target_entity_type: 'SYSTEM_WALLET',
          target_entity_id: '1',
          description: `Updated ${asset} main wallet address`,
          old_value: { [addressColumn]: currentWallet?.[addressColumn as keyof typeof currentWallet] },
          new_value: { [addressColumn]: address.trim() },
        });

        return new Response(
          JSON.stringify({ success: true, data: updatedWallet }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sendToMainWallet': {
        const { asset, source_user_id, source_address, amount, send_all, reason } = body;

        if (!asset) {
          return new Response(
            JSON.stringify({ success: false, error: 'Asset is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate asset
        const validAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
        if (!validAssets.includes(asset)) {
          return new Response(
            JSON.stringify({ success: false, error: `Invalid asset. Must be one of: ${validAssets.join(', ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get main wallet address
        const { data: systemWallet, error: sysError } = await supabase
          .from('system_wallets')
          .select('sol_main_address, eth_main_address, btc_main_address, xrp_main_address, usdt_eth_main_address, usdc_eth_main_address')
          .eq('id', 1)
          .single();

        if (sysError || !systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Determine main address based on asset
        let mainAddress: string | null = null;
        let addressColumn: string = '';
        
        if (asset === 'SOL') {
          mainAddress = systemWallet.sol_main_address;
          addressColumn = 'sol_main_address';
        } else if (asset === 'ETH') {
          mainAddress = systemWallet.eth_main_address;
          addressColumn = 'eth_main_address';
        } else if (asset === 'BTC') {
          mainAddress = systemWallet.btc_main_address;
          addressColumn = 'btc_main_address';
        } else if (asset === 'XRP') {
          mainAddress = systemWallet.xrp_main_address;
          addressColumn = 'xrp_main_address';
        } else if (asset === 'USDT') {
          mainAddress = systemWallet.usdt_eth_main_address || systemWallet.eth_main_address;
          addressColumn = 'usdt_eth_main_address';
        } else if (asset === 'USDC') {
          mainAddress = systemWallet.usdc_eth_main_address || systemWallet.eth_main_address;
          addressColumn = 'usdc_eth_main_address';
        }

        if (!mainAddress) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Main wallet address not configured for ${asset}. Please set it in Admin → Treasury → Wallet Settings.` 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Determine function name for sending
        let functionName = '';
        if (asset === 'BTC') {
          functionName = 'send-bitcoin-transaction';
        } else if (asset === 'ETH') {
          functionName = 'send-ethereum-transaction';
        } else if (asset === 'SOL') {
          functionName = 'send-solana-transaction';
        } else if (asset === 'XRP') {
          functionName = 'send-xrp-transaction';
        } else if (asset === 'USDT') {
          functionName = 'send-usdt-transaction';
        } else if (asset === 'USDC') {
          functionName = 'send-usdc-transaction';
        }

        // Return main wallet address and instructions
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              main_wallet_address: mainAddress,
              asset: asset,
              address_column: addressColumn,
              function_name: functionName,
              instructions: `To send ${asset} to main wallet:\n` +
                `1. Main wallet address: ${mainAddress}\n` +
                `2. Use Admin Panel → Users → Select user → Send Crypto\n` +
                (functionName ? `3. Or use the ${functionName} Edge Function\n` : '') +
                `4. Destination: ${mainAddress}\n` +
                (source_user_id ? `5. Source user: ${source_user_id}\n` : '') +
                (amount ? `6. Amount: ${amount} ${asset}\n` : send_all ? '6. Amount: All available\n' : '') +
                `\nAfter transfer, use Treasury → Adjust Liquidity to update inventory.`
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getOnChainBalances': {
        const { data: onChainBalances, error } = await supabase
          .from('on_chain_balances')
          .select('*')
          .order('asset', { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: onChainBalances || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getReconciliationStatus': {
        const { data: reconciliationStatus, error } = await supabase
          .from('treasury_reconciliation_status')
          .select('*')
          .order('asset', { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: reconciliationStatus || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getRiskAlerts': {
        const { status: alertStatus, severity } = body;
        
        let query = supabase
          .from('treasury_risk_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (alertStatus) {
          query = query.eq('status', alertStatus);
        }
        if (severity) {
          query = query.eq('severity', severity);
        }

        const { data: riskAlerts, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: riskAlerts || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetchMainWalletBalances': {
        // Trigger the fetch-main-wallet-balances edge function
        const functionUrl = `${supabaseUrl}/functions/v1/fetch-main-wallet-balances`;
        
        try {
          const response = await fetch(functionUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
          });

          const result = await response.json();

          if (!response.ok) {
            return new Response(
              JSON.stringify({ success: false, error: result.error || 'Failed to fetch balances' }),
              { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          return new Response(
            JSON.stringify({ success: false, error: error.message || 'Failed to fetch balances' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'acknowledgeRiskAlert': {
        const { alertId } = body;

        if (!alertId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Alert ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: updatedAlert, error } = await supabase
          .from('treasury_risk_alerts')
          .update({
            status: 'ACKNOWLEDGED',
            acknowledged_by: user.id,
            acknowledged_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', alertId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'RISK_ALERT_ACKNOWLEDGED',
          performed_by: user.id,
          target_entity_type: 'RISK_ALERT',
          target_entity_id: alertId,
          description: `Acknowledged risk alert: ${updatedAlert?.title}`,
        });

        return new Response(
          JSON.stringify({ success: true, data: updatedAlert }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'resolveRiskAlert': {
        const { alertId, notes } = body;

        if (!alertId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Alert ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: updatedAlert, error } = await supabase
          .from('treasury_risk_alerts')
          .update({
            status: 'RESOLVED',
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(notes && { notes }),
          })
          .eq('id', alertId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create audit log
        await supabase.from('audit_logs').insert({
          action_type: 'RISK_ALERT_RESOLVED',
          performed_by: user.id,
          target_entity_type: 'RISK_ALERT',
          target_entity_id: alertId,
          description: `Resolved risk alert: ${updatedAlert?.title}`,
          metadata: notes ? { notes } : {},
        });

        return new Response(
          JSON.stringify({ success: true, data: updatedAlert }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getMetrics': {
        const { data: systemWallet, error: systemWalletError } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (systemWalletError || !systemWallet) {
          return new Response(
            JSON.stringify({
              success: false,
              error: systemWalletError?.message || 'System wallet not found',
            }),
            {
              status: systemWalletError ? 500 : 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const cryptoAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const;
        const alchemyKey = getAlchemyApiKey();
        if (!alchemyKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'ALCHEMY_API_KEY not set (required for live prices)' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const usdToNgn = await getUsdToNgnRate();
        const alchemyMap = await fetchAlchemyUsdPricesBySymbols([...cryptoAssets]);
        const ngnPriceByAsset: Record<string, number> = {};
        for (const sym of cryptoAssets) {
          const row = alchemyMap.get(sym);
          if (!row?.usd || row.usd <= 0) continue;
          ngnPriceByAsset[sym] = row.usd * usdToNgn;
        }

        const missingPricing = cryptoAssets.filter((a) => !(ngnPriceByAsset[a] > 0) || Number.isNaN(ngnPriceByAsset[a]));
        if (missingPricing.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Missing live prices for: ${missingPricing.join(', ')}. Check Alchemy Prices API availability.`,
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // NGN per ~1 USD
        const ngnPerUsd = usdToNgn;

        let totalCryptoValueNgn = 0;
        for (const asset of cryptoAssets) {
          const inventoryField = `${asset.toLowerCase()}_inventory`;
          const balance = parseFloat(systemWallet[inventoryField] || '0');
          totalCryptoValueNgn += balance * ngnPriceByAsset[asset];
        }
        const totalCryptoValueUSD = totalCryptoValueNgn / ngnPerUsd;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { data: dailyVolumeRows, error: dailyVolumeError } = await supabase
          .from('transactions')
          .select('fiat_amount, transaction_type, status')
          .in('transaction_type', ['BUY', 'SELL'])
          .eq('status', 'COMPLETED')
          .gte('created_at', today.toISOString())
          .lt('created_at', tomorrow.toISOString());

        if (dailyVolumeError) {
          return new Response(
            JSON.stringify({ success: false, error: dailyVolumeError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const dailyVolumeProcessed = (dailyVolumeRows || []).reduce((sum, row) => {
          return sum + parseFloat(row.fiat_amount || '0');
        }, 0);

        // Calculate liquidity health index (simplified)
        const ngnFloat = parseFloat(systemWallet.ngn_float_balance || '0');
        const minThreshold = 1000000;
        const liquidityHealthIndex = Math.min(100, (ngnFloat / minThreshold) * 100);

        // Determine system health
        let systemHealthStatus: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
        if (ngnFloat < minThreshold) {
          systemHealthStatus = 'RED';
        } else if (ngnFloat < minThreshold * 1.5) {
          systemHealthStatus = 'YELLOW';
        }

        const metrics = {
          current_ngn_float: ngnFloat,
          crypto_inventory_value_usd: totalCryptoValueUSD,
          system_health_status: systemHealthStatus,
          daily_volume_processed: dailyVolumeProcessed,
          liquidity_health_index: Math.round(liquidityHealthIndex),
        };

        return new Response(
          JSON.stringify({ success: true, data: metrics }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getWallets': {
        // Get wallets from treasury_wallets table or system_wallets
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Pull latest on-chain balances so wallet tab reflects real holdings.
        const { data: onChainBalances } = await supabase
          .from('on_chain_balances')
          .select('asset, on_chain_balance')
          .in('asset', ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL']);
        const chainBalanceMap: Record<string, number> = {};
        for (const row of onChainBalances || []) {
          chainBalanceMap[row.asset] = parseFloat(row.on_chain_balance || '0');
        }

        // Create wallet objects for Exodus and Trust
        const wallets: any[] = [
          {
            id: 'exodus-1',
            name: 'Exodus Wallet',
            type: 'EXODUS',
            addresses: {
              BTC: systemWallet.btc_main_address,
              ETH: systemWallet.eth_main_address,
              USDT: systemWallet.usdt_eth_main_address,
              USDC: systemWallet.usdc_eth_main_address,
              XRP: systemWallet.xrp_main_address,
              SOL: systemWallet.sol_main_address,
            },
            balances: {
              BTC: chainBalanceMap.BTC || 0,
              ETH: chainBalanceMap.ETH || 0,
              USDT: chainBalanceMap.USDT || 0,
              USDC: chainBalanceMap.USDC || 0,
              XRP: chainBalanceMap.XRP || 0,
              SOL: chainBalanceMap.SOL || 0,
            },
          },
          {
            id: 'trust-1',
            name: 'Trust Wallet',
            type: 'TRUST',
            addresses: {
              BTC: systemWallet.btc_main_address, // Same addresses for now
              ETH: systemWallet.eth_main_address,
              USDT: systemWallet.usdt_eth_main_address,
              USDC: systemWallet.usdc_eth_main_address,
              XRP: systemWallet.xrp_main_address,
              SOL: systemWallet.sol_main_address,
            },
            balances: {
              BTC: chainBalanceMap.BTC || 0,
              ETH: chainBalanceMap.ETH || 0,
              USDT: chainBalanceMap.USDT || 0,
              USDC: chainBalanceMap.USDC || 0,
              XRP: chainBalanceMap.XRP || 0,
              SOL: chainBalanceMap.SOL || 0,
            },
          },
        ];

        return new Response(
          JSON.stringify({ success: true, data: wallets }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getInventoryBalances': {
        // Get system wallet
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get on-chain balances
        const { data: onChainBalances } = await supabase
          .from('on_chain_balances')
          .select('*')
          .order('asset', { ascending: true });

        const assets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
        const inventoryBalances: any[] = [];

        console.log('📊 Getting inventory balances for assets:', assets);
        console.log('📊 System wallet data:', {
          btc_inventory: systemWallet.btc_inventory,
          eth_inventory: systemWallet.eth_inventory,
          usdt_inventory: systemWallet.usdt_inventory,
          usdc_inventory: systemWallet.usdc_inventory,
          xrp_inventory: systemWallet.xrp_inventory,
          sol_inventory: systemWallet.sol_inventory,
        });

        for (const asset of assets) {
          const inventoryField = `${asset.toLowerCase()}_inventory`;
          const ledgerBalance = parseFloat(systemWallet[inventoryField] || '0');
          
          console.log(`📊 ${asset}: field=${inventoryField}, ledgerBalance=${ledgerBalance}`);
          
          // Find on-chain balance for this asset
          const onChainRecord = onChainBalances?.find(b => b.asset === asset);
          const onChainBalance = onChainRecord ? parseFloat(onChainRecord.on_chain_balance || '0') : 0;
          
          const difference = onChainBalance - ledgerBalance;
          let status: 'MATCHED' | 'DISCREPANCY' | 'RECONCILING' = 'MATCHED';
          
          if (Math.abs(difference) > 0.00000001) {
            status = 'DISCREPANCY';
          }

          inventoryBalances.push({
            asset,
            ledger_balance: ledgerBalance,
            on_chain_balance: onChainBalance,
            difference,
            status,
          });
        }

        console.log('📊 Returning inventory balances:', inventoryBalances);

        return new Response(
          JSON.stringify({ success: true, data: inventoryBalances }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'addInventory': {
        const { asset, amount, reason } = body;

        if (!asset || amount === undefined || !reason) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Use existing adjustLiquidity logic
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const inventoryField = `${asset.toLowerCase()}_inventory`;
        const currentInventory = parseFloat(systemWallet[inventoryField] || '0');
        const newInventory = currentInventory + amount;

        const updateData: any = {};
        updateData[inventoryField] = newInventory;

        const { error: updateError } = await supabase
          .from('system_wallets')
          .update(updateData)
          .eq('id', 1);

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_ADJUSTMENT',
          performed_by: user.id,
          target_entity_type: 'SYSTEM_WALLET',
          description: `Added ${amount} ${asset} inventory - ${reason}`,
          new_value: { asset, amount, operation: 'add', reason, new_balance: newInventory },
        });

        return new Response(
          JSON.stringify({ success: true, new_balance: newInventory }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'removeInventory': {
        // Legacy endpoint - now uses create_inventory_adjustment with metadata
        const { asset, amount, reason, adjustment_type, source_reference } = body;

        if (!asset || amount === undefined || !reason) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: asset, amount, reason' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('create_inventory_adjustment', {
          p_asset: asset,
          p_amount: amount,
          p_operation: 'remove',
          p_reason: reason,
          p_adjustment_type: adjustment_type || 'WITHDRAWAL',
          p_source_reference: source_reference || null,
          p_blockchain_network: null,
          p_wallet_address: null,
          p_transaction_hash: null,
          p_performed_by: user.id,
          p_notes: null,
          p_metadata: {}
        });

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

      case 'createInventoryAdjustment': {
        const { asset, amount, operation, reason, adjustment_type, source_reference, blockchain_network, wallet_address, transaction_hash, notes, metadata } = body;

        if (!asset || amount === undefined || !operation || !reason || !adjustment_type) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: asset, amount, operation, reason, adjustment_type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('create_inventory_adjustment', {
          p_asset: asset,
          p_amount: amount,
          p_operation: operation,
          p_reason: reason,
          p_adjustment_type: adjustment_type,
          p_source_reference: source_reference || null,
          p_blockchain_network: blockchain_network || null,
          p_wallet_address: wallet_address || null,
          p_transaction_hash: transaction_hash || null,
          p_performed_by: user.id,
          p_notes: notes || null,
          p_metadata: metadata || {}
        });

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

      case 'confirmPendingAdjustment': {
        const { adjustment_id, transaction_hash } = body;

        if (!adjustment_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'adjustment_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('confirm_pending_adjustment', {
          p_adjustment_id: adjustment_id,
          p_transaction_hash: transaction_hash || null,
          p_verified_by: user.id
        });

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

      case 'forceReconciliation': {
        const { asset } = body;

        if (!asset) {
          return new Response(
            JSON.stringify({ success: false, error: 'Asset is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('force_reconciliation', {
          p_asset: asset,
          p_reconciliation_method: 'MANUAL_FORCE_SYNC',
          p_initiated_by: user.id,
          p_resolution_action: null,
          p_resolution_notes: null
        });

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

      case 'resolveDiscrepancy': {
        const { asset, resolution_action, resolution_notes, transaction_hash, adjustment_id } = body;

        if (!asset || !resolution_action || !resolution_notes) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields: asset, resolution_action, resolution_notes' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('resolve_discrepancy', {
          p_asset: asset,
          p_resolution_action: resolution_action,
          p_resolution_notes: resolution_notes,
          p_transaction_hash: transaction_hash || null,
          p_adjustment_id: adjustment_id || null,
          p_resolved_by: user.id
        });

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

      case 'getInventoryAdjustments': {
        const { asset, status, limit = 50, offset = 0 } = body;

        let query = supabase
          .from('inventory_adjustments')
          .select('*')
          .order('performed_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (asset) {
          query = query.eq('asset', asset);
        }
        if (status) {
          query = query.eq('status', status);
        }

        const { data: adjustments, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: adjustments }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getReconciliationHistory': {
        const { asset, limit = 50, offset = 0 } = body;

        let query = supabase
          .from('reconciliation_history')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (asset) {
          query = query.eq('asset', asset);
        }

        const { data: history, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: history }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getAvailableLiquidity': {
        const { asset } = body;

        if (!asset) {
          return new Response(
            JSON.stringify({ success: false, error: 'Asset is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('get_available_liquidity', {
          p_asset: asset
        });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, available_liquidity: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'startReconciliation': {
        const { asset } = body;

        if (!asset) {
          return new Response(
            JSON.stringify({ success: false, error: 'Asset is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get system wallet
        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get ledger balance
        const inventoryField = `${asset.toLowerCase()}_inventory`;
        const ledgerBalance = parseFloat(systemWallet[inventoryField] || '0');

        // Get on-chain balance
        const { data: onChainRecord } = await supabase
          .from('on_chain_balances')
          .select('*')
          .eq('asset', asset)
          .order('last_fetched_at', { ascending: false })
          .limit(1)
          .single();

        const onChainBalance = onChainRecord ? parseFloat(onChainRecord.on_chain_balance || '0') : 0;
        const difference = onChainBalance - ledgerBalance;
        
        let status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISCREPANCY' = 'COMPLETED';
        if (Math.abs(difference) > 0.00000001) {
          status = 'DISCREPANCY';
        }

        // Create reconciliation record
        const { data: reconciliation, error: reconError } = await supabase
          .from('reconciliations')
          .insert({
            reconciliation_type: 'CRYPTO_INVENTORY',
            status,
            reconciliation_date: new Date().toISOString(),
            expected_amount: ledgerBalance,
            actual_amount: onChainBalance,
            discrepancy_amount: difference,
            currency: asset,
            transactions_checked: 0,
            discrepancies_found: status === 'DISCREPANCY' ? 1 : 0,
            details: {
              asset,
              ledger_balance: ledgerBalance,
              on_chain_balance: onChainBalance,
              difference,
            },
          })
          .select()
          .single();

        if (reconError) {
          return new Response(
            JSON.stringify({ success: false, error: reconError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'RECONCILIATION_RUN',
          performed_by: user.id,
          target_entity_type: 'RECONCILIATION',
          target_entity_id: reconciliation.id,
          description: `Started reconciliation for ${asset}`,
        });

        return new Response(
          JSON.stringify({ success: true, data: reconciliation }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'addNgnFloat': {
        const { amount, reason } = body;

        if (!amount || !reason) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const currentFloat = parseFloat(systemWallet.ngn_float_balance || '0');
        const newFloat = currentFloat + amount;

        const { error: updateError } = await supabase
          .from('system_wallets')
          .update({ ngn_float_balance: newFloat })
          .eq('id', 1);

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_ADJUSTMENT',
          performed_by: user.id,
          target_entity_type: 'SYSTEM_WALLET',
          description: `Added ${amount} NGN float - ${reason}`,
          new_value: { asset: 'NGN', amount, operation: 'add', reason, new_balance: newFloat },
        });

        return new Response(
          JSON.stringify({ success: true, new_balance: newFloat }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'removeNgnFloat': {
        const { amount, reason } = body;

        if (!amount || !reason) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: systemWallet } = await supabase
          .from('system_wallets')
          .select('*')
          .eq('id', 1)
          .single();

        if (!systemWallet) {
          return new Response(
            JSON.stringify({ success: false, error: 'System wallet not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const currentFloat = parseFloat(systemWallet.ngn_float_balance || '0');
        const newFloat = currentFloat - amount;

        if (newFloat < 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'Insufficient balance' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabase
          .from('system_wallets')
          .update({ ngn_float_balance: newFloat })
          .eq('id', 1);

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'TREASURY_ADJUSTMENT',
          performed_by: user.id,
          target_entity_type: 'SYSTEM_WALLET',
          description: `Removed ${amount} NGN float - ${reason}`,
          new_value: { asset: 'NGN', amount, operation: 'remove', reason, new_balance: newFloat },
        });

        return new Response(
          JSON.stringify({ success: true, new_balance: newFloat }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getPricingRules': {
        // Would query from pricing_rules table if it exists
        // For now, return empty array
        return new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getPriceOverrides': {
        // Would query from price_overrides table if it exists
        // For now, return empty array
        return new Response(
          JSON.stringify({ success: true, data: [] }),
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
    console.error('Admin treasury error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
