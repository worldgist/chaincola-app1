import { createClient } from '@/lib/supabase/client';

// Types
export interface User {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  phone_number: string | null;
  account_status: string;
  total_btc_balance: number;
  total_eth_balance: number;
  total_usdt_balance: number;
  total_usdc_balance: number;
  /** Present on list users from admin-user-management; optional on some detail payloads */
  total_sol_balance?: number;
  total_ngn_balance: number;
  created_at: string;
  email_verified: boolean;
  pin_setup_completed: boolean;
  last_activity: string | null;
}

export interface Transaction {
  id: string;
  transaction_id: string;
  user_id: string;
  type: string;
  status: string;
  currency: string;
  amount: number;
  fee: number;
  net_amount: number;
  created_at: string;
  updated_at: string;
  // Optional fields present in some API responses
  transaction_type?: string;
  recipient_address?: string;
  sender_address?: string;
  crypto_hash?: string;
  // user_profile may come from joined user_profiles; allow phone_number to be undefined or null
  user_profile?: {
    full_name?: string;
    email?: string;
    phone_number?: string | null | undefined;
    [key: string]: any;
  };
  user?: string;
  description?: string;
  completed_at?: string;
  metadata?: any;
  [key: string]: any;
}

export type CryptoDepositMonitorBucket = 'incoming' | 'delivered' | 'failed';

/** Maps `transactions.status` to admin deposit monitor lanes (incoming = not finalized). */
export function mapTransactionStatusToDepositMonitor(raw: string | null | undefined): CryptoDepositMonitorBucket {
  const s = (raw || '').toUpperCase();
  if (['CONFIRMED', 'COMPLETED', 'SUCCESS'].includes(s)) return 'delivered';
  if (['FAILED', 'CANCELLED', 'REJECTED', 'ERROR'].includes(s)) return 'failed';
  return 'incoming';
}

export interface CryptoOverview {
  total_users: number;
  users_with_balance?: number;
  /** Users with balance in any of BTC, ETH, USDT, USDC, XRP, SOL (excludes TRX-only holders). */
  users_with_listed_crypto_balance?: number;
  total_balance: number;
  by_currency: Record<string, number>;
  user_allocated_balances?: {
    btc?: number;
    eth?: number;
    usdt?: number;
    usdc?: number;
    xrp?: number;
    trx?: number;
    sol?: number;
  };
  /** Sum of `wallets.ngn_balance` for all users (admin-visible rows). */
  total_user_ngn_balance?: number;
}

export interface DashboardStats {
  total_users: number;
  active_users: number;
  total_transactions: number;
  total_volume: number;
  revenue: number;
  // optional growth fields used by dashboard UI
  users_growth?: number;
  transactions_growth?: number;
  revenue_growth?: number;
  [key: string]: any;
}

export interface QuickStats {
  users_today: number;
  transactions_today: number;
  volume_today: number;
  revenue_today: number;
  pending_withdrawals?: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  response_time: number;
  errors: number;
  /** Optional fields from admin system-health / dashboard payloads */
  edge_functions_status?: string;
  database_status?: string;
  storage_used?: number;
  storage_limit?: number;
  api_calls_today?: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  // Additional optional fields returned by API or used in UI
  metadata?: any;
  body?: string;
  status?: string;
  category?: string;
  read?: boolean;
  action_url?: string;
  updated_at?: string;
  read_at?: string | null;
  user_name?: string;
  user_email?: string;
  data?: any;
  [key: string]: any;
}

export interface NotificationStats {
  total: number;
  unread: number;
  by_type: Record<string, number>;
  // optional fields used by the dashboard
  total_notifications?: number;
  unread_count?: number;
  sent_24h?: number;
  sent_7d?: number;
  stats?: any;
  [key: string]: any;
}


export interface ReferralCode {
  id: string;
  user_id: string;
  referral_code: string;
  created_at: string;
  // optional display fields
  full_name?: string;
  email?: string;
  total_referrals?: number;
  total_earnings?: number;
  [key: string]: any;
}

export interface ReferralOverview {
  total_referrals: number;
  total_earnings: number;
  active_referrers: number;
}

export interface ReferralStats {
  total_referrals: number;
  total_earnings: number;
  by_status: Record<string, number>;
}

export interface TopReferrer {
  user_id: string;
  name: string;
  email: string;
  total_referrals: number;
  total_earnings: number;
  referral_code?: string;
  pending_earnings?: number;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  // optional fields used by dashboard
  last_message_at?: string;
  user_profiles?: any;
  assigned_to?: string | null;
  updated_at?: string;
  resolved_at?: string | null;
  assigned_admin?: any;
  message_count?: number;
  [key: string]: any;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin: boolean;
  created_at: string;
  // optional fields
  is_read?: boolean;
  read_at?: string | null;
  user_profiles?: any;
  [key: string]: any;
}

export interface ChatStatistics {
  total_tickets: number;
  open_tickets: number;
  resolved_tickets: number;
  average_response_time: number;
  // optional fields used by dashboard
  total?: number;
  by_status?: Record<string, number>;
  unread_messages?: number;
  [key: string]: any;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  created_at: string;
  // optional fields used by UI
  metadata?: any;
  user_profiles?: any;
  processed_at?: string | null;
  processed_by?: string | null;
  bank_account_id?: string | null;
  admin_notes?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

export interface WithdrawalStats {
  total_withdrawals: number;
  pending_withdrawals: number;
  approved_withdrawals: number;
  rejected_withdrawals?: number;
  total_amount: number;
}

export interface AppSettings {
  app_name: string;
  maintenance_mode: boolean;
  transaction_fee: number;
  support_email: string;
  support_phone: string;
  support_address?: string;
  privacy_policy?: string | null;
  terms_and_conditions?: string | null;
  app_version?: string;
  registration_enabled?: boolean;
  withdrawal_fee?: number;
  /** JSON blob (treasury risk, crypto flags, etc.) */
  additional_settings?: Record<string, unknown> | null;
  [key: string]: any;
}

/** Stored under `app_settings.additional_settings.crypto_asset_status` */
export type CryptoAssetRuntimeStatus = 'active' | 'inactive' | 'maintenance';

const CRYPTO_ASSET_STATUS_SYMBOLS = [
  'BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX',
] as const;

/** Normalize DB JSON to a full map (defaults to active). */
export function normalizeCryptoAssetStatusMap(
  additional_settings: unknown
): Record<string, CryptoAssetRuntimeStatus> {
  const nested =
    additional_settings &&
    typeof additional_settings === 'object' &&
    'crypto_asset_status' in additional_settings
      ? (additional_settings as { crypto_asset_status?: Record<string, string> }).crypto_asset_status
      : undefined;

  const out: Record<string, CryptoAssetRuntimeStatus> = {};
  for (const sym of CRYPTO_ASSET_STATUS_SYMBOLS) {
    const raw = nested?.[sym] ?? nested?.[sym.toLowerCase()];
    const v = String(raw ?? 'active').toLowerCase();
    if (v === 'inactive' || v === 'maintenance') {
      out[sym] = v;
    } else {
      out[sym] = 'active';
    }
  }
  return out;
}

export function cryptoAssetStatusToDisplay(
  s: CryptoAssetRuntimeStatus
): 'Active' | 'Inactive' | 'Maintenance' {
  switch (s) {
    case 'inactive':
      return 'Inactive';
    case 'maintenance':
      return 'Maintenance';
    default:
      return 'Active';
  }
}

/** Stored under `app_settings.additional_settings.admin_crypto_price_overrides_ngn` */
export type AdminCryptoPriceOverrideRow = { buy_ngn: number; sell_ngn: number };

const ADMIN_CRYPTO_PRICE_OVERRIDES_KEY = 'admin_crypto_price_overrides_ngn';

const ADMIN_LIST_PRICE_SYMBOLS = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const;

/** Parse admin-published NGN buy/sell list prices (per 1 coin). Missing symbols mean "use live market". */
export function parseAdminCryptoPriceOverrides(
  additional_settings: unknown
): Partial<Record<string, AdminCryptoPriceOverrideRow>> {
  const nested =
    additional_settings &&
    typeof additional_settings === 'object' &&
    ADMIN_CRYPTO_PRICE_OVERRIDES_KEY in additional_settings
      ? (additional_settings as Record<string, unknown>)[ADMIN_CRYPTO_PRICE_OVERRIDES_KEY]
      : undefined;
  const out: Partial<Record<string, AdminCryptoPriceOverrideRow>> = {};
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return out;
  for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
    const sym = k.toUpperCase();
    if (!(ADMIN_LIST_PRICE_SYMBOLS as readonly string[]).includes(sym)) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const buy = Number(o.buy_ngn ?? o.buy);
    const sell = Number(o.sell_ngn ?? o.sell);
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) continue;
    out[sym] = { buy_ngn: buy, sell_ngn: sell };
  }
  return out;
}

// API Response Types
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: any;
}

// A flexible paginated response type. Some API functions return { items: T[] , pagination } under data,
// others return data: { <plural-name>: T[], pagination: {...} }, and older code sometimes returns top-level
// fields like `transactions`, `pagination`, `total`, `page`, `limit`.
export interface PaginatedResponse<T> {
  success: boolean;
  // data can be a plain array, or an object with named arrays + pagination
  data?: T[] | { [key: string]: any; pagination?: Pagination } | { items?: T[]; pagination?: Pagination };
  // backward-compatible top-level fields
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
  pagination?: Pagination;
  error?: string;
  [key: string]: any;
}

export interface PaginatedUsersResponse {
  users: User[];
  pagination: Pagination;
  [key: string]: any;
}

