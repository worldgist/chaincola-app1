// Supabase removed - service disabled

import { supabase } from './supabase';

export interface AirtimePurchase {
  phone_number: string;
  network: 'MTN' | 'Airtel' | 'Glo' | '9mobile';
  amount: number;
  currency?: 'NGN' | 'USD';
}

export interface DataPurchase {
  phone_number: string;
  network: 'MTN' | 'Airtel' | 'Glo' | '9mobile';
  data_plan: string;
  amount: number;
  currency?: 'NGN' | 'USD';
}

export interface ElectricityPurchase {
  meter_number: string;
  meter_type: 'prepaid' | 'postpaid';
  provider: string;
  amount: number;
  currency?: 'NGN' | 'USD';
}

export interface UtilityPurchaseResponse {
  success: boolean;
  transaction_id?: string;
  reference?: string;
  message?: string;
  error?: string;
}

/**
 * Purchase airtime
 */
export async function purchaseAirtime(
  userId: string,
  purchase: AirtimePurchase
): Promise<UtilityPurchaseResponse> {
  try {
    // TODO: Replace with your API to purchase airtime
    // For now, return mock success to allow UI testing
    const result = {
      success: true,
      transaction_id: `airtime_${Date.now()}`,
      reference: `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      message: 'Airtime purchase successful',
    };

    // Record transaction in the database for auditing and UI
    try {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'AIRTIME',
        fiat_currency: purchase.currency || 'NGN',
        fiat_amount: purchase.amount,
        status: 'COMPLETED',
        reference: result.reference,
        external_transaction_id: result.transaction_id,
        metadata: {
          network: purchase.network,
          phone_number: purchase.phone_number,
          source: 'utility-service',
        },
      });

      if (txError) {
        console.error('Failed to insert airtime transaction:', txError);
      }
    } catch (err) {
      console.error('Exception inserting airtime transaction:', err);
    }

    // Also insert into dedicated airtime_transactions table (if present)
    try {
      const { error: airtimeErr } = await supabase.from('airtime_transactions').insert({
        user_id: userId,
        phone_number: purchase.phone_number,
        network: purchase.network,
        amount: purchase.amount,
        currency: purchase.currency || 'NGN',
        reference: result.reference,
        external_transaction_id: result.transaction_id,
        status: 'COMPLETED',
        metadata: { source: 'utility-service' },
      });

      if (airtimeErr) {
        // Non-fatal — table may not exist in some environments
        console.error('Failed to insert into airtime_transactions:', airtimeErr);
      }
    } catch (err) {
      console.error('Exception inserting into airtime_transactions:', err);
    }

    return result;
  } catch (error: any) {
    console.error('Exception purchasing airtime:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase airtime',
    };
  }
}

/**
 * Purchase data bundle
 */
export async function purchaseData(
  userId: string,
  purchase: DataPurchase
): Promise<UtilityPurchaseResponse> {
  try {
    // TODO: Replace with your API to purchase data
    // For now, return mock success to allow UI testing
    const result = {
      success: true,
      transaction_id: `data_${Date.now()}`,
      reference: `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      message: 'Data purchase successful',
    };

    // Record transaction
    try {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'DATA',
        fiat_currency: purchase.currency || 'NGN',
        fiat_amount: purchase.amount,
        status: 'COMPLETED',
        reference: result.reference,
        external_transaction_id: result.transaction_id,
        metadata: {
          network: purchase.network,
          data_plan: purchase.data_plan,
          phone_number: purchase.phone_number,
          source: 'utility-service',
        },
      });

      if (txError) {
        console.error('Failed to insert data transaction:', txError);
      }
    } catch (err) {
      console.error('Exception inserting data transaction:', err);
    }

    return result;
  } catch (error: any) {
    console.error('Exception purchasing data:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase data',
    };
  }
}

/**
 * Purchase electricity
 */
export async function purchaseElectricity(
  userId: string,
  purchase: ElectricityPurchase
): Promise<UtilityPurchaseResponse> {
  try {
    // TODO: Replace with your API to purchase electricity
    // For now, return mock success to allow UI testing
    const result = {
      success: true,
      transaction_id: `electricity_${Date.now()}`,
      reference: `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      message: 'Electricity purchase successful',
    };

    // Record transaction
    try {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'ELECTRICITY',
        fiat_currency: purchase.currency || 'NGN',
        fiat_amount: purchase.amount,
        status: 'COMPLETED',
        reference: result.reference,
        external_transaction_id: result.transaction_id,
        metadata: {
          meter_number: purchase.meter_number,
          meter_type: purchase.meter_type,
          provider: purchase.provider,
          source: 'utility-service',
        },
      });

      if (txError) {
        console.error('Failed to insert electricity transaction:', txError);
      }
    } catch (err) {
      console.error('Exception inserting electricity transaction:', err);
    }

    return result;
  } catch (error: any) {
    console.error('Exception purchasing electricity:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase electricity',
    };
  }
}

export interface CablePurchase {
  smartcard_number: string;
  provider: string; // DSTV | GOTV | STARTIMES | etc
  bouquet: string;
  amount: number;
  currency?: 'NGN' | 'USD';
}

/**
 * Purchase cable TV bouquet
 */
export async function purchaseCableTv(
  userId: string,
  purchase: CablePurchase
): Promise<UtilityPurchaseResponse> {
  try {
    // TODO: Replace with real cable purchase API
    // Mock success response for UI testing
    const result = {
      success: true,
      transaction_id: `cable_${Date.now()}`,
      reference: `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      message: 'Cable purchase successful',
    };

    // Record transaction
    try {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'CABLE',
        fiat_currency: purchase.currency || 'NGN',
        fiat_amount: purchase.amount,
        status: 'COMPLETED',
        reference: result.reference,
        external_transaction_id: result.transaction_id,
        metadata: {
          smartcard_number: purchase.smartcard_number,
          provider: purchase.provider,
          bouquet: purchase.bouquet,
          source: 'utility-service',
        },
      });

      if (txError) {
        console.error('Failed to insert cable transaction:', txError);
      }
    } catch (err) {
      console.error('Exception inserting cable transaction:', err);
    }

    return result;
  } catch (error: any) {
    console.error('Exception purchasing cable tv:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase cable tv',
    };
  }
}

/**
 * Purchase gift card (integrated with utility services)
 */
export async function purchaseGiftCardFromUtility(
  userId: string,
  purchase: {
    amount: number;
    currency: 'NGN' | 'USD';
    recipient_email?: string;
    recipient_name?: string;
    message?: string;
    expires_in_days?: number;
  }
): Promise<UtilityPurchaseResponse> {
  try {
    // Import gift card service
    const { purchaseGiftCard } = await import('./gift-card-service');
    
    const result = await purchaseGiftCard(userId, purchase);
    
    if (result.success && result.giftCard) {
      return {
        success: true,
        transaction_id: result.giftCard.id,
        reference: result.giftCard.code,
        message: 'Gift card purchase successful',
      };
    }
    
    return {
      success: false,
      error: result.error || 'Failed to purchase gift card',
    };
  } catch (error: any) {
    console.error('Exception purchasing gift card from utility:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase gift card',
    };
  }
}


















