import { supabase } from './supabase';

export interface GiftCard {
  id: string;
  user_id: string;
  code: string;
  amount: number;
  currency: 'NGN' | 'USD';
  card_category: string;
  card_subcategory: string;
  card_type: 'ecode' | 'physical';
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  recipient_email?: string;
  recipient_name?: string;
  message?: string;
  expires_at?: string;
  redeemed_at?: string;
  redeemed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface GiftCardPurchase {
  amount: number;
  currency: 'NGN' | 'USD';
  card_category?: string;
  card_subcategory?: string;
  card_type?: 'ecode' | 'physical';
  recipient_email?: string;
  recipient_name?: string;
  message?: string;
  expires_in_days?: number;
  // Zendit-specific fields
  offerId?: string; // Zendit offer ID
  brand?: string; // Brand identifier
  country?: string; // Country ISO code
  fields?: Array<{ name: string; value: string }>; // Required fields for Zendit purchase
}

export interface GiftCardPurchaseResponse {
  success: boolean;
  giftCard?: GiftCard;
  error?: string;
}

export interface GiftCardRedeemResponse {
  success: boolean;
  amount?: number;
  currency?: string;
  error?: string;
}

/**
 * Purchase a gift card via Zendit API and save transaction
 */
export async function purchaseGiftCard(
  userId: string,
  purchase: GiftCardPurchase
): Promise<GiftCardPurchaseResponse> {
  try {
    console.log('💰 Purchasing gift card:', purchase);

    // If using Zendit API (has offerId)
    if (purchase.offerId) {
      const { createZenditVoucherPurchase } = await import('./zendit-api-service');
      
      // Generate unique transaction ID
      const transactionId = `GC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      // Prepare fields for Zendit purchase
      const fields: Array<{ name: string; value: string }> = purchase.fields || [];
      
      // Add recipient info if provided
      if (purchase.recipient_email) {
        fields.push({ name: 'email', value: purchase.recipient_email });
      }
      if (purchase.recipient_name) {
        fields.push({ name: 'recipientName', value: purchase.recipient_name });
      }
      
      // Check balance before purchase
      const { data: walletData, error: walletError } = await supabase
        .from('user_wallets')
        .select('ngn_balance')
        .eq('user_id', userId)
        .single();

      if (walletError || !walletData) {
        return {
          success: false,
          error: 'Unable to check wallet balance',
        };
      }

      const currentBalance = parseFloat(walletData.ngn_balance?.toString() || '0');
      if (currentBalance < purchase.amount) {
        return {
          success: false,
          error: 'Insufficient balance',
        };
      }

      // Create purchase via Zendit API
      // For RANGE offers, we need to include the value parameter
      const purchaseParams: any = {
        offerId: purchase.offerId,
        transactionId,
        fields,
      };

      // If this is a RANGE offer, include the value
      // Note: We'll need to pass priceType from the offer, but for now we'll try without value first
      // The API will tell us if value is required for RANGE offers
      
      const zenditResult = await createZenditVoucherPurchase(purchaseParams);

      if (!zenditResult.success) {
        return {
          success: false,
          error: zenditResult.error || 'Failed to create gift card purchase via Zendit',
        };
      }

      // Debit wallet balance
      // Get current balance
      const { data: currentWallet, error: walletCheckError } = await supabase
        .from('user_wallets')
        .select('ngn_balance')
        .eq('user_id', userId)
        .single();

      if (walletCheckError || !currentWallet) {
        return {
          success: false,
          error: 'Unable to check wallet balance',
        };
      }

      const newBalance = parseFloat(currentWallet.ngn_balance?.toString() || '0') - purchase.amount;

      // Update wallet balance
      const { error: debitError } = await supabase
        .from('user_wallets')
        .update({
          ngn_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (debitError) {
        console.error('❌ Error debiting wallet:', debitError);
        return {
          success: false,
          error: debitError.message || 'Failed to debit wallet balance',
        };
      }

      // Also update wallet_balances table
      await supabase
        .from('wallet_balances')
        .upsert({
          user_id: userId,
          currency: 'NGN',
          balance: newBalance,
          updated_at: new Date().toISOString(),
        });

      // Save transaction to database
      const { data: transactionData, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'GIFT_CARD_PURCHASE',
          amount: purchase.amount,
          currency: purchase.currency || 'NGN',
          status: zenditResult.status === 'DONE' ? 'COMPLETED' : 'PENDING',
          description: `Gift card purchase: ${purchase.card_subcategory || purchase.brand || 'Unknown'}`,
          external_reference: transactionId,
          external_transaction_id: zenditResult.transactionId,
          metadata: {
            card_category: purchase.card_category,
            card_subcategory: purchase.card_subcategory,
            card_type: purchase.card_type || 'ecode',
            brand: purchase.brand,
            country: purchase.country,
            offerId: purchase.offerId,
            zendit_status: zenditResult.status,
            zendit_transaction_id: zenditResult.transactionId,
            recipient_email: purchase.recipient_email,
            recipient_name: purchase.recipient_name,
          },
        })
        .select()
        .single();

      if (txError) {
        console.error('❌ Error saving transaction:', txError);
        // Transaction was created in Zendit but failed to save locally
        // Still return success but log the error
      }

      // Create gift card record
      // Note: Zendit will provide the actual gift card code via webhook
      // For now, we'll create a placeholder record that will be updated when webhook arrives
      const giftCardCode = `GC-${transactionId.substring(transactionId.length - 8)}`;
      
      const { data: giftCardData, error: gcError } = await supabase
        .from('gift_cards')
        .insert({
          user_id: userId,
          code: giftCardCode,
          amount: purchase.amount,
          currency: purchase.currency || 'NGN',
          card_category: purchase.card_category || 'retail',
          card_subcategory: purchase.card_subcategory || purchase.brand || 'unknown',
          card_type: purchase.card_type || 'ecode',
          status: 'active',
          recipient_email: purchase.recipient_email,
          recipient_name: purchase.recipient_name,
          message: purchase.message,
          expires_at: purchase.expires_in_days
            ? new Date(Date.now() + purchase.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
          transaction_id: transactionData?.id,
        })
        .select()
        .single();

      if (gcError) {
        console.error('❌ Error creating gift card record:', gcError);
      }

      return {
        success: true,
        giftCard: giftCardData ? {
          id: giftCardData.id,
          user_id: giftCardData.user_id,
          code: giftCardData.code,
          amount: parseFloat(giftCardData.amount.toString()),
          currency: giftCardData.currency as 'NGN' | 'USD',
          card_category: giftCardData.card_category,
          card_subcategory: giftCardData.card_subcategory,
          card_type: giftCardData.card_type as 'ecode' | 'physical',
          status: giftCardData.status as 'active' | 'redeemed' | 'expired' | 'cancelled',
          recipient_email: giftCardData.recipient_email || undefined,
          recipient_name: giftCardData.recipient_name || undefined,
          message: giftCardData.message || undefined,
          expires_at: giftCardData.expires_at || undefined,
          redeemed_at: giftCardData.redeemed_at || undefined,
          redeemed_by: giftCardData.redeemed_by || undefined,
          created_at: giftCardData.created_at,
          updated_at: giftCardData.updated_at,
        } : {
          id: '',
          user_id: userId,
          code: giftCardCode,
          amount: purchase.amount,
          currency: purchase.currency || 'NGN',
          card_category: purchase.card_category || 'retail',
          card_subcategory: purchase.card_subcategory || purchase.brand || 'unknown',
          card_type: purchase.card_type || 'ecode',
          status: 'active',
          recipient_email: purchase.recipient_email,
          recipient_name: purchase.recipient_name,
          message: purchase.message,
          expires_at: purchase.expires_in_days
            ? new Date(Date.now() + purchase.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    }

    // Fallback to old database function if no offerId (legacy support)
    // Validate required fields
    if (!purchase.card_category || !purchase.card_subcategory) {
      return {
        success: false,
        error: 'Card category and subcategory are required',
      };
    }

    // Call Supabase function to purchase gift card (this already creates transaction)
    const { data, error } = await supabase.rpc('purchase_gift_card', {
      p_user_id: userId,
      p_amount: purchase.amount,
      p_currency: purchase.currency || 'NGN',
      p_card_category: purchase.card_category,
      p_card_subcategory: purchase.card_subcategory,
      p_card_type: purchase.card_type || 'ecode',
      p_recipient_email: purchase.recipient_email || null,
      p_recipient_name: purchase.recipient_name || null,
      p_message: purchase.message || null,
      p_expires_in_days: purchase.expires_in_days || 365,
    });

    if (error) {
      console.error('❌ Error purchasing gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to purchase gift card',
      };
    }

    if (!data || data.length === 0 || !data[0].success) {
      return {
        success: false,
        error: data?.[0]?.error_message || 'Failed to purchase gift card',
      };
    }

    const result = data[0];

    // Fetch the created gift card
    const { data: giftCardData, error: fetchError } = await supabase
      .from('gift_cards')
      .select('*')
      .eq('id', result.gift_card_id)
      .single();

    if (fetchError || !giftCardData) {
      console.error('❌ Error fetching created gift card:', fetchError);
      // Still return success with code
      return {
        success: true,
        giftCard: {
          id: result.gift_card_id,
          user_id: userId,
          code: result.code,
          amount: purchase.amount,
          currency: purchase.currency || 'NGN',
          card_category: purchase.card_category,
          card_subcategory: purchase.card_subcategory,
          card_type: purchase.card_type || 'ecode',
          status: 'active',
          recipient_email: purchase.recipient_email,
          recipient_name: purchase.recipient_name,
          message: purchase.message,
          expires_at: purchase.expires_in_days
            ? new Date(Date.now() + purchase.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      giftCard: {
        id: giftCardData.id,
        user_id: giftCardData.user_id,
        code: giftCardData.code,
        amount: parseFloat(giftCardData.amount.toString()),
        currency: giftCardData.currency as 'NGN' | 'USD',
        card_category: giftCardData.card_category,
        card_subcategory: giftCardData.card_subcategory,
        card_type: giftCardData.card_type as 'ecode' | 'physical',
        status: giftCardData.status as 'active' | 'redeemed' | 'expired' | 'cancelled',
        recipient_email: giftCardData.recipient_email || undefined,
        recipient_name: giftCardData.recipient_name || undefined,
        message: giftCardData.message || undefined,
        expires_at: giftCardData.expires_at || undefined,
        redeemed_at: giftCardData.redeemed_at || undefined,
        redeemed_by: giftCardData.redeemed_by || undefined,
        created_at: giftCardData.created_at,
        updated_at: giftCardData.updated_at,
      },
    };
  } catch (error: any) {
    console.error('❌ Exception purchasing gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase gift card',
    };
  }
}

/**
 * Get user's purchased gift cards
 */
export async function getUserGiftCards(userId: string): Promise<{ giftCards: GiftCard[]; error: any }> {
  try {
    // TODO: Replace with your API to fetch user gift cards
    // For now, return empty array to allow UI testing
    return { giftCards: [], error: null };
  } catch (error: any) {
    console.error('Exception fetching user gift cards:', error);
    return { giftCards: [], error };
  }
}

/**
 * Get a gift card by code
 */
export async function getGiftCardByCode(code: string): Promise<{ giftCard: GiftCard | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('gift_cards')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching gift card by code:', error);
      return { giftCard: null, error };
    }

    if (!data) {
      return { giftCard: null, error: null };
    }

    const giftCard: GiftCard = {
      id: data.id,
      user_id: data.user_id,
      code: data.code,
      amount: parseFloat(data.amount.toString()),
      currency: data.currency as 'NGN' | 'USD',
      card_category: data.card_category,
      card_subcategory: data.card_subcategory,
      card_type: data.card_type as 'ecode' | 'physical',
      status: data.status as 'active' | 'redeemed' | 'expired' | 'cancelled',
      recipient_email: data.recipient_email || undefined,
      recipient_name: data.recipient_name || undefined,
      message: data.message || undefined,
      expires_at: data.expires_at || undefined,
      redeemed_at: data.redeemed_at || undefined,
      redeemed_by: data.redeemed_by || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return { giftCard, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching gift card by code:', error);
    return { giftCard: null, error };
  }
}

/**
 * Redeem a gift card
 */
export async function redeemGiftCard(
  userId: string,
  code: string
): Promise<GiftCardRedeemResponse> {
  try {
    // TODO: Replace with your API to redeem gift card
    // For now, return mock success to allow UI testing
    return {
      success: true,
      amount: 0,
      currency: 'NGN',
    };
  } catch (error: any) {
    console.error('Exception redeeming gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to redeem gift card',
    };
  }
}

/**
 * Validate a gift card code
 */
export async function validateGiftCardCode(code: string): Promise<{ isValid: boolean; error?: string }> {
  try {
    if (!code || code.trim().length === 0) {
      return {
        isValid: false,
        error: 'Gift card code cannot be empty',
      };
    }

    const { data, error } = await supabase.rpc('validate_gift_card_code', {
      p_code: code.trim(),
    });

    if (error) {
      console.error('❌ Error validating gift card code:', error);
      return {
        isValid: false,
        error: error.message || 'An error occurred while validating the gift card code',
      };
    }

    if (!data || data.length === 0) {
      return {
        isValid: false,
        error: 'Gift card code not found',
      };
    }

    const result = data[0];
    return {
      isValid: result.is_valid,
      error: result.error_message || undefined,
    };
  } catch (error: any) {
    console.error('❌ Exception validating gift card code:', error);
    return {
      isValid: false,
      error: 'An error occurred while validating the gift card code',
    };
  }
}

/**
 * Cancel a gift card (if not redeemed)
 */
export async function cancelGiftCard(
  giftCardId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('gift_cards')
      .update({ status: 'cancelled' })
      .eq('id', giftCardId)
      .eq('status', 'active'); // Only cancel active cards

    if (error) {
      console.error('❌ Error cancelling gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel gift card',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception cancelling gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel gift card',
    };
  }
}

/**
 * Get gift card statistics for a user
 */
export async function getGiftCardStats(userId: string): Promise<{
  totalPurchased: number;
  totalRedeemed: number;
  totalActive: number;
  totalAmount: number;
  error: any;
}> {
  try {
    const { data, error } = await supabase.rpc('get_user_gift_cards', {
      p_user_id: userId,
      p_status: null, // Get all
    });

    if (error) {
      console.error('❌ Error fetching gift card stats:', error);
      return {
        totalPurchased: 0,
        totalRedeemed: 0,
        totalActive: 0,
        totalAmount: 0,
        error,
      };
    }

    const giftCards = data || [];
    const totalPurchased = giftCards.length;
    const totalRedeemed = giftCards.filter((gc: any) => gc.status === 'redeemed').length;
    const totalActive = giftCards.filter((gc: any) => gc.status === 'active').length;
    const totalAmount = giftCards.reduce((sum: number, gc: any) => {
      return sum + parseFloat(gc.amount.toString());
    }, 0);

    return {
      totalPurchased,
      totalRedeemed,
      totalActive,
      totalAmount,
      error: null,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching gift card stats:', error);
    return {
      totalPurchased: 0,
      totalRedeemed: 0,
      totalActive: 0,
      totalAmount: 0,
      error,
    };
  }
}

/**
 * Get all gift cards (admin only)
 */
export async function getAllGiftCards(
  status?: string,
  limit: number = 100,
  offset: number = 0,
  searchQuery?: string
): Promise<{ giftCards: GiftCard[]; total: number; error: any }> {
  try {
    let query = supabase
      .from('gift_cards')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      query = query.or(
        `code.ilike.%${searchQuery}%,card_subcategory.ilike.%${searchQuery}%,card_category.ilike.%${searchQuery}%`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching all gift cards:', error);
      return { giftCards: [], total: 0, error };
    }

    const giftCards: GiftCard[] = (data || []).map((card: any) => ({
      id: card.id,
      user_id: card.user_id,
      code: card.code,
      amount: parseFloat(card.amount.toString()),
      currency: card.currency as 'NGN' | 'USD',
      card_category: card.card_category,
      card_subcategory: card.card_subcategory,
      card_type: card.card_type as 'ecode' | 'physical',
      status: card.status as 'active' | 'redeemed' | 'expired' | 'cancelled',
      recipient_email: card.recipient_email || undefined,
      recipient_name: card.recipient_name || undefined,
      message: card.message || undefined,
      expires_at: card.expires_at || undefined,
      redeemed_at: card.redeemed_at || undefined,
      redeemed_by: card.redeemed_by || undefined,
      transaction_id: card.transaction_id || undefined,
      created_at: card.created_at,
      updated_at: card.updated_at,
    }));

    return { giftCards, total: count || 0, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching all gift cards:', error);
    return { giftCards: [], total: 0, error };
  }
}



