// Helper function to call edge function
async function callAdminFunction<T = unknown>(action: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    if (!supabaseUrl) {
      return { success: false, error: 'Supabase URL not configured' };
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/admin-user-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...((body as any) || {}) }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      // Handle network errors gracefully - narrow to Error when possible
      const fe = fetchError as Error | undefined;
      const msg = fe?.message ?? String(fetchError);

      if (msg.includes('timeout') || msg.includes('AbortError')) {
        return { success: false, error: 'Request timeout. Please try again.' };
      }

      if (msg.includes('Failed to fetch') || msg.includes('Network request failed') || msg.toLowerCase().includes('network')) {
        return { success: false, error: 'Network error. Please check your internet connection and try again.' };
      }

      // Re-throw other errors
      throw fetchError;
    }

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const errorBody = await response.json();
        errorMessage = (errorBody && (errorBody.error || errorBody.message)) || `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      return { success: false, error: errorMessage };
    }

    // Try to parse json and cast to ApiResponse<T>
    const parsed = await response.json();
    return parsed as ApiResponse<T>;
  } catch (error: unknown) {
    // Catch any other unexpected errors
    const err = error as Error | undefined;
    console.error('Error in callAdminFunction:', error);
    return { 
      success: false, 
      error: err?.message || 'An unexpected error occurred. Please try again.' 
    };
  }
}

// Admin API
export const adminApi = {
  getUsers: async (params?: { page?: number; limit?: number; search?: string; status?: string; sort_by?: string; sort_order?: string }): Promise<ApiResponse<PaginatedUsersResponse>> => {
    try {
      const result = await callAdminFunction<PaginatedUsersResponse>('getUsers', {
        page: params?.page || 1,
        limit: params?.limit || 20,
        search: params?.search,
        status: params?.status,
      });

      if (result.success && result.data) {
        return {
          success: true,
          data: {
            users: result.data.users || [],
            pagination: result.data.pagination || {
              page: params?.page || 1,
              limit: params?.limit || 20,
              total: 0,
              pages: 0,
            },
          },
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to fetch users',
      };
    } catch (error: any) {
      console.error('Error fetching users:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch users',
      };
    }
  },

  getUserDetails: async (userId: string): Promise<ApiResponse<User>> => {
    try {
      const result = await callAdminFunction<User>('getUserDetails', { userId });

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to fetch user details',
      };
    } catch (error: any) {
      console.error('Error fetching user details:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch user details',
      };
    }
  },

  suspendUser: async (userId: string): Promise<ApiResponse<void>> => {
    try {
      const result = await callAdminFunction('suspendUser', { userId });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Failed to suspend user',
      };
    } catch (error: any) {
      console.error('Error suspending user:', error);
      return {
        success: false,
        error: error.message || 'Failed to suspend user',
      };
    }
  },

  activateUser: async (userId: string): Promise<ApiResponse<void>> => {
    try {
      const result = await callAdminFunction('activateUser', { userId });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Failed to activate user',
      };
    } catch (error: any) {
      console.error('Error activating user:', error);
      return {
        success: false,
        error: error.message || 'Failed to activate user',
      };
    }
  },

  deleteUser: async (userId: string, permanent: boolean = false): Promise<ApiResponse<void>> => {
    try {
      const result = await callAdminFunction('deleteUser', { userId, permanent });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Failed to delete user',
      };
    } catch (error: any) {
      console.error('Error deleting user:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete user',
      };
    }
  },

  creditBalance: async (userId: string, amount: number, currency: string, reason: string): Promise<ApiResponse<void>> => {
    try {
      const result = await callAdminFunction('creditBalance', { userId, amount, currency, reason });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Failed to credit balance',
      };
    } catch (error: any) {
      console.error('Error crediting balance:', error);
      return {
        success: false,
        error: error.message || 'Failed to credit balance',
      };
    }
  },

  debitBalance: async (userId: string, amount: number, currency: string, reason: string): Promise<ApiResponse<void>> => {
    try {
      const result = await callAdminFunction('debitBalance', { userId, amount, currency, reason });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Failed to debit balance',
      };
    } catch (error: any) {
      console.error('Error debiting balance:', error);
      return {
        success: false,
        error: error.message || 'Failed to debit balance',
      };
    }
  },
};

// Transactions API
export const transactionsApi = {
  getTransactions: async (params?: { 
    page?: number; 
    limit?: number; 
    filter?: string; 
    type?: string; 
    currency?: string; 
    search?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    status_filter?: string;
    /** If set, restricts to these DB status values (uppercase). Takes precedence over status_filter when non-empty. */
    status_in?: string[];
    transaction_type?: string;
    currency_filter?: string;
    search_query?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    /** When true, only on-chain crypto receipts (excludes fiat-style rows). */
    crypto_receive_only?: boolean;
  }): Promise<PaginatedResponse<Transaction>> => {
    try {
      const supabase = createClient();
      
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Authentication error: ${sessionError.message}`);
      }

      if (!session) {
        return {
          success: false,
          data: {
            transactions: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: 'Not authenticated',
        };
      }

      const page = params?.page || 1;
      const limit = params?.limit || 50;
      const offset = (page - 1) * limit;

      // Build query - fetch transactions first
      // Note: We can't directly join user_profiles because they both reference auth.users
      // We'll fetch user profiles separately and join in code
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' });

      // Apply filters
      if (params?.user_id) {
        query = query.eq('user_id', params.user_id);
      }

      if (params?.status_in && params.status_in.length > 0) {
        const normalized = params.status_in.map((s) => s.toUpperCase().trim()).filter(Boolean);
        query = query.in('status', normalized);
      } else if (params?.status_filter) {
        query = query.eq('status', params.status_filter.toUpperCase());
      }

      if (params?.crypto_receive_only) {
        query = query.eq('transaction_type', 'RECEIVE').not('crypto_currency', 'in', '(NGN,USD,FIAT)');
      } else if (params?.transaction_type) {
        query = query.eq('transaction_type', params.transaction_type.toUpperCase());
      }

      if (params?.currency_filter) {
        query = query.eq('crypto_currency', params.currency_filter.toUpperCase());
      }

      if (params?.date_from) {
        query = query.gte('created_at', params.date_from);
      }

      if (params?.date_to) {
        query = query.lte('created_at', params.date_to);
      }

      // Search query (search in transaction hash, external IDs)
      // Note: User name/email search would require a more complex query with joins
      if (params?.search_query || params?.search) {
        const searchTerm = params.search_query || params.search || '';
        query = query.or(`transaction_hash.ilike.%${searchTerm}%,external_order_id.ilike.%${searchTerm}%,external_transaction_id.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`);
      }

      // Sorting
      const sortBy = params?.sort_by || 'created_at';
      const sortOrder = params?.sort_order || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching transactions:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return {
          success: false,
          data: {
            transactions: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: error.message || 'Failed to fetch transactions',
        };
      }

      // Fetch user profiles for all unique user_ids
      const userIds = [...new Set((data || []).map((tx: any) => tx.user_id))];
      let userProfilesMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email, phone_number')
          .in('user_id', userIds);

        if (!profilesError && profilesData) {
          profilesData.forEach((profile: any) => {
            userProfilesMap[profile.user_id] = profile;
          });
        }
      }

      // Transform data to match Transaction interface
      const transactions: Transaction[] = (data || []).map((tx: any) => {
        const userProfile = userProfilesMap[tx.user_id];
        
        // Determine currency and amount based on transaction type
        // For BUY/SELL transactions, use fiat_currency (NGN) for display since amounts are in NGN
        // For RECEIVE transactions with fiat_amount, use fiat_currency (NGN) for display
        // For other crypto transactions (SEND), use crypto_currency
        const txType = tx.transaction_type?.toUpperCase();
        const isBuyOrSell = txType === 'BUY' || txType === 'SELL';
        const isReceive = txType === 'RECEIVE';
        const isFiatOnly = tx.crypto_currency === 'FIAT' || !tx.crypto_currency;
        
        let currency: string;
        let amount: number;
        
        if (isBuyOrSell) {
          // BUY/SELL: Use fiat_currency (NGN) and fiat_amount for display
          currency = tx.fiat_currency || 'NGN';
          amount = parseFloat(tx.fiat_amount || '0');
        } else if (isReceive && tx.fiat_amount && tx.fiat_currency === 'NGN') {
          // RECEIVE: If fiat_amount exists in NGN, use NGN for display (amount is in NGN)
          currency = 'NGN';
          amount = parseFloat(tx.fiat_amount);
        } else if (isFiatOnly || txType === 'DEPOSIT') {
          // Fiat-only transactions: Use fiat_currency
          currency = tx.fiat_currency || 'NGN';
          amount = parseFloat(tx.fiat_amount || '0');
        } else {
          // Other crypto transactions (SEND, etc.): Use crypto_currency
          currency = tx.crypto_currency || tx.fiat_currency || 'NGN';
          amount = tx.fiat_amount ? parseFloat(tx.fiat_amount) : parseFloat(tx.crypto_amount || '0');
        }
        
        return {
          id: tx.id,
          transaction_id: tx.id,
          user_id: tx.user_id,
          type: tx.transaction_type?.toLowerCase() || '',
          status: tx.status?.toLowerCase() || 'pending',
          currency: currency,
          amount: amount,
          fee: parseFloat(tx.fee_amount || '0'),
          net_amount: amount - parseFloat(tx.fee_amount || '0'),
          created_at: tx.created_at,
          updated_at: tx.updated_at,
          // Additional fields for display
          user_profile: userProfile ? {
            full_name: userProfile.full_name,
            email: userProfile.email,
            phone_number: userProfile.phone_number,
          } : undefined,
          transaction_type: tx.transaction_type,
          crypto_currency: tx.crypto_currency,
          fiat_amount: tx.fiat_amount,
          crypto_amount: tx.crypto_amount,
          transaction_hash: tx.transaction_hash,
          from_address: tx.from_address,
          to_address: tx.to_address,
          metadata: tx.metadata,
          confirmations: tx.confirmations,
          block_number: tx.block_number,
          network: tx.network,
          error_message: tx.error_message,
        };
      });

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          transactions: transactions,
          pagination: {
            page,
            limit,
            total,
            pages: totalPages,
          },
        },
        // Also include at top level for backward compatibility
        transactions: transactions,
        total,
        page,
        limit,
        pages: totalPages,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching transactions:', error);
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      // Provide more helpful error messages
      let errorMessage = error?.message || 'Failed to fetch transactions';
      
      if (error?.message?.includes('Failed to fetch') || error?.name === 'TypeError') {
        errorMessage = 'Network error: Unable to connect to Supabase. Please check your internet connection and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly.';
        console.error('Network error detected. Check:');
        console.error('- Internet connection');
        console.error('- Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing');
        console.error('- Supabase Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing');
      }
      
      return {
        success: false,
        data: {
          transactions: [],
          pagination: {
            page: params?.page || 1,
            limit: params?.limit || 50,
            total: 0,
            pages: 0,
          },
        },
        error: errorMessage,
      };
    }
  },

  getCryptoDepositMonitorStats: async (): Promise<
    ApiResponse<{
      incoming: number;
      delivered: number;
      failed: number;
      total: number;
    }>
  > => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }
      const base = () =>
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('transaction_type', 'RECEIVE')
          .not('crypto_currency', 'in', '(NGN,USD,FIAT)');
      const [incomingRes, deliveredRes, failedRes, totalRes] = await Promise.all([
        base().in('status', ['PENDING', 'CONFIRMING', 'PROCESSING']),
        base().in('status', ['CONFIRMED', 'COMPLETED', 'SUCCESS']),
        base().in('status', ['FAILED', 'CANCELLED', 'REJECTED', 'ERROR']),
        base(),
      ]);
      const pick = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
      if (incomingRes.error) console.warn('getCryptoDepositMonitorStats incoming:', incomingRes.error);
      if (deliveredRes.error) console.warn('getCryptoDepositMonitorStats delivered:', deliveredRes.error);
      if (failedRes.error) console.warn('getCryptoDepositMonitorStats failed:', failedRes.error);
      if (totalRes.error) console.warn('getCryptoDepositMonitorStats total:', totalRes.error);
      return {
        success: true,
        data: {
          incoming: pick(incomingRes.count),
          delivered: pick(deliveredRes.count),
          failed: pick(failedRes.count),
          total: pick(totalRes.count),
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, error: err?.message || 'Failed to load deposit stats' };
    }
  },

  getTransactionStats: async (): Promise<ApiResponse<{
    total: number;
    by_status: { pending: number; completed: number; failed: number };
    by_type: { deposit: number; withdrawal: number; send: number; receive: number; buy: number; sell: number };
    /** Sum of fiat_amount (NGN) for completed NGN transactions — platform volume, not fees */
    volume: { ngn: number };
    /** Sum of fee_amount (NGN) for completed transactions — actual fee revenue */
    fee_revenue_ngn: number;
  }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get total count
      const { count: total, error: totalError } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      if (totalError) {
        throw totalError;
      }

      // Get counts by status
      const { count: pendingCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      const { count: completedCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'COMPLETED');

      const { count: failedCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'FAILED');

      // Get counts by type
      const { count: depositCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'DEPOSIT');

      const { count: withdrawalCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'WITHDRAWAL');

      const { count: sendCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'SEND');

      const { count: receiveCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'RECEIVE');

      const { count: buyCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'BUY');

      const { count: sellCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_type', 'SELL');

      // Get total volume (sum of fiat_amount for completed transactions)
      const { data: volumeData, error: volumeError } = await supabase
        .from('transactions')
        .select('fiat_amount')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN');

      let ngnVolume = 0;
      if (!volumeError && volumeData) {
        ngnVolume = volumeData.reduce((sum, tx) => {
          return sum + parseFloat(tx.fiat_amount || '0');
        }, 0);
      }

      const { data: feeRows, error: feeError } = await supabase
        .from('transactions')
        .select('fee_amount, fiat_currency')
        .eq('status', 'COMPLETED');

      let feeRevenueNgn = 0;
      if (!feeError && feeRows) {
        feeRevenueNgn = feeRows.reduce((sum, tx) => {
          const row = tx as { fee_amount?: string | null; fiat_currency?: string | null };
          const fee = parseFloat(row.fee_amount || '0');
          const cur = String(row.fiat_currency || '').toUpperCase();
          // Count fees on NGN legs and legacy rows with no fiat_currency set
          if (!cur || cur === 'NGN') return sum + fee;
          return sum;
        }, 0);
      }

      return {
        success: true,
        data: {
          total: total || 0,
          by_status: {
            pending: pendingCount || 0,
            completed: completedCount || 0,
            failed: failedCount || 0,
          },
          by_type: {
            deposit: depositCount || 0,
            withdrawal: withdrawalCount || 0,
            send: sendCount || 0,
            receive: receiveCount || 0,
            buy: buyCount || 0,
            sell: sellCount || 0,
          },
          volume: {
            ngn: ngnVolume,
          },
          fee_revenue_ngn: feeRevenueNgn,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching transaction stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch transaction stats',
      };
    }
  },

  updateTransactionStatus: async (
    transactionId: string,
    status: 'completed' | 'failed' | 'pending' | 'cancelled',
    reason?: string
  ): Promise<ApiResponse<Transaction>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get the transaction first to check its current status and type
      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (fetchError || !transaction) {
        return {
          success: false,
          error: fetchError?.message || 'Transaction not found',
        };
      }

      // Prepare update data
      const updateData: any = {
        status: status.toUpperCase(),
        updated_at: new Date().toISOString(),
      };

      // Set completed_at if status is being changed to COMPLETED
      if (status === 'completed' && transaction.status !== 'COMPLETED') {
        updateData.completed_at = new Date().toISOString();
      }

      // Add error message if status is FAILED
      if (status === 'failed' && reason) {
        updateData.error_message = reason;
      }

      // Update the transaction
      const { data: updatedTransaction, error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transactionId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating transaction status:', updateError);
        return {
          success: false,
          error: updateError.message || 'Failed to update transaction status',
        };
      }

      // Log admin action for audit
      const { error: auditLogError } = await supabase.from('admin_action_logs').insert({
        admin_user_id: session.user.id,
        target_user_id: transaction.user_id,
        action_type: 'transaction_status_update',
        action_details: {
          transaction_id: transactionId,
          old_status: transaction.status,
          new_status: status.toUpperCase(),
          reason: reason || undefined,
        },
      });
      if (auditLogError) {
        console.error('Failed to log admin action:', auditLogError);
      }

      // If completing a DEPOSIT transaction, credit the wallet
      if (status === 'completed' && transaction.transaction_type === 'DEPOSIT' && transaction.fiat_amount) {
        try {
          // Calculate deposit fee (5%)
          const depositFeeRate = 0.05;
          const depositFee = parseFloat(transaction.fiat_amount) * depositFeeRate;
          const netAmount = parseFloat(transaction.fiat_amount) - depositFee;
          const currency = transaction.fiat_currency || 'NGN';

          // Update transaction metadata with fee information
          await supabase
            .from('transactions')
            .update({
              metadata: {
                ...(transaction.metadata || {}),
                deposit_fee: depositFee,
                deposit_fee_rate: depositFeeRate,
                gross_amount: transaction.fiat_amount,
                net_amount: netAmount,
                manually_completed: true,
                completed_by_admin: session.user.id,
              },
            })
            .eq('id', transactionId);

          // Credit user wallet with net amount (after fee deduction)
          const { error: creditError } = await supabase.rpc('credit_wallet', {
            p_user_id: transaction.user_id,
            p_amount: netAmount,
            p_currency: currency,
          });

          if (creditError) {
            console.error('Error crediting wallet:', creditError);
            // Revert transaction status
            await supabase
              .from('transactions')
              .update({
                status: 'FAILED',
                error_message: 'Failed to credit wallet: ' + creditError.message,
              })
              .eq('id', transactionId);

            return {
              success: false,
              error: 'Failed to credit wallet: ' + creditError.message,
            };
          }
        } catch (walletError: any) {
          console.error('Error processing wallet credit:', walletError);
          return {
            success: false,
            error: 'Failed to process wallet credit: ' + walletError.message,
          };
        }
      }

      // Transform to Transaction interface
      const result: Transaction = {
        id: updatedTransaction.id,
        transaction_id: updatedTransaction.id,
        user_id: updatedTransaction.user_id,
        type: updatedTransaction.transaction_type?.toLowerCase() || '',
        status: updatedTransaction.status?.toLowerCase() || 'pending',
        currency: updatedTransaction.crypto_currency || updatedTransaction.fiat_currency || 'NGN',
        amount: parseFloat(updatedTransaction.fiat_amount || updatedTransaction.crypto_amount || '0'),
        fee: parseFloat(updatedTransaction.fee_amount || '0'),
        net_amount: parseFloat(updatedTransaction.fiat_amount || updatedTransaction.crypto_amount || '0') - parseFloat(updatedTransaction.fee_amount || '0'),
        created_at: updatedTransaction.created_at,
        updated_at: updatedTransaction.updated_at,
      };

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Exception updating transaction status:', error);
      return {
        success: false,
        error: error.message || 'Failed to update transaction status',
      };
    }
  },

  refundTransaction: async (transactionId: string, reason?: string): Promise<ApiResponse<{
    refunded_amount: number;
    refunded_currency: string;
    new_balance: number;
  }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Call the refund function
      const { data, error } = await supabase.rpc('admin_refund_transaction', {
        p_transaction_id: transactionId,
        p_admin_user_id: session.user.id,
        p_refund_reason: reason || 'Admin refund for failed transaction',
      });

      if (error) {
        console.error('Error refunding transaction:', error);
        return {
          success: false,
          error: error.message || 'Failed to refund transaction',
        };
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          error: 'No data returned from refund function',
        };
      }

      const result = data[0];

      if (!result.success) {
        return {
          success: false,
          error: result.error_message || 'Refund failed',
        };
      }

      return {
        success: true,
        data: {
          refunded_amount: parseFloat(result.refunded_amount?.toString() || '0'),
          refunded_currency: result.refunded_currency || '',
          new_balance: parseFloat(result.new_balance?.toString() || '0'),
        },
      };
    } catch (error: any) {
      console.error('Exception refunding transaction:', error);
      return {
        success: false,
        error: error.message || 'Failed to refund transaction',
      };
    }
  },

  getTransactionAuditLogs: async (params?: {
    page?: number;
    limit?: number;
    transaction_id?: string;
    action_type?: string;
  }): Promise<ApiResponse<{
    logs: Array<{
      id: string;
      admin_user_id: string;
      admin_email?: string;
      target_user_id: string;
      target_email?: string;
      action_type: string;
      action_details: Record<string, unknown>;
      created_at: string;
    }>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const page = params?.page || 1;
      const limit = params?.limit || 50;
      const offset = (page - 1) * limit;

      // Build query - transaction-related actions only (refund, transaction_status_update)
      let query = supabase
        .from('admin_action_logs')
        .select('id, admin_user_id, target_user_id, action_type, action_details, created_at', { count: 'exact' })
        .in('action_type', ['refund', 'transaction_status_update'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (params?.transaction_id) {
        query = query.filter('action_details->>transaction_id', 'eq', params.transaction_id);
      }
      if (params?.action_type) {
        query = query.eq('action_type', params.action_type);
      }

      const { data: logs, error, count: totalCount } = await query;

      if (error) {
        console.error('Error fetching audit logs:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch audit logs',
        };
      }

      // Fetch admin and target user emails for display
      const adminIds = [...new Set((logs || []).map((l: { admin_user_id: string }) => l.admin_user_id))];
      const targetIds = [...new Set((logs || []).map((l: { target_user_id: string }) => l.target_user_id).filter(Boolean))];
      const allIds = [...new Set([...adminIds, ...targetIds])].filter(Boolean);

      let profileMap: Record<string, string> = {};
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, email')
          .in('user_id', allIds);
        profileMap = (profiles || []).reduce((acc: Record<string, string>, p: { user_id: string; email: string }) => {
          acc[p.user_id] = p.email || '';
          return acc;
        }, {});
      }

      type AuditLogEntry = {
        id: string;
        admin_user_id: string;
        admin_email?: string;
        target_user_id: string;
        target_email?: string;
        action_type: string;
        action_details: Record<string, unknown>;
        created_at: string;
      };
      const enrichedLogs = (logs || []).map((log) => ({
        ...log,
        admin_email: profileMap[log.admin_user_id],
        target_email: profileMap[log.target_user_id],
      })) as AuditLogEntry[];

      const total = totalCount ?? (logs?.length ?? 0);

      return {
        success: true,
        data: {
          logs: enrichedLogs,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Exception fetching audit logs:', err);
      return {
        success: false,
        error: err?.message || 'Failed to fetch audit logs',
      };
    }
  },
};

// Crypto API
export const cryptoApi = {
  getCryptoOverview: async (): Promise<ApiResponse<CryptoOverview>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get total users
      const { count: totalUsers } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      // Get crypto balances from wallet_balances table (where currency is crypto)
      const { data: walletBalances, error: walletBalancesError } = await supabase
        .from('wallet_balances')
        .select('currency, balance, user_id')
        .in('currency', ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'TRX', 'SOL', 'btc', 'eth', 'usdt', 'usdc', 'xrp', 'trx', 'sol']);

      let totalBalance = 0;
      const byCurrency: Record<string, number> = {};
      const userAllocatedBalances: {
        btc?: number;
        eth?: number;
        usdt?: number;
        usdc?: number;
        xrp?: number;
        trx?: number;
        sol?: number;
      } = {};
      const usersWithBalance = new Set<string>();
      const LISTED_SIX = new Set(['btc', 'eth', 'usdt', 'usdc', 'xrp', 'sol']);
      const usersWithListedCryptoBalance = new Set<string>();

      if (!walletBalancesError && walletBalances) {
        walletBalances.forEach((wb: any) => {
          const balance = parseFloat(wb.balance?.toString() || '0');
          if (balance > 0) {
            const currency = wb.currency?.toUpperCase() || '';
            const currencyLower = currency.toLowerCase();
            
            totalBalance += balance;
            byCurrency[currencyLower] = (byCurrency[currencyLower] || 0) + balance;
            
            // Track users with balance
            if (wb.user_id) {
              usersWithBalance.add(wb.user_id);
              if (LISTED_SIX.has(currencyLower)) {
                usersWithListedCryptoBalance.add(wb.user_id);
              }
            }

            // Map to user_allocated_balances structure
            if (currencyLower === 'btc') {
              userAllocatedBalances.btc = (userAllocatedBalances.btc || 0) + balance;
            } else if (currencyLower === 'eth') {
              userAllocatedBalances.eth = (userAllocatedBalances.eth || 0) + balance;
            } else if (currencyLower === 'usdt') {
              userAllocatedBalances.usdt = (userAllocatedBalances.usdt || 0) + balance;
            } else if (currencyLower === 'usdc') {
              userAllocatedBalances.usdc = (userAllocatedBalances.usdc || 0) + balance;
            } else if (currencyLower === 'xrp') {
              userAllocatedBalances.xrp = (userAllocatedBalances.xrp || 0) + balance;
            } else if (currencyLower === 'trx') {
              userAllocatedBalances.trx = (userAllocatedBalances.trx || 0) + balance;
            } else if (currencyLower === 'sol') {
              userAllocatedBalances.sol = (userAllocatedBalances.sol || 0) + balance;
            }
          }
        });
      }

      let totalUserNgnBalance = 0;
      const ngnPageSize = 1000;
      let ngnOffset = 0;
      for (;;) {
        const { data: ngnRows, error: ngnErr } = await supabase
          .from('wallets')
          .select('ngn_balance')
          .range(ngnOffset, ngnOffset + ngnPageSize - 1);
        if (ngnErr) {
          console.warn('getCryptoOverview: wallets NGN sum', ngnErr);
          break;
        }
        if (!ngnRows?.length) break;
        for (const row of ngnRows) {
          totalUserNgnBalance += parseFloat(String((row as { ngn_balance?: unknown }).ngn_balance ?? 0)) || 0;
        }
        if (ngnRows.length < ngnPageSize) break;
        ngnOffset += ngnPageSize;
      }

      return {
        success: true,
        data: {
          total_users: totalUsers || 0,
          users_with_balance: usersWithBalance.size,
          users_with_listed_crypto_balance: usersWithListedCryptoBalance.size,
          total_balance: totalBalance,
          by_currency: byCurrency,
          user_allocated_balances: userAllocatedBalances,
          total_user_ngn_balance: totalUserNgnBalance,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching crypto overview:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch crypto overview',
      };
    }
  },

  getCryptoStats: async (): Promise<ApiResponse<any>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get buy transaction stats
      const { data: buyStats, error: buyError } = await supabase
        .from('buy_transactions')
        .select('crypto_currency, crypto_amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Get sell transaction stats
      const { data: sellStats, error: sellError } = await supabase
        .from('sell_transactions')
        .select('crypto_currency, crypto_amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Get transaction stats (deposits/receives)
      const { data: transactionStats, error: transactionError } = await supabase
        .from('transactions')
        .select('crypto_currency, crypto_amount, transaction_type, status, created_at')
        .in('transaction_type', ['RECEIVE', 'DEPOSIT'])
        .in('crypto_currency', ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'TRX', 'SOL'])
        .order('created_at', { ascending: false })
        .limit(1000);

      // Calculate stats by currency
      const statsByCurrency: Record<string, {
        total_bought: number;
        total_sold: number;
        total_deposited: number;
        buy_count: number;
        sell_count: number;
        deposit_count: number;
      }> = {};

      const currencies = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'TRX', 'SOL'];
      currencies.forEach(currency => {
        statsByCurrency[currency] = {
          total_bought: 0,
          total_sold: 0,
          total_deposited: 0,
          buy_count: 0,
          sell_count: 0,
          deposit_count: 0,
        };
      });

      // Process buy transactions
      if (!buyError && buyStats) {
        buyStats.forEach((tx: any) => {
          const currency = tx.crypto_currency?.toUpperCase();
          if (currency && statsByCurrency[currency]) {
            const amount = parseFloat(tx.crypto_amount?.toString() || '0');
            statsByCurrency[currency].total_bought += amount;
            if (tx.status === 'COMPLETED') {
              statsByCurrency[currency].buy_count++;
            }
          }
        });
      }

      // Process sell transactions
      if (!sellError && sellStats) {
        sellStats.forEach((tx: any) => {
          const currency = tx.crypto_currency?.toUpperCase();
          if (currency && statsByCurrency[currency]) {
            const amount = parseFloat(tx.crypto_amount?.toString() || '0');
            statsByCurrency[currency].total_sold += amount;
            if (tx.status === 'COMPLETED') {
              statsByCurrency[currency].sell_count++;
            }
          }
        });
      }

      // Process deposit transactions
      if (!transactionError && transactionStats) {
        transactionStats.forEach((tx: any) => {
          const currency = tx.crypto_currency?.toUpperCase();
          if (currency && statsByCurrency[currency]) {
            const amount = parseFloat(tx.crypto_amount?.toString() || '0');
            statsByCurrency[currency].total_deposited += amount;
            if (tx.status === 'CONFIRMED' || tx.status === 'completed') {
              statsByCurrency[currency].deposit_count++;
            }
          }
        });
      }

      return {
        success: true,
        data: {
          stats: {
            by_currency: statsByCurrency,
            total_buys: buyStats?.length || 0,
            total_sells: sellStats?.length || 0,
            total_deposits: transactionStats?.length || 0,
          },
        },
      };
    } catch (error: any) {
      console.error('Exception fetching crypto stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch crypto stats',
      };
    }
  },
};

