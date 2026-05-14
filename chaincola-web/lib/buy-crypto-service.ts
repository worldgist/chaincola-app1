import { createClient } from './supabase/client';

const supabase = createClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface InstantBuyRequest {
  asset: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';
  ngn_amount: number;
}

export interface InstantBuyResponse {
  success: boolean;
  crypto_amount?: number;
  ngn_amount?: number;
  rate?: number;
  fee_percentage?: number;
  balances?: {
    ngn_balance: number;
    crypto_balance: number;
    crypto_symbol: string;
    transaction_id?: string;
    ngn_gross_before?: number;
    ngn_locked_before?: number;
    ngn_available_before?: number;
    ngn_amount_debited?: number;
    crypto_amount_credited?: number;
  };
  transaction_id?: string;
  instant_settlement?: {
    ngn_debited_immediately: boolean;
    crypto_credited_immediately: boolean;
    system_inventory_debited_immediately: boolean;
    user_balances_updated_immediately: boolean;
    ledger_steps: string[];
    atomic_single_transaction: boolean;
  };
  error?: string;
}

/**
 * Instant Buy Crypto - Internal ledger swap (no blockchain movement)
 * Swaps NGN to crypto instantly using system inventory
 */
export async function instantBuyCrypto(request: InstantBuyRequest): Promise<InstantBuyResponse> {
  try {
    console.log('💰 Instant buy request:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    if (!SUPABASE_URL) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${SUPABASE_URL}/functions/v1/instant-buy-crypto`;

    if (!SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Calling instant buy function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: request.asset,
        ngn_amount: request.ngn_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      
      console.error('❌ Instant buy error:', errorData);
      return {
        success: false,
        error: errorData.error || `Failed to buy crypto: ${response.status}`,
      };
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Instant buy successful:', result);
      return {
        success: true,
        crypto_amount: result.crypto_amount,
        ngn_amount: result.ngn_amount,
        rate: result.rate,
        fee_percentage: result.fee_percentage,
        balances: result.balances,
        transaction_id: result.transaction_id,
        instant_settlement: result.instant_settlement,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Buy failed',
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Instant buy exception:', error);
    return {
      success: false,
      error: msg || 'Failed to buy crypto',
    };
  }
}
