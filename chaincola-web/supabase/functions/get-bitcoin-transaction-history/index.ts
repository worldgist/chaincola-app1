// Get Bitcoin Transaction History Edge Function
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

    // Get user's Bitcoin wallet address
    let btcAddress = address;
    if (!btcAddress) {
      const { data: wallet } = await supabase
        .from('crypto_wallets')
        .select('address')
        .eq('user_id', user.id)
        .eq('asset', 'BTC')
        .eq('network', 'mainnet')
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Bitcoin wallet not found',
            transactions: [],
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      btcAddress = wallet.address;
    }

    // Get transactions from database first (faster)
    const { data: dbTransactions, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('crypto_currency', 'BTC')
      .or(`to_address.eq.${btcAddress},from_address.eq.${btcAddress}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/rq1GQ1LbhwToT3n4E6IIB';
    const alchemyUrl = bitcoinRpcUrl;

    // Get blockchain transactions (if needed)
    // Note: Alchemy Bitcoin API doesn't have direct address transaction history
    // We'll use the database transactions and enhance with blockchain data

    const transactions = (dbTransactions || []).map((tx: any) => {
      const isIncoming = tx.to_address === btcAddress;
      const isOutgoing = tx.from_address === btcAddress;

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
          address: btcAddress,
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
    console.error('❌ Exception getting Bitcoin transaction history:', error);
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