// Dashboard API
export const dashboardApi = {
  getDashboardStats: async (): Promise<ApiResponse<DashboardStats>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get total users
      const { count: totalUsers } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      // Get active users (users who have logged in within last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: activeUsers } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', thirtyDaysAgo.toISOString());

      // Get total transactions
      const { count: totalTransactions } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      // Get total volume (sum of fiat_amount for completed transactions)
      const { data: volumeData } = await supabase
        .from('transactions')
        .select('fiat_amount')
        .eq('status', 'COMPLETED');

      let totalVolume = 0;
      if (volumeData) {
        totalVolume = volumeData.reduce((sum, tx) => {
          return sum + parseFloat(tx.fiat_amount || '0');
        }, 0);
      }

      // Get real platform revenue from admin_revenue ledger (NGN-normalized)
      const { data: revenueData } = await supabase
        .from('admin_revenue')
        .select('amount_ngn');

      let revenue = 0;
      if (revenueData) {
        revenue = revenueData.reduce((sum, row) => {
          return sum + parseFloat(String(row.amount_ngn || '0'));
        }, 0);
      }

      return {
        success: true,
        data: {
          total_users: totalUsers || 0,
          active_users: activeUsers || 0,
          total_transactions: totalTransactions || 0,
          total_volume: totalVolume,
          revenue: revenue,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching dashboard stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch dashboard stats',
      };
    }
  },

  getQuickStats: async (): Promise<ApiResponse<QuickStats>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get users created today
      const { count: usersToday } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      // Get transactions created today
      const { count: transactionsToday } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      // Get volume today (sum of fiat_amount for completed transactions today)
      const { data: volumeTodayData } = await supabase
        .from('transactions')
        .select('fiat_amount')
        .eq('status', 'COMPLETED')
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      let volumeToday = 0;
      if (volumeTodayData) {
        volumeToday = volumeTodayData.reduce((sum, tx) => {
          return sum + parseFloat(tx.fiat_amount || '0');
        }, 0);
      }

      // Get real revenue today from admin_revenue ledger
      const { data: revenueTodayData } = await supabase
        .from('admin_revenue')
        .select('amount_ngn')
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      let revenueToday = 0;
      if (revenueTodayData) {
        revenueToday = revenueTodayData.reduce((sum, row) => {
          return sum + parseFloat(String(row.amount_ngn || '0'));
        }, 0);
      }

      return {
        success: true,
        data: {
          users_today: usersToday || 0,
          transactions_today: transactionsToday || 0,
          volume_today: volumeToday,
          revenue_today: revenueToday,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching quick stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch quick stats',
      };
    }
  },

  getSystemHealth: async (): Promise<ApiResponse<SystemHealth>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Test database connection by making a simple query
      const startTime = Date.now();
      const { error: healthError } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      
      const responseTime = Date.now() - startTime;

      // Get count of failed transactions in last hour as error indicator
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const { count: recentErrors } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'FAILED')
        .gte('created_at', oneHourAgo.toISOString());

      // Determine health status
      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      if (healthError) {
        status = 'down';
      } else if (responseTime > 1000 || (recentErrors && recentErrors > 10)) {
        status = 'degraded';
      }

      // Calculate uptime (simplified - in production this would track actual uptime)
      // For now, we'll use a high value if system is healthy
      const uptime = status === 'healthy' ? 99.9 : status === 'degraded' ? 95.0 : 0;

      return {
        success: true,
        data: {
          status: status,
          uptime: uptime,
          response_time: responseTime,
          errors: recentErrors || 0,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching system health:', error);
      return {
        success: true,
        data: {
          status: 'down',
          uptime: 0,
          response_time: 0,
          errors: 0,
        },
      };
    }
  },

  getRecentTransactions: async (limit: number = 10): Promise<ApiResponse<Transaction[]>> => {
    try {
      // Use transactionsApi to get recent transactions
      const result = await transactionsApi.getTransactions({
        page: 1,
        limit,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      if (result.success && result.data) {
        const txs = Array.isArray(result.data)
          ? result.data
          : Array.isArray((result.data as any).transactions)
            ? ((result.data as any).transactions as Transaction[])
            : Array.isArray((result.data as any).items)
              ? ((result.data as any).items as Transaction[])
              : [];
        return {
          success: true,
          data: txs,
        };
      }

      return {
        success: false,
        data: [],
        error: result.error || 'Failed to fetch recent transactions',
      };
    } catch (error: any) {
      console.error('Error fetching recent transactions:', error);
      return {
        success: false,
        data: [],
        error: error.message || 'Failed to fetch recent transactions',
      };
    }
  },
};

// Notifications API
export const notificationsApi = {
  getNotifications: async (params?: { 
    page?: number; 
    limit?: number;
    type_filter?: string;
    status_filter?: string;
    read_filter?: 'read' | 'unread';
    search?: string;
  }): Promise<PaginatedResponse<Notification>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            notifications: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: 'Not authenticated',
        };
      }

      const page = params?.page || 1;
      const limit = params?.limit || 50;
      const offset = (page - 1) * limit;

      // Build query with count
      // Note: user_profiles is joined via user_id (both reference auth.users)
      // We'll fetch user_profiles separately if needed, or use a simpler query
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' });

      // Apply filters
      if (params?.type_filter) {
        query = query.eq('type', params.type_filter);
      }

      if (params?.status_filter) {
        // Note: The table uses 'status' field with values 'read'/'unread'
        // But the interface uses 'is_read' boolean, so we need to map it
        if (params.status_filter === 'read') {
          query = query.eq('status', 'read');
        } else if (params.status_filter === 'unread') {
          query = query.eq('status', 'unread');
        }
      }

      if (params?.read_filter) {
        query = query.eq('status', params.read_filter);
      }

      // Search query
      if (params?.search) {
        query = query.or(`title.ilike.%${params.search}%,message.ilike.%${params.search}%`);
      }

      // Sorting
      query = query.order('created_at', { ascending: false });

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const response = await query;

      if (response.error) {
        console.error('Error fetching notifications:', response.error);
        return {
          success: false,
          data: {
            notifications: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: response.error.message || response.error.code || 'Failed to fetch notifications',
        };
      }

      const { data, count } = response;

      // Fetch user profiles for all unique user_ids in one query
      const userIds = [...new Set((data || []).map((n: any) => n.user_id))];
      let userProfilesMap: Record<string, { full_name?: string; email?: string }> = {};
      
      if (userIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_id, full_name, email')
            .in('user_id', userIds);
          
          if (profiles) {
            profiles.forEach((profile: any) => {
              userProfilesMap[profile.user_id] = {
                full_name: profile.full_name,
                email: profile.email,
              };
            });
          }
        } catch (profileError) {
          console.warn('Could not fetch user profiles:', profileError);
          // Continue without user profiles
        }
      }

      // Transform data to match Notification interface
      const notifications: Notification[] = (data || []).map((notif: any) => ({
        id: notif.id,
        user_id: notif.user_id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        is_read: notif.status === 'read',
        created_at: notif.created_at,
        // Additional fields for display
        user_profile: userProfilesMap[notif.user_id] || undefined,
        data: notif.data,
        read_at: notif.read_at,
        updated_at: notif.updated_at,
      }));

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          notifications: notifications,
          pagination: {
            page,
            limit,
            total,
            pages: totalPages,
          },
        },
        // Also include at top level for backward compatibility
        total,
        page,
        limit,
        pages: totalPages,
      };
    } catch (error: any) {
      console.error('Exception fetching notifications:', error);
      return {
        success: false,
        data: {
          notifications: [],
          pagination: {
            page: params?.page || 1,
            limit: params?.limit || 50,
            total: 0,
            pages: 0,
          },
        },
        error: error.message || 'Failed to fetch notifications',
      };
    }
  },

  getNotificationStats: async (): Promise<ApiResponse<NotificationStats>> => {
    // TODO: Replace with your API to fetch notification stats
    return {
      success: true,
      data: {
        total: 0,
        unread: 0,
        by_type: {},
      },
    };
  },
};


