// Get Ethereum Transaction History Edge Function
// Feature 2: Transaction history - Fetch incoming/outgoing transactions

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

    // Get user from auth token
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
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get query parameters
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const address = url.searchParams.get('address');

    // Get user's Ethereum wallet address
    let ethAddress = address;
    if (!ethAddress) {
      const { data: wallet } = await supabase
        .from('crypto_wallets')
        .select('address')
        .eq('user_id', user.id)
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Ethereum wallet not found',
            transactions: [],
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      ethAddress = wallet.address;
    }

    // Get transactions from database
    const { data: dbTransactions, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('crypto_currency', 'ETH')
      .or(`to_address.eq.${ethAddress},from_address.eq.${ethAddress}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const transactions = (dbTransactions || []).map((tx: any) => {
      const isIncoming = tx.to_address === ethAddress;
      const isOutgoing = tx.from_address === ethAddress;

      return {
        id: tx.id,
        txid: tx.transaction_hash,
        type: isIncoming ? 'RECEIVE' : isOutgoing ? 'SEND' : tx.transaction_type,
        status: tx.status,
        amount: parseFloat(tx.crypto_amount?.toString() || '0'),
        fee: parseFloat(tx.fee_amount?.toString() || '0'),
        from: tx.from_address,
        to: tx.to_address,
        confirmations: tx.confirmations || 0,
        blockNumber: tx.block_number,
        createdAt: tx.created_at,
        confirmedAt: tx.confirmed_at,
        completedAt: tx.completed_at,
        metadata: tx.metadata,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address: ethAddress,
          transactions,
          pagination: {
            limit,
            offset,
            total: dbTransactions?.length || 0,
          },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception getting Ethereum transaction history:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get transaction history',
        transactions: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});















