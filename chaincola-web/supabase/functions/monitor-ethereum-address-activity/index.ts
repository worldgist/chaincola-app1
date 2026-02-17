// Monitor Ethereum Address Activity Edge Function
// Feature 4: Address activity monitoring

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LARGE_TRANSFER_THRESHOLD = 5.0; // ETH
const SUSPICIOUS_ACTIVITY_THRESHOLD = 20; // transactions per hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    const body = await req.json().catch(() => ({}));
    const addresses = body.addresses || [];

    let addressesToMonitor = addresses;
    if (addressesToMonitor.length === 0) {
      const { data: wallets } = await supabase
        .from('crypto_wallets')
        .select('address, user_id')
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .eq('is_active', true);

      addressesToMonitor = wallets?.map(w => w.address) || [];
    }

    console.log(`🔍 Monitoring ${addressesToMonitor.length} Ethereum addresses for activity...`);

    const activityReport = {
      addressesChecked: 0,
      activitiesFound: 0,
      largeTransfers: [] as any[],
      suspiciousActivities: [] as any[],
      recentTransactions: [] as any[],
      alerts: [] as string[],
    };

    for (const address of addressesToMonitor) {
      try {
        activityReport.addressesChecked++;

        const { data: recentTxs } = await supabase
          .from('transactions')
          .select('*')
          .or(`to_address.eq.${address},from_address.eq.${address}`)
          .eq('crypto_currency', 'ETH')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        if (!recentTxs || recentTxs.length === 0) continue;

        activityReport.activitiesFound += recentTxs.length;

        for (const tx of recentTxs) {
          const amount = parseFloat(tx.crypto_amount?.toString() || '0');
          
          if (amount >= LARGE_TRANSFER_THRESHOLD) {
            activityReport.largeTransfers.push({
              address,
              txid: tx.transaction_hash,
              amount,
              type: tx.transaction_type,
              timestamp: tx.created_at,
            });
            activityReport.alerts.push(
              `Large transfer detected: ${amount} ETH at ${address}`
            );
          }

          activityReport.recentTransactions.push({
            address,
            txid: tx.transaction_hash,
            amount,
            type: tx.transaction_type,
            status: tx.status,
            confirmations: tx.confirmations,
            timestamp: tx.created_at,
          });
        }

        const transactionsLastHour = recentTxs.filter(
          (tx: any) => new Date(tx.created_at) > new Date(Date.now() - 60 * 60 * 1000)
        ).length;

        if (transactionsLastHour >= SUSPICIOUS_ACTIVITY_THRESHOLD) {
          activityReport.suspiciousActivities.push({
            address,
            transactionsCount: transactionsLastHour,
            timeframe: '1 hour',
            alert: 'High transaction frequency detected',
          });
          activityReport.alerts.push(
            `Suspicious activity: ${transactionsLastHour} transactions in 1 hour at ${address}`
          );
        }

        // Get current balance
        const balanceResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          const balanceWei = BigInt(balanceData.result || '0');
          const balanceETH = Number(balanceWei) / 1e18;
          console.log(`Address ${address}: ${recentTxs.length} transactions, Balance: ${balanceETH} ETH`);
        }
      } catch (error: any) {
        console.error(`Error monitoring address ${address}:`, error);
        activityReport.alerts.push(`Error monitoring ${address}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: activityReport,
        summary: {
          addressesMonitored: activityReport.addressesChecked,
          totalActivities: activityReport.activitiesFound,
          largeTransfers: activityReport.largeTransfers.length,
          suspiciousActivities: activityReport.suspiciousActivities.length,
          alerts: activityReport.alerts.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception monitoring Ethereum addresses:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to monitor addresses',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});