// Referral API
export const referralApi = {
  getReferralOverview: async (): Promise<ApiResponse<ReferralOverview>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get total referrals count
      const { count: totalReferrals, error: countError } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error fetching total referrals:', countError);
        return {
          success: false,
          error: countError.message || 'Failed to fetch referral overview',
        };
      }

      // Get total earnings (sum of all reward amounts)
      const { data: earningsData, error: earningsError } = await supabase
        .from('referrals')
        .select('reward_amount');

      if (earningsError) {
        console.error('Error fetching earnings:', earningsError);
        return {
          success: false,
          error: earningsError.message || 'Failed to fetch referral overview',
        };
      }

      const totalEarnings = (earningsData || []).reduce((sum, ref) => {
        return sum + parseFloat(ref.reward_amount?.toString() || '0');
      }, 0);

      // Get active referrers (users who have made at least one referral)
      const { data: referrersData, error: referrersError } = await supabase
        .from('referrals')
        .select('referrer_user_id', { count: 'exact' })
        .limit(1);

      // Count distinct referrers
      const { data: distinctReferrers, error: distinctError } = await supabase
        .from('referrals')
        .select('referrer_user_id');

      if (distinctError) {
        console.error('Error fetching active referrers:', distinctError);
        return {
          success: false,
          error: distinctError.message || 'Failed to fetch referral overview',
        };
      }

      const activeReferrers = new Set((distinctReferrers || []).map(r => r.referrer_user_id)).size;

      return {
        success: true,
        data: {
          total_referrals: totalReferrals || 0,
          total_earnings: totalEarnings,
          active_referrers: activeReferrers,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching referral overview:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch referral overview',
      };
    }
  },

  getReferralStats: async (): Promise<ApiResponse<ReferralStats>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get all referrals with their status
      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select('reward_amount, reward_status');

      if (referralsError) {
        console.error('Error fetching referral stats:', referralsError);
        return {
          success: false,
          error: referralsError.message || 'Failed to fetch referral stats',
        };
      }

      // Calculate stats
      const totalReferrals = referrals?.length || 0;
      const totalEarnings = (referrals || []).reduce((sum, ref) => {
        return sum + parseFloat(ref.reward_amount?.toString() || '0');
      }, 0);

      // Group by status (count)
      const byStatus: Record<string, number> = {};
      (referrals || []).forEach(ref => {
        const status = ref.reward_status || 'pending';
        byStatus[status] = (byStatus[status] || 0) + 1;
      });

      return {
        success: true,
        data: {
          total_referrals: totalReferrals,
          total_earnings: totalEarnings,
          by_status: byStatus,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching referral stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch referral stats',
      };
    }
  },

  getTopReferrers: async (limit: number = 10): Promise<ApiResponse<TopReferrer[]>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get all referrals grouped by referrer
      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select('referrer_user_id, reward_amount');

      if (referralsError) {
        console.error('Error fetching top referrers:', referralsError);
        return {
          success: false,
          error: referralsError.message || 'Failed to fetch top referrers',
        };
      }

      // Group by referrer and calculate stats
      const referrerMap = new Map<string, { count: number; earnings: number }>();
      
      (referrals || []).forEach(ref => {
        const referrerId = ref.referrer_user_id;
        const current = referrerMap.get(referrerId) || { count: 0, earnings: 0 };
        referrerMap.set(referrerId, {
          count: current.count + 1,
          earnings: current.earnings + parseFloat(ref.reward_amount?.toString() || '0'),
        });
      });

      // Convert to array and sort by total referrals (descending)
      const referrerStats = Array.from(referrerMap.entries())
        .map(([user_id, stats]) => ({
          user_id,
          total_referrals: stats.count,
          total_earnings: stats.earnings,
        }))
        .sort((a, b) => b.total_referrals - a.total_referrals)
        .slice(0, limit);

      // Fetch user profiles for top referrers (including referral codes)
      const userIds = referrerStats.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, referral_code')
        .in('user_id', userIds);

      // Fetch pending earnings for each referrer
      const { data: pendingReferrals, error: pendingError } = await supabase
        .from('referrals')
        .select('referrer_user_id, reward_amount')
        .eq('reward_status', 'pending')
        .in('referrer_user_id', userIds);

      if (profilesError) {
        console.error('Error fetching user profiles:', profilesError);
        // Return data without names/emails if profile fetch fails
        return {
          success: true,
          data: referrerStats.map(r => ({
            user_id: r.user_id,
            name: 'Unknown',
            email: '',
            total_referrals: r.total_referrals,
            total_earnings: r.total_earnings,
          })),
        };
      }

      // Calculate pending earnings per referrer
      const pendingMap = new Map<string, number>();
      (pendingReferrals || []).forEach(ref => {
        const referrerId = ref.referrer_user_id;
        const current = pendingMap.get(referrerId) || 0;
        pendingMap.set(referrerId, current + parseFloat(ref.reward_amount?.toString() || '0'));
      });

      // Create profile map
      const profileMap = new Map(
        (profiles || []).map((p: { user_id: string; full_name?: string | null; email?: string | null; referral_code?: string | null }) => [
          p.user_id,
          {
            name: (p.full_name && String(p.full_name).trim()) || (p.email && String(p.email).trim()) || 'Unknown',
            email: (p.email && String(p.email).trim()) || '',
            referral_code: p.referral_code || 'N/A',
          },
        ])
      );

      // Combine stats with profile data
      const topReferrers: TopReferrer[] = referrerStats.map((r) => {
        const profile = profileMap.get(r.user_id);
        return {
          user_id: r.user_id,
          name: profile?.name || 'Unknown',
          email: profile?.email || '',
          total_referrals: r.total_referrals,
          total_earnings: r.total_earnings,
          referral_code: profile?.referral_code || 'N/A',
          pending_earnings: pendingMap.get(r.user_id) || 0,
        };
      });

      return {
        success: true,
        data: topReferrers,
      };
    } catch (error: any) {
      console.error('Exception fetching top referrers:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch top referrers',
      };
    }
  },

  getAllReferralCodes: async (params?: { 
    page?: number; 
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<ReferralCode>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            referralCodes: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: 'Not authenticated',
        };
      }

      const page = params?.page || 1;
      const limit = params?.limit || 50;
      const offset = (page - 1) * limit;

      // Build query - fetch from user_profiles since referral_code is stored there
      let query = supabase
        .from('user_profiles')
        .select(`
          user_id,
          referral_code,
          full_name,
          email,
          created_at
        `, { count: 'exact' })
        .not('referral_code', 'is', null);

      // Apply search filter if provided
      if (params?.search) {
        query = query.or(`referral_code.ilike.%${params.search}%,full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
      }

      // Sorting
      query = query.order('created_at', { ascending: false });

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching referral codes:', error);
        return {
          success: false,
          data: {
            referralCodes: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: error.message || 'Failed to fetch referral codes',
        };
      }

      // Base rows (display expects full_name / email on ReferralCode)
      const baseRows = (data || [])
        .filter((profile: any) => profile.referral_code)
        .map((profile: any) => ({
          id: profile.user_id as string,
          user_id: profile.user_id as string,
          referral_code: profile.referral_code as string,
          created_at: profile.created_at as string,
          full_name: (profile.full_name as string | null) ?? undefined,
          email: (profile.email as string | null) ?? undefined,
        }));

      const userIds = baseRows.map((r) => r.user_id).filter(Boolean);
      const countMap = new Map<string, number>();
      const earningsMap = new Map<string, number>();

      if (userIds.length > 0) {
        const { data: refAgg, error: refAggError } = await supabase
          .from('referrals')
          .select('referrer_user_id, reward_amount')
          .in('referrer_user_id', userIds);

        if (!refAggError && refAgg) {
          refAgg.forEach((row: { referrer_user_id: string; reward_amount?: string | number | null }) => {
            const rid = row.referrer_user_id;
            countMap.set(rid, (countMap.get(rid) || 0) + 1);
            const amt = parseFloat(String(row.reward_amount ?? 0)) || 0;
            earningsMap.set(rid, (earningsMap.get(rid) || 0) + amt);
          });
        }
      }

      const referralCodes: ReferralCode[] = baseRows.map((row) => ({
        ...row,
        total_referrals: countMap.get(row.user_id) || 0,
        total_earnings: earningsMap.get(row.user_id) || 0,
      }));

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          referralCodes: referralCodes,
          pagination: {
            page,
            limit,
            total,
            pages: totalPages,
          },
        },
        // Also include at top level for backward compatibility
        total,
        page,
        limit,
        pages: totalPages,
      };
    } catch (error: any) {
      console.error('Exception fetching referral codes:', error);
      return {
        success: false,
        data: {
          referralCodes: [],
          pagination: {
            page: params?.page || 1,
            limit: params?.limit || 50,
            total: 0,
            pages: 0,
          },
        },
        error: error.message || 'Failed to fetch referral codes',
      };
    }
  },

  getUserReferrals: async (
    _userId: string
  ): Promise<
    ApiResponse<{
      referral_code: string | null;
      balance: {
        total_referrals: number;
        total_earnings: number;
        available_balance: number;
        withdrawn_balance: number;
      };
    }>
  > => {
    return {
      success: false,
      error: 'Referral details are not available from this client yet.',
    };
  },

  creditReferralBalance: async (_params: {
    user_id: string;
    amount: number;
    description?: string;
  }): Promise<ApiResponse<{ new_balance: number }>> => {
    return {
      success: false,
      error: 'Credit referral balance is not available from this client yet.',
    };
  },
};

// Chat Support API
export const chatSupportApi = {
  getTickets: async (params?: { 
    page?: number; 
    limit?: number;
    status?: string;
    priority?: string;
  }): Promise<PaginatedResponse<SupportTicket>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            tickets: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: 'Not authenticated',
        };
      }

      const page = params?.page || 1;
      const limit = params?.limit || 50;
      const offset = (page - 1) * limit;

      // Build query for support_tickets
      let query = supabase
        .from('support_tickets')
        .select('*', { count: 'exact' });

      // Apply filters
      if (params?.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      if (params?.priority && params.priority !== 'all') {
        query = query.eq('priority', params.priority);
      }

      // Sorting
      query = query.order('last_message_at', { ascending: false });

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching support tickets:', error);
        return {
          success: false,
          data: {
            tickets: [],
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 50,
              total: 0,
              pages: 0,
            },
          },
          error: error.message || 'Failed to fetch support tickets',
        };
      }

      // Fetch user_profiles for all unique user_ids
      const userIds = [...new Set((data || []).map((ticket: any) => ticket.user_id))];
      let userProfilesMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email, phone_number')
          .in('user_id', userIds);

        if (!profilesError && profiles) {
          // Create a map for quick lookup
          userProfilesMap = profiles.reduce((acc: Record<string, any>, profile: any) => {
            acc[profile.user_id] = profile;
            return acc;
          }, {});
        }
      }

      // Transform data to match SupportTicket interface
      const tickets: SupportTicket[] = (data || []).map((ticket: any) => {
        const userProfile = userProfilesMap[ticket.user_id];
        return {
          id: ticket.id,
          user_id: ticket.user_id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category || 'general',
          created_at: ticket.created_at,
          // Additional fields for display
          user_profiles: userProfile ? {
            user_id: userProfile.user_id,
            full_name: userProfile.full_name,
            email: userProfile.email,
            phone_number: userProfile.phone_number,
          } : undefined,
          assigned_to: ticket.assigned_to,
          last_message_at: ticket.last_message_at,
          updated_at: ticket.updated_at,
          resolved_at: ticket.resolved_at,
        };
      });

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          tickets: tickets,
          pagination: {
            page,
            limit,
            total,
            pages: totalPages,
          },
        },
        // Also include at top level for backward compatibility
        total,
        page,
        limit,
        pages: totalPages,
      };
    } catch (error: any) {
      console.error('Exception fetching support tickets:', error);
      return {
        success: false,
        data: {
          tickets: [],
          pagination: {
            page: params?.page || 1,
            limit: params?.limit || 50,
            total: 0,
            pages: 0,
          },
        },
        error: error.message || 'Failed to fetch support tickets',
      };
    }
  },

  getTicketMessages: async (ticketId: string): Promise<ApiResponse<SupportMessage[]>> => {
    // TODO: Replace with your API to fetch ticket messages
    return {
      success: true,
      data: [],
    };
  },

  getChatStatistics: async (): Promise<ApiResponse<ChatStatistics>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            total_tickets: 0,
            open_tickets: 0,
            resolved_tickets: 0,
            average_response_time: 0,
          },
          error: 'Not authenticated',
        };
      }

      // Get total tickets
      const { count: totalTickets } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true });

      // Get open tickets
      const { count: openTickets } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      // Get resolved tickets
      const { count: resolvedTickets } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved');

      // Get in_progress tickets
      const { count: inProgressTickets } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');

      // Get unread messages count
      const { count: unreadMessages } = await supabase
        .from('support_messages')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('is_admin', false);

      return {
        success: true,
        data: {
          total_tickets: totalTickets || 0,
          open_tickets: openTickets || 0,
          resolved_tickets: resolvedTickets || 0,
          average_response_time: 0, // TODO: Calculate average response time
          total: totalTickets || 0,
          by_status: {
            open: openTickets || 0,
            in_progress: inProgressTickets || 0,
            resolved: resolvedTickets || 0,
          },
          unread_messages: unreadMessages || 0,
        },
      };
    } catch (error: any) {
      console.error('Error fetching chat statistics:', error);
      return {
        success: false,
        data: {
          total_tickets: 0,
          open_tickets: 0,
          resolved_tickets: 0,
          average_response_time: 0,
        },
        error: error.message || 'Failed to fetch chat statistics',
      };
    }
  },

  getTicket: async (ticketId: string): Promise<ApiResponse<{ ticket: SupportTicket; messages: SupportMessage[] }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: { ticket: {} as SupportTicket, messages: [] },
          error: 'Not authenticated',
        };
      }

      // Fetch ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketError || !ticket) {
        return {
          success: false,
          data: { ticket: {} as SupportTicket, messages: [] },
          error: ticketError?.message || 'Ticket not found',
        };
      }

      // Fetch messages
      const { data: messages, error: messagesError } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
      }

      // Fetch user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, phone_number')
        .eq('user_id', ticket.user_id)
        .single();

      const supportTicket: SupportTicket = {
        id: ticket.id,
        user_id: ticket.user_id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category || 'general',
        created_at: ticket.created_at,
        customer_chat_display_name: (ticket as { customer_chat_display_name?: string | null }).customer_chat_display_name ?? undefined,
        user_profiles: profile ? {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: profile.email,
          phone_number: profile.phone_number,
        } : undefined,
        assigned_to: ticket.assigned_to,
        last_message_at: ticket.last_message_at,
        updated_at: ticket.updated_at,
        resolved_at: ticket.resolved_at,
      };

      return {
        success: true,
        data: {
          ticket: supportTicket,
          messages: (messages || []).map((msg: any) => ({
            id: msg.id,
            ticket_id: msg.ticket_id,
            user_id: msg.user_id,
            message: msg.message,
            is_admin: msg.is_admin || false,
            sender_display_name: msg.sender_display_name ?? null,
            created_at: msg.created_at,
            is_read: msg.is_read,
            read_at: msg.read_at,
          })),
        },
      };
    } catch (error: any) {
      console.error('Error fetching ticket:', error);
      return {
        success: false,
        data: { ticket: {} as SupportTicket, messages: [] },
        error: error.message || 'Failed to fetch ticket',
      };
    }
  },

  sendMessage: async (ticketId: string, message: string): Promise<ApiResponse<{ message: SupportMessage }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: { message: {} as SupportMessage },
          error: 'Not authenticated',
        };
      }

      const { data: adminProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const agentLabel =
        (adminProfile?.full_name && String(adminProfile.full_name).trim()) ||
        (adminProfile?.email && String(adminProfile.email).split('@')[0]) ||
        'Support Agent';

      const { data: newMessage, error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          user_id: session.user.id,
          message: message,
          is_admin: true,
          sender_display_name: agentLabel.slice(0, 80),
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          data: { message: {} as SupportMessage },
          error: error.message || 'Failed to send message',
        };
      }

      // Update ticket's last_message_at
      await supabase
        .from('support_tickets')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', ticketId);

      return {
        success: true,
        data: {
          message: {
            id: newMessage.id,
            ticket_id: newMessage.ticket_id,
            user_id: newMessage.user_id,
            message: newMessage.message,
            is_admin: newMessage.is_admin,
            created_at: newMessage.created_at,
            is_read: newMessage.is_read,
            read_at: newMessage.read_at,
            sender_display_name: (newMessage as { sender_display_name?: string | null }).sender_display_name ?? null,
          },
        },
      };
    } catch (error: any) {
      console.error('Error sending message:', error);
      return {
        success: false,
        data: { message: {} as SupportMessage },
        error: error.message || 'Failed to send message',
      };
    }
  },

  updateTicket: async (ticketId: string, updates: { status?: string; priority?: string; assigned_to?: string }): Promise<ApiResponse<SupportTicket>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {} as SupportTicket,
          error: 'Not authenticated',
        };
      }

      const updateData: any = {};
      if (updates.status) updateData.status = updates.status;
      if (updates.priority) updateData.priority = updates.priority;
      if (updates.assigned_to) updateData.assigned_to = updates.assigned_to;
      updateData.updated_at = new Date().toISOString();

      if (updates.status === 'resolved' || updates.status === 'closed') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { data: updatedTicket, error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          data: {} as SupportTicket,
          error: error.message || 'Failed to update ticket',
        };
      }

      // Fetch user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, phone_number')
        .eq('user_id', updatedTicket.user_id)
        .single();

      const supportTicket: SupportTicket = {
        id: updatedTicket.id,
        user_id: updatedTicket.user_id,
        subject: updatedTicket.subject,
        status: updatedTicket.status,
        priority: updatedTicket.priority,
        category: updatedTicket.category || 'general',
        created_at: updatedTicket.created_at,
        user_profiles: profile ? {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: profile.email,
          phone_number: profile.phone_number,
        } : undefined,
        assigned_to: updatedTicket.assigned_to,
        last_message_at: updatedTicket.last_message_at,
        updated_at: updatedTicket.updated_at,
        resolved_at: updatedTicket.resolved_at,
      };

      return {
        success: true,
        data: supportTicket,
      };
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      return {
        success: false,
        data: {} as SupportTicket,
        error: error.message || 'Failed to update ticket',
      };
    }
  },

  markMessagesRead: async (ticketId: string): Promise<ApiResponse<void>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: undefined,
          error: 'Not authenticated',
        };
      }

      const { error } = await supabase
        .from('support_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('ticket_id', ticketId)
        .eq('is_admin', false)
        .eq('is_read', false);

      if (error) {
        return {
          success: false,
          data: undefined,
          error: error.message || 'Failed to mark messages as read',
        };
      }

      return {
        success: true,
        data: undefined,
      };
    } catch (error: any) {
      console.error('Error marking messages as read:', error);
      return {
        success: false,
        data: undefined,
        error: error.message || 'Failed to mark messages as read',
      };
    }
  },
};

// Withdrawal API
export const withdrawalApi = {
  getWithdrawals: async (params?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<Withdrawal>> => {
    // TODO: Replace with your API to fetch withdrawals
    return {
      success: true,
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    };
  },

  getWithdrawalStats: async (): Promise<ApiResponse<WithdrawalStats>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            total_withdrawals: 0,
            pending_withdrawals: 0,
            approved_withdrawals: 0,
            total_amount: 0,
          },
          error: 'Not authenticated',
        };
      }

      // Get withdrawal stats from transactions table
      const { data: withdrawals, error } = await supabase
        .from('transactions')
        .select('status, fiat_amount, fiat_currency, crypto_amount, crypto_currency')
        .eq('transaction_type', 'WITHDRAWAL');

      if (error) {
        console.error('Error fetching withdrawal stats:', error);
        return {
          success: false,
          data: {
            total_withdrawals: 0,
            pending_withdrawals: 0,
            approved_withdrawals: 0,
            total_amount: 0,
          },
          error: error.message || 'Failed to fetch withdrawal stats',
        };
      }

      // Calculate stats
      const stats: WithdrawalStats = {
        total_withdrawals: withdrawals?.length || 0,
        pending_withdrawals: withdrawals?.filter(w => 
          w.status === 'PENDING' || w.status === 'pending' || 
          w.status === 'CONFIRMING' || w.status === 'confirming'
        ).length || 0,
        approved_withdrawals: withdrawals?.filter(w => 
          w.status === 'COMPLETED' || w.status === 'completed' || 
          w.status === 'CONFIRMED' || w.status === 'confirmed' ||
          w.status === 'APPROVED' || w.status === 'approved'
        ).length || 0,
        rejected_withdrawals: withdrawals?.filter(w => 
          w.status === 'FAILED' || w.status === 'failed' || 
          w.status === 'REJECTED' || w.status === 'rejected' ||
          w.status === 'CANCELLED' || w.status === 'cancelled'
        ).length || 0,
        total_amount: withdrawals?.reduce((sum, w) => {
          // Use fiat_amount if available, otherwise convert crypto_amount
          const amount = parseFloat(w.fiat_amount?.toString() || '0') || 
                        (parseFloat(w.crypto_amount?.toString() || '0') * 1500); // Approximate conversion
          return sum + amount;
        }, 0) || 0,
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      console.error('Exception fetching withdrawal stats:', error);
      return {
        success: false,
        data: {
          total_withdrawals: 0,
          pending_withdrawals: 0,
          approved_withdrawals: 0,
          total_amount: 0,
        },
        error: error.message || 'Failed to fetch withdrawal stats',
      };
    }
  },
};

// Revenue API
export interface RevenueRecord {
  id: string;
  revenue_type: string;
  source: string;
  amount: number;
  currency: string;
  amount_ngn: number | null;
  fee_percentage: number | null;
  base_amount: number | null;
  transaction_id: string | null;
  user_id: string | null;
  metadata: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueSummary {
  total_revenue_ngn: number;
  total_transactions: number;
  by_type: Record<string, { count: number; total_ngn: number }>;
  by_source: Record<string, { count: number; total_ngn: number }>;
  by_currency: Record<string, { count: number; total: number; total_ngn: number }>;
}

export interface RevenueStats {
  total_revenue: number;
  today_revenue: number;
  yesterday_revenue: number;
  month_revenue: number;
  last_month_revenue: number;
  year_revenue: number;
  last_year_revenue: number;
  revenue_by_source: {
    transaction_fees: number;
    crypto_trading_fees: number;
    gift_card_sales: number;
    utility_services: number;
    withdrawal_fees: number;
  };
  revenue_trends: {
    last_7_days: number;
    last_30_days: number;
    last_90_days: number;
  };
}

export const revenueApi = {
  getRevenue: async (params?: {
    start_date?: string;
    end_date?: string;
    revenue_type?: string;
    source?: string;
    currency?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ records: RevenueRecord[]; summary: RevenueSummary; pagination: any }>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: { records: [], summary: { total_revenue_ngn: 0, total_transactions: 0, by_type: {}, by_source: {}, by_currency: {} }, pagination: {} },
          error: 'Not authenticated',
        };
      }

      // Call the edge function
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const queryParams = new URLSearchParams();
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      if (params?.revenue_type) queryParams.append('revenue_type', params.revenue_type);
      if (params?.source) queryParams.append('source', params.source);
      if (params?.currency) queryParams.append('currency', params.currency);
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-admin-revenue?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          data: { records: [], summary: { total_revenue_ngn: 0, total_transactions: 0, by_type: {}, by_source: {}, by_currency: {} }, pagination: {} },
          error: data.error || 'Failed to fetch revenue',
        };
      }

      return {
        success: true,
        data: data.data,
      };
    } catch (error: any) {
      console.error('Error fetching revenue:', error);
      return {
        success: false,
        data: { records: [], summary: { total_revenue_ngn: 0, total_transactions: 0, by_type: {}, by_source: {}, by_currency: {} }, pagination: {} },
        error: error.message || 'Failed to fetch revenue',
      };
    }
  },

  getRevenueStats: async (): Promise<ApiResponse<RevenueStats>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          data: {
            total_revenue: 0,
            today_revenue: 0,
            yesterday_revenue: 0,
            month_revenue: 0,
            last_month_revenue: 0,
            year_revenue: 0,
            last_year_revenue: 0,
            revenue_by_source: {
              transaction_fees: 0,
              crypto_trading_fees: 0,
              gift_card_sales: 0,
              utility_services: 0,
              withdrawal_fees: 0,
            },
            revenue_trends: {
              last_7_days: 0,
              last_30_days: 0,
              last_90_days: 0,
            },
          },
          error: 'Not authenticated',
        };
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const thisYearStart = new Date(now.getFullYear(), 0, 1);
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear(), 0, 0);
      const last7Days = new Date(now);
      last7Days.setDate(last7Days.getDate() - 7);
      const last30Days = new Date(now);
      last30Days.setDate(last30Days.getDate() - 30);
      const last90Days = new Date(now);
      last90Days.setDate(last90Days.getDate() - 90);

      // Fetch all revenue records
      const { data: allRevenue, error } = await supabase
        .from('admin_revenue')
        .select('revenue_type, source, amount_ngn, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching revenue stats:', error);
        return {
          success: false,
          data: {
            total_revenue: 0,
            today_revenue: 0,
            yesterday_revenue: 0,
            month_revenue: 0,
            last_month_revenue: 0,
            year_revenue: 0,
            last_year_revenue: 0,
            revenue_by_source: {
              transaction_fees: 0,
              crypto_trading_fees: 0,
              gift_card_sales: 0,
              utility_services: 0,
              withdrawal_fees: 0,
            },
            revenue_trends: {
              last_7_days: 0,
              last_30_days: 0,
              last_90_days: 0,
            },
          },
          error: error.message || 'Failed to fetch revenue stats',
        };
      }

      let totalRevenue = 0;
      let todayRevenue = 0;
      let yesterdayRevenue = 0;
      let monthRevenue = 0;
      let lastMonthRevenue = 0;
      let yearRevenue = 0;
      let lastYearRevenue = 0;
      let last7DaysRevenue = 0;
      let last30DaysRevenue = 0;
      let last90DaysRevenue = 0;

      const revenueBySource = {
        transaction_fees: 0,
        crypto_trading_fees: 0,
        gift_card_sales: 0,
        utility_services: 0,
        withdrawal_fees: 0,
      };

      if (allRevenue) {
        allRevenue.forEach((record) => {
          const amountNgn = parseFloat(record.amount_ngn || '0');
          const recordDate = new Date(record.created_at);

          totalRevenue += amountNgn;

          // Today
          if (recordDate >= today) {
            todayRevenue += amountNgn;
          }

          // Yesterday
          if (recordDate >= yesterday && recordDate < today) {
            yesterdayRevenue += amountNgn;
          }

          // This month
          if (recordDate >= thisMonthStart) {
            monthRevenue += amountNgn;
          }

          // Last month
          if (recordDate >= lastMonthStart && recordDate < thisMonthStart) {
            lastMonthRevenue += amountNgn;
          }

          // This year
          if (recordDate >= thisYearStart) {
            yearRevenue += amountNgn;
          }

          // Last year
          if (recordDate >= lastYearStart && recordDate < thisYearStart) {
            lastYearRevenue += amountNgn;
          }

          // Last 7 days
          if (recordDate >= last7Days) {
            last7DaysRevenue += amountNgn;
          }

          // Last 30 days
          if (recordDate >= last30Days) {
            last30DaysRevenue += amountNgn;
          }

          // Last 90 days
          if (recordDate >= last90Days) {
            last90DaysRevenue += amountNgn;
          }

          // Categorize by source
          const revenueType = record.revenue_type || '';
          const source = record.source || '';

          if (revenueType === 'WITHDRAWAL_FEE') {
            revenueBySource.withdrawal_fees += amountNgn;
          } else if (revenueType === 'DEPOSIT_FEE' || revenueType === 'SEND_FEE' || revenueType === 'TRANSFER_FEE') {
            revenueBySource.transaction_fees += amountNgn;
          } else if (revenueType === 'BUY_FEE' || revenueType === 'SELL_FEE' || revenueType === 'SWAP_FEE') {
            revenueBySource.crypto_trading_fees += amountNgn;
          } else if (source.includes('GIFT') || source.includes('ZENDIT')) {
            revenueBySource.gift_card_sales += amountNgn;
          } else if (source.includes('UTILITY') || source.includes('BILL')) {
            revenueBySource.utility_services += amountNgn;
          }
        });
      }

      return {
        success: true,
        data: {
          total_revenue: totalRevenue,
          today_revenue: todayRevenue,
          yesterday_revenue: yesterdayRevenue,
          month_revenue: monthRevenue,
          last_month_revenue: lastMonthRevenue,
          year_revenue: yearRevenue,
          last_year_revenue: lastYearRevenue,
          revenue_by_source: revenueBySource,
          revenue_trends: {
            last_7_days: last7DaysRevenue,
            last_30_days: last30DaysRevenue,
            last_90_days: last90DaysRevenue,
          },
        },
      };
    } catch (error: any) {
      console.error('Error fetching revenue stats:', error);
      return {
        success: false,
        data: {
          total_revenue: 0,
          today_revenue: 0,
          yesterday_revenue: 0,
          month_revenue: 0,
          last_month_revenue: 0,
          year_revenue: 0,
          last_year_revenue: 0,
          revenue_by_source: {
            transaction_fees: 0,
            crypto_trading_fees: 0,
            gift_card_sales: 0,
            utility_services: 0,
            withdrawal_fees: 0,
          },
          revenue_trends: {
            last_7_days: 0,
            last_30_days: 0,
            last_90_days: 0,
          },
        },
        error: error.message || 'Failed to fetch revenue stats',
      };
    }
  },
};

// App Settings API
export const appSettingsApi = {
  getAppSettings: async (): Promise<ApiResponse<AppSettings>> => {
    try {
      const supabase = createClient();
      
      // Use limit(1) to ensure only one row, then maybeSingle() to handle 0 or 1 rows gracefully
      // This prevents "Cannot coerce the result to a single JSON object" error
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .limit(1)
        .maybeSingle();

      if (error) {
        // Handle specific error codes
        if (error.code === 'PGRST116') {
          // No row exists, return default values
          return {
            success: true,
            data: {
              app_name: 'ChainCola',
              app_version: '1.0.0',
              maintenance_mode: false,
              registration_enabled: true,
              transaction_fee: 0,
              support_email: 'support@chaincola.com',
              support_phone: '+234 800 000 0000',
              additional_settings: null,
            },
          };
        }
        
        // Handle "Cannot coerce" error - might indicate multiple rows
        if (error.message?.includes('Cannot coerce') || error.message?.includes('multiple rows')) {
          console.warn('Multiple app_settings rows detected, fetching first row');
          // Try to get the first row
          const { data: firstRow, error: firstRowError } = await supabase
            .from('app_settings')
            .select('*')
            .eq('id', 1)
            .limit(1)
            .single();
          
          if (!firstRowError && firstRow) {
            // Use the first row
            const settings = firstRow;
            return {
              success: true,
              data: {
                app_name: settings.app_name || 'ChainCola',
                app_version: settings.app_version || '1.0.0',
                maintenance_mode: settings.maintenance_mode || false,
                registration_enabled: settings.registration_enabled ?? true,
                transaction_fee: settings.transaction_fee ? parseFloat(String(settings.transaction_fee)) : 0,
                support_email: settings.support_email || 'support@chaincola.com',
                support_phone: settings.support_phone || '+234 800 000 0000',
                support_address: settings.support_address,
                privacy_policy: settings.privacy_policy,
                terms_and_conditions: settings.terms_and_conditions,
                additional_settings: (settings.additional_settings as Record<string, unknown> | null) ?? null,
              },
            };
          }
        }
        
        console.error('Error fetching app settings:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch app settings',
        };
      }

      // If no data (maybeSingle returns null when no rows)
      if (!data) {
        return {
          success: true,
          data: {
            app_name: 'ChainCola',
            app_version: '1.0.0',
            maintenance_mode: false,
            registration_enabled: true,
            transaction_fee: 0,
            support_email: 'support@chaincola.com',
            support_phone: '+234 800 000 0000',
            additional_settings: null,
          },
        };
      }

      return {
        success: true,
        data: {
          app_name: data.app_name || 'ChainCola',
          app_version: data.app_version || '1.0.0',
          maintenance_mode: data.maintenance_mode || false,
          registration_enabled: data.registration_enabled ?? true,
          transaction_fee: data.transaction_fee ? parseFloat(String(data.transaction_fee)) : 0,
          support_email: data.support_email || 'support@chaincola.com',
          support_phone: data.support_phone || '+234 800 000 0000',
          support_address: data.support_address,
          privacy_policy: data.privacy_policy,
          terms_and_conditions: data.terms_and_conditions,
          additional_settings: (data.additional_settings as Record<string, unknown> | null) ?? null,
        },
      };
    } catch (error: any) {
      console.error('Exception fetching app settings:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch app settings',
      };
    }
  },

  updateAppSettings: async (settings: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Prepare update data - only include defined fields
      const updateData: any = {
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      };

      if (settings.app_name !== undefined) updateData.app_name = settings.app_name;
      if (settings.app_version !== undefined) updateData.app_version = settings.app_version;
      if (settings.maintenance_mode !== undefined) updateData.maintenance_mode = settings.maintenance_mode;
      if (settings.registration_enabled !== undefined) updateData.registration_enabled = settings.registration_enabled;
      if (settings.transaction_fee !== undefined) updateData.transaction_fee = settings.transaction_fee;
      if (settings.withdrawal_fee !== undefined) updateData.withdrawal_fee = settings.withdrawal_fee;
      if (settings.support_email !== undefined) updateData.support_email = settings.support_email;
      if (settings.support_phone !== undefined) updateData.support_phone = settings.support_phone;
      if (settings.support_address !== undefined) updateData.support_address = settings.support_address;
      if (settings.privacy_policy !== undefined) updateData.privacy_policy = settings.privacy_policy;
      if (settings.terms_and_conditions !== undefined) updateData.terms_and_conditions = settings.terms_and_conditions;

      // Use upsert to handle case where row doesn't exist
      // This prevents "Cannot coerce" errors
      const { data, error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          ...updateData,
        }, {
          onConflict: 'id',
        })
        .eq('id', 1)
        .select()
        .limit(1)
        .maybeSingle();

      if (error) {
        // Enhanced error logging
        const errorDetails: any = {};
        if (error.code) errorDetails.code = error.code;
        if (error.message) errorDetails.message = error.message;
        if (error.details) errorDetails.details = error.details;
        if (error.hint) errorDetails.hint = error.hint;
        
        // Only log if we have meaningful error information
        const hasErrorInfo = Object.keys(errorDetails).length > 0;
        if (hasErrorInfo) {
          console.error('Error updating app settings:', errorDetails);
        } else {
          console.error('Error updating app settings (empty error object):', {
            errorType: typeof error,
            errorString: String(error),
            errorKeys: Object.keys(error || {}),
          });
        }
        
        return {
          success: false,
          error: error.message || errorDetails.message || 'Failed to update app settings',
        };
      }

      // If no data returned (shouldn't happen with upsert, but handle it)
      if (!data) {
        // Fetch the updated settings
        const { data: fetchedData, error: fetchError } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', 1)
          .limit(1)
          .maybeSingle();

        if (fetchError || !fetchedData) {
          return {
            success: false,
            error: 'Settings updated but failed to fetch updated data',
          };
        }

        return {
          success: true,
          data: {
            app_name: fetchedData.app_name || 'ChainCola',
            app_version: fetchedData.app_version || '1.0.0',
            maintenance_mode: fetchedData.maintenance_mode || false,
            registration_enabled: fetchedData.registration_enabled ?? true,
            transaction_fee: fetchedData.transaction_fee ? parseFloat(String(fetchedData.transaction_fee)) : 0,
            support_email: fetchedData.support_email || 'support@chaincola.com',
            support_phone: fetchedData.support_phone || '+234 800 000 0000',
            support_address: fetchedData.support_address,
            privacy_policy: fetchedData.privacy_policy,
            terms_and_conditions: fetchedData.terms_and_conditions,
          },
        };
      }

      return {
        success: true,
        data: {
          app_name: data.app_name || 'ChainCola',
          app_version: data.app_version || '1.0.0',
          maintenance_mode: data.maintenance_mode || false,
          registration_enabled: data.registration_enabled ?? true,
          transaction_fee: data.transaction_fee ? parseFloat(String(data.transaction_fee)) : 0,
          support_email: data.support_email || 'support@chaincola.com',
          support_phone: data.support_phone || '+234 800 000 0000',
          support_address: data.support_address,
          privacy_policy: data.privacy_policy,
          terms_and_conditions: data.terms_and_conditions,
        },
      };
    } catch (error: any) {
      // Enhanced error logging for exceptions
      const errorDetails: any = {};
      if (error?.code) errorDetails.code = error.code;
      if (error?.message) errorDetails.message = error.message;
      if (error?.details) errorDetails.details = error.details;
      if (error?.hint) errorDetails.hint = error.hint;
      if (error?.name) errorDetails.name = error.name;
      if (error?.stack) errorDetails.stack = error.stack;
      
      const hasErrorInfo = Object.keys(errorDetails).length > 0;
      if (hasErrorInfo) {
        console.error('Exception updating app settings:', errorDetails);
      } else {
        console.error('Exception updating app settings (empty error object):', {
          errorType: typeof error,
          errorString: String(error),
          errorKeys: Object.keys(error || {}),
        });
      }
      
      return {
        success: false,
        error: error?.message || String(error) || 'Failed to update app settings',
      };
    }
  },

  /**
   * Persists per-asset flags under app_settings.additional_settings.crypto_asset_status
   * (merges with existing additional_settings keys such as treasury risk).
   */
  mergeCryptoAssetStatuses: async (
    updates: Partial<Record<(typeof CRYPTO_ASSET_STATUS_SYMBOLS)[number], CryptoAssetRuntimeStatus>>
  ): Promise<
    ApiResponse<{ crypto_asset_status: Record<string, CryptoAssetRuntimeStatus> }>
  > => {
    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data: row, error: fetchError } = await supabase
        .from('app_settings')
        .select('additional_settings')
        .eq('id', 1)
        .maybeSingle();

      if (fetchError) {
        return { success: false, error: fetchError.message || 'Failed to load settings' };
      }

      const prevAdditional =
        row?.additional_settings && typeof row.additional_settings === 'object'
          ? { ...(row.additional_settings as Record<string, unknown>) }
          : {};

      const normalized = normalizeCryptoAssetStatusMap(prevAdditional);
      const nextStatus: Record<string, CryptoAssetRuntimeStatus> = { ...normalized };
      for (const [sym, st] of Object.entries(updates)) {
        if (!sym || !st) continue;
        const u = sym.toUpperCase() as (typeof CRYPTO_ASSET_STATUS_SYMBOLS)[number];
        if ((CRYPTO_ASSET_STATUS_SYMBOLS as readonly string[]).includes(u)) {
          nextStatus[u] = st;
        }
      }

      const nextAdditional = {
        ...prevAdditional,
        crypto_asset_status: nextStatus,
      };

      const patch = {
        additional_settings: nextAdditional,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      };

      const { data: afterUpdate, error: updateError } = await supabase
        .from('app_settings')
        .update(patch)
        .eq('id', 1)
        .select('additional_settings')
        .maybeSingle();

      if (updateError) {
        return { success: false, error: updateError.message || 'Failed to update crypto statuses' };
      }

      if (!afterUpdate) {
        const { error: insertError } = await supabase.from('app_settings').insert({
          id: 1,
          ...patch,
        });
        if (insertError) {
          return { success: false, error: insertError.message || 'Failed to create app settings row' };
        }
      }

      return {
        success: true,
        data: {
          crypto_asset_status: normalizeCryptoAssetStatusMap(nextAdditional),
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('mergeCryptoAssetStatuses:', err);
      return {
        success: false,
        error: err?.message || 'Failed to merge crypto asset statuses',
      };
    }
  },

  /**
   * Persists list buy/sell (NGN per 1 coin) under
   * `app_settings.additional_settings.admin_crypto_price_overrides_ngn`.
   * Pass `null` for a symbol to clear override (UI then uses live market quotes).
   */
  mergeAdminCryptoPriceOverrides: async (
    updates: Partial<Record<(typeof ADMIN_LIST_PRICE_SYMBOLS)[number], AdminCryptoPriceOverrideRow | null>>,
  ): Promise<ApiResponse<{ overrides: Partial<Record<string, AdminCryptoPriceOverrideRow>> }>> => {
    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data: row, error: fetchError } = await supabase
        .from('app_settings')
        .select('additional_settings')
        .eq('id', 1)
        .maybeSingle();

      if (fetchError) {
        return { success: false, error: fetchError.message || 'Failed to load settings' };
      }

      const prevAdditional =
        row?.additional_settings && typeof row.additional_settings === 'object'
          ? { ...(row.additional_settings as Record<string, unknown>) }
          : {};

      const prevOverrides = parseAdminCryptoPriceOverrides(prevAdditional);
      const nextOverrides: Record<string, AdminCryptoPriceOverrideRow> = { ...prevOverrides } as Record<
        string,
        AdminCryptoPriceOverrideRow
      >;

      for (const [sym, val] of Object.entries(updates)) {
        const u = sym.toUpperCase() as (typeof ADMIN_LIST_PRICE_SYMBOLS)[number];
        if (!(ADMIN_LIST_PRICE_SYMBOLS as readonly string[]).includes(u)) continue;
        if (val === null) {
          delete nextOverrides[u];
        } else if (val && val.buy_ngn > 0 && val.sell_ngn > 0) {
          nextOverrides[u] = { buy_ngn: val.buy_ngn, sell_ngn: val.sell_ngn };
        }
      }

      const nextAdditional = {
        ...prevAdditional,
        [ADMIN_CRYPTO_PRICE_OVERRIDES_KEY]: nextOverrides,
      };

      const patch = {
        additional_settings: nextAdditional,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      };

      const { data: afterUpdate, error: updateError } = await supabase
        .from('app_settings')
        .update(patch)
        .eq('id', 1)
        .select('additional_settings')
        .maybeSingle();

      if (updateError) {
        return { success: false, error: updateError.message || 'Failed to update list prices' };
      }

      if (!afterUpdate) {
        const { error: insertError } = await supabase.from('app_settings').insert({
          id: 1,
          ...patch,
        });
        if (insertError) {
          return { success: false, error: insertError.message || 'Failed to create app settings row' };
        }
      }

      return {
        success: true,
        data: { overrides: parseAdminCryptoPriceOverrides(nextAdditional) },
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('mergeAdminCryptoPriceOverrides:', err);
      return {
        success: false,
        error: err?.message || 'Failed to merge list prices',
      };
    }
  },
};

// Verification API
export interface Verification {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone_number: string;
  address: string;
  nin: string;
  nin_front_url: string | null;
  nin_back_url: string | null;
  passport_photo_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason?: string | null;
  user_name?: string;
}

export interface VerificationStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export const verificationApi = {
  /**
   * Resolve a stored verification doc reference into a usable URL.
   *
   * Why: verification documents bucket is private, so "public URLs" will 404.
   * Admins should view docs via signed URLs (policies allow admin access).
   *
   * Accepts:
   * - Full Supabase storage URLs (public or signed)
   * - "bucket/path/to/file.jpg"
   * - "path/to/file.jpg" (assumed to be in verification-documents)
   */
  getSignedStorageUrl: async (
    supabase: ReturnType<typeof createClient>,
    storageRef: string | null | undefined,
    options?: { expiresInSeconds?: number },
  ): Promise<string | null> => {
    if (!storageRef) return null;

    const expiresIn = options?.expiresInSeconds ?? 60 * 60; // 1 hour

    // If it's already a signed URL, it should work until it expires.
    if (storageRef.startsWith('http://') || storageRef.startsWith('https://')) {
      // Try to extract bucket/path from any Supabase storage URL so we can re-sign (handles private bucket 404).
      try {
        const u = new URL(storageRef);
        const marker = '/storage/v1/object/';
        const idx = u.pathname.indexOf(marker);
        if (idx >= 0) {
          const after = u.pathname.slice(idx + marker.length); // e.g. "public/bucket/path..." or "sign/bucket/path..."
          const parts = after.split('/').filter(Boolean);
          const mode = parts[0]; // public | sign
          const bucket = parts[1];
          const path = parts.slice(2).join('/');
          if (bucket && path) {
            const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
            if (!error && data?.signedUrl) return data.signedUrl;
          }
        }
      } catch {
        // fall through
      }
      return storageRef;
    }

    // Remove leading slash if present
    const clean = storageRef.startsWith('/') ? storageRef.slice(1) : storageRef;

    // If caller stored "bucket/path"
    const commonBuckets = ['verification-documents', 'verifications', 'kyc-documents'];
    const bucketFromPrefix = commonBuckets.find((b) => clean.startsWith(`${b}/`));
    const bucket = bucketFromPrefix ?? 'verification-documents';
    const path = bucketFromPrefix ? clean.slice(bucket.length + 1) : clean;

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      // Fall back to original reference for debugging
      return storageRef;
    }
    return data.signedUrl;
  },

  getVerifications: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Verification[]>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

      if (!supabaseUrl || !supabaseAnonKey) {
        return { success: false, error: 'Supabase configuration missing' };
      }

      // Call edge function to view verifications
      const limit = params?.limit || 50;
      const page = params?.page || 1;
      const offset = (page - 1) * limit;

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/admin-verification-management`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'view',
            status: params?.status && params.status !== 'all' ? params.status : undefined,
            limit,
            offset,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        // Handle network errors gracefully
        const fe = fetchError as Error | undefined;
        const msg = fe?.message ?? String(fetchError);
        
        if (msg.includes('timeout') || msg.includes('AbortError')) {
          console.error('Error fetching verifications: Request timeout');
          return { success: false, error: 'Request timeout. Please try again.' };
        }
        
        if (msg.includes('Failed to fetch') || msg.includes('Network request failed') || msg.toLowerCase().includes('network')) {
          console.error('Error fetching verifications: Network error', {
            message: msg,
            error: fetchError,
          });
          return { success: false, error: 'Network error. Please check your internet connection and try again.' };
        }
        
        // Re-throw other errors to be caught by outer catch
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('Error fetching verifications (HTTP error):', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorText,
        });
        return { success: false, error: errorData.error || `HTTP ${response.status}: Failed to fetch verifications` };
      }

      let result;
      try {
        const responseText = await response.text();
        if (!responseText) {
          console.error('Error fetching verifications: Empty response from server');
          return { success: false, error: 'Empty response from server' };
        }
        result = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error('Error parsing verification response:', {
          parseError: parseError?.message || parseError?.toString(),
          parseErrorDetails: parseError,
        });
        return { success: false, error: 'Invalid response format from server' };
      }

      if (!result.success || !result.data) {
        console.error('Error fetching verifications (API error):', {
          success: result.success,
          error: result.error,
          data: result.data,
          result,
        });
        return { success: false, error: result.error || 'Failed to fetch verifications' };
      }

      // Apply search filter if provided (edge function doesn't handle search yet)
      let data = result.data;
      if (params?.search) {
        const searchTerm = params.search.toLowerCase();
        data = data.filter((v: any) => 
          v.full_name?.toLowerCase().includes(searchTerm) ||
          v.phone_number?.toLowerCase().includes(searchTerm) ||
          v.nin?.toLowerCase().includes(searchTerm) ||
          v.user_email?.toLowerCase().includes(searchTerm)
        );
      }

      const verifications: Verification[] = await Promise.all(
        (data || []).map(async (v: any) => {
          const resolve = verificationApi.getSignedStorageUrl;
          return {
            id: v.id,
            user_id: v.user_id,
            full_name: v.full_name || '',
            email: v.user_email || '',
            phone_number: v.phone_number || '',
            address: v.address || '',
            nin: v.nin || '',
            nin_front_url: await resolve(supabase, v.nin_front_url),
            nin_back_url: await resolve(supabase, v.nin_back_url),
            passport_photo_url: await resolve(supabase, v.passport_photo_url),
            status: v.status,
            submitted_at: v.submitted_at,
            reviewed_at: v.reviewed_at,
            reviewed_by: v.reviewed_by,
            rejection_reason: v.rejection_reason,
          };
        }),
      );

      return { success: true, data: verifications };
    } catch (error: any) {
      // Better error logging - handle different error types
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorDetails = {
        message: errorMessage,
        name: error?.name,
        stack: error?.stack,
        ...(error?.cause && { cause: error.cause }),
      };
      console.error('Error fetching verifications:', errorDetails);
      
      // Return a more descriptive error message
      let userFriendlyError = 'Failed to fetch verifications';
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Network')) {
        userFriendlyError = 'Network error: Unable to connect to server. Please check your internet connection.';
      } else if (errorMessage.includes('timeout')) {
        userFriendlyError = 'Request timeout. Please try again.';
      } else if (errorMessage) {
        userFriendlyError = errorMessage;
      }
      
      return { success: false, error: userFriendlyError };
    }
  },

  getVerificationById: async (id: string): Promise<ApiResponse<Verification>> => {
    // TODO: Replace with your API to fetch verification by ID
    return {
      success: true,
      data: {
        id,
        user_id: '',
        full_name: '',
        email: '',
        phone_number: '',
        address: '',
        nin: '',
        nin_front_url: null,
        nin_back_url: null,
        passport_photo_url: null,
        status: 'pending',
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
      },
    };
  },

  getVerificationStats: async (): Promise<ApiResponse<VerificationStats>> => {
    // TODO: Replace with your API to fetch verification stats
    return {
      success: true,
      data: {
        pending: 0,
        approved: 0,
        rejected: 0,
        total: 0,
      },
    };
  },

  approveVerification: async (id: string): Promise<ApiResponse<Verification>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

      if (!supabaseUrl || !supabaseAnonKey) {
        return { success: false, error: 'Supabase configuration missing' };
      }

      // Call edge function to approve verification (includes notifications)
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-verification-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
          verification_id: id,
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
        console.error('Error approving verification:', errorData);
        return { success: false, error: errorData.error || 'Failed to approve verification' };
      }

      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to approve verification' };
      }

      // Fetch updated verification with user details
      const { data: updatedVerification, error: fetchError } = await supabase
        .from('account_verifications')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        return { success: false, error: fetchError.message };
      }

      // Fetch user profile
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email, phone_number')
        .eq('user_id', updatedVerification.user_id)
        .single();

      const resolve = verificationApi.getSignedStorageUrl;
      
      const verificationData: Verification = {
        id: updatedVerification.id,
        user_id: updatedVerification.user_id,
        full_name: updatedVerification.full_name || userProfile?.full_name || '',
        email: userProfile?.email || '',
        phone_number: updatedVerification.phone_number || userProfile?.phone_number || '',
        address: updatedVerification.address || '',
        nin: updatedVerification.nin || '',
        nin_front_url: await resolve(supabase, updatedVerification.nin_front_url),
        nin_back_url: await resolve(supabase, updatedVerification.nin_back_url),
        passport_photo_url: await resolve(supabase, updatedVerification.passport_photo_url),
        status: updatedVerification.status,
        submitted_at: updatedVerification.submitted_at,
        reviewed_at: updatedVerification.reviewed_at,
        reviewed_by: updatedVerification.reviewed_by,
        rejection_reason: updatedVerification.rejection_reason,
      };

      return { success: true, data: verificationData };
    } catch (error: any) {
      console.error('Error approving verification:', error);
      return { success: false, error: error.message || 'Failed to approve verification' };
    }
  },

  rejectVerification: async (id: string, reason: string): Promise<ApiResponse<Verification>> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

      if (!supabaseUrl || !supabaseAnonKey) {
        return { success: false, error: 'Supabase configuration missing' };
      }

      // Same edge function as approve — runs RPC + push + email
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-verification-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
          verification_id: id,
          rejection_reason: reason,
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
        console.error('Error rejecting verification:', errorData);
        return { success: false, error: errorData.error || 'Failed to reject verification' };
      }

      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to reject verification' };
      }

      // Fetch updated verification
      const { data: updatedVerification, error: fetchError } = await supabase
        .from('account_verifications')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        return { success: false, error: fetchError.message };
      }

      // Fetch user profile
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email, phone_number')
        .eq('user_id', updatedVerification.user_id)
        .single();

      const resolve = verificationApi.getSignedStorageUrl;
      
      const verificationData: Verification = {
        id: updatedVerification.id,
        user_id: updatedVerification.user_id,
        full_name: updatedVerification.full_name || userProfile?.full_name || '',
        email: userProfile?.email || '',
        phone_number: updatedVerification.phone_number || userProfile?.phone_number || '',
        address: updatedVerification.address || '',
        nin: updatedVerification.nin || '',
        nin_front_url: await resolve(supabase, updatedVerification.nin_front_url),
        nin_back_url: await resolve(supabase, updatedVerification.nin_back_url),
        passport_photo_url: await resolve(supabase, updatedVerification.passport_photo_url),
        status: updatedVerification.status,
        submitted_at: updatedVerification.submitted_at,
        reviewed_at: updatedVerification.reviewed_at,
        reviewed_by: updatedVerification.reviewed_by,
        rejection_reason: updatedVerification.rejection_reason,
      };

      return { success: true, data: verificationData };
    } catch (error: any) {
      console.error('Error rejecting verification:', error);
      return { success: false, error: error.message || 'Failed to reject verification' };
    }
  },
};
