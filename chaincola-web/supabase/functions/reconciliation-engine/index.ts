// Reconciliation Engine
// Automated on-chain vs internal ledger comparison with manual force sync

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
    let userId: string | null = null;
    let isServiceRole = false;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      
      // Check if it's service role key
      if (token === supabaseKey) {
        isServiceRole = true;
      } else {
        // Try to get user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = user.id;

        // Check if user is admin (skip for service role)
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
      }
    } else {
      // Allow service role calls without auth header (for cron jobs)
      isServiceRole = true;
    }

    const body = await req.json();
    const { action, asset } = body;

    switch (action) {
      case 'reconcileAll': {
        const assets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
        const results: any[] = [];

        for (const assetToReconcile of assets) {
          const result = await reconcileAsset(assetToReconcile, supabase, userId || '00000000-0000-0000-0000-000000000000');
          results.push(result);
        }

        return new Response(
          JSON.stringify({ success: true, data: results }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reconcileAsset': {
        if (!asset) {
          return new Response(
            JSON.stringify({ success: false, error: 'Asset is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = await reconcileAsset(asset, supabase, userId!);

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getReconciliationHistory': {
        const { limit = 50, offset = 0 } = body;

        const { data: reconciliations, error } = await supabase
          .from('reconciliations')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

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

      case 'getReconciliationStatus': {
        const { data: statuses, error } = await supabase
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
          JSON.stringify({ success: true, data: statuses }),
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
    console.error('Reconciliation engine error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function autoReconcileAsset(
  asset: string,
  supabase: any,
  userId: string | null,
  tolerancePercentage: number,
  autoResolve: boolean
): Promise<any> {
  try {
    // Use force_reconciliation function
    const { data, error } = await supabase.rpc('force_reconciliation', {
      p_asset: asset,
      p_reconciliation_method: 'AUTO',
      p_initiated_by: userId
    });

    if (error) {
      return { asset, success: false, error: error.message };
    }

    const discrepancyPct = Math.abs(data.discrepancy_percentage || 0);
    const shouldAutoResolve = autoResolve && 
      data.status === 'DISCREPANCY' && 
      discrepancyPct <= tolerancePercentage;

    if (shouldAutoResolve) {
      // Auto-resolve small discrepancies
      const { data: resolved, error: resolveError } = await supabase.rpc('resolve_discrepancy', {
        p_asset: asset,
        p_resolution_action: 'SYNC_FROM_CHAIN',
        p_resolution_notes: `Auto-resolved: discrepancy ${discrepancyPct}% within tolerance ${tolerancePercentage}%`,
        p_resolved_by: userId
      });

      if (resolveError) {
        console.error(`Error auto-resolving ${asset}:`, resolveError);
      } else {
        return {
          asset,
          success: true,
          ...data,
          auto_resolved: true,
          resolution: resolved
        };
      }
    }

    // Create alert if discrepancy exceeds tolerance
    if (data.status === 'DISCREPANCY' && discrepancyPct > tolerancePercentage) {
      await supabase.rpc('create_treasury_alert', {
        p_alert_type: 'DISCREPANCY',
        p_severity: discrepancyPct > 10 ? 'HIGH' : 'MEDIUM',
        p_title: `${asset} Reconciliation Discrepancy`,
        p_message: `${asset} discrepancy ${discrepancyPct.toFixed(4)}% exceeds tolerance ${tolerancePercentage}%`,
        p_asset: asset,
        p_details: {
          discrepancy_percentage: discrepancyPct,
          tolerance_percentage: tolerancePercentage,
          ledger_balance: data.ledger_balance,
          on_chain_balance: data.on_chain_balance,
          discrepancy: data.discrepancy
        }
      });
    }

    return {
      asset,
      success: true,
      ...data,
      auto_resolved: false
    };
  } catch (error: any) {
    console.error(`Error auto-reconciling ${asset}:`, error);
    return {
      asset,
      success: false,
      error: error.message
    };
  }
}

async function reconcileAsset(
  asset: string,
  supabase: any,
  userId: string
): Promise<any> {
  try {
    // Get system wallet inventory (ledger balance - confirmed only)
    const { data: systemWallet } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (!systemWallet) {
      return { asset, success: false, error: 'System wallet not found' };
    }

    const inventoryField = `${asset.toLowerCase()}_inventory`;
    const ledgerBalance = parseFloat(systemWallet[inventoryField] || '0');

    // Get on-chain balance
    const { data: onChainBalance } = await supabase
      .from('on_chain_balances')
      .select('on_chain_balance')
      .eq('asset', asset)
      .order('last_fetched_at', { ascending: false })
      .limit(1)
      .single();

    const onChainBalanceValue = onChainBalance ? parseFloat(onChainBalance.on_chain_balance || '0') : 0;

    // Calculate difference
    const difference = onChainBalanceValue - ledgerBalance;
    const differencePercentage = ledgerBalance > 0 
      ? (difference / ledgerBalance) * 100 
      : 0;

    // Determine status
    let status = 'BALANCED';
    const tolerance = 0.00000001; // Very small tolerance for floating point

    if (Math.abs(difference) > tolerance) {
      status = 'MISMATCH';
    }

    if (ledgerBalance < 0) {
      status = 'NEGATIVE_INVENTORY';
    }

    // Update reconciliation status
    const { error: updateError } = await supabase
      .from('treasury_reconciliation_status')
      .upsert({
        asset,
        ledger_balance: ledgerBalance,
        on_chain_balance: onChainBalanceValue,
        difference,
        difference_percentage: differencePercentage,
        status,
        is_negative_inventory: ledgerBalance < 0,
        is_low_balance: false,
        is_on_chain_lower: onChainBalanceValue < ledgerBalance,
        last_reconciled_at: new Date().toISOString()
      }, {
        onConflict: 'asset'
      });

    if (updateError) {
      console.error('Error updating reconciliation status:', updateError);
    }

    // Create reconciliation history entry
    const { error: historyError } = await supabase
      .from('reconciliation_history')
      .insert({
        asset,
        ledger_balance_before: ledgerBalance,
        on_chain_balance_before: onChainBalanceValue,
        ledger_balance_after: ledgerBalance,
        on_chain_balance_after: onChainBalanceValue,
        discrepancy_before: difference,
        discrepancy_after: difference,
        discrepancy_resolved: (status === 'BALANCED'),
        reconciliation_method: 'MANUAL',
        status: status === 'BALANCED' ? 'COMPLETED' : 'DISCREPANCY',
        initiated_by: userId
      });

    if (historyError) {
      console.error('Error creating reconciliation history:', historyError);
    }

    // Create alert if discrepancy found
    if (status === 'MISMATCH' && Math.abs(difference) > 0.01) {
      await supabase.rpc('create_treasury_alert', {
        p_alert_type: 'DISCREPANCY',
        p_severity: Math.abs(differencePercentage) > 10 ? 'HIGH' : 'MEDIUM',
        p_title: `${asset} Reconciliation Discrepancy`,
        p_message: `${asset} ledger balance (${ledgerBalance}) does not match on-chain balance (${onChainBalanceValue}). Difference: ${difference}`,
        p_asset: asset,
        p_details: {
          ledger_balance: ledgerBalance,
          on_chain_balance: onChainBalanceValue,
          difference,
          difference_percentage
        }
      });
    }

    return {
      asset,
      success: true,
      ledger_balance: ledgerBalance,
      on_chain_balance: onChainBalanceValue,
      difference,
      difference_percentage,
      status
    };
  } catch (error: any) {
    console.error(`Error reconciling ${asset}:`, error);
    return {
      asset,
      success: false,
      error: error.message
    };
  }
}
