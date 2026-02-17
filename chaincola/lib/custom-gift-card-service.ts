import { supabase } from './supabase';

export interface CustomGiftCard {
  id: string;
  created_by: string;
  code: string;
  amount: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD';
  balance: number;
  title?: string;
  description?: string;
  design_color?: string;
  design_image_url?: string;
  card_type: 'digital' | 'physical' | 'virtual';
  recipient_email?: string;
  recipient_name?: string;
  recipient_phone?: string;
  personal_message?: string;
  status: 'active' | 'used' | 'expired' | 'cancelled' | 'pending';
  is_reloadable: boolean;
  is_transferable: boolean;
  expires_at?: string;
  expires_in_days?: number;
  used_at?: string;
  used_by?: string;
  last_used_at?: string;
  usage_count: number;
  transaction_id?: string;
  metadata?: any;
  tags?: string[];
  is_promotional: boolean;
  promotional_code?: string;
  created_for_user_id?: string;
  created_at: string;
  updated_at: string;
  activated_at?: string;
}

export interface CreateCustomGiftCardParams {
  amount: number;
  currency?: 'NGN' | 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD';
  title?: string;
  description?: string;
  design_color?: string;
  design_image_url?: string;
  card_type?: 'digital' | 'physical' | 'virtual';
  recipient_email?: string;
  recipient_name?: string;
  recipient_phone?: string;
  personal_message?: string;
  expires_in_days?: number;
  is_reloadable?: boolean;
  is_transferable?: boolean;
  is_promotional?: boolean;
  promotional_code?: string;
  created_for_user_id?: string;
  tags?: string[];
  metadata?: any;
}

export interface CreateCustomGiftCardResponse {
  success: boolean;
  giftCard?: CustomGiftCard;
  code?: string;
  error?: string;
}

export interface UseCustomGiftCardParams {
  code: string;
  amount?: number; // If not provided, uses full balance
}

export interface UseCustomGiftCardResponse {
  success: boolean;
  remaining_balance?: number;
  amount_used?: number;
  error?: string;
}

export interface ReloadCustomGiftCardParams {
  code: string;
  amount: number;
}

export interface ReloadCustomGiftCardResponse {
  success: boolean;
  new_balance?: number;
  error?: string;
}

/**
 * Create a custom gift card
 */
export async function createCustomGiftCard(
  userId: string,
  params: CreateCustomGiftCardParams
): Promise<CreateCustomGiftCardResponse> {
  try {
    console.log('🎁 Creating custom gift card:', params);

    // Validate required fields
    if (!params.amount || params.amount <= 0) {
      return {
        success: false,
        error: 'Amount must be greater than 0',
      };
    }

    // Call Supabase function to create custom gift card
    const { data, error } = await supabase.rpc('create_custom_gift_card', {
      p_created_by: userId,
      p_amount: params.amount,
      p_currency: params.currency || 'NGN',
      p_title: params.title || null,
      p_description: params.description || null,
      p_design_color: params.design_color || null,
      p_design_image_url: params.design_image_url || null,
      p_card_type: params.card_type || 'digital',
      p_recipient_email: params.recipient_email || null,
      p_recipient_name: params.recipient_name || null,
      p_recipient_phone: params.recipient_phone || null,
      p_personal_message: params.personal_message || null,
      p_expires_in_days: params.expires_in_days || 365,
      p_is_reloadable: params.is_reloadable || false,
      p_is_transferable: params.is_transferable !== false, // Default true
      p_is_promotional: params.is_promotional || false,
      p_promotional_code: params.promotional_code || null,
      p_created_for_user_id: params.created_for_user_id || null,
      p_tags: params.tags || null,
      p_metadata: params.metadata || {},
    });

    if (error) {
      console.error('❌ Error creating custom gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to create custom gift card',
      };
    }

    if (!data || data.length === 0 || !data[0].success) {
      return {
        success: false,
        error: data?.[0]?.error_message || 'Failed to create custom gift card',
      };
    }

    const result = data[0];

    // Fetch the created gift card
    const { data: giftCardData, error: fetchError } = await supabase
      .from('custom_gift_cards')
      .select('*')
      .eq('id', result.gift_card_id)
      .single();

    if (fetchError || !giftCardData) {
      console.error('❌ Error fetching created custom gift card:', fetchError);
      // Still return success with code
      return {
        success: true,
        code: result.code,
      };
    }

    return {
      success: true,
      giftCard: mapCustomGiftCard(giftCardData),
      code: result.code,
    };
  } catch (error: any) {
    console.error('❌ Exception creating custom gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to create custom gift card',
    };
  }
}

/**
 * Use/redeem a custom gift card
 */
export async function useCustomGiftCard(
  userId: string,
  params: UseCustomGiftCardParams
): Promise<UseCustomGiftCardResponse> {
  try {
    console.log('💳 Using custom gift card:', params.code);

    const { data, error } = await supabase.rpc('use_custom_gift_card', {
      p_code: params.code,
      p_user_id: userId,
      p_amount: params.amount || null,
    });

    if (error) {
      console.error('❌ Error using custom gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to use custom gift card',
      };
    }

    if (!data || data.length === 0 || !data[0].success) {
      return {
        success: false,
        error: data?.[0]?.error_message || 'Failed to use custom gift card',
      };
    }

    const result = data[0];

    return {
      success: true,
      remaining_balance: parseFloat(result.remaining_balance?.toString() || '0'),
      amount_used: parseFloat(result.amount_used?.toString() || '0'),
    };
  } catch (error: any) {
    console.error('❌ Exception using custom gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to use custom gift card',
    };
  }
}

