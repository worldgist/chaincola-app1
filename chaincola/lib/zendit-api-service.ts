import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

// Get Supabase URL for Edge Function
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     SUPABASE_URL;

const ZENDIT_EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/get-zendit-brands`;
const ZENDIT_VOUCHER_OFFERS_URL = `${supabaseUrl}/functions/v1/get-zendit-voucher-offers`;
const ZENDIT_VOUCHER_OFFER_BY_ID_URL = `${supabaseUrl}/functions/v1/get-zendit-voucher-offer-by-id`;
const ZENDIT_VOUCHER_PURCHASES_URL = `${supabaseUrl}/functions/v1/get-zendit-voucher-purchases`;
const ZENDIT_CREATE_VOUCHER_PURCHASE_URL = `${supabaseUrl}/functions/v1/create-zendit-voucher-purchase`;
const ZENDIT_BRAND_DETAILS_URL = `${supabaseUrl}/functions/v1/get-zendit-brand-details`;

export interface ZenditBrand {
  id: string; // Mapped from API's "brand" field
  name: string; // Mapped from API's "brandName" field
  brand?: string; // Original brand field from API (short name)
  brandName?: string; // Original brandName field from API (display name)
  category?: string;
  country?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  logo?: string; // Brand logo URL (preferred: brandLogo > brandGiftImage > brandBigImage)
  brandLogo?: string; // Original brandLogo URL from API
  brandGiftImage?: string; // Brand gift card image URL
  brandBigImage?: string; // Brand big image URL
  brandColor?: string; // Brand color for styling
  brandLogoExtension?: string; // File type for logo (SVG, PNG, JPEG)
  brandInfoPdf?: string; // URL to PDF with brand information
  description?: string;
  inputMasks?: any[]; // Input masks for validation
  redemptionInstructions?: any[]; // Instructions for redeeming the gift card
  requiredFieldsLabels?: any[]; // Labels for required fields during purchase
}

export interface ZenditBrandsResponse {
  success: boolean;
  brands?: ZenditBrand[];
  total?: number;
  error?: string;
}

export interface GetBrandsParams {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  country?: string; // Optional: 2 letter ISO code
}

export interface GetVoucherOffersParams {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  brand?: string; // Optional: Brand name to filter
  country?: string; // Optional: 2 letter ISO code
  subType?: string; // Optional: Offer subtype
}

export interface ZenditVoucherOffer {
  offerId: string;
  brand: string;
  country: string;
  currency: string;
  priceType: 'Fixed' | 'Range';
  cardAmount?: number | null; // For Fixed offers
  minAmount?: number | null; // For Range offers
  maxAmount?: number | null; // For Range offers
  currencyDivisor?: number;
  enabled?: boolean;
  notes?: string;
  shortNotes?: string;
  requiredFields?: any[];
}

export interface ZenditVoucherOffersResponse {
  success: boolean;
  offers?: ZenditVoucherOffer[];
  total?: number;
  error?: string;
}

export interface ZenditVoucherOfferDetail extends ZenditVoucherOffer {
  cost?: {
    currency?: string;
    currencyDivisor?: number;
    fixed?: number;
    fx?: number;
    max?: number;
    min?: number;
  };
  price?: {
    currency?: string;
    currencyDivisor?: number;
    fixed?: number;
    fx?: number;
    margin?: number;
    max?: number;
    min?: number;
    suggestedFixed?: number;
    suggestedFx?: number;
  };
  productType?: 'TOPUP' | 'VOUCHER' | 'ESIM' | 'RECHARGE_SANDBOX' | 'RECHARGE_WITH_CREDIT_CARD';
  regions?: string[];
  subTypes?: string[];
  createdAt?: string;
  updatedAt?: string;
  fullOffer?: any; // Full API response for reference
}

export interface ZenditVoucherOfferDetailResponse {
  success: boolean;
  offer?: ZenditVoucherOfferDetail;
  error?: string;
}

export interface GetVoucherPurchasesParams {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  createdAt?: string; // Optional: Date filter
  status?: 'DONE' | 'FAILED' | 'PENDING' | 'ACCEPTED' | 'AUTHORIZED' | 'IN_PROGRESS'; // Optional: Status filter
}

export interface ZenditVoucherPurchase {
  purchaseId: string;
  offerId: string;
  brand: string;
  country: string;
  status: 'DONE' | 'FAILED' | 'PENDING' | 'ACCEPTED' | 'AUTHORIZED' | 'IN_PROGRESS';
  cost?: {
    currency?: string;
    currencyDivisor?: number;
    fixed?: number;
    fx?: number;
    max?: number;
    min?: number;
  };
  price?: {
    currency?: string;
    currencyDivisor?: number;
    fixed?: number;
    fx?: number;
    margin?: number;
    max?: number;
    min?: number;
    suggestedFixed?: number;
    suggestedFx?: number;
  };
  send?: {
    currency?: string;
    currencyDivisor?: number;
    fixed?: number;
    fx?: number;
    max?: number;
    min?: number;
  };
  receipt?: any; // Receipt information
  createdAt?: string;
  updatedAt?: string;
  fullPurchase?: any; // Full API response for reference
}

export interface ZenditVoucherPurchasesResponse {
  success: boolean;
  purchases?: ZenditVoucherPurchase[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

export interface VoucherField {
  name: string;
  value: string;
}

export interface PurchaseValue {
  type: 'PRICE' | 'AMOUNT';
  value: number;
}

export interface CreateVoucherPurchaseParams {
  fields: VoucherField[]; // Required: Fields required for offer
  offerId: string; // Required: Catalog ID of the offer
  transactionId: string; // Required: Transaction ID provided by partner
  value?: PurchaseValue; // Optional: Purchase amount and type (required for RANGE offers, omitted for FIXED)
}

export interface CreateVoucherPurchaseResponse {
  success: boolean;
  status?: string; // Status of transaction acceptance
  transactionId?: string; // Transaction ID provided by partner
  fullResponse?: any; // Full API response for reference
  error?: string;
  statusCode?: number;
}

/**
 * Get list of available gift card brands from Zendit API via Supabase Edge Function
 */
export async function getZenditBrands(
  params: GetBrandsParams
): Promise<ZenditBrandsResponse> {
  try {
    // Validate required parameters
    if (!params.limit || params.limit < 1 || params.limit > 1024) {
      return {
        success: false,
        error: 'Limit must be between 1 and 1024',
      };
    }

    if (params.offset === undefined || params.offset < 0) {
      return {
        success: false,
        error: 'Offset must be a non-negative number',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log('📡 Fetching Zendit brands via Edge Function');

    // Call Supabase Edge Function with timeout (60 seconds to account for Edge Function processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          limit: params.limit,
          offset: params.offset,
          country: params.country,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('network')) {
        console.error('❌ Edge Function request timed out or network failed');
        return {
          success: false,
          error: 'Request timed out or network failed. Please check your connection and try again.',
        };
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Edge Function error:', response.status, errorText);
      return {
        success: false,
        error: `Failed to fetch brands: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch brands',
      };
    }

    console.log(`✅ Fetched ${result.brands?.length || 0} brands from Zendit`);

    return {
      success: true,
      brands: result.brands || [],
      total: result.total || 0,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit brands:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch brands from Zendit API',
    };
  }
}

