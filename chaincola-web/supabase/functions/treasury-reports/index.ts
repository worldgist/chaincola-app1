// Treasury Reports Generator
// Generates comprehensive downloadable reports in PDF/CSV/JSON/Excel formats
// Supports: Daily/Weekly/Monthly summaries, Reconciliation, Settlement, Audit, Compliance reports

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSETS = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];

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

    // Check if user is admin or has treasury permissions
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    // Check treasury permissions
    const { data: treasuryRole } = await supabase
      .from('user_treasury_roles')
      .select('role_name, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    const hasPermission = profile?.is_admin || 
      (treasuryRole && ['TREASURY_ADMIN', 'TREASURY_OPERATOR', 'TREASURY_VIEWER'].includes(treasuryRole.role_name));

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin or Treasury access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'generateReport': {
        const { reportType, format, periodStart, periodEnd, notes } = body;

        if (!reportType || !format) {
          return new Response(
            JSON.stringify({ success: false, error: 'Report type and format are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create pending report record
        const { data: pendingReport, error: createError } = await supabase
          .from('treasury_reports')
          .insert({
            report_type: reportType,
            report_format: format,
            period_start: periodStart || new Date().toISOString(),
            period_end: periodEnd || new Date().toISOString(),
            status: 'GENERATING',
            generated_by: user.id,
            notes: notes || null
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating report record:', createError);
        }

        try {
          const reportData = await generateReportData(reportType, periodStart, periodEnd, supabase);
          const formattedReport = await formatReport(reportData, format, reportType);

          // Update report with completed status
          const { data: savedReport, error: saveError } = await supabase
            .from('treasury_reports')
            .update({
              report_data: reportData,
              status: 'COMPLETED',
              generated_at: new Date().toISOString(),
              is_export_ready: true,
              regulatory_compliant: true
            })
            .eq('id', pendingReport?.id)
            .select()
            .single();

          if (saveError) {
            console.error('Error saving report:', saveError);
          }

          return new Response(
            format === 'CSV' ? formattedReport : JSON.stringify({ 
              success: true, 
              data: {
                report: formattedReport,
                reportId: savedReport?.id || pendingReport?.id,
                format: format
              }
            }),
            { 
              status: 200, 
              headers: { 
                ...corsHeaders, 
                'Content-Type': format === 'CSV' ? 'text/csv' : 'application/json',
                'Content-Disposition': `attachment; filename="treasury-report-${reportType}-${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}"`
              } 
            }
          );
        } catch (error: any) {
          // Update report with failed status
          await supabase
            .from('treasury_reports')
            .update({
              status: 'FAILED',
              report_data: { error: error.message }
            })
            .eq('id', pendingReport?.id);

          throw error;
        }
      }

      case 'getReports': {
        const { limit = 50, offset = 0, reportType, status } = body;

        let query = supabase
          .from('treasury_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (reportType) {
          query = query.eq('report_type', reportType);
        }
        if (status) {
          query = query.eq('status', status);
        }

        const { data: reports, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: reports }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getReport': {
        const { reportId } = body;

        if (!reportId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Report ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: report, error } = await supabase
          .from('treasury_reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: report }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'generateSettlementReport': {
        const { reportDate, reportType = 'DAILY' } = body;
        const targetDate = reportDate || new Date().toISOString().split('T')[0];

        const report = await generateSettlementReport(targetDate, reportType, supabase, user.id);

        return new Response(
          JSON.stringify({ success: true, data: report }),
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
    console.error('Treasury reports error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateReportData(
  reportType: string,
  periodStart: string | null,
  periodEnd: string | null,
  supabase: any
): Promise<any> {
  // Calculate default period based on report type
  let defaultStart: Date;
  const now = new Date();
  
  switch (reportType) {
    case 'DAILY_SUMMARY':
      defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'WEEKLY_SUMMARY':
      defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'MONTHLY_SUMMARY':
      defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const startDate = periodStart || defaultStart.toISOString();
  const endDate = periodEnd || now.toISOString();

  switch (reportType) {
    case 'DAILY_SUMMARY':
    case 'WEEKLY_SUMMARY':
    case 'MONTHLY_SUMMARY': {
      return await generateSummaryReport(startDate, endDate, supabase, reportType);
    }

    case 'RECONCILIATION': {
      return await generateReconciliationReport(startDate, endDate, supabase);
    }

    case 'SETTLEMENT': {
      return await generateSettlementReportData(startDate, endDate, supabase);
    }

    case 'AUDIT': {
      return await generateAuditReport(startDate, endDate, supabase);
    }

    case 'COMPLIANCE': {
      return await generateComplianceReport(startDate, endDate, supabase);
    }

    default:
      return { period: { start: startDate, end: endDate }, data: {}, error: 'Unknown report type' };
  }
}

async function generateSummaryReport(
  startDate: string,
  endDate: string,
  supabase: any,
  reportType: string
): Promise<any> {
  // Get system wallet balances
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('*')
    .eq('id', 1)
    .single();

  // Get inventory balances with reconciliation status
  const { data: inventoryBalances } = await supabase
    .from('treasury_reconciliation_status')
    .select('*')
    .order('asset', { ascending: true });

  // Get on-chain balances
  const { data: onChainBalances } = await supabase
    .from('on_chain_balances')
    .select('*')
    .order('asset', { ascending: true });

  // Get latest prices
  const prices: Record<string, any> = {};
  for (const asset of ASSETS) {
    const { data: priceData } = await supabase
      .from('price_cache')
      .select('*')
      .eq('asset', asset)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();
    
    if (priceData) {
      prices[asset] = {
        price_usd: parseFloat(priceData.price_usd || '0'),
        price_ngn: parseFloat(priceData.price_ngn || '0'),
        source: priceData.price_source,
        fetched_at: priceData.fetched_at
      };
    }
  }

  // Get transactions for the period
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  // Get alerts
  const { data: alerts } = await supabase
    .from('treasury_alerts')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  // Get threshold rules
  const { data: thresholdRules } = await supabase
    .from('treasury_threshold_rules')
    .select('*')
    .eq('is_active', true);

  // Calculate transaction statistics
  const txStats = calculateTransactionStats(transactions || []);
  
  // Calculate inventory value
  const inventoryValue = calculateInventoryValue(systemWallet, prices);
  
  // Calculate alert statistics
  const alertStats = {
    total: alerts?.length || 0,
    critical: alerts?.filter((a: any) => a.severity === 'CRITICAL').length || 0,
    high: alerts?.filter((a: any) => a.severity === 'HIGH').length || 0,
    medium: alerts?.filter((a: any) => a.severity === 'MEDIUM').length || 0,
    low: alerts?.filter((a: any) => a.severity === 'LOW').length || 0,
    by_type: groupAlertsByType(alerts || [])
  };

  return {
    report_type: reportType,
    period: { start: startDate, end: endDate },
    generated_at: new Date().toISOString(),
    system_wallet: {
      ngn_float_balance: parseFloat(systemWallet?.ngn_float_balance || '0'),
      btc_inventory: parseFloat(systemWallet?.btc_inventory || '0'),
      eth_inventory: parseFloat(systemWallet?.eth_inventory || '0'),
      usdt_inventory: parseFloat(systemWallet?.usdt_inventory || '0'),
      usdc_inventory: parseFloat(systemWallet?.usdc_inventory || '0'),
      xrp_inventory: parseFloat(systemWallet?.xrp_inventory || '0'),
      sol_inventory: parseFloat(systemWallet?.sol_inventory || '0'),
    },
    inventory_balances: inventoryBalances || [],
    on_chain_balances: onChainBalances || [],
    prices: prices,
    inventory_value_ngn: inventoryValue.total_ngn,
    inventory_value_usd: inventoryValue.total_usd,
    threshold_rules: thresholdRules || [],
    transactions: {
      total: transactions?.length || 0,
      stats: txStats,
      recent: transactions?.slice(0, 100) || []
    },
    alerts: {
      stats: alertStats,
      recent: alerts?.slice(0, 50) || []
    },
    summary: {
      total_transactions: transactions?.length || 0,
      total_alerts: alerts?.length || 0,
      critical_alerts: alertStats.critical,
      total_inventory_value_ngn: inventoryValue.total_ngn,
      reconciliation_status: calculateReconciliationStatus(inventoryBalances || [])
    }
  };
}

async function generateReconciliationReport(
  startDate: string,
  endDate: string,
  supabase: any
): Promise<any> {
  const { data: reconciliations } = await supabase
    .from('reconciliations')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  const { data: reconciliationStatus } = await supabase
    .from('treasury_reconciliation_status')
    .select('*')
    .order('asset', { ascending: true });

  const { data: onChainBalances } = await supabase
    .from('on_chain_balances')
    .select('*')
    .order('asset', { ascending: true });

  // Get system wallet for ledger balances
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('*')
    .eq('id', 1)
    .single();

  const discrepancies = reconciliationStatus?.filter(
    (r: any) => r.status === 'MISMATCH' || r.status === 'NEGATIVE_INVENTORY'
  ) || [];

  return {
    report_type: 'RECONCILIATION',
    period: { start: startDate, end: endDate },
    generated_at: new Date().toISOString(),
    reconciliations: reconciliations || [],
    current_status: reconciliationStatus || [],
    on_chain_balances: onChainBalances || [],
    system_wallet: systemWallet,
    discrepancies: discrepancies,
    summary: {
      total_reconciliations: reconciliations?.length || 0,
      total_discrepancies: discrepancies.length,
      balanced_assets: reconciliationStatus?.filter((r: any) => r.status === 'BALANCED').length || 0,
      mismatched_assets: discrepancies.length
    }
  };
}

async function generateSettlementReportData(
  startDate: string,
  endDate: string,
  supabase: any
): Promise<any> {
  const { data: settlements } = await supabase
    .from('settlement_reports')
    .select('*')
    .gte('report_date', startDate.split('T')[0])
    .lte('report_date', endDate.split('T')[0])
    .order('report_date', { ascending: false });

  // Calculate aggregate statistics
  const totalCredits = settlements?.reduce((sum: number, s: any) => 
    sum + parseFloat(s.total_credits || '0'), 0) || 0;
  const totalDebits = settlements?.reduce((sum: number, s: any) => 
    sum + parseFloat(s.total_debits || '0'), 0) || 0;
  const netChange = totalCredits - totalDebits;

  return {
    report_type: 'SETTLEMENT',
    period: { start: startDate, end: endDate },
    generated_at: new Date().toISOString(),
    settlements: settlements || [],
    summary: {
      total_settlements: settlements?.length || 0,
      total_credits: totalCredits,
      total_debits: totalDebits,
      net_change: netChange,
      completed: settlements?.filter((s: any) => s.status === 'COMPLETED').length || 0,
      pending: settlements?.filter((s: any) => s.status === 'PENDING').length || 0,
      failed: settlements?.filter((s: any) => s.settlement_failed === true).length || 0
    }
  };
}

async function generateAuditReport(
  startDate: string,
  endDate: string,
  supabase: any
): Promise<any> {
  // Get audit logs
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  // Get treasury adjustments
  const treasuryAdjustments = auditLogs?.filter(
    (log: any) => log.action_type === 'TREASURY_ADJUSTMENT'
  ) || [];

  // Get settlement activities
  const settlementActivities = auditLogs?.filter(
    (log: any) => log.action_type?.includes('SETTLEMENT')
  ) || [];

  // Get reconciliation activities
  const reconciliationActivities = auditLogs?.filter(
    (log: any) => log.action_type?.includes('RECONCILIATION')
  ) || [];

  return {
    report_type: 'AUDIT',
    period: { start: startDate, end: endDate },
    generated_at: new Date().toISOString(),
    audit_logs: auditLogs || [],
    treasury_adjustments: treasuryAdjustments,
    settlement_activities: settlementActivities,
    reconciliation_activities: reconciliationActivities,
    summary: {
      total_audit_entries: auditLogs?.length || 0,
      treasury_adjustments: treasuryAdjustments.length,
      settlement_activities: settlementActivities.length,
      reconciliation_activities: reconciliationActivities.length,
      by_action_type: groupByActionType(auditLogs || [])
    }
  };
}

async function generateComplianceReport(
  startDate: string,
  endDate: string,
  supabase: any
): Promise<any> {
  // Get transaction anomalies
  const { data: anomalies } = await supabase
    .from('transaction_anomalies')
    .select('*')
    .gte('detected_at', startDate)
    .lte('detected_at', endDate)
    .order('detected_at', { ascending: false });

  // Get alerts
  const { data: alerts } = await supabase
    .from('treasury_alerts')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  // Get threshold breaches
  const thresholdBreaches = alerts?.filter(
    (a: any) => a.alert_type === 'THRESHOLD_BREACH' || a.alert_type === 'CRITICAL_BALANCE'
  ) || [];

  // Get emergency controls status
  const { data: emergencyControls } = await supabase
    .from('emergency_controls')
    .select('*')
    .eq('id', 1)
    .single();

  return {
    report_type: 'COMPLIANCE',
    period: { start: startDate, end: endDate },
    generated_at: new Date().toISOString(),
    anomalies: anomalies || [],
    alerts: alerts || [],
    threshold_breaches: thresholdBreaches,
    emergency_controls: emergencyControls,
    summary: {
      total_anomalies: anomalies?.length || 0,
      confirmed_anomalies: anomalies?.filter((a: any) => a.status === 'CONFIRMED').length || 0,
      false_positives: anomalies?.filter((a: any) => a.status === 'FALSE_POSITIVE').length || 0,
      threshold_breaches: thresholdBreaches.length,
      critical_alerts: alerts?.filter((a: any) => a.severity === 'CRITICAL').length || 0,
      system_frozen: emergencyControls?.is_system_frozen || false
    }
  };
}

async function formatReport(data: any, format: string, reportType: string): Promise<string> {
  if (format === 'CSV') {
    return generateCSV(data, reportType);
  } else if (format === 'JSON') {
    return JSON.stringify(data, null, 2);
  } else {
    // For PDF/Excel, return JSON for now (would need additional libraries)
    return JSON.stringify(data, null, 2);
  }
}

function generateCSV(data: any, reportType: string): string {
  let csv = '';

  switch (reportType) {
    case 'DAILY_SUMMARY':
    case 'WEEKLY_SUMMARY':
    case 'MONTHLY_SUMMARY': {
      // Summary section
      csv += '=== TREASURY SUMMARY REPORT ===\n';
      csv += `Report Type: ${data.report_type}\n`;
      csv += `Period: ${data.period.start} to ${data.period.end}\n`;
      csv += `Generated At: ${data.generated_at}\n\n`;

      // Inventory balances
      csv += '=== INVENTORY BALANCES ===\n';
      csv += 'Asset,Ledger Balance,On-Chain Balance,Difference,Status,Difference %\n';
      if (data.inventory_balances) {
        for (const balance of data.inventory_balances) {
          csv += `${balance.asset},${balance.ledger_balance || 0},${balance.on_chain_balance || 0},${balance.difference || 0},${balance.status || 'UNKNOWN'},${balance.difference_percentage || 0}\n`;
        }
      }
      csv += '\n';

      // Prices
      csv += '=== CURRENT PRICES ===\n';
      csv += 'Asset,Price USD,Price NGN,Source,Fetched At\n';
      if (data.prices) {
        for (const [asset, price] of Object.entries(data.prices)) {
          const p = price as any;
          csv += `${asset},${p.price_usd || 0},${p.price_ngn || 0},${p.source || 'N/A'},${p.fetched_at || 'N/A'}\n`;
        }
      }
      csv += '\n';

      // Transaction summary
      csv += '=== TRANSACTION SUMMARY ===\n';
      if (data.transactions?.stats) {
        const stats = data.transactions.stats;
        csv += `Total Transactions,${data.transactions.total || 0}\n`;
        csv += `Buy Transactions,${stats.buy_count || 0}\n`;
        csv += `Sell Transactions,${stats.sell_count || 0}\n`;
        csv += `Total Buy Volume (NGN),${stats.buy_volume_ngn || 0}\n`;
        csv += `Total Sell Volume (NGN),${stats.sell_volume_ngn || 0}\n`;
        csv += `Total Fees Collected,${stats.total_fees || 0}\n`;
      }
      csv += '\n';

      // Alert summary
      csv += '=== ALERT SUMMARY ===\n';
      if (data.alerts?.stats) {
        const alertStats = data.alerts.stats;
        csv += `Total Alerts,${alertStats.total || 0}\n`;
        csv += `Critical Alerts,${alertStats.critical || 0}\n`;
        csv += `High Alerts,${alertStats.high || 0}\n`;
        csv += `Medium Alerts,${alertStats.medium || 0}\n`;
        csv += `Low Alerts,${alertStats.low || 0}\n`;
      }
      break;
    }

    case 'RECONCILIATION': {
      csv += '=== RECONCILIATION REPORT ===\n';
      csv += `Period: ${data.period.start} to ${data.period.end}\n`;
      csv += `Generated At: ${data.generated_at}\n\n`;

      csv += '=== CURRENT RECONCILIATION STATUS ===\n';
      csv += 'Asset,Ledger Balance,On-Chain Balance,Difference,Difference %,Status\n';
      if (data.current_status) {
        for (const status of data.current_status) {
          csv += `${status.asset},${status.ledger_balance || 0},${status.on_chain_balance || 0},${status.difference || 0},${status.difference_percentage || 0},${status.status || 'UNKNOWN'}\n`;
        }
      }
      csv += '\n';

      csv += '=== RECONCILIATION HISTORY ===\n';
      csv += 'Date,Type,Currency,Expected Amount,Actual Amount,Discrepancy,Status\n';
      if (data.reconciliations) {
        for (const rec of data.reconciliations) {
          csv += `${rec.reconciliation_date || rec.created_at},${rec.reconciliation_type || 'N/A'},${rec.currency || 'N/A'},${rec.expected_amount || 0},${rec.actual_amount || 0},${rec.discrepancy_amount || 0},${rec.status || 'N/A'}\n`;
        }
      }
      csv += '\n';

      csv += '=== SUMMARY ===\n';
      if (data.summary) {
        csv += `Total Reconciliations,${data.summary.total_reconciliations || 0}\n`;
        csv += `Total Discrepancies,${data.summary.total_discrepancies || 0}\n`;
        csv += `Balanced Assets,${data.summary.balanced_assets || 0}\n`;
        csv += `Mismatched Assets,${data.summary.mismatched_assets || 0}\n`;
      }
      break;
    }

    case 'SETTLEMENT': {
      csv += '=== SETTLEMENT REPORT ===\n';
      csv += `Period: ${data.period.start} to ${data.period.end}\n`;
      csv += `Generated At: ${data.generated_at}\n\n`;

      csv += '=== SETTLEMENT DETAILS ===\n';
      csv += 'Date,Type,Opening Balance,Closing Balance,Total Credits,Total Debits,Net Change,Status\n';
      if (data.settlements) {
        for (const settlement of data.settlements) {
          csv += `${settlement.report_date},${settlement.report_type || 'N/A'},${settlement.opening_balance || 0},${settlement.closing_balance || 0},${settlement.total_credits || 0},${settlement.total_debits || 0},${settlement.net_change || 0},${settlement.status || 'N/A'}\n`;
        }
      }
      csv += '\n';

      csv += '=== SUMMARY ===\n';
      if (data.summary) {
        csv += `Total Settlements,${data.summary.total_settlements || 0}\n`;
        csv += `Total Credits,${data.summary.total_credits || 0}\n`;
        csv += `Total Debits,${data.summary.total_debits || 0}\n`;
        csv += `Net Change,${data.summary.net_change || 0}\n`;
        csv += `Completed,${data.summary.completed || 0}\n`;
        csv += `Pending,${data.summary.pending || 0}\n`;
        csv += `Failed,${data.summary.failed || 0}\n`;
      }
      break;
    }

    case 'AUDIT': {
      csv += '=== AUDIT REPORT ===\n';
      csv += `Period: ${data.period.start} to ${data.period.end}\n`;
      csv += `Generated At: ${data.generated_at}\n\n`;

      csv += '=== AUDIT LOGS ===\n';
      csv += 'Date,Action Type,Performed By,Target Entity,Description\n';
      if (data.audit_logs) {
        for (const log of data.audit_logs) {
          csv += `${log.created_at},${log.action_type || 'N/A'},${log.performed_by || 'N/A'},${log.target_entity_type || 'N/A'},"${(log.description || '').replace(/"/g, '""')}"\n`;
        }
      }
      csv += '\n';

      csv += '=== SUMMARY ===\n';
      if (data.summary) {
        csv += `Total Audit Entries,${data.summary.total_audit_entries || 0}\n`;
        csv += `Treasury Adjustments,${data.summary.treasury_adjustments || 0}\n`;
        csv += `Settlement Activities,${data.summary.settlement_activities || 0}\n`;
        csv += `Reconciliation Activities,${data.summary.reconciliation_activities || 0}\n`;
      }
      break;
    }

    case 'COMPLIANCE': {
      csv += '=== COMPLIANCE REPORT ===\n';
      csv += `Period: ${data.period.start} to ${data.period.end}\n`;
      csv += `Generated At: ${data.generated_at}\n\n`;

      csv += '=== TRANSACTION ANOMALIES ===\n';
      csv += 'Date,Type,Severity,Status,Risk Score,Transaction ID\n';
      if (data.anomalies) {
        for (const anomaly of data.anomalies) {
          csv += `${anomaly.detected_at},${anomaly.anomaly_type || 'N/A'},${anomaly.severity || 'N/A'},${anomaly.status || 'N/A'},${anomaly.risk_score || 0},${anomaly.transaction_id || 'N/A'}\n`;
        }
      }
      csv += '\n';

      csv += '=== THRESHOLD BREACHES ===\n';
      csv += 'Date,Type,Severity,Asset,Status\n';
      if (data.threshold_breaches) {
        for (const breach of data.threshold_breaches) {
          csv += `${breach.created_at},${breach.alert_type || 'N/A'},${breach.severity || 'N/A'},${breach.asset || 'N/A'},${breach.status || 'N/A'}\n`;
        }
      }
      csv += '\n';

      csv += '=== SUMMARY ===\n';
      if (data.summary) {
        csv += `Total Anomalies,${data.summary.total_anomalies || 0}\n`;
        csv += `Confirmed Anomalies,${data.summary.confirmed_anomalies || 0}\n`;
        csv += `False Positives,${data.summary.false_positives || 0}\n`;
        csv += `Threshold Breaches,${data.summary.threshold_breaches || 0}\n`;
        csv += `Critical Alerts,${data.summary.critical_alerts || 0}\n`;
        csv += `System Frozen,${data.summary.system_frozen ? 'Yes' : 'No'}\n`;
      }
      break;
    }

    default:
      csv += 'Report type not supported for CSV export\n';
  }

  return csv;
}

// Helper functions
function calculateTransactionStats(transactions: any[]): any {
  const stats = {
    buy_count: 0,
    sell_count: 0,
    deposit_count: 0,
    withdrawal_count: 0,
    buy_volume_ngn: 0,
    sell_volume_ngn: 0,
    buy_volume_crypto: {} as Record<string, number>,
    sell_volume_crypto: {} as Record<string, number>,
    total_fees: 0,
    by_asset: {} as Record<string, any>
  };

  for (const tx of transactions) {
    const amount = parseFloat(tx.fiat_amount || '0');
    const cryptoAmount = parseFloat(tx.crypto_amount || tx.amount || '0');
    const asset = tx.asset || tx.crypto_currency || 'UNKNOWN';
    const fees = parseFloat(tx.fees || '0');

    stats.total_fees += fees;

    switch (tx.transaction_type) {
      case 'BUY':
        stats.buy_count++;
        stats.buy_volume_ngn += amount;
        stats.buy_volume_crypto[asset] = (stats.buy_volume_crypto[asset] || 0) + cryptoAmount;
        break;
      case 'SELL':
        stats.sell_count++;
        stats.sell_volume_ngn += amount;
        stats.sell_volume_crypto[asset] = (stats.sell_volume_crypto[asset] || 0) + cryptoAmount;
        break;
      case 'DEPOSIT':
        stats.deposit_count++;
        break;
      case 'SEND':
      case 'WITHDRAWAL':
        stats.withdrawal_count++;
        break;
    }

    if (!stats.by_asset[asset]) {
      stats.by_asset[asset] = {
        buy_count: 0,
        sell_count: 0,
        buy_volume_ngn: 0,
        sell_volume_ngn: 0,
        buy_volume_crypto: 0,
        sell_volume_crypto: 0
      };
    }

    if (tx.transaction_type === 'BUY') {
      stats.by_asset[asset].buy_count++;
      stats.by_asset[asset].buy_volume_ngn += amount;
      stats.by_asset[asset].buy_volume_crypto += cryptoAmount;
    } else if (tx.transaction_type === 'SELL') {
      stats.by_asset[asset].sell_count++;
      stats.by_asset[asset].sell_volume_ngn += amount;
      stats.by_asset[asset].sell_volume_crypto += cryptoAmount;
    }
  }

  return stats;
}

function calculateInventoryValue(systemWallet: any, prices: Record<string, any>): any {
  let total_ngn = parseFloat(systemWallet?.ngn_float_balance || '0');
  let total_usd = 0;

  for (const asset of ASSETS) {
    const inventoryField = `${asset.toLowerCase()}_inventory`;
    const balance = parseFloat(systemWallet?.[inventoryField] || '0');
    const price = prices[asset];

    if (price) {
      const value_ngn = balance * parseFloat(price.price_ngn || '0');
      const value_usd = balance * parseFloat(price.price_usd || '0');
      total_ngn += value_ngn;
      total_usd += value_usd;
    }
  }

  return { total_ngn, total_usd };
}

function calculateReconciliationStatus(inventoryBalances: any[]): any {
  const balanced = inventoryBalances.filter((b: any) => b.status === 'BALANCED').length;
  const mismatched = inventoryBalances.filter((b: any) => b.status === 'MISMATCH').length;
  const negative = inventoryBalances.filter((b: any) => b.is_negative_inventory === true).length;

  return {
    balanced_count: balanced,
    mismatched_count: mismatched,
    negative_inventory_count: negative,
    total_assets: inventoryBalances.length
  };
}

function groupAlertsByType(alerts: any[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const alert of alerts) {
    const type = alert.alert_type || 'UNKNOWN';
    grouped[type] = (grouped[type] || 0) + 1;
  }
  return grouped;
}

function groupByActionType(auditLogs: any[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const log of auditLogs) {
    const type = log.action_type || 'UNKNOWN';
    grouped[type] = (grouped[type] || 0) + 1;
  }
  return grouped;
}

async function generateSettlementReport(
  reportDate: string,
  reportType: string,
  supabase: any,
  userId: string
): Promise<any> {
  // Get NGN float balance
  const { data: systemWallet } = await supabase
    .from('system_wallets')
    .select('ngn_float_balance')
    .eq('id', 1)
    .single();

  const currentBalance = parseFloat(systemWallet?.ngn_float_balance || '0');

  // Get transactions for the day
  const startOfDay = new Date(reportDate).toISOString().split('T')[0] + 'T00:00:00Z';
  const endOfDay = new Date(reportDate).toISOString().split('T')[0] + 'T23:59:59Z';

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('fiat_currency', 'NGN')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  let totalCredits = 0;
  let totalDebits = 0;

  for (const tx of transactions || []) {
    const amount = parseFloat(tx.fiat_amount || '0');
    if (tx.transaction_type === 'SELL' || tx.transaction_type === 'DEPOSIT') {
      totalCredits += amount;
    } else if (tx.transaction_type === 'BUY' || tx.transaction_type === 'SEND') {
      totalDebits += amount;
    }
  }

  // Calculate opening balance (previous day's closing)
  const previousDay = new Date(new Date(reportDate).getTime() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: previousReport } = await supabase
    .from('settlement_reports')
    .select('closing_balance')
    .eq('report_date', previousDay)
    .eq('report_type', reportType)
    .single();

  const openingBalance = previousReport?.closing_balance || currentBalance;
  const closingBalance = openingBalance + totalCredits - totalDebits;
  const netChange = totalCredits - totalDebits;

  // Create settlement report
  const { data: report, error } = await supabase
    .from('settlement_reports')
    .upsert({
      report_date: reportDate,
      report_type: reportType,
      period_start: startOfDay,
      period_end: endOfDay,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      total_credits: totalCredits,
      total_debits: totalDebits,
      net_change: netChange,
      status: 'COMPLETED',
      generated_by: userId,
      generated_at: new Date().toISOString(),
      report_data: {
        transactions: transactions || [],
        summary: {
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          total_credits: totalCredits,
          total_debits: totalDebits,
          net_change: netChange
        }
      }
    }, {
      onConflict: 'report_date,report_type'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create settlement report: ${error.message}`);
  }

  return report;
}
