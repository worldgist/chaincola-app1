// Treasury Health Monitor
// Auto-evaluates system health status and creates alerts

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

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'evaluateHealth': {
        const healthStatus = await evaluateSystemHealth(supabase);
        
        return new Response(
          JSON.stringify({ success: true, data: healthStatus }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'checkThresholds': {
        const thresholdChecks = await checkAllThresholds(supabase);
        
        return new Response(
          JSON.stringify({ success: true, data: thresholdChecks }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'checkReconciliation': {
        const reconciliationStatus = await checkReconciliationStatus(supabase);
        
        return new Response(
          JSON.stringify({ success: true, data: reconciliationStatus }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getHealthMetrics': {
        const metrics = await getHealthMetrics(supabase);
        
        return new Response(
          JSON.stringify({ success: true, data: metrics }),
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
    console.error('Health monitor error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function evaluateSystemHealth(supabase: any): Promise<any> {
  const issues: any[] = [];
  let overallStatus: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

  // 1. Check system wallet balances
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('*')
    .eq('id', 1)
    .single();

  if (!systemWallet) {
    issues.push({ type: 'CRITICAL', message: 'System wallet not found' });
    overallStatus = 'RED';
  }

  // 2. Check threshold breaches
  const thresholdChecks = await checkAllThresholds(supabase);
  for (const check of thresholdChecks) {
    if (check.is_below_critical) {
      issues.push({
        type: 'CRITICAL',
        message: `${check.asset} balance is below critical threshold`,
        asset: check.asset
      });
      overallStatus = 'RED';
    } else if (check.is_below_minimum) {
      issues.push({
        type: 'WARNING',
        message: `${check.asset} balance is below minimum threshold`,
        asset: check.asset
      });
      if (overallStatus === 'GREEN') overallStatus = 'YELLOW';
    }
  }

  // 3. Check reconciliation status
  const reconciliationStatus = await checkReconciliationStatus(supabase);
  for (const status of reconciliationStatus) {
    if (status.status === 'MISMATCH' && Math.abs(status.difference_percentage) > 5) {
      issues.push({
        type: 'WARNING',
        message: `${status.asset} reconciliation mismatch: ${status.difference_percentage.toFixed(2)}%`,
        asset: status.asset
      });
      if (overallStatus === 'GREEN') overallStatus = 'YELLOW';
    }
  }

  // 4. Check pending critical alerts
  const { data: criticalAlerts } = await supabase
    .from('treasury_alerts')
    .select('*')
    .eq('severity', 'CRITICAL')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(10);

  if (criticalAlerts && criticalAlerts.length > 0) {
    issues.push({
      type: 'CRITICAL',
      message: `${criticalAlerts.length} critical alerts pending`,
      count: criticalAlerts.length
    });
    overallStatus = 'RED';
  }

  // 5. Check emergency controls
  const { data: emergencyControls } = await supabase
    .from('emergency_controls')
    .select('*')
    .eq('id', 1)
    .single();

  if (emergencyControls?.is_system_frozen) {
    issues.push({
      type: 'CRITICAL',
      message: 'System is frozen',
      reason: emergencyControls.freeze_reason
    });
    overallStatus = 'RED';
  }

  // 6. Check liquidity controls
  const { data: liquidityControls } = await supabase
    .from('liquidity_controls')
    .select('*')
    .eq('is_active', true);

  for (const control of liquidityControls || []) {
    if (control.is_frozen) {
      issues.push({
        type: 'WARNING',
        message: `${control.asset} ${control.wallet_type} wallet is frozen`,
        asset: control.asset,
        wallet_type: control.wallet_type
      });
      if (overallStatus === 'GREEN') overallStatus = 'YELLOW';
    }

    if (control.utilization_percentage > 90) {
      issues.push({
        type: 'WARNING',
        message: `${control.asset} ${control.wallet_type} wallet utilization is ${control.utilization_percentage}%`,
        asset: control.asset,
        wallet_type: control.wallet_type
      });
      if (overallStatus === 'GREEN') overallStatus = 'YELLOW';
    }
  }

  // Create system health alert if needed
  if (overallStatus !== 'GREEN') {
    await supabase.rpc('create_treasury_alert', {
      p_alert_type: 'SYSTEM_HEALTH',
      p_severity: overallStatus === 'RED' ? 'CRITICAL' : 'MEDIUM',
      p_title: `System Health Status: ${overallStatus}`,
      p_message: `System health evaluation detected ${issues.length} issue(s). Status: ${overallStatus}`,
      p_details: {
        status: overallStatus,
        issues: issues,
        timestamp: new Date().toISOString()
      }
    });
  }

  return {
    status: overallStatus,
    issues: issues,
    issue_count: issues.length,
    evaluated_at: new Date().toISOString(),
    metrics: await getHealthMetrics(supabase)
  };
}

async function checkAllThresholds(supabase: any): Promise<any[]> {
  const assets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN'];
  const results: any[] = [];

  // Get system wallet
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('*')
    .eq('id', 1)
    .single();

  if (!systemWallet) {
    return results;
  }

  // Get threshold rules
  const { data: thresholdRules } = await supabase
    .from('treasury_threshold_rules')
    .select('*')
    .eq('is_active', true);

  for (const asset of assets) {
    const inventoryField = asset === 'NGN' ? 'ngn_float_balance' : `${asset.toLowerCase()}_inventory`;
    const currentBalance = parseFloat(systemWallet[inventoryField] || '0');

    const rule = thresholdRules?.find((r: any) => r.asset === asset);

    if (rule) {
      const { data: checkResult } = await supabase.rpc('check_balance_threshold', {
        p_asset: asset,
        p_current_balance: currentBalance
      });

      if (checkResult && checkResult.length > 0) {
        const result = checkResult[0];
        results.push({
          asset,
          current_balance: currentBalance,
          minimum_balance: rule.minimum_balance,
          critical_balance: rule.critical_balance,
          is_below_minimum: result.is_below_minimum,
          is_below_critical: result.is_below_critical,
          should_disable_trading: result.should_disable_trading
        });

        // Create alerts if thresholds breached
        if (result.is_below_critical && rule.alert_on_critical) {
          await supabase.rpc('create_treasury_alert', {
            p_alert_type: 'CRITICAL_BALANCE',
            p_severity: 'CRITICAL',
            p_title: `${asset} Critical Balance Alert`,
            p_message: `${asset} balance (${currentBalance}) is below critical threshold (${rule.critical_balance})`,
            p_asset: asset,
            p_details: {
              current_balance: currentBalance,
              critical_balance: rule.critical_balance,
              minimum_balance: rule.minimum_balance
            }
          });
        } else if (result.is_below_minimum && rule.alert_on_minimum) {
          await supabase.rpc('create_treasury_alert', {
            p_alert_type: 'LOW_BALANCE',
            p_severity: 'MEDIUM',
            p_title: `${asset} Low Balance Alert`,
            p_message: `${asset} balance (${currentBalance}) is below minimum threshold (${rule.minimum_balance})`,
            p_asset: asset,
            p_details: {
              current_balance: currentBalance,
              minimum_balance: rule.minimum_balance
            }
          });
        }
      }
    }
  }

  return results;
}

async function checkReconciliationStatus(supabase: any): Promise<any[]> {
  const { data: statuses } = await supabase
    .from('treasury_reconciliation_status')
    .select('*')
    .order('asset', { ascending: true });

  return statuses || [];
}

async function getHealthMetrics(supabase: any): Promise<any> {
  // Get system wallet
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('*')
    .eq('id', 1)
    .single();

  // Get pending alerts count
  const { count: pendingAlerts } = await supabase
    .from('treasury_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'PENDING');

  // Get critical alerts count
  const { count: criticalAlerts } = await supabase
    .from('treasury_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'CRITICAL')
    .eq('status', 'PENDING');

  // Get reconciliation mismatches
  const { count: mismatches } = await supabase
    .from('treasury_reconciliation_status')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'MISMATCH');

  // Get emergency controls
  const { data: emergencyControls } = await supabase
    .from('emergency_controls')
    .select('*')
    .eq('id', 1)
    .single();

  return {
    system_wallet_exists: !!systemWallet,
    pending_alerts: pendingAlerts || 0,
    critical_alerts: criticalAlerts || 0,
    reconciliation_mismatches: mismatches || 0,
    system_frozen: emergencyControls?.is_system_frozen || false,
    trading_enabled: emergencyControls?.trading_enabled !== false,
    withdrawals_enabled: emergencyControls?.withdrawals_enabled !== false,
    deposits_enabled: emergencyControls?.deposits_enabled !== false
  };
}
