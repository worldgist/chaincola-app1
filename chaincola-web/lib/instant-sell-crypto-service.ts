import { createClient } from './supabase/client';

const supabase = createClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface InstantSellRequest {
  asset: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';
  amount: number;
}

export interface InstantSellResponse {
  success: boolean;
  ngn_amount?: number;
  crypto_amount?: number;
  rate?: number;
  fee_percentage?: number;
  /** Raw payload from edge function (crypto_balance, ngn_balance, system fields). */
  new_balances?: Record<string, unknown>;
  balances?: {
    ngn_balance: number;
    crypto_balance: number;
    crypto_symbol: string;
    transaction_id?: string;
  };
  instant_settlement?: {
    ngn_credited_immediately: boolean;
    user_balances_updated_immediately: boolean;
    system_treasury_booked_immediately: boolean;
    ledger_steps: string[];
    atomic_single_transaction: boolean;
    on_chain_transfer?: {
      ledger_instant_complete: boolean;
      custody_sweep: {
        status: string;
        plan?: Record<string, unknown>;
        transaction_row_metadata_merged?: boolean;
        blockchain_broadcast_from_this_edge_function: boolean;
        explanation?: string;
      };
    };
  };
  error?: string;
}

/**
 * Instant Sell Crypto - Internal ledger swap (no blockchain movement)
 * Swaps crypto to NGN instantly using system inventory
 * Uses pricing engine for rates
 */
export async function instantSellCrypto(request: InstantSellRequest): Promise<InstantSellResponse> {
  try {
    console.log('💰 Instant sell request:', request);

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

    const functionUrl = `${SUPABASE_URL}/functions/v1/instant-sell-crypto-v2`;

    if (!SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Calling instant sell function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: request.asset,
        amount: request.amount,
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
      
      console.error('❌ Instant sell error:', errorData);
      return {
        success: false,
        error: errorData.error || `Failed to sell crypto: ${response.status}`,
      };
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Instant sell successful:', result);
      return {
        success: true,
        ngn_amount: result.ngn_amount,
        crypto_amount: request.amount,
        rate: result.rate,
        fee_percentage: result.fee_percentage,
        balances: result.balances,
        new_balances: result.new_balances,
        instant_settlement: result.instant_settlement,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Sell failed',
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Instant sell exception:', error);
    return {
      success: false,
      error: msg || 'Failed to sell crypto',
    };
  }
}