/**
 * Reload/add funds to a custom gift card
 */
export async function reloadCustomGiftCard(
  params: ReloadCustomGiftCardParams
): Promise<ReloadCustomGiftCardResponse> {
  try {
    console.log('💰 Reloading custom gift card:', params.code, params.amount);

    const { data, error } = await supabase.rpc('reload_custom_gift_card', {
      p_code: params.code,
      p_amount: params.amount,
    });

    if (error) {
      console.error('❌ Error reloading custom gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to reload custom gift card',
      };
    }

    if (!data || data.length === 0 || !data[0].success) {
      return {
        success: false,
        error: data?.[0]?.error_message || 'Failed to reload custom gift card',
      };
    }

    const result = data[0];

    return {
      success: true,
      new_balance: parseFloat(result.new_balance?.toString() || '0'),
    };
  } catch (error: any) {
    console.error('❌ Exception reloading custom gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to reload custom gift card',
    };
  }
}

/**
 * Cancel a custom gift card
 */
export async function cancelCustomGiftCard(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('❌ Cancelling custom gift card:', code);

    const { data, error } = await supabase.rpc('cancel_custom_gift_card', {
      p_code: code,
      p_user_id: userId,
    });

    if (error) {
      console.error('❌ Error cancelling custom gift card:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel custom gift card',
      };
    }

    if (!data || data.length === 0 || !data[0].success) {
      return {
        success: false,
        error: data?.[0]?.error_message || 'Failed to cancel custom gift card',
      };
    }

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Exception cancelling custom gift card:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel custom gift card',
    };
  }
}

/**
 * Get custom gift cards for a user
 */
export async function getCustomGiftCards(
  userId: string,
  status?: string,
  includeExpired: boolean = false
): Promise<{ giftCards: CustomGiftCard[]; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_custom_gift_cards', {
      p_user_id: userId,
      p_status: status || null,
      p_include_expired: includeExpired,
    });

    if (error) {
      console.error('❌ Error fetching custom gift cards:', error);
      return { giftCards: [], error };
    }

    const giftCards: CustomGiftCard[] = (data || []).map((card: any) =>
      mapCustomGiftCard(card)
    );

    return { giftCards, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching custom gift cards:', error);
    return { giftCards: [], error };
  }
}

/**
 * Get a custom gift card by code
 */
export async function getCustomGiftCardByCode(
  code: string
): Promise<{ giftCard: CustomGiftCard | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('custom_gift_cards')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching custom gift card by code:', error);
      return { giftCard: null, error };
    }

    if (!data) {
      return { giftCard: null, error: null };
    }

    return { giftCard: mapCustomGiftCard(data), error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching custom gift card by code:', error);
    return { giftCard: null, error };
  }
}

/**
 * Get all custom gift cards (admin only)
 */
export async function getAllCustomGiftCards(
  status?: string,
  limit: number = 100,
  offset: number = 0,
  searchQuery?: string
): Promise<{ giftCards: CustomGiftCard[]; total: number; error: any }> {
  try {
    let query = supabase
      .from('custom_gift_cards')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      query = query.or(
        `code.ilike.%${searchQuery}%,title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching all custom gift cards:', error);
      return { giftCards: [], total: 0, error };
    }

    const giftCards: CustomGiftCard[] = (data || []).map((card: any) =>
      mapCustomGiftCard(card)
    );

    return { giftCards, total: count || 0, error: null };
  } catch (error: any) {
    console.error('❌ Exception fetching all custom gift cards:', error);
    return { giftCards: [], total: 0, error };
  }
}

/**
 * Helper function to map database record to CustomGiftCard interface
 */
function mapCustomGiftCard(data: any): CustomGiftCard {
  return {
    id: data.id,
    created_by: data.created_by,
    code: data.code,
    amount: parseFloat(data.amount.toString()),
    currency: data.currency as 'NGN' | 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD',
    balance: parseFloat(data.balance.toString()),
    title: data.title || undefined,
    description: data.description || undefined,
    design_color: data.design_color || undefined,
    design_image_url: data.design_image_url || undefined,
    card_type: data.card_type as 'digital' | 'physical' | 'virtual',
    recipient_email: data.recipient_email || undefined,
    recipient_name: data.recipient_name || undefined,
    recipient_phone: data.recipient_phone || undefined,
    personal_message: data.personal_message || undefined,
    status: data.status as 'active' | 'used' | 'expired' | 'cancelled' | 'pending',
    is_reloadable: data.is_reloadable || false,
    is_transferable: data.is_transferable !== false,
    expires_at: data.expires_at || undefined,
    expires_in_days: data.expires_in_days || undefined,
    used_at: data.used_at || undefined,
    used_by: data.used_by || undefined,
    last_used_at: data.last_used_at || undefined,
    usage_count: data.usage_count || 0,
    transaction_id: data.transaction_id || undefined,
    metadata: data.metadata || undefined,
    tags: data.tags || undefined,
    is_promotional: data.is_promotional || false,
    promotional_code: data.promotional_code || undefined,
    created_for_user_id: data.created_for_user_id || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    activated_at: data.activated_at || undefined,
  };
}
