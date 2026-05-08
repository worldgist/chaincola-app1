import { supabase } from './supabase';

// Helper function to get crypto logo
function getCryptoLogo(symbol: string): any {
  const logoMap: Record<string, any> = {
    BTC: require('@/assets/images/bitcoin.png'),
    ETH: require('@/assets/images/ethereum.png'),
    USDT: require('@/assets/images/tether.png'),
    USDC: require('@/assets/images/usdc.png'),
    XRP: require('@/assets/images/ripple.png'),
    SOL: require('@/assets/images/solana.png'), // Add SOL logo if available
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
    XRP: 'Ripple',
    SOL: 'Solana',
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
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Unknown';
  }
}

// Transaction interface matching database structure
export interface Transaction {
  id: string;
  transaction_id?: string;
  user_id: string;
  type: string;
  status: string;
  currency: string;
  amount: number;
  crypto_amount?: number;
  fiat_amount?: number;
  fee: number;
  net_amount?: number;
  created_at: string;
  updated_at?: string;
  transaction_type?: string;
  crypto_currency?: string;
  transaction_hash?: string;
  from_address?: string;
  to_address?: string;
  metadata?: any;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  recipient_address?: string;
  sender_address?: string;
  crypto_hash?: string;
  payment_reference?: string;
  flutterwave_tx_ref?: string;
  gift_card_code?: string;
  recipient_email?: string;
  recipient_name?: string;
  phone_number?: string;
  network?: string;
  crypto_type?: string;
}

// Transaction list item interface for the transactions screen
export interface TransactionListItem {
  id: string;
  type: string;
  crypto: string;
  symbol: string;
  logo: any;
  amount: string;
  total: string;
  date: string;
  status: string;
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
    if (!supabase) {
      return {
        transactions: [],
        error: 'Supabase client not initialized',
      };
    }

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
      // Determine currency (prioritize crypto_currency, fallback to fiat_currency)
      const currency = tx.crypto_currency && tx.crypto_currency !== 'FIAT'
        ? tx.crypto_currency
        : (tx.fiat_currency || 'NGN');

      const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'].includes(currency);
      const isNaira = currency === 'NGN';
      
      // Get fiat currency from transaction (for SELL transactions, this is NGN)
      const fiatCurrency = tx.fiat_currency || 'NGN';
      const isFiatNaira = fiatCurrency === 'NGN';

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

      // Convert NGN to USD for display (approximate rate: 1650 NGN = 1 USD)
      const NGN_TO_USD_RATE = 1650;
      const convertNGNToUSD = (ngnAmount: number): number => {
        return ngnAmount / NGN_TO_USD_RATE;
      };

      let amount = '';
      let total = '';

      if (isCrypto) {
        // For RECEIVE transactions, always use crypto_amount (the actual amount received)
        // Don't fall back to tx.amount which might be a different value
        const txType = (tx.transaction_type || '').toUpperCase();
        const cryptoAmount = tx.crypto_amount !== undefined && tx.crypto_amount !== null
          ? tx.crypto_amount
          : (txType === 'RECEIVE' ? 0 : (tx.amount || 0));
        amount = formatCryptoAmount(cryptoAmount);
        
        // Check fiat_currency to determine display currency
        if (tx.fiat_amount) {
          // Use fiat_currency if available, otherwise default based on transaction type
          const displayCurrency = isFiatNaira ? 'NGN' : (tx.fiat_currency || 'USD');
          total = formatAmount(parseFloat(tx.fiat_amount), displayCurrency);
        } else {
          // Fallback: use USD for old transactions without fiat_amount
          total = formatAmount(tx.net_amount || tx.amount || 0, 'USD');
        }
      } else if (isNaira) {
        amount = formatAmount(tx.fiat_amount || tx.amount || 0, 'NGN');
        total = formatAmount(tx.net_amount || tx.fiat_amount || tx.amount || 0, 'NGN');
      } else {
        amount = formatAmount(tx.fiat_amount || tx.amount || 0, 'USD');
        total = formatAmount(tx.net_amount || tx.fiat_amount || tx.amount || 0, 'USD');
      }

      // Format date
      const date = formatRelativeTime(tx.created_at);

      // Determine status - properly handle FAILED status
      const dbStatus = (tx.status || '').toUpperCase();
      let status: 'completed' | 'pending' | 'failed';
      
      if (dbStatus === 'COMPLETED' || dbStatus === 'CONFIRMED') {
        status = 'completed';
      } else if (dbStatus === 'FAILED' || dbStatus === 'CANCELLED') {
        status = 'failed';
      } else {
        // PENDING, CONFIRMING, or any other status
        status = 'pending';
      }

