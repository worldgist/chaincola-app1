import { supabase } from './supabase';

export interface WalletBalance {
  usd: number;
  ngn: number;
  giftCardBalance?: number;
}

/**
 * Gets the user's USD wallet balance
 * Fetches from wallets or wallet_balances table
 */
export async function getUsdBalance(userId: string): Promise<number> {
  try {
    // Try wallets table first
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

    // Create wallet if it doesn't exist
    if (error && error.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: userId, usd_balance: 0, ngn_balance: 0 })
        .select('usd_balance')
        .single();

      if (!createError && newWallet) {
        return parseFloat(newWallet.usd_balance.toString()) || 0;
      }
    }

    return 0;
  } catch (error: any) {
    console.error('Exception fetching USD balance:', error);
    return 0;
  }
}

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Spendable NGN for buy/sell: max of user_wallets, wallets, wallet_balances (matches instant_buy_crypto reconciliation).
 */
export async function getNgnBalance(userId: string): Promise<number> {
  try {
    const [uwRes, wRes, wbRes] = await Promise.all([
      supabase.from('user_wallets').select('ngn_balance').eq('user_id', userId).maybeSingle(),
      supabase.from('wallets').select('ngn_balance').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_balances').select('balance').eq('user_id', userId).eq('currency', 'NGN').maybeSingle(),
    ]);

    const a = parseMoney(uwRes.data?.ngn_balance);
    const b = parseMoney(wRes.data?.ngn_balance);
    const c = parseMoney(wbRes.data?.balance);
    return Math.max(a, b, c);
  } catch (error: any) {
    console.error('Exception fetching NGN balance:', error);
    return 0;
  }
}

/**
 * Gets gift card balance for a user
 */
export async function getGiftCardBalance(userId: string): Promise<number> {
  try {
    // TODO: Replace with your API to fetch gift card balance
    // For now, return 0 to allow UI testing
    return 0;
  } catch (error: any) {
    console.error('Exception fetching gift card balance:', error);
    return 0;
  }
}

/**
 * Gets both USD and NGN balances for a user
 */
export async function getWalletBalances(userId: string): Promise<WalletBalance> {
  try {
    const [usdBalance, ngnBalance, giftCardBalance] = await Promise.all([
      getUsdBalance(userId),
      getNgnBalance(userId),
      getGiftCardBalance(userId),
    ]);

    return {
      usd: usdBalance,
      ngn: ngnBalance,
      giftCardBalance: giftCardBalance,
    };
  } catch (error: any) {
    console.error('Exception fetching wallet balances:', error);
    return {
      usd: 0,
      ngn: 0,
      giftCardBalance: 0,
    };
  }
}

/**
 * Formats a balance amount with proper formatting
 */
export function formatBalance(amount: number, currency: 'USD' | 'NGN' = 'USD'): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

