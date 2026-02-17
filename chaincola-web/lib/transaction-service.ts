import { createClient } from './supabase/client';

const supabase = createClient();

// Helper function to get crypto logo path
function getCryptoLogo(symbol: string): string | null {
  const logoMap: Record<string, string> = {
    BTC: '/images/bitcoin.png',
    ETH: '/images/ethereum.png',
    USDT: '/images/tether.png',
    USDC: '/images/usdc.png',
    TRX: '/images/tron.png',
    XRP: '/images/ripple.png',
    SOL: '/images/solana.png', // Solana logo (add file if needed)
  };
  return logoMap[symbol] || null;
}

// Helper function to get crypto name
function getCryptoName(symbol: string): string {
  const nameMap: Record<string, string> = {
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    USDT: 'Tether',
    USDC: 'USD Coin',
    TRX: 'Tron',
    XRP: 'Ripple',
  };
  return nameMap[symbol] || symbol;
}

/**
 * Formats a timestamp to relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: string): string {
  try {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
    }

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error formatting relative time:', msg);
    return 'Unknown';
  }
}

// Transaction list item interface
export interface TransactionListItem {
  id: string;
  type: string;
  crypto: string;
  symbol: string;
  logo: string | null;
  amount: string;
  total: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  bankName?: string;
}

/**
 * Fetches user transactions from the database
 */
export async function getUserTransactions(
  userId: string,
  limit: number = 100
): Promise<{ transactions: TransactionListItem[]; error: any }> {
  try {
    // Fetch transactions from the database
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching transactions:', error);
      return {
        transactions: [],
        error: error.message || 'Failed to fetch transactions',
      };
    }

    // Transform database transactions to TransactionListItem format
    const transactions: TransactionListItem[] = (data || []).map((tx: any) => {
      // Determine currency
      const currency = tx.crypto_currency && tx.crypto_currency !== 'FIAT'
        ? tx.crypto_currency
        : (tx.fiat_currency || 'NGN');

      const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP', 'SOL'].includes(currency);
      const isNaira = currency === 'NGN';

      // Determine UI type
      let uiType: string = (tx.transaction_type || '').toLowerCase();
      if (uiType === 'deposit') {
        uiType = 'fund';
      } else if (uiType === 'withdraw' || uiType === 'withdrawal') {
        uiType = tx.bank_name ? 'withdraw-bank' : 'withdraw';
      }

      // Get crypto info
      const cryptoName = isCrypto ? getCryptoName(currency) : (isNaira ? 'Bank' : 'Wallet');
      const cryptoLogo = isCrypto ? getCryptoLogo(currency) : null;

      // Format amounts
      const formatAmount = (amount: number, currency: string): string => {
        const isNaira = currency === 'NGN';
        const symbol = isNaira ? '₦' : '$';
        return `${symbol}${Math.abs(amount).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      };

      const formatCryptoAmount = (amount: number, decimals: number = 8): string => {
        return Math.abs(amount).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      };

      let amount = '';
      let total = '';

      if (isCrypto) {
        const cryptoAmount = tx.crypto_amount || tx.amount || 0;
        amount = formatCryptoAmount(cryptoAmount);
        total = formatAmount(tx.fiat_amount || tx.net_amount || tx.amount || 0, 'USD');
      } else if (isNaira) {
        amount = formatAmount(tx.fiat_amount || tx.amount || 0, 'NGN');
        total = formatAmount(tx.net_amount || tx.fiat_amount || tx.amount || 0, 'NGN');
      } else {
        amount = formatAmount(tx.fiat_amount || tx.amount || 0, 'USD');
        total = formatAmount(tx.net_amount || tx.fiat_amount || tx.amount || 0, 'USD');
      }

      // Format date
      const date = formatRelativeTime(tx.created_at);

      // Determine status
      const dbStatus = (tx.status || '').toUpperCase();
      let status: 'completed' | 'pending' | 'failed';
      
      if (dbStatus === 'COMPLETED' || dbStatus === 'CONFIRMED') {
        status = 'completed';
      } else if (dbStatus === 'FAILED' || dbStatus === 'CANCELLED') {
        status = 'failed';
      } else {
        status = 'pending';
      }

      return {
        id: tx.id,
        type: uiType,
        crypto: cryptoName,
        symbol: currency,
        logo: cryptoLogo,
        amount: amount.replace(/[₦$]/g, '').trim(),
        total,
        date,
        status,
        bankName: tx.bank_name,
      };
    });

    return {
      transactions,
      error: null,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching transactions:', msg);
    return {
      transactions: [],
      error: msg || 'An error occurred while fetching transactions',
    };
  }
}










