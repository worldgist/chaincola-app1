import { createClient } from './supabase/client';

const supabase = createClient();

export interface WalletBalance {
  usd: number;
  ngn: number;
  giftCardBalance?: number;
}

/**
 * Gets the user's USD wallet balance
 */
export async function getUsdBalance(userId: string): Promise<number> {
  try {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('usd_balance')
      .eq('user_id', userId)
      .single();

    if (!error && wallet) {
      return parseFloat(wallet.usd_balance?.toString() || '0') || 0;
    }

    // Fallback to wallet_balances table
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'USD')
      .single();

    if (!balanceError && balance) {
      return parseFloat(balance.balance?.toString() || '0') || 0;
    }

    return 0;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching USD balance:', msg);
    return 0;
  }
}

/**
 * Gets the user's NGN wallet balance
 */
export async function getNgnBalance(userId: string): Promise<number> {
  try {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    if (!error && wallet) {
      return parseFloat(wallet.ngn_balance?.toString() || '0') || 0;
    }

    // Fallback to wallet_balances table
    const { data: balance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();

    if (!balanceError && balance) {
      return parseFloat(balance.balance?.toString() || '0') || 0;
    }

    return 0;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching NGN balance:', msg);
    return 0;
  }
}

/**
 * Gets all wallet balances
 */
export async function getWalletBalances(userId: string): Promise<WalletBalance> {
  try {
    const [usd, ngn] = await Promise.all([
      getUsdBalance(userId),
      getNgnBalance(userId),
    ]);

    return { usd, ngn };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching wallet balances:', msg);
    return { usd: 0, ngn: 0 };
  }
}

/**
 * Formats balance with currency symbol
 */
export function formatBalance(amount: number, currency: string): string {
  if (currency === 'NGN') {
    return amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}










