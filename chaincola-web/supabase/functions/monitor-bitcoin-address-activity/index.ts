// Monitor Bitcoin Address Activity Edge Function
// Feature 4: Address activity monitoring - Watch for activity, alerts, fraud detection

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Thresholds for alerts
const LARGE_TRANSFER_THRESHOLD = 1.0; // BTC
const SUSPICIOUS_ACTIVITY_THRESHOLD = 10; // transactions per hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    const alchemyUrl = bitcoinRpcUrl;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const addresses = body.addresses || [];

    // If no addresses provided, get all active Bitcoin wallets
    let addressesToMonitor = addresses;
    if (addressesToMonitor.length === 0) {
      const { data: wallets } = await supabase
        .from('crypto_wallets')
        .select('address, user_id')
        .eq('asset', 'BTC')
        .eq('network', 'mainnet')
        .eq('is_active', true);

      addressesToMonitor = wallets?.map(w => w.address) || [];
    }

    console.log(`🔍 Monitoring ${addressesToMonitor.length} Bitcoin addresses for activity...`);

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

        // Get recent transactions for this address
        const { data: recentTxs } = await supabase
          .from('transactions')
          .select('*')
          .or(`to_address.eq.${address},from_address.eq.${address}`)
          .eq('crypto_currency', 'BTC')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
          .order('created_at', { ascending: false })
          .limit(100);

        if (!recentTxs || recentTxs.length === 0) continue;

        activityReport.activitiesFound += recentTxs.length;

        // Check for large transfers
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
              `Large transfer detected: ${amount} BTC at ${address}`
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

        // Check for suspicious activity (too many transactions)
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

        // Get current balance for context using Alchemy API
        try {
          let balance = 0;
          const processedTxids = new Set<string>();

          // Calculate balance from known transactions using gettxout
          for (const tx of recentTxs || []) {
            if (!tx.transaction_hash || processedTxids.has(tx.transaction_hash)) continue;
            if (tx.to_address !== address) continue; // Only count incoming
            
            processedTxids.add(tx.transaction_hash);

            try {
              // Get transaction details
              const txResponse = await fetch(alchemyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'getrawtransaction',
                  params: [tx.transaction_hash, true],
                  id: 1,
                }),
              });

              if (txResponse.ok) {
                const txData = await txResponse.json();
                const txDetails = txData.result;
                if (!txDetails || !txDetails.vout) continue;

                // Check each output
                for (let voutIndex = 0; voutIndex < txDetails.vout.length; voutIndex++) {
                  const output = txDetails.vout[voutIndex];
                  
                  if (output.scriptPubKey && output.scriptPubKey.addresses) {
                    const outputAddresses = output.scriptPubKey.addresses;
                    if (outputAddresses.includes(address)) {
                      // Check if unspent
                      const txoutResponse = await fetch(alchemyUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          jsonrpc: '2.0',
                          method: 'gettxout',
                          params: [tx.transaction_hash, voutIndex],
                          id: 2,
                        }),
                      });

                      if (txoutResponse.ok) {
                        const txoutData = await txoutResponse.json();
                        if (txoutData.result) {
                          balance += txoutData.result.value || output.value || 0;
                        }
                      }
                    }
                  }
                }
              }
            } catch (txError) {
              // Skip this transaction if there's an error
            }
          }

          // Log activity summary
          console.log(`Address ${address}: ${recentTxs.length} transactions, Balance: ${balance.toFixed(8)} BTC`);
        } catch (balanceError) {
          console.warn(`Could not get balance for ${address}:`, balanceError);
        }
      } catch (error: any) {
        console.error(`Error monitoring address ${address}:`, error);
        activityReport.alerts.push(`Error monitoring ${address}: ${error.message}`);
      }
    }

    // Create notifications for alerts
    if (activityReport.alerts.length > 0) {
      // You can create notifications here for admins
      console.log('⚠️ Alerts generated:', activityReport.alerts);
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
    console.error('❌ Exception monitoring Bitcoin addresses:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to monitor addresses',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});




