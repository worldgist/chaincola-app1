// Check Luno Balance Edge Function
// Simple function to check Luno balance for debugging

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LUNO_API_BASE = 'https://api.luno.com';

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Luno API credentials
    const lunoApiKeyId = Deno.env.get('LUNO_API_KEY_ID');
    const lunoApiSecret = Deno.env.get('LUNO_API_SECRET');

    if (!lunoApiKeyId || !lunoApiSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Luno API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lunoAuthHeader = `Basic ${btoa(`${lunoApiKeyId}:${lunoApiSecret}`)}`;

    // Check Luno balance
    const balanceUrl = `${LUNO_API_BASE}/api/1/balance`;
    console.log(`🔍 Checking Luno balance at: ${balanceUrl}`);
    
    const balanceResponse = await fetch(balanceUrl, {
      headers: { 'Authorization': lunoAuthHeader },
    });

    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to check Luno balance: ${balanceResponse.status} ${balanceResponse.statusText}`,
          details: errorText
        }),
        { status: balanceResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const balanceData = await balanceResponse.json();
    console.log(`📊 Luno balance response:`, JSON.stringify(balanceData, null, 2));
    
    // Handle different response formats from Luno API
    let solBalance = null;
    if (Array.isArray(balanceData)) {
      balanceData.forEach((b: any, idx: number) => {
        console.log(`   [${idx}] Asset: ${b.asset || b.currency}, Balance: ${b.balance || b.available || '0'}, Reserved: ${b.reserved || '0'}, Unconfirmed: ${b.unconfirmed || '0'}`);
      });
      
      solBalance = balanceData.find((b: any) => 
        b.asset === 'SOL' || 
        b.currency === 'SOL' ||
        (b.asset && b.asset.toUpperCase() === 'SOL') ||
        (b.currency && b.currency.toUpperCase() === 'SOL')
      );
    } else if (balanceData.balance !== undefined) {
      solBalance = balanceData;
    } else if (balanceData.available !== undefined) {
      solBalance = balanceData;
    }

    return new Response(
      JSON.stringify({
        success: true,
        raw_response: balanceData,
        sol_balance: solBalance,
        all_balances: Array.isArray(balanceData) ? balanceData : [balanceData],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Check Luno balance error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


