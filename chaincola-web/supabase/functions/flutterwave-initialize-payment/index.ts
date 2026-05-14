// Flutterwave Payment Initialization Edge Function
// Initializes a Flutterwave payment for wallet funding

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flutterwave API base URL
const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface InitializePaymentRequest {
  amount: number;
  currency?: string;
  redirect_url?: string;
  purpose?: string;
  metadata?: {
    deposit_amount?: number;
    fee_amount?: number;
    fee_percentage?: number;
    credit_amount?: number; // Amount to credit after fee deduction
  };
}

interface FlutterwavePaymentResponse {
  status: string;
  message: string;
  data: {
    link: string;
    tx_ref: string;
    amount: number;
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

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing authorization header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid or expired token',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Flutterwave API credentials
    const flutterwavePublicKey = Deno.env.get('FLUTTERWAVE_PUBLIC_KEY');
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

    if (!flutterwavePublicKey || !flutterwaveSecretKey) {
      console.error('❌ Flutterwave API credentials not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Flutterwave API credentials not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: InitializePaymentRequest = await req.json();
    const { amount, currency = 'NGN', redirect_url, purpose = 'wallet-funding', metadata } = body;
    
    // NEW FEE MODEL: Fee is deducted from deposit amount
    // amount = deposit amount (what user pays)
    // fee = 3% of deposit amount
    // credit_amount = deposit - fee (what user receives)
    const FEE_PERCENTAGE = 0.03; // 3% fee
    
    // If metadata provides deposit_amount, use it; otherwise amount is the deposit
    const depositAmount = metadata?.deposit_amount || amount;
    const feeAmount = metadata?.fee_amount || (depositAmount * FEE_PERCENTAGE);
    const creditAmount = metadata?.credit_amount || (depositAmount - feeAmount);
    const feePercentage = metadata?.fee_percentage || (FEE_PERCENTAGE * 100);
    
    // Amount to charge user = deposit amount (fee is deducted from this)
    const chargeAmount = depositAmount;

    // Validate amount
    if (!chargeAmount || chargeAmount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid amount. Must be greater than 0',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Ensure credit amount is positive
    if (creditAmount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid amount. Fee cannot exceed deposit amount.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate unique transaction reference
    const txRef = `CHAINCOLA-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Get user email and name for payment
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .eq('user_id', user.id)
      .single();

    const customerEmail = profile?.email || user.email || '';
    const customerName = profile?.full_name || user.email || 'Customer';

    // Create transaction record
    // Create transaction record in database
    // For DEPOSIT transactions, we use 'FIAT' as crypto_currency since it's a fiat-only transaction
    // Store deposit_amount (amount to credit) and fee_amount separately
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'DEPOSIT',
        crypto_currency: 'FIAT', // Placeholder for fiat-only transactions
        network: 'mainnet', // Required field
        fiat_amount: chargeAmount, // Amount charged to user (deposit amount)
        fiat_currency: currency,
        status: 'PENDING',
        external_reference: txRef,
        metadata: {
          purpose: purpose,
          source: 'flutterwave',
          deposit_amount: depositAmount, // Amount user deposited (charged amount)
          fee_amount: feeAmount, // Fee deducted from deposit (3%)
          fee_percentage: feePercentage, // Fee percentage (3%)
          credit_amount: creditAmount, // Amount to credit to wallet (deposit - fee)
          total_payment: chargeAmount, // Total amount charged to user
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating transaction record:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create transaction record',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`💾 Created transaction record: ${transaction.id}`);

    // Prepare Flutterwave payment request — redirect back to app after checkout.
    // Append our tx_ref when missing so the in-app WebView always has a ref to verify.
    const base =
      (typeof redirect_url === "string" && redirect_url.trim().length > 0)
        ? redirect_url.trim()
        : `chaincola://home?payment=successful`;
    const hasTxRef = /(^|[?&])tx_ref=/.test(base);
    const join = base.includes("?") ? "&" : "?";
    const callbackUrl = hasTxRef ? base : `${base}${join}tx_ref=${encodeURIComponent(txRef)}`;
    
    const flutterwavePayload = {
      tx_ref: txRef,
      amount: chargeAmount, // Charge deposit amount (fee deducted from this)
      currency: currency,
      redirect_url: callbackUrl,
      payment_options: 'card,account,ussd,banktransfer,mobilemoney',
      customer: {
        email: customerEmail,
        name: customerName,
      },
      customizations: {
        title: 'ChainCola Wallet Funding',
        description: `Fund your wallet with ${currency} ${chargeAmount} (Fee: ${currency} ${feeAmount.toFixed(2)}, Credit: ${currency} ${creditAmount.toFixed(2)})`,
        logo: 'https://chaincola.com/logo.png', // Update with your logo URL
      },
      meta: {
        transaction_id: transaction.id,
        user_id: user.id,
        purpose: purpose,
      },
    };

    console.log(`📋 Payment callback URL: ${callbackUrl}`);

    // Call Flutterwave API to initialize payment
    console.log(`📤 Initializing Flutterwave payment: ${txRef}, Charge: ${chargeAmount} ${currency}, Fee: ${feeAmount.toFixed(2)} ${currency}, Credit: ${creditAmount.toFixed(2)} ${currency}`);
    
    const flutterwaveResponse = await fetch(`${FLUTTERWAVE_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flutterwavePayload),
    });

    if (!flutterwaveResponse.ok) {
      const errorText = await flutterwaveResponse.text();
      console.error('❌ Flutterwave API error:', flutterwaveResponse.status, errorText);
      
      // Update transaction status to FAILED
      await supabase
        .from('transactions')
        .update({
          status: 'FAILED',
          error_message: `Flutterwave API error: ${flutterwaveResponse.status}`,
        })
        .eq('id', transaction.id);

      let errorMessage = `Flutterwave API error: ${flutterwaveResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        {
          status: flutterwaveResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const flutterwaveResult: FlutterwavePaymentResponse = await flutterwaveResponse.json();

    if (flutterwaveResult.status !== 'success') {
      // Update transaction status to FAILED
      await supabase
        .from('transactions')
        .update({
          status: 'FAILED',
          error_message: flutterwaveResult.message || 'Payment initialization failed',
        })
        .eq('id', transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: flutterwaveResult.message || 'Payment initialization failed',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update transaction with Flutterwave reference
    await supabase
      .from('transactions')
      .update({
        external_order_id: flutterwaveResult.data.tx_ref,
      })
      .eq('id', transaction.id);

    console.log('✅ Flutterwave payment initialized:', flutterwaveResult.data.tx_ref);

    return new Response(
      JSON.stringify({
        success: true,
        checkout_link: flutterwaveResult.data.link,
        tx_ref: flutterwaveResult.data.tx_ref,
        amount: flutterwaveResult.data.amount,
        currency: flutterwaveResult.data.currency,
        transaction_id: transaction.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception in initialize payment function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to initialize payment',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

