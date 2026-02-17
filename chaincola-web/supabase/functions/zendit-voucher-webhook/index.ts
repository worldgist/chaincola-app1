// Zendit Voucher Purchase Webhook Handler
// Processes voucher purchase callbacks from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ZenditVoucherWebhookPayload {
  brand: string;
  confirmation?: {
    confirmationNumber?: string;
    externalReferenceId?: string;
    transactionTime?: string;
  };
  cost: number;
  costCurrency: string;
  costCurrencyDivisor: number;
  country: string;
  createdAt: string;
  error?: {
    code?: string;
    description?: string;
    message?: string;
  };
  fields?: any[];
  log?: any[];
  notes?: string;
  offerId: string;
  price: number;
  priceCurrency: string;
  priceCurrencyDivisor: number;
  priceType: 'FIXED' | 'RANGE';
  productType: 'TOPUP' | 'VOUCHER' | 'ESIM' | 'RECHARGE_SANDBOX' | 'RECHARGE_WITH_CREDIT_CARD';
  receipt?: {
    deliveryType?: string;
    confirmationNumber?: string;
    currency?: string;
    epin?: string;
    voucherId?: string;
    redemptionUrl?: string;
    accountId?: string;
    expiresAt?: string;
    instructions?: string;
    notes?: string;
    recipientCustomerServiceNumber?: string;
    send?: number;
    senderCustomerServiceNumber?: string;
    terms?: string;
  };
  regions?: string[];
  send: number;
  sendCurrency: string;
  sendCurrencyDivisor: number;
  shortNotes?: string;
  status: 'DONE' | 'FAILED' | 'PENDING' | 'ACCEPTED' | 'AUTHORIZED' | 'IN_PROGRESS';
  subTypes?: string[];
  transactionId: string; // This is the transaction ID we provided to Zendit
  updatedAt: string;
  value?: {
    type?: string;
    value?: number;
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

    // Parse webhook payload
    const payload: ZenditVoucherWebhookPayload = await req.json();
    
    console.log(`📨 Zendit voucher webhook received:`, {
      transactionId: payload.transactionId,
      status: payload.status,
      brand: payload.brand,
      offerId: payload.offerId,
    });

    // Validate required fields
    if (!payload.transactionId) {
      console.error('❌ Missing transactionId in webhook payload');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing transactionId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Find transaction in database using transactionId (stored in external_reference or metadata)
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .or(`external_reference.eq.${payload.transactionId},metadata->>zendit_transaction_id.eq.${payload.transactionId}`)
      .maybeSingle();

    if (txError) {
      console.error('❌ Error finding transaction:', txError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Database error',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!transaction) {
      console.warn(`⚠️ Transaction not found for transactionId: ${payload.transactionId}`);
      // Return 200 to prevent Zendit from retrying
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Transaction not found (may have been processed already)',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Determine transaction status based on Zendit status
    let newStatus = transaction.status;
    let giftCardCode: string | null = null;
    let giftCardId: string | null = null;

    if (payload.status === 'DONE') {
      newStatus = 'COMPLETED';
      
      // Extract gift card code from receipt
      if (payload.receipt) {
        giftCardCode = payload.receipt.epin || payload.receipt.voucherId || payload.receipt.confirmationNumber || null;
        
        // Find or create gift card record
        if (giftCardCode) {
          // Check if gift card already exists
          const { data: existingGiftCard } = await supabase
            .from('gift_cards')
            .select('id')
            .eq('code', giftCardCode.toUpperCase())
            .maybeSingle();

          if (existingGiftCard) {
            giftCardId = existingGiftCard.id;
            
            // Update gift card with receipt information
            await supabase
              .from('gift_cards')
              .update({
                status: 'active',
                updated_at: new Date().toISOString(),
                metadata: {
                  ...(existingGiftCard.metadata || {}),
                  zendit_receipt: payload.receipt,
                  zendit_transaction_id: payload.transactionId,
                  redemption_url: payload.receipt.redemptionUrl,
                  expires_at: payload.receipt.expiresAt,
                  instructions: payload.receipt.instructions,
                },
              })
              .eq('id', giftCardId);
          } else {
            // Create new gift card record
            const sendAmount = payload.send / (payload.sendCurrencyDivisor || 100);
            const { data: newGiftCard, error: gcError } = await supabase
              .from('gift_cards')
              .insert({
                user_id: transaction.user_id,
                code: giftCardCode.toUpperCase(),
                amount: sendAmount,
                currency: payload.sendCurrency || 'USD',
                card_category: transaction.metadata?.card_category || 'retail',
                card_subcategory: transaction.metadata?.card_subcategory || payload.brand,
                card_type: 'ecode',
                status: 'active',
                expires_at: payload.receipt.expiresAt || null,
                metadata: {
                  zendit_brand: payload.brand,
                  zendit_offer_id: payload.offerId,
                  zendit_transaction_id: payload.transactionId,
                  zendit_receipt: payload.receipt,
                  redemption_url: payload.receipt.redemptionUrl,
                  instructions: payload.receipt.instructions,
                  country: payload.country,
                  product_type: payload.productType,
                },
              })
              .select('id')
              .single();

            if (!gcError && newGiftCard) {
              giftCardId = newGiftCard.id;
            }
          }
        }
      }
    } else if (payload.status === 'FAILED') {
      newStatus = 'FAILED';
      
      // If there's an error, log it
      if (payload.error) {
        console.error('❌ Zendit transaction failed:', payload.error);
      }
    } else if (['PENDING', 'ACCEPTED', 'AUTHORIZED', 'IN_PROGRESS'].includes(payload.status)) {
      newStatus = 'PENDING';
    }

    // Update transaction status
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(transaction.metadata || {}),
        zendit_webhook_received_at: new Date().toISOString(),
        zendit_status: payload.status,
        zendit_brand: payload.brand,
        zendit_offer_id: payload.offerId,
        zendit_receipt: payload.receipt,
        zendit_error: payload.error,
      },
    };

    if (newStatus === 'COMPLETED') {
      updateData.completed_at = new Date().toISOString();
      if (giftCardId) {
        updateData.metadata.gift_card_id = giftCardId;
      }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transaction.id);

    if (updateError) {
      console.error('❌ Error updating transaction:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to update transaction',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If transaction failed, refund user's wallet
    if (payload.status === 'FAILED' && transaction.type === 'gift_card_purchase') {
      const refundAmount = transaction.fiat_amount || transaction.amount;
      
      // Credit user's wallet
      const { error: refundError } = await supabase.rpc('credit_ngn_balance', {
        p_user_id: transaction.user_id,
        p_amount: refundAmount,
        p_reason: 'gift_card_purchase_failed_refund',
        p_metadata: {
          original_transaction_id: transaction.id,
          zendit_transaction_id: payload.transactionId,
          zendit_error: payload.error,
        },
      });

      if (refundError) {
        console.error('❌ Error refunding user wallet:', refundError);
        // Don't fail the webhook - log error but return success
      } else {
        console.log(`✅ Refunded ${refundAmount} NGN to user ${transaction.user_id}`);
      }
    }

    console.log(`✅ Processed Zendit voucher webhook: Transaction ${transaction.id} -> ${newStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        transactionId: transaction.id,
        status: newStatus,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception processing Zendit voucher webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to process webhook',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
