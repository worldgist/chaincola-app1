// Sell Gift Card Service
// Handles selling gift cards to the platform
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

export interface GiftCardSale {
  id: string;
  user_id: string;
  card_category: string;
  card_subcategory: string;
  amount: number;
  currency: 'NGN' | 'USD';
  card_type: 'ecode' | 'physical';
  image_urls: string[];
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  admin_notes?: string;
  rejection_reason?: string;
  reviewed_at?: string;
  payment_transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGiftCardSaleRequest {
  card_category: string;
  card_subcategory: string;
  amount: number;
  currency?: 'NGN' | 'USD';
  card_type: 'ecode' | 'physical';
  image_uris: string[]; // Local file URIs
}

export interface CreateGiftCardSaleResponse {
  success: boolean;
  saleId?: string;
  error?: string;
}

/**
 * Convert base64 string to Uint8Array (React Native compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  let base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  let binaryString: string;
  
  if (typeof atob !== 'undefined') {
    binaryString = atob(base64Data);
  } else {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let result = '';
    let i = 0;
    base64Data = base64Data.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < base64Data.length) {
      const enc1 = chars.indexOf(base64Data.charAt(i++));
      const enc2 = chars.indexOf(base64Data.charAt(i++));
      const enc3 = chars.indexOf(base64Data.charAt(i++));
      const enc4 = chars.indexOf(base64Data.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      result += String.fromCharCode(chr1);
      if (enc3 !== 64) result += String.fromCharCode(chr2);
      if (enc4 !== 64) result += String.fromCharCode(chr3);
    }
    binaryString = result;
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Upload an image file to Supabase Storage
 */
async function uploadImageToStorage(
  userId: string,
  imageUri: string,
  fileName: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const filePath = `gift-card-sales/${userId}/${Date.now()}_${fileName}`;

    let fileData: Uint8Array;

    if (imageUri.startsWith('file://') || imageUri.startsWith('content://') || imageUri.startsWith('ph://')) {
      // React Native: Read as base64 and convert
      // Use string literal 'base64' directly (EncodingType enum may not be available)
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64' as any,
      });
      fileData = base64ToUint8Array(base64);
    } else if (imageUri.startsWith('data:')) {
      // Base64 data URL
      fileData = base64ToUint8Array(imageUri);
    } else {
      return { success: false, error: 'Invalid image URI format' };
    }

    const { data, error } = await supabase.storage
      .from('gift-card-images')
      .upload(filePath, fileData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image:', error);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('gift-card-images')
      .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl };
  } catch (error: any) {
    console.error('Error uploading image to storage:', error);
    return { success: false, error: error.message || 'Failed to upload image' };
  }
}

/**
 * Create a gift card sale request
 */
export async function createGiftCardSale(
  userId: string,
  request: CreateGiftCardSaleRequest
): Promise<CreateGiftCardSaleResponse> {
  try {
    console.log('📤 Creating gift card sale request for user:', userId);

    // Upload images
    const imageUrls: string[] = [];
    for (let i = 0; i < request.image_uris.length; i++) {
      const imageUri = request.image_uris[i];
      const fileName = `gift_card_${i + 1}.jpg`;
      
      console.log(`📤 Uploading image ${i + 1}/${request.image_uris.length}...`);
      const uploadResult = await uploadImageToStorage(userId, imageUri, fileName);
      
      if (!uploadResult.success) {
        return {
          success: false,
          error: `Failed to upload image ${i + 1}: ${uploadResult.error}`,
        };
      }
      
      if (uploadResult.url) {
        imageUrls.push(uploadResult.url);
      }
    }

    console.log(`✅ Uploaded ${imageUrls.length} images`);

    // Create gift card sale record
    const { data: saleId, error: createError } = await supabase.rpc('create_gift_card_sale', {
      p_user_id: userId,
      p_card_category: request.card_category,
      p_card_subcategory: request.card_subcategory,
      p_amount: request.amount,
      p_card_type: request.card_type,
      p_currency: request.currency || 'NGN',
      p_image_urls: imageUrls,
    });

    if (createError) {
      console.error('❌ Error creating gift card sale:', createError);
      return {
        success: false,
        error: createError.message || 'Failed to create gift card sale request',
      };
    }

    console.log('✅ Gift card sale request created successfully:', saleId);
    return { success: true, saleId: saleId || undefined };
  } catch (error: any) {
    console.error('❌ Exception creating gift card sale:', error);
    return {
      success: false,
      error: error.message || 'Failed to create gift card sale request',
    };
  }
}

/**
 * Get user's gift card sales
 */
export async function getUserGiftCardSales(
  userId: string,
  status?: GiftCardSale['status']
): Promise<{ sales: GiftCardSale[]; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_user_gift_card_sales', {
      p_user_id: userId,
      p_status: status || null,
    });

    if (error) {
      console.error('Error fetching gift card sales:', error);
      return { sales: [], error };
    }

    const sales = (data || []).map((sale: any) => ({
      id: sale.id,
      user_id: sale.user_id,
      card_category: sale.card_category,
      card_subcategory: sale.card_subcategory,
      amount: Number(sale.amount) || 0,
      currency: sale.currency as 'NGN' | 'USD',
      card_type: sale.card_type as 'ecode' | 'physical',
      image_urls: (sale.image_urls || []) as string[],
      status: sale.status as GiftCardSale['status'],
      admin_notes: sale.admin_notes || undefined,
      rejection_reason: sale.rejection_reason || undefined,
      reviewed_at: sale.reviewed_at || undefined,
      payment_transaction_id: sale.payment_transaction_id || undefined,
      created_at: sale.created_at,
      updated_at: sale.updated_at,
    }));

    return { sales, error: null };
  } catch (error: any) {
    console.error('Exception fetching gift card sales:', error);
    return { sales: [], error };
  }
}

/**
 * Cancel a gift card sale (only if pending)
 */
export async function cancelGiftCardSale(
  saleId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('gift_card_sales')
      .update({ status: 'cancelled' })
      .eq('id', saleId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error cancelling gift card sale:', error);
      return { success: false, error: error.message || 'Failed to cancel gift card sale' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception cancelling gift card sale:', error);
    return { success: false, error: error.message || 'Failed to cancel gift card sale' };
  }
}

