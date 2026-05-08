// Flutterwave Management Edge Function
// Fetches Flutterwave account balances and transactions for admin dashboard

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  flw_ref: string;
  device_fingerprint: string;
  amount: number;
  currency: string;
  charged_amount: number;
  app_fee: number;
  merchant_fee: number;
  processor_response: string;
  auth_model: string;
  card: {
    first_6digits: string;
    last_4digits: string;
    issuer: string;
    country: string;
    type: string;
    token: string;
    expiry: string;
  };
  created_at: string;
  account_id: number;
  customer: {
    id: number;
    name: string;
    phone_number: string;
    email: string;
    created_at: string;
  };
  status: string;
  payment_type: string;
  created_at: string;
  amount_settled: number;
  meta: any;
  amount_charged: number;
  currency_settled: string;
  rave_ref: string;
  customer_id: number;
  account: {
    account_number: string;
    account_bank: string;
    bank_name: string;
  };
  payment_id: string;
}

interface FlutterwaveTransactionsResponse {
  status: string;
  message: string;
  data: {
    transactions: FlutterwaveTransaction[];
    page_info: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
}

interface FlutterwaveBalanceResponse {
  status: string;
  message: string;
  data: {
    available_balance: number;
    ledger_balance: number;
    currency: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin (profiles use user_id = auth.users.id)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile || (!profile.is_admin && profile.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Flutterwave secret key
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!flutterwaveSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Flutterwave secret key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'all';

    // Fetch Flutterwave account balance
    // Flutterwave API v3 uses /balances endpoint (may require specific account type)
    if (action === 'balance') {
      try {
        // Try the standard balances endpoint
        const balanceUrl = `${FLUTTERWAVE_API_BASE}/balances`;
        console.log('📊 Fetching Flutterwave balance from:', balanceUrl);
        
        const balanceResponse = await fetch(balanceUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        const responseText = await balanceResponse.text();
        console.log('📊 Balance response status:', balanceResponse.status);
        console.log('📊 Balance response body:', responseText);

        if (!balanceResponse.ok) {
          console.error('❌ Flutterwave balance fetch failed:', responseText);
          
          // Try alternative endpoint: /wallet endpoint (for some account types)
          try {
            const walletUrl = `${FLUTTERWAVE_API_BASE}/wallet`;
            console.log('📊 Trying wallet endpoint:', walletUrl);
            const walletResponse = await fetch(walletUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${flutterwaveSecretKey}`,
                'Content-Type': 'application/json',
              },
            });

            if (walletResponse.ok) {
              const walletText = await walletResponse.text();
              console.log('✅ Wallet response:', walletText);
              const walletData = JSON.parse(walletText);
              
              // Extract balance from wallet response (structure may vary)
              const balanceData = {
                available_balance: walletData.data?.available_balance || walletData.data?.balance || walletData.available_balance || walletData.balance || 0,
                ledger_balance: walletData.data?.ledger_balance || walletData.data?.balance || walletData.ledger_balance || walletData.balance || 0,
                currency: walletData.data?.currency || walletData.currency || 'NGN',
              };
              
              console.log('✅ Extracted balance data:', balanceData);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  data: balanceData,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } catch (walletError) {
            console.error('❌ Wallet endpoint also failed:', walletError);
          }
          
          // Return error response with details
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Failed to fetch balance',
              details: responseText.substring(0, 500),
              note: 'Balance endpoint may not be available for your account type. Check Flutterwave dashboard.'
            }),
            { status: balanceResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const balanceData: any = JSON.parse(responseText);
        console.log('✅ Balance data parsed:', JSON.stringify(balanceData, null, 2));
        
        // Handle different response structures
        let balance = balanceData.data || balanceData;
        
        // Check if balance is an array (some APIs return arrays)
        if (Array.isArray(balance)) {
          balance = balance[0] || {};
        }
        
        const formattedBalance = {
          available_balance: parseFloat(String(balance.available_balance || balance.availableBalance || balance.balance || 0)) || 0,
          ledger_balance: parseFloat(String(balance.ledger_balance || balance.ledgerBalance || balance.balance || 0)) || 0,
          currency: balance.currency || 'NGN',
        };
        
        console.log('✅ Formatted balance:', formattedBalance);
        
        return new Response(
          JSON.stringify({
            success: true,
            data: formattedBalance,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('❌ Error fetching Flutterwave balance:', error);
        console.error('❌ Error stack:', error.stack);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Failed to fetch balance',
            details: error.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch Flutterwave transactions
    if (action === 'transactions' || action === 'all') {
      try {
        const page = url.searchParams.get('page') || '1';
        const perPage = url.searchParams.get('per_page') || '50';
        const status = url.searchParams.get('status') || '';
        const from = url.searchParams.get('from') || '';
        const to = url.searchParams.get('to') || '';

        let transactionsUrl = `${FLUTTERWAVE_API_BASE}/transactions?page=${page}&per_page=${perPage}`;
        if (status) {
          transactionsUrl += `&status=${status}`;
        }
        if (from) {
          transactionsUrl += `&from=${from}`;
        }
        if (to) {
          transactionsUrl += `&to=${to}`;
        }

        console.log('📊 Fetching Flutterwave transactions from:', transactionsUrl);
        
        const transactionsResponse = await fetch(transactionsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        const responseText = await transactionsResponse.text();
        console.log('📊 Transactions response status:', transactionsResponse.status);
        console.log('📊 Transactions response preview:', responseText.substring(0, 500));

        if (!transactionsResponse.ok) {
          console.error('❌ Flutterwave transactions fetch failed:', responseText);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Failed to fetch transactions',
              details: responseText 
            }),
            { status: transactionsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const fwJson: Record<string, unknown> = JSON.parse(responseText);
        const fwData = fwJson.data;

        // Flutterwave v3: `data` is usually an array; pagination lives under `meta.page_info`
        let rawList: unknown[] = [];
        if (Array.isArray(fwData)) {
          rawList = fwData as unknown[];
        } else if (fwData && typeof fwData === "object" && Array.isArray((fwData as { transactions?: unknown[] }).transactions)) {
          rawList = (fwData as { transactions: unknown[] }).transactions;
        }

        const meta = fwJson.meta as { page_info?: { total?: number; current_page?: number; total_pages?: number } } | undefined;
        const metaPage = meta?.page_info;
        const perPageNum = Math.max(1, parseInt(perPage, 10) || 50);
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const totalFromMeta = metaPage?.total ?? rawList.length;
        const totalPagesFromMeta = metaPage?.total_pages ??
          Math.max(1, Math.ceil(totalFromMeta / perPageNum));

        const normalizeTx = (tx: Record<string, unknown>) => {
          const cust = tx.customer as Record<string, unknown> | undefined;
          const customer = cust && typeof cust === "object"
            ? cust
            : {
              id: (tx.customer_id as number) || 0,
              name: String(tx.customer_name || tx.customer_fullname || ""),
              email: String(tx.customer_email || ""),
              phone_number: String(tx.customer_phone || tx.phone_number || ""),
            };
          return { ...tx, customer };
        };

        const transactions = rawList
          .filter((t) => t && typeof t === "object")
          .map((t) => normalizeTx(t as Record<string, unknown>));

        const pageInfo = {
          total: totalFromMeta,
          current_page: metaPage?.current_page ?? pageNum,
          total_pages: totalPagesFromMeta,
        };

        console.log("✅ Transactions normalized:", {
          count: transactions.length,
          pageInfo,
        });

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              transactions,
              page_info: pageInfo,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (error: any) {
        console.error('❌ Error fetching Flutterwave transactions:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch transactions',
            details: error.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch both balance and transactions
    if (action === 'all') {
      try {
        // Fetch balance
        const balanceUrl = `${FLUTTERWAVE_API_BASE}/balances`;
        const balanceResponse = await fetch(balanceUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        // Fetch transactions
        const page = url.searchParams.get('page') || '1';
        const perPage = url.searchParams.get('per_page') || '50';
        const transactionsUrl = `${FLUTTERWAVE_API_BASE}/transactions?page=${page}&per_page=${perPage}`;
        const transactionsResponse = await fetch(transactionsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        const balanceData = balanceResponse.ok 
          ? await balanceResponse.json() 
          : { data: null, error: 'Failed to fetch balance' };
        
        const transactionsData = transactionsResponse.ok
          ? await transactionsResponse.json()
          : { data: null, error: 'Failed to fetch transactions' };

        return new Response(
          JSON.stringify({
            success: true,
            balance: balanceData.data,
            transactions: transactionsData.data,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('❌ Error fetching Flutterwave data:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch Flutterwave data',
            details: error.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error in Flutterwave management function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
