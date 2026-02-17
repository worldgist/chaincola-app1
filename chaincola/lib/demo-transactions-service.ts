/**
 * Demo Transactions Service
 * Creates sample transactions for testing and demo purposes
 */

import { supabase } from './supabase';

export type TransactionType = 'BUY' | 'SELL' | 'SEND' | 'RECEIVE' | 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'SWAP' | 'CONVERT';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'CONFIRMING' | 'CONFIRMED';
export type CryptoCurrency = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL' | 'FIAT';

export interface DemoTransactionParams {
  transaction_type: TransactionType;
  crypto_currency?: CryptoCurrency;
  amount?: number;
  status?: TransactionStatus;
  daysAgo?: number; // How many days ago the transaction should be dated
}

export interface CreateDemoTransactionsParams {
  userId: string;
  count?: number; // Number of transactions to create per type
  includeAllTypes?: boolean; // Create transactions for all types
  transactionTypes?: TransactionType[]; // Specific types to create
}

/**
 * Generate a random transaction hash
 */
function generateTransactionHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Generate a random wallet address
 */
function generateWalletAddress(crypto: CryptoCurrency): string {
  const prefixes: Record<string, string> = {
    BTC: 'bc1q',
    ETH: '0x',
    USDT: '0x',
    USDC: '0x',
    XRP: 'r',
    SOL: '',
  };

  const prefix = prefixes[crypto] || '';
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let address = prefix;
  
  const length = crypto === 'BTC' ? 42 : crypto === 'ETH' || crypto === 'USDT' || crypto === 'USDC' ? 40 : crypto === 'XRP' ? 33 : 44;
  
  for (let i = address.length; i < length; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return address;
}

/**
 * Create a single demo transaction
 */
export async function createDemoTransaction(
  params: DemoTransactionParams
): Promise<{ success: boolean; transaction_id?: string; error?: string }> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session || !session.user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const userId = session.user.id;
    const {
      transaction_type,
      crypto_currency = 'BTC',
      amount,
      status = 'COMPLETED',
      daysAgo = 0,
    } = params;

    // Generate random amounts if not provided
    let cryptoAmount: number | undefined;
    let fiatAmount: number | undefined;
    let feeAmount: number | undefined;

    if (transaction_type === 'DEPOSIT' || transaction_type === 'WITHDRAWAL') {
      // Fiat transactions
      fiatAmount = amount || Math.floor(Math.random() * 100000) + 1000; // ₦1,000 - ₦100,000
      feeAmount = fiatAmount * 0.03; // 3% fee
    } else if (transaction_type === 'BUY' || transaction_type === 'SELL') {
      // Buy/Sell transactions
      if (transaction_type === 'BUY') {
        fiatAmount = amount || Math.floor(Math.random() * 50000) + 1000; // ₦1,000 - ₦50,000
        // Estimate crypto amount based on typical prices
        const prices: Record<string, number> = {
          BTC: 50000000, // ₦50M per BTC
          ETH: 3000000, // ₦3M per ETH
          USDT: 1420,
          USDC: 1420,
          XRP: 900,
          SOL: 200000,
        };
        const price = prices[crypto_currency] || 1000000;
        cryptoAmount = fiatAmount / price;
      } else {
        cryptoAmount = amount || Math.random() * 0.1 + 0.001; // 0.001 - 0.1 crypto
        const prices: Record<string, number> = {
          BTC: 50000000,
          ETH: 3000000,
          USDT: 1420,
          USDC: 1420,
          XRP: 900,
          SOL: 200000,
        };
        const price = prices[crypto_currency] || 1000000;
        fiatAmount = cryptoAmount * price;
      }
      feeAmount = fiatAmount * 0.03; // 3% fee
    } else if (transaction_type === 'SEND' || transaction_type === 'RECEIVE') {
      // Crypto send/receive
      cryptoAmount = amount || Math.random() * 0.01 + 0.0001; // 0.0001 - 0.01 crypto
      const prices: Record<string, number> = {
        BTC: 50000000,
        ETH: 3000000,
        USDT: 1420,
        USDC: 1420,
        XRP: 900,
        SOL: 200000,
      };
      const price = prices[crypto_currency] || 1000000;
      fiatAmount = cryptoAmount * price;
      feeAmount = cryptoAmount * 0.001; // Network fee
    } else if (transaction_type === 'CONVERT') {
      // Convert transactions
      cryptoAmount = amount || Math.random() * 0.01 + 0.0001;
      const prices: Record<string, number> = {
        BTC: 50000000,
        ETH: 3000000,
        USDT: 1420,
        USDC: 1420,
        XRP: 900,
        SOL: 200000,
      };
      const price = prices[crypto_currency] || 1000000;
      fiatAmount = cryptoAmount * price;
      feeAmount = fiatAmount * 0.01; // 1% conversion fee
    }

    // Generate timestamps
    const now = new Date();
    const createdAt = new Date(now);
    createdAt.setDate(now.getDate() - daysAgo);
    createdAt.setHours(Math.floor(Math.random() * 24));
    createdAt.setMinutes(Math.floor(Math.random() * 60));

    const completedAt = status === 'COMPLETED' || status === 'CONFIRMED' 
      ? new Date(createdAt.getTime() + Math.random() * 60000 * 30) // 0-30 minutes later
      : null;

    const confirmedAt = status === 'CONFIRMED'
      ? new Date(completedAt!.getTime() + Math.random() * 60000 * 10) // 0-10 minutes after completion
      : null;

    // Generate addresses
    const fromAddress = transaction_type === 'SEND' || transaction_type === 'RECEIVE' || transaction_type === 'BUY'
      ? generateWalletAddress(crypto_currency)
      : undefined;

    const toAddress = transaction_type === 'SEND' || transaction_type === 'RECEIVE' || transaction_type === 'SELL'
      ? generateWalletAddress(crypto_currency)
      : undefined;

    // Generate transaction hash for blockchain transactions
    const transactionHash = (transaction_type === 'SEND' || transaction_type === 'RECEIVE' || transaction_type === 'BUY' || transaction_type === 'SELL')
      ? generateTransactionHash()
      : undefined;

    // Create metadata
    const metadata: any = {
      is_demo: true,
      demo_created_at: new Date().toISOString(),
    };

    if (transaction_type === 'DEPOSIT') {
      metadata.source = 'demo';
      metadata.deposit_amount = fiatAmount;
      metadata.fee_amount = feeAmount;
    } else if (transaction_type === 'WITHDRAWAL') {
      metadata.bank_name = 'Demo Bank';
      metadata.account_number = '****' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      metadata.withdrawal_fee = feeAmount;
    } else if (transaction_type === 'BUY') {
      metadata.exchange = 'demo';
      metadata.order_type = 'market';
    } else if (transaction_type === 'SELL') {
      metadata.exchange = 'demo';
      metadata.order_type = 'market';
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type,
        crypto_currency: transaction_type === 'DEPOSIT' || transaction_type === 'WITHDRAWAL' ? 'FIAT' : crypto_currency,
        network: 'mainnet',
        crypto_amount: cryptoAmount?.toString(),
        fiat_amount: fiatAmount?.toString(),
        fiat_currency: 'NGN',
        fee_amount: feeAmount?.toString(),
        fee_percentage: transaction_type === 'DEPOSIT' || transaction_type === 'WITHDRAWAL' ? 3 : transaction_type === 'CONVERT' ? 1 : undefined,
        fee_currency: transaction_type === 'DEPOSIT' || transaction_type === 'WITHDRAWAL' ? 'NGN' : crypto_currency,
        status,
        from_address: fromAddress,
        to_address: toAddress,
        transaction_hash: transactionHash,
        confirmations: status === 'CONFIRMED' ? Math.floor(Math.random() * 6) + 1 : status === 'COMPLETED' ? 0 : undefined,
        external_reference: `DEMO-${transaction_type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        metadata,
        created_at: createdAt.toISOString(),
        completed_at: completedAt?.toISOString(),
        confirmed_at: confirmedAt?.toISOString(),
      })
      .select()
      .single();

    if (txError) {
      console.error('❌ Demo: Error creating transaction:', txError);
      return {
        success: false,
        error: 'Failed to create transaction',
      };
    }

    console.log('✅ Demo: Transaction created:', transaction.id);

    return {
      success: true,
      transaction_id: transaction.id,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception creating transaction:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Create multiple demo transactions
 */
export async function createDemoTransactions(
  params: CreateDemoTransactionsParams
): Promise<{ success: boolean; created: number; errors: string[] }> {
  try {
    const {
      userId,
      count = 5,
      includeAllTypes = true,
      transactionTypes,
    } = params;

    const types: TransactionType[] = includeAllTypes
      ? ['BUY', 'SELL', 'SEND', 'RECEIVE', 'DEPOSIT', 'WITHDRAWAL', 'CONVERT']
      : transactionTypes || [];

    const cryptos: CryptoCurrency[] = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
    const statuses: TransactionStatus[] = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'PENDING', 'CONFIRMED']; // Mostly completed

    let created = 0;
    const errors: string[] = [];

    for (const type of types) {
      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(Math.random() * 30); // Random date within last 30 days
        const crypto = type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 'FIAT' : cryptos[Math.floor(Math.random() * cryptos.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const result = await createDemoTransaction({
          transaction_type: type,
          crypto_currency: crypto as CryptoCurrency,
          status,
          daysAgo,
        });

        if (result.success) {
          created++;
        } else {
          errors.push(`${type} #${i + 1}: ${result.error}`);
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: true,
      created,
      errors,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception creating transactions:', error);
    return {
      success: false,
      created: 0,
      errors: [error.message || 'Unknown error occurred'],
    };
  }
}

/**
 * Create a set of demo transactions for quick testing
 */
export async function createQuickDemoTransactions(): Promise<{ success: boolean; created: number; errors: string[] }> {
  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session || !session.user) {
    return {
      success: false,
      created: 0,
      errors: ['Not authenticated'],
    };
  }

  return createDemoTransactions({
    userId: session.user.id,
    count: 3, // 3 transactions per type
    includeAllTypes: true,
  });
}