/**
 * Get all brands for a specific country (with pagination)
 * Optimized to limit pagination for faster response
 */
export async function getAllBrandsForCountry(
  country: string,
  limit: number = 100
): Promise<ZenditBrandsResponse> {
  try {
    const allBrands: ZenditBrand[] = [];
    let offset = 0;
    let hasMore = true;
    const maxPages = 10; // Limit to 10 pages max (1000 brands) for faster response
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      const result = await getZenditBrands({
        limit,
        offset,
        country,
      });

      if (!result.success || !result.brands) {
        if (offset === 0) {
          // If first request fails, return error
          return result;
        }
        // If later request fails, return what we have
        break;
      }

      allBrands.push(...result.brands);
      pageCount++;

      // Check if we got fewer results than requested (last page)
      if (result.brands.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    if (pageCount >= maxPages) {
      console.warn(`⚠️ Reached max pages limit (${maxPages}), returning ${allBrands.length} brands`);
    }

    return {
      success: true,
      brands: allBrands,
      total: allBrands.length,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching all brands:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch all brands',
    };
  }
}

/**
 * Search brands by name
 */
export async function searchBrands(
  searchTerm: string,
  country?: string,
  limit: number = 50
): Promise<ZenditBrandsResponse> {
  try {
    const result = await getAllBrandsForCountry(country || '', limit * 10); // Fetch more to filter

    if (!result.success || !result.brands) {
      return result;
    }

    const searchLower = searchTerm.toLowerCase();
    const filteredBrands = result.brands.filter(
      (brand) =>
        brand.name.toLowerCase().includes(searchLower) ||
        brand.category?.toLowerCase().includes(searchLower)
    ).slice(0, limit);

    return {
      success: true,
      brands: filteredBrands,
      total: filteredBrands.length,
    };
  } catch (error: any) {
    console.error('❌ Exception searching brands:', error);
    return {
      success: false,
      error: error.message || 'Failed to search brands',
    };
  }
}

/**
 * Get voucher offers (gift card amounts) from Zendit API via Supabase Edge Function
 */
export async function getZenditVoucherOffers(
  params: GetVoucherOffersParams
): Promise<ZenditVoucherOffersResponse> {
  try {
    // Validate required parameters
    if (!params.limit || params.limit < 1 || params.limit > 1024) {
      return {
        success: false,
        error: 'Limit must be between 1 and 1024',
      };
    }

    if (params.offset === undefined || params.offset < 0) {
      return {
        success: false,
        error: 'Offset must be a non-negative number',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log('📡 Fetching Zendit voucher offers via Edge Function');

    // Call Supabase Edge Function with timeout (60 seconds to account for Edge Function processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_VOUCHER_OFFERS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          limit: params.limit,
          offset: params.offset,
          brand: params.brand,
          country: params.country,
          regions: params.regions,
          subType: params.subType,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
        console.error('❌ Edge Function request timed out');
        return {
          success: false,
          error: 'Request timed out. The Zendit API may be slow. Try reducing the limit or adding filters (brand, country, regions).',
        };
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle 404 - Edge Function not deployed
      if (response.status === 404) {
        return {
          success: false,
          error: 'Voucher offers service not available',
        };
      }
      
      console.error('❌ Edge Function error:', response.status, errorText);
      return {
        success: false,
        error: `Failed to fetch voucher offers: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch voucher offers',
      };
    }

    console.log(`✅ Fetched ${result.offers?.length || 0} voucher offers from Zendit`);

    return {
      success: true,
      offers: result.offers || [],
      total: result.total || 0,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher offers:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch voucher offers from Zendit API',
    };
  }
}

/**
 * Get all voucher offers for a specific brand and country (with pagination)
 */
export async function getAllVoucherOffersForBrand(
  brand: string,
  country?: string,
  limit: number = 100
): Promise<ZenditVoucherOffersResponse> {
  try {
    const allOffers: ZenditVoucherOffer[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await getZenditVoucherOffers({
        limit,
        offset,
        brand,
        country,
      });

      if (!result.success || !result.offers) {
        if (offset === 0) {
          // If first request fails, return error
          return result;
        }
        // If later request fails, return what we have
        break;
      }

      allOffers.push(...result.offers);

      // Check if we got fewer results than requested (last page)
      if (result.offers.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit to prevent infinite loops
      if (offset > 10000) {
        console.warn('⚠️ Reached safety limit for pagination');
        break;
      }
    }

    return {
      success: true,
      offers: allOffers,
      total: allOffers.length,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching all voucher offers:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch all voucher offers',
    };
  }
}

/**
 * Get a specific voucher offer by offer ID from Zendit API via Supabase Edge Function
 */
export async function getZenditVoucherOfferById(
  offerId: string
): Promise<ZenditVoucherOfferDetailResponse> {
  try {
    // Validate required parameters
    if (!offerId || offerId.trim() === '') {
      return {
        success: false,
        error: 'Offer ID is required',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log(`📡 Fetching Zendit voucher offer by ID via Edge Function: ${offerId}`);

    // Call Supabase Edge Function with timeout (60 seconds to account for Edge Function processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_VOUCHER_OFFER_BY_ID_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          offerId: offerId.trim(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
        console.error('❌ Edge Function request timed out');
        return {
          success: false,
          error: 'Request timed out. Please try again.',
        };
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle 404 - Offer not found
      if (response.status === 404) {
        return {
          success: false,
          error: 'Voucher offer not found',
        };
      }
      
      // Handle 404 - Edge Function not deployed
      if (response.status === 404) {
        return {
          success: false,
          error: 'Voucher offer service not available',
        };
      }
      
      console.error('❌ Edge Function error:', response.status, errorText);
      return {
        success: false,
        error: `Failed to fetch voucher offer: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch voucher offer',
      };
    }

    console.log(`✅ Fetched voucher offer: ${offerId}`);

    return {
      success: true,
      offer: result.offer,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher offer:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch voucher offer from Zendit API',
    };
  }
}

/**
 * Get list of voucher purchases/transactions from Zendit API via Supabase Edge Function
 */
export async function getZenditVoucherPurchases(
  params: GetVoucherPurchasesParams
): Promise<ZenditVoucherPurchasesResponse> {
  try {
    // Validate required parameters
    if (!params.limit || params.limit < 1 || params.limit > 1024) {
      return {
        success: false,
        error: 'Limit must be between 1 and 1024',
      };
    }

    if (params.offset === undefined || params.offset < 0) {
      return {
        success: false,
        error: 'Offset must be a non-negative number',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log('📡 Fetching Zendit voucher purchases via Edge Function');

    // Call Supabase Edge Function with timeout (60 seconds to account for Edge Function processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_VOUCHER_PURCHASES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          limit: params.limit,
          offset: params.offset,
          createdAt: params.createdAt,
          status: params.status,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('network')) {
        console.error('❌ Edge Function request timed out');
        return {
          success: false,
          error: 'Request timed out. Please try again.',
        };
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle 404 - Edge Function not deployed
      if (response.status === 404) {
        return {
          success: false,
          error: 'Voucher purchases service not available',
        };
      }
      
      console.error('❌ Edge Function error:', response.status, errorText);
      return {
        success: false,
        error: `Failed to fetch voucher purchases: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch voucher purchases',
      };
    }

    console.log(`✅ Fetched ${result.purchases?.length || 0} voucher purchases from Zendit`);

    return {
      success: true,
      purchases: result.purchases || [],
      total: result.total || 0,
      limit: result.limit,
      offset: result.offset,
    };
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher purchases:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch voucher purchases from Zendit API',
    };
  }
}

/**
 * Create a voucher purchase transaction via Zendit API
 */
export async function createZenditVoucherPurchase(
  params: CreateVoucherPurchaseParams
): Promise<CreateVoucherPurchaseResponse> {
  try {
    // Validate required parameters
    if (!params.offerId || params.offerId.trim() === '') {
      return {
        success: false,
        error: 'offerId is required',
      };
    }

    if (!params.transactionId || params.transactionId.trim() === '') {
      return {
        success: false,
        error: 'transactionId is required',
      };
    }

    if (!params.fields || !Array.isArray(params.fields) || params.fields.length === 0) {
      return {
        success: false,
        error: 'fields array is required and must not be empty',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log('📡 Creating Zendit voucher purchase via Edge Function');

    // Build request payload
    const requestPayload: any = {
      offerId: params.offerId.trim(),
      transactionId: params.transactionId.trim(),
      fields: params.fields,
    };

    // Add value only if provided (required for RANGE offers)
    if (params.value) {
      requestPayload.value = params.value;
    }

    // Call Supabase Edge Function with timeout (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_CREATE_VOUCHER_PURCHASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('network')) {
        console.error('❌ Edge Function request timed out');
        return {
          success: false,
          error: 'Request timed out. Please try again.',
        };
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle 404 - Edge Function not deployed
      if (response.status === 404) {
        return {
          success: false,
          error: 'Voucher purchase service not available',
        };
      }
      
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      console.error('❌ Edge Function error:', response.status, errorText);
      return {
        success: false,
        error: errorData.error || `Failed to create voucher purchase: ${response.status} - ${errorText}`,
        statusCode: response.status,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create voucher purchase',
        statusCode: result.statusCode,
      };
    }

    console.log(`✅ Created voucher purchase: ${result.transactionId} - Status: ${result.status}`);

    return {
      success: true,
      status: result.status,
      transactionId: result.transactionId,
      fullResponse: result.fullResponse,
    };
  } catch (error: any) {
    console.error('❌ Exception creating Zendit voucher purchase:', error);
    return {
      success: false,
      error: error.message || 'Failed to create voucher purchase from Zendit API',
    };
  }
}

/**
 * Get available card amounts for a brand (extracts unique fixed amounts with currency)
 */
export async function getAvailableCardAmounts(
  brand: string,
  country?: string
): Promise<{ success: boolean; amounts?: number[]; currency?: string; error?: string }> {
  try {
    const result = await getAllVoucherOffersForBrand(brand, country);

    if (!result.success || !result.offers) {
      return {
        success: false,
        error: result.error || 'Failed to fetch card amounts',
      };
    }

    // Extract currency from offers (should be consistent for a brand/country)
    const currencies = result.offers
      .map((offer) => offer.currency)
      .filter((currency): currency is string => !!currency);
    const currency = currencies.length > 0 ? currencies[0] : 'USD'; // Default to USD if not found

    // Extract unique fixed card amounts
    const fixedAmounts = result.offers
      .filter((offer) => offer.priceType === 'Fixed' && offer.cardAmount !== null)
      .map((offer) => offer.cardAmount!)
      .filter((amount, index, self) => self.indexOf(amount) === index) // Remove duplicates
      .sort((a, b) => a - b); // Sort ascending

    // For Range offers, extract min/max bounds
    const rangeOffers = result.offers.filter((offer) => offer.priceType === 'Range');
    const minAmounts = rangeOffers
      .map((offer) => offer.minAmount)
      .filter((amount): amount is number => amount !== null);
    const maxAmounts = rangeOffers
      .map((offer) => offer.maxAmount)
      .filter((amount): amount is number => amount !== null);

    // Combine and deduplicate
    const allAmounts = [...fixedAmounts, ...minAmounts, ...maxAmounts]
      .filter((amount, index, self) => self.indexOf(amount) === index)
      .sort((a, b) => a - b);

    return {
      success: true,
      amounts: allAmounts.length > 0 ? allAmounts : undefined,
      currency,
    };
  } catch (error: any) {
    console.error('❌ Exception getting card amounts:', error);
    return {
      success: false,
      error: error.message || 'Failed to get card amounts',
    };
  }
}

export interface CountryInfo {
  id: string; // Currency code (e.g., 'NGN', 'USD')
  name: string; // Country name
  currency: string; // Currency code
  symbol: string; // Currency symbol
  flag: string; // Emoji flag
  isoCode: string; // ISO 2-letter country code
}

export interface CountriesResponse {
  success: boolean;
  countries?: CountryInfo[];
  error?: string;
}

// Country code to currency and flag mapping
const COUNTRY_MAP: Record<string, { name: string; currency: string; symbol: string; flag: string }> = {
  'NG': { name: 'Nigeria', currency: 'NGN', symbol: '₦', flag: '🇳🇬' },
  'US': { name: 'United States', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  'GB': { name: 'United Kingdom', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  'CA': { name: 'Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  'AU': { name: 'Australia', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  'DE': { name: 'Germany', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  'FR': { name: 'France', currency: 'EUR', symbol: '€', flag: '🇫🇷' },
  'IT': { name: 'Italy', currency: 'EUR', symbol: '€', flag: '🇮🇹' },
  'ES': { name: 'Spain', currency: 'EUR', symbol: '€', flag: '🇪🇸' },
  'NL': { name: 'Netherlands', currency: 'EUR', symbol: '€', flag: '🇳🇱' },
  'BE': { name: 'Belgium', currency: 'EUR', symbol: '€', flag: '🇧🇪' },
  'AT': { name: 'Austria', currency: 'EUR', symbol: '€', flag: '🇦🇹' },
  'CH': { name: 'Switzerland', currency: 'CHF', symbol: 'CHF', flag: '🇨🇭' },
  'SE': { name: 'Sweden', currency: 'SEK', symbol: 'kr', flag: '🇸🇪' },
  'NO': { name: 'Norway', currency: 'NOK', symbol: 'kr', flag: '🇳🇴' },
  'DK': { name: 'Denmark', currency: 'DKK', symbol: 'kr', flag: '🇩🇰' },
  'FI': { name: 'Finland', currency: 'EUR', symbol: '€', flag: '🇫🇮' },
  'PL': { name: 'Poland', currency: 'PLN', symbol: 'zł', flag: '🇵🇱' },
  'IE': { name: 'Ireland', currency: 'EUR', symbol: '€', flag: '🇮🇪' },
  'PT': { name: 'Portugal', currency: 'EUR', symbol: '€', flag: '🇵🇹' },
  'GR': { name: 'Greece', currency: 'EUR', symbol: '€', flag: '🇬🇷' },
  'ZA': { name: 'South Africa', currency: 'ZAR', symbol: 'R', flag: '🇿🇦' },
  'KE': { name: 'Kenya', currency: 'KES', symbol: 'KSh', flag: '🇰🇪' },
  'GH': { name: 'Ghana', currency: 'GHS', symbol: '₵', flag: '🇬🇭' },
  'EG': { name: 'Egypt', currency: 'EGP', symbol: 'E£', flag: '🇪🇬' },
  'IN': { name: 'India', currency: 'INR', symbol: '₹', flag: '🇮🇳' },
  'PK': { name: 'Pakistan', currency: 'PKR', symbol: '₨', flag: '🇵🇰' },
  'BD': { name: 'Bangladesh', currency: 'BDT', symbol: '৳', flag: '🇧🇩' },
  'PH': { name: 'Philippines', currency: 'PHP', symbol: '₱', flag: '🇵🇭' },
  'TH': { name: 'Thailand', currency: 'THB', symbol: '฿', flag: '🇹🇭' },
  'VN': { name: 'Vietnam', currency: 'VND', symbol: '₫', flag: '🇻🇳' },
  'ID': { name: 'Indonesia', currency: 'IDR', symbol: 'Rp', flag: '🇮🇩' },
  'MY': { name: 'Malaysia', currency: 'MYR', symbol: 'RM', flag: '🇲🇾' },
  'SG': { name: 'Singapore', currency: 'SGD', symbol: 'S$', flag: '🇸🇬' },
  'HK': { name: 'Hong Kong', currency: 'HKD', symbol: 'HK$', flag: '🇭🇰' },
  'JP': { name: 'Japan', currency: 'JPY', symbol: '¥', flag: '🇯🇵' },
  'KR': { name: 'South Korea', currency: 'KRW', symbol: '₩', flag: '🇰🇷' },
  'CN': { name: 'China', currency: 'CNY', symbol: '¥', flag: '🇨🇳' },
  'BR': { name: 'Brazil', currency: 'BRL', symbol: 'R$', flag: '🇧🇷' },
  'MX': { name: 'Mexico', currency: 'MXN', symbol: '$', flag: '🇲🇽' },
  'AR': { name: 'Argentina', currency: 'ARS', symbol: '$', flag: '🇦🇷' },
  'CL': { name: 'Chile', currency: 'CLP', symbol: '$', flag: '🇨🇱' },
  'CO': { name: 'Colombia', currency: 'COP', symbol: '$', flag: '🇨🇴' },
  'PE': { name: 'Peru', currency: 'PEN', symbol: 'S/', flag: '🇵🇪' },
  'AE': { name: 'United Arab Emirates', currency: 'AED', symbol: 'د.إ', flag: '🇦🇪' },
  'SA': { name: 'Saudi Arabia', currency: 'SAR', symbol: '﷼', flag: '🇸🇦' },
  'IL': { name: 'Israel', currency: 'ILS', symbol: '₪', flag: '🇮🇱' },
  'TR': { name: 'Turkey', currency: 'TRY', symbol: '₺', flag: '🇹🇷' },
  'RU': { name: 'Russia', currency: 'RUB', symbol: '₽', flag: '🇷🇺' },
  'NZ': { name: 'New Zealand', currency: 'NZD', symbol: 'NZ$', flag: '🇳🇿' },
};

/**
 * Default countries to return if API fails
 */
const DEFAULT_COUNTRIES: CountryInfo[] = [
  { id: 'NGN', name: 'Nigeria', currency: 'NGN', symbol: '₦', flag: '🇳🇬', isoCode: 'NG' },
  { id: 'USD', name: 'United States', currency: 'USD', symbol: '$', flag: '🇺🇸', isoCode: 'US' },
  { id: 'GBP', name: 'United Kingdom', currency: 'GBP', symbol: '£', flag: '🇬🇧', isoCode: 'GB' },
];

/**
 * Extract unique countries from voucher offers
 * Optimized to only fetch first page for faster response
 */
async function extractCountriesFromVoucherOffers(): Promise<Map<string, { isoCode: string; currency: string }>> {
  const countryMap = new Map<string, { isoCode: string; currency: string }>();
  
  // Only fetch first page (1000 offers) to get a good sample of countries quickly
  // This is much faster than paginating through all offers
  const limit = 1000;
  const offset = 0;

  try {
    const result = await getZenditVoucherOffers({
      limit,
      offset,
    });

    if (!result.success || !result.offers) {
      // If fetch fails, return empty map (will use fallback)
      return countryMap;
    }

    // Extract countries from this page
    result.offers.forEach((offer) => {
      if (offer.country && offer.currency) {
        const isoCode = offer.country.toUpperCase();
        // Keep first currency encountered for each country
        if (!countryMap.has(isoCode)) {
          countryMap.set(isoCode, {
            isoCode,
            currency: offer.currency,
          });
        }
      }
    });
  } catch (error) {
    console.error('❌ Error extracting countries from voucher offers:', error);
    // Return empty map on error (will use fallback)
  }

  return countryMap;
}

/**
 * Convert country map to CountryInfo array
 */
function mapToCountryInfoArray(
  countryMap: Map<string, { isoCode: string; currency: string }>
): CountryInfo[] {
  return Array.from(countryMap.entries())
    .map(([isoCode, data]) => {
      const countryInfo = COUNTRY_MAP[isoCode];
      if (countryInfo) {
        return {
          id: data.currency, // Use currency as ID
          name: countryInfo.name,
          currency: data.currency,
          symbol: countryInfo.symbol,
          flag: countryInfo.flag,
          isoCode,
        };
      } else {
        // Fallback for unknown countries
        return {
          id: data.currency,
          name: isoCode, // Use ISO code as name if not found
          currency: data.currency,
          symbol: data.currency,
          flag: '🌍',
          isoCode,
        };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
}

/**
 * Get available countries from voucher offers (optimized with pagination)
 * Fetches all voucher offers using pagination to get complete country list
 * Has a timeout fallback to return default countries quickly
 */
export async function getAvailableCountries(): Promise<CountriesResponse> {
  try {
    console.log('🌍 Fetching available countries from Zendit API...');

    // Add timeout wrapper - return default countries after 5 seconds
    const timeoutPromise = new Promise<CountriesResponse>((resolve) => {
      setTimeout(() => {
        console.warn('⚠️ Country fetch timed out, using default countries');
        resolve({
          success: true,
          countries: DEFAULT_COUNTRIES,
        });
      }, 5000); // 5 second timeout
    });

    // Try to extract countries from voucher offers with pagination
    const fetchPromise = (async () => {
      try {
        const countryMap = await extractCountriesFromVoucherOffers();

        // If no countries found, return default countries
        if (countryMap.size === 0) {
          console.warn('⚠️ No countries found from API, using default countries');
          return {
            success: true,
            countries: DEFAULT_COUNTRIES,
          };
        }

        // Convert to CountryInfo array
        const countries = mapToCountryInfoArray(countryMap);

        console.log(`✅ Found ${countries.length} unique countries`);

        return {
          success: true,
          countries,
        };
      } catch (error: any) {
        console.error('❌ Exception fetching countries:', error);
        // Return default countries on error
        return {
          success: true,
          countries: DEFAULT_COUNTRIES,
        };
      }
    })();

    // Race between timeout and actual fetch
    return Promise.race([fetchPromise, timeoutPromise]);
  } catch (error: any) {
    console.error('❌ Exception fetching countries:', error);
    // Return default countries on error
    return {
      success: true,
      countries: DEFAULT_COUNTRIES,
    };
  }
}

/**
 * Get available gift card brands for a country
 * Filters out utility/bills payment brands (electricity, etc.) to only return gift cards
 */
export async function getAvailableGiftCards(
  countryIsoCode: string
): Promise<ZenditBrandsResponse> {
  const result = await getAllBrandsForCountry(countryIsoCode, 100);
  
  if (!result.success || !result.brands) {
    return result;
  }
  
  // Filter out utility/bills payment brands (electricity, etc.)
  // Focus on specific utility keywords that clearly indicate bills/utilities
  const utilityKeywords = [
    'electricity',
    'electric bill',
    'power bill',
    'utility bill',
    'prepaid meter',
    'postpaid meter',
    'disco', // Distribution Company (Nigeria electricity)
    'aedc', // Abuja Electricity Distribution Company
    'ekedc', // Eko Electricity Distribution Company
    'ikedc', // Ikeja Electric Distribution Company
    'phedc', // Port Harcourt Electricity Distribution Company
    'kaedco', // Kaduna Electric Distribution Company
    'kedco', // Kano Electric Distribution Company
    'yedc', // Yola Electricity Distribution Company
    'ibedc', // Ibadan Electricity Distribution Company
  ];
  
  // Filter brands to exclude utilities
  const giftCardBrands = result.brands.filter((brand) => {
    const brandName = (brand.name || '').toLowerCase();
    const brandId = (brand.id || brand.brand || '').toLowerCase();
    
    // Exclude if name or id contains utility keywords
    // Use more specific matching to avoid false positives
    const isUtility = utilityKeywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      return brandName.includes(keywordLower) || brandId.includes(keywordLower);
    });
    
    return !isUtility;
  });
  
  return {
    success: true,
    brands: giftCardBrands,
    total: giftCardBrands.length,
  };
}

/**
 * Get detailed brand information including logo
 */
export async function getBrandDetails(
  brandId: string
): Promise<{ success: boolean; brand?: ZenditBrand; error?: string }> {
  try {
    if (!brandId) {
      return {
        success: false,
        error: 'Brand ID is required',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    // Silently fetch - don't log to reduce noise

    // Call Supabase Edge Function with timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response: Response;
    try {
      response = await fetch(ZENDIT_BRAND_DETAILS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          brand: brandId,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('network')) {
        // Don't log - expected failures
        return {
          success: false,
          error: 'Request timed out or network failed',
        };
      }
      throw fetchError;
    }

    // Handle 503 BOOT_ERROR - don't retry, just fail fast
    // Retries cause more issues than they solve with cold starts
    if (response.status === 503) {
      const errorText = await response.text();
      // Don't log error - it's expected with cold starts
      return {
        success: false,
        error: 'Service temporarily unavailable',
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      // Don't log errors - they're expected and handled gracefully
      return {
        success: false,
        error: `Failed to fetch brand details: ${response.status}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch brand details',
      };
    }

    return {
      success: true,
      brand: result.brand,
    };
  } catch (error: any) {
    // Never throw - always return error response
    // Silently fail - errors are expected and handled gracefully
    return {
      success: false,
      error: 'Failed to fetch brand details',
    };
  }
}

/**
 * Enrich brands with logo information
 * Fetches brand details for each brand to get logos
 * Optimized with timeout handling and batch processing
 */
/**
 * Enrich brands with logo information (OPTIONAL, NON-BLOCKING)
 * This function is designed to fail gracefully - it never throws errors
 * and always returns brands (with or without logos)
 */
export async function enrichBrandsWithLogos(
  brands: ZenditBrand[]
): Promise<ZenditBrand[]> {
  // Early exit if no brands
  if (!brands || brands.length === 0) {
    return brands;
  }

  try {
    // Limit to first 10 brands only to minimize API calls and failures
    const brandsToEnrich = brands.slice(0, 10);
    const remainingBrands = brands.slice(10);

    // Track failures - if too many fail early, skip all enrichment
    let successCount = 0;
    let failureCount = 0;
    const minSuccessRate = 0.3; // Need at least 30% success rate to continue

    // Process brands sequentially (one at a time) to avoid overwhelming Edge Function
    const enrichedBrands: ZenditBrand[] = [];

    for (const brand of brandsToEnrich) {
      const brandId = brand.brand || brand.id;
      if (!brandId) {
        enrichedBrands.push(brand);
        continue;
      }

      // If failure rate is too high, skip remaining enrichment
      const totalAttempts = successCount + failureCount;
      if (totalAttempts >= 5 && failureCount / totalAttempts > (1 - minSuccessRate)) {
        console.warn('⚠️ Logo enrichment failure rate too high, skipping remaining brands');
        enrichedBrands.push(...brandsToEnrich.slice(enrichedBrands.length));
        break;
      }

      try {
        // Very short timeout (2 seconds) - fail fast
        const brandDetailPromise = getBrandDetails(brandId);
        const timeoutPromise = new Promise<{ success: boolean; brand?: ZenditBrand; error?: string }>((resolve) => {
          setTimeout(() => {
            resolve({ success: false, error: 'Timeout' });
          }, 2000); // 2 second timeout - very aggressive
        });

        const result = await Promise.race([brandDetailPromise, timeoutPromise]);
        
        if (result.success && result.brand) {
          successCount++;
          enrichedBrands.push({
            ...brand,
            logo: result.brand.logo || brand.logo,
            brandLogo: result.brand.brandLogo,
            brandGiftImage: result.brand.brandGiftImage,
            brandBigImage: result.brand.brandBigImage,
            brandColor: result.brand.brandColor,
            brandLogoExtension: result.brand.brandLogoExtension,
            brandInfoPdf: result.brand.brandInfoPdf,
            description: result.brand.description || brand.description,
            inputMasks: result.brand.inputMasks,
            redemptionInstructions: result.brand.redemptionInstructions,
            requiredFieldsLabels: result.brand.requiredFieldsLabels,
          });
        } else {
          failureCount++;
          enrichedBrands.push(brand); // Use original brand without logo
        }
      } catch (error) {
        failureCount++;
        // Silently use original brand - don't log every failure
        enrichedBrands.push(brand);
      }

      // Small delay between requests to avoid rate limiting
      if (enrichedBrands.length < brandsToEnrich.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests
      }
    }

    // Return enriched brands + remaining brands that weren't enriched
    return [...enrichedBrands, ...remainingBrands];
  } catch (error: any) {
    // Never throw - always return original brands
    console.warn('⚠️ Logo enrichment encountered error, returning original brands:', error.message);
    return brands;
  }
}
