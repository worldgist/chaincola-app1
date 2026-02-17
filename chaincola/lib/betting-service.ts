import { supabase } from './supabase';

export interface BetRequest {
  match_id: string;
  selection: string; // e.g., "Team A"
  odds: number;
  stake: number;
  currency?: 'NGN' | 'USD';
}

export interface BetResponse {
  success: boolean;
  bet_id?: string;
  reference?: string;
  message?: string;
  error?: string;
}

/**
 * Mock placeBet for UI testing
 */
export async function placeBet(userId: string, bet: BetRequest): Promise<BetResponse> {
  try {
    // Replace with real betting API integration
    const result = {
      success: true,
      bet_id: `bet_${Date.now()}`,
      reference: `BET${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      message: 'Bet placed successfully',
    };

    // Record bet as a transaction (pending settlement)
    try {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_type: 'BET',
        fiat_currency: bet.currency || 'NGN',
        fiat_amount: bet.stake,
        status: 'PENDING',
        reference: result.reference,
        external_transaction_id: result.bet_id,
        metadata: {
          match_id: bet.match_id,
          selection: bet.selection,
          odds: bet.odds,
          source: 'betting-service',
        },
      });

      if (txError) {
        console.error('Failed to insert bet transaction:', txError);
      }
    } catch (err) {
      console.error('Exception inserting bet transaction:', err);
    }

    return result;
  } catch (error: any) {
    console.error('Error placing bet:', error);
    return { success: false, error: error.message || 'Failed to place bet' };
  }
}