      // Extract bank_name from metadata if not directly available
      let bankName = tx.bank_name;
      if (!bankName && tx.metadata) {
        try {
          const metadata = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
          bankName = metadata?.bank_name || null;
        } catch (e) {
          // Ignore parsing errors
        }
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
        bankName: bankName || undefined,
      };
    });

    return {
      transactions,
      error: null,
    };
  } catch (error: any) {
    console.error('Exception fetching transactions:', error);
    return {
      transactions: [],
      error: error.message || 'An error occurred while fetching transactions',
    };
  }
}

/** Raw row from `transactions` for PDF / email statements */
export type StatementTransactionRow = Record<string, unknown>;

/**
 * Loads the signed-in user's transactions for a statement period (chronological).
 */
export async function getUserTransactionsForStatement(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  limit: number = 2000,
): Promise<{ rows: StatementTransactionRow[]; error: string | null }> {
  try {
    if (!supabase) {
      return { rows: [], error: 'Supabase client not initialized' };
    }
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('transactions')
      .select(
        [
          'id',
          'created_at',
          'transaction_type',
          'status',
          'crypto_currency',
          'fiat_currency',
          'crypto_amount',
          'fiat_amount',
          'fee_amount',
          'fee_currency',
          'network',
          'transaction_hash',
          'external_reference',
          'external_order_id',
          'external_transaction_id',
          'notes',
          'metadata',
          'from_address',
          'to_address',
        ].join(','),
      )
      .eq('user_id', userId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { rows: [], error: error.message || 'Failed to fetch transactions' };
    }
    return { rows: (data || []) as StatementTransactionRow[], error: null };
  } catch (error: any) {
    return { rows: [], error: error?.message || 'Unexpected error loading transactions' };
  }
}

/**
 * Fetches a single transaction by ID
 */
export async function getTransactionById(
  transactionId: string,
  userId: string
): Promise<{ transaction: Transaction | null; error: any }> {
  try {
    if (!supabase) {
      return {
        transaction: null,
        error: 'Supabase client not initialized',
      };
    }

    // Fetch transaction from the database
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching transaction:', error);
      return {
        transaction: null,
        error: error.message || 'Failed to fetch transaction',
      };
    }

    if (!data) {
      return {
        transaction: null,
        error: 'Transaction not found',
      };
    }

    // Transform database transaction to Transaction format
    const currency = data.crypto_currency && data.crypto_currency !== 'FIAT'
      ? data.crypto_currency
      : (data.fiat_currency || 'NGN');

    const transaction: Transaction = {
      id: data.id,
      transaction_id: data.id,
      user_id: data.user_id,
      type: (data.transaction_type || '').toLowerCase(),
      status: (data.status || '').toLowerCase(),
      currency: currency,
      amount: parseFloat(data.fiat_amount || data.crypto_amount || '0'),
      crypto_amount: data.crypto_amount ? parseFloat(data.crypto_amount.toString()) : undefined,
      fiat_amount: data.fiat_amount ? parseFloat(data.fiat_amount.toString()) : undefined,
      fee: parseFloat(data.fee_amount || '0'),
      net_amount: parseFloat(data.fiat_amount || data.crypto_amount || '0') - parseFloat(data.fee_amount || '0'),
      created_at: data.created_at,
      updated_at: data.updated_at,
      transaction_type: data.transaction_type,
      crypto_currency: data.crypto_currency,
      transaction_hash: data.transaction_hash,
      from_address: data.from_address,
      to_address: data.to_address,
      metadata: data.metadata,
      bank_name: data.bank_name,
      account_number: data.account_number,
      account_name: data.account_name,
      recipient_address: data.to_address,
      sender_address: data.from_address,
      crypto_hash: data.transaction_hash,
      payment_reference: data.external_reference,
      flutterwave_tx_ref: data.external_reference,
      gift_card_code: data.metadata?.gift_card_code,
      recipient_email: data.metadata?.recipient_email,
      recipient_name: data.metadata?.recipient_name,
      phone_number: data.metadata?.phone_number,
      network: data.network,
      crypto_type: data.crypto_currency,
    };

    return {
      transaction,
      error: null,
    };
  } catch (error: any) {
    console.error('Exception fetching transaction:', error);
    return {
      transaction: null,
      error: error.message || 'An error occurred while fetching transaction',
    };
  }
}
