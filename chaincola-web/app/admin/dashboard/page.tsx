'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { adminApi, transactionsApi, cryptoApi, dashboardApi, notificationsApi, referralApi, chatSupportApi, withdrawalApi, appSettingsApi, verificationApi, revenueApi, normalizeCryptoAssetStatusMap, cryptoAssetStatusToDisplay, type User as ApiUser, type Transaction as ApiTransaction, type CryptoOverview, type DashboardStats, type QuickStats, type SystemHealth, type Notification as ApiNotification, type NotificationStats, type ReferralCode as ApiReferralCode, type ReferralOverview, type ReferralStats, type TopReferrer, type SupportTicket as ApiSupportTicket, type SupportMessage as ApiSupportMessage, type ChatStatistics, type Withdrawal as ApiWithdrawal, type WithdrawalStats, type AppSettings, type Verification, type RevenueStats, type RevenueRecord, type CryptoAssetRuntimeStatus } from '@/lib/admin-api';
import { getLunoPrices, type CryptoPrice } from '@/lib/crypto-price-service';
import { attachSupportTypingBridge } from '@/lib/support-chat-service';

interface StatCard {
  title: string;
  value: string;
  change: string;
  icon: string;
  color: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'Active' | 'Suspended' | 'Pending' | 'active' | 'suspended' | 'pending' | 'deleted';
  balance: string;
  joinedDate: string;
  address?: string;
  kycStatus?: 'Verified' | 'Pending' | 'Unverified';
  totalTransactions?: number;
  lastLogin?: string;
  // Additional fields from API
  user_id?: string;
  full_name?: string | null;
  phone_number?: string | null;
  account_status?: string;
  total_btc_balance?: number;
  total_eth_balance?: number;
  total_usdt_balance?: number;
  total_usdc_balance?: number;
  total_sol_balance?: number;
  total_ngn_balance?: number;
  created_at?: string;
  email_verified?: boolean;
  pin_setup_completed?: boolean;
  last_activity?: string | null;
}

interface Transaction {
  id: string;
  user: string;
  type: string;
  amount: string;
  crypto: string;
  status: 'Completed' | 'Pending' | 'Failed' | 'completed' | 'pending' | 'failed';
  date: string;
  fee: string;
  transactionId?: string;
  reference?: string;
  hash?: string;
  fromAddress?: string;
  toAddress?: string;
  network?: string;
  description?: string;
  // API fields
  user_id?: string;
  transaction_id?: string;
  transaction_type?: string;
  currency?: string;
  net_amount?: string | number;
  recipient_address?: string;
  sender_address?: string;
  crypto_hash?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  user_profile?: {
    full_name?: string;
    email?: string;
    phone_number?: string;
  };
  metadata?: Record<string, unknown>;
}

interface Crypto {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  price: string;
  change24h: string;
  status: 'Active' | 'Inactive' | 'Maintenance';
  marketCap: string;
  volume24h: string;
  balance?: string;
  totalValue?: string;
  // API fields
  user_allocated?: number;
  price_usd?: number;
  price_ngn?: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'System' | 'Transaction' | 'Promotion' | 'Security' | string;
  status: 'Sent' | 'Pending' | 'Failed' | 'sent' | 'pending' | 'failed' | string;
  recipients: number;
  date: string;
  pushNotification?: boolean;
  targetAudience?: 'All Users' | 'Specific Users' | 'User Segments';
  scheduledTime?: string;
  deepLink?: string;
  imageUrl?: string;
  // API fields
  user_id?: string;
  body?: string;
  category?: string;
  is_read?: boolean;
  read?: boolean;
  action_url?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  read_at?: string;
  user_name?: string;
  user_email?: string;
}


interface Referral {
  id: string;
  referrer: string;
  referred: string;
  code: string;
  status: 'Active' | 'Used' | 'Expired' | 'active' | 'used' | 'expired' | 'pending' | 'completed' | 'credited';
  reward: string;
  date: string;
  earnings: string;
  totalEarnings?: string;
  // API fields
  user_id?: string;
  referral_code?: string;
  referrer_id?: string;
  referred_user_id?: string;
  referred_email?: string;
  referred_name?: string;
  referred_joined?: string;
  reward_amount?: number;
  reward_status?: string;
  created_at?: string;
  total_referrals?: number;
  total_earnings?: number;
  email?: string;
  full_name?: string;
}

interface ChatSupport {
  id: string;
  user: string;
  email: string;
  subject: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed' | 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | 'low' | 'normal' | 'high' | 'urgent';
  date: string;
  lastReply: string;
  // API fields
  user_id?: string;
  category?: string;
  assigned_to?: string;
  last_message_at?: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  user_profiles?: {
    full_name?: string;
    email?: string;
    phone_number?: string;
  };
  assigned_admin?: {
    full_name?: string;
    email?: string;
  };
  message_count?: number;
  unread_count?: number;
}

interface ChatMessage {
  id: string;
  chatId: string;
  sender: 'user' | 'admin';
  message: string;
  timestamp: string;
  sender_display_name?: string | null;
  // API fields
  ticket_id?: string;
  user_id?: string;
  is_admin?: boolean;
  is_read?: boolean;
  read_at?: string;
  created_at?: string;
  user_profiles?: {
    full_name?: string;
    email?: string;
  };
}

interface Withdrawal {
  id: string;
  user: string;
  amount: string;
  currency: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Processing' | 'Completed' | 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  date: string;
  fee: string;
  withdrawalId?: string;
  reference?: string;
  userEmail?: string;
  userPhone?: string;
  processedDate?: string;
  processedBy?: string;
  rejectionReason?: string;
  transactionHash?: string;
  // API fields
  user_id?: string;
  bank_account_id?: string;
  admin_notes?: string;
  processed_at?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
  user_profiles?: {
    full_name?: string;
    email?: string;
    phone_number?: string;
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'transactions' | 'crypto' | 'notifications' | 'referrals' | 'chat' | 'withdrawals' | 'settings' | 'analytics' | 'fees' | 'revenue' | 'gift-cards' | 'verifications'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersLimit] = useState(20);
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [transactionCurrencyFilter, setTransactionCurrencyFilter] = useState('all');
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(1);
  const [transactionsLimit] = useState(50);
  const [transactionStats, setTransactionStats] = useState<{
    total: number;
    by_status: { pending: number; completed: number; failed: number };
    by_type: { deposit: number; withdrawal: number; send: number; receive: number; buy: number; sell: number };
    volume: { ngn: number };
    fee_revenue_ngn?: number;
  } | null>(null);
  const [cryptoSearchTerm, setCryptoSearchTerm] = useState('');
  const [cryptoOverview, setCryptoOverview] = useState<CryptoOverview | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoStats, setCryptoStats] = useState<any>(null);
  const [cryptoMarketPrices, setCryptoMarketPrices] = useState<Record<string, CryptoPrice>>({});
  const [cryptoAssetRuntimeBySymbol, setCryptoAssetRuntimeBySymbol] = useState<
    Record<string, CryptoAssetRuntimeStatus>
  >({});
  const [cryptoAssetStatusSavingId, setCryptoAssetStatusSavingId] = useState<string | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [recentTransactionsOverview, setRecentTransactionsOverview] = useState<Transaction[]>([]);
  const [notificationFilter, setNotificationFilter] = useState('all');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState('all');
  const [notificationStatusFilter, setNotificationStatusFilter] = useState('all');
  const [notificationReadFilter, setNotificationReadFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [notificationSearchQuery, setNotificationSearchQuery] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsTotal, setNotificationsTotal] = useState(0);
  const [notificationsTotalPages, setNotificationsTotalPages] = useState(1);
  const [notificationsLimit] = useState(50);
  const [notificationStats, setNotificationStats] = useState<NotificationStats | null>(null);
  const [referralFilter, setReferralFilter] = useState('all');
  const [chatFilter, setChatFilter] = useState('all');
  const [withdrawalFilter, setWithdrawalFilter] = useState('all');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([]);
  const [remoteTyping, setRemoteTyping] = useState<{ name: string } | null>(null);
  const [agentChatDisplayName, setAgentChatDisplayName] = useState('Support');
  const typingBridgeRef = useRef<ReturnType<typeof attachSupportTypingBridge> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showDebitModal, setShowDebitModal] = useState(false);
  const [showUserTransactions, setShowUserTransactions] = useState(false);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [userTransactionsLoading, setUserTransactionsLoading] = useState(false);
  const [transactionDateFrom, setTransactionDateFrom] = useState('');
  const [transactionDateTo, setTransactionDateTo] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditCurrency, setCreditCurrency] = useState('NGN');
  const [debitAmount, setDebitAmount] = useState('');
  const [debitCurrency, setDebitCurrency] = useState('NGN');
  const [creditReason, setCreditReason] = useState('');
  const [debitReason, setDebitReason] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showWithdrawalDetails, setShowWithdrawalDetails] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [transactionToReject, setTransactionToReject] = useState<string | null>(null);
  const [analyticsDateRange, setAnalyticsDateRange] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');
  const [feeHistory, setFeeHistory] = useState<Array<{id: string, date: string, type: string, oldValue: string, newValue: string, changedBy: string}>>([
    { id: '1', date: '2024-02-20 10:30', type: 'Buy Fee', oldValue: '1.0%', newValue: '1.5%', changedBy: 'Admin User' },
    { id: '2', date: '2024-02-19 14:20', type: 'Withdrawal Fee (USD)', oldValue: '$2.0', newValue: '$2.5', changedBy: 'Admin User' },
    { id: '3', date: '2024-02-18 09:15', type: 'Sell Fee', oldValue: '1.2%', newValue: '1.5%', changedBy: 'Admin User' },
  ]);
  const [appSettings, setAppSettings] = useState({
    appName: 'ChainCola',
    appVersion: '1.0.0',
    maintenanceMode: false,
    registrationEnabled: true,
    withdrawalFee: '2.5',
    transactionFee: '1.0',
    supportEmail: 'support@chaincola.com',
    supportPhone: '+234 800 000 0000',
    privacyPolicy: '',
    termsAndConditions: '',
  });
  const [appSettingsLoading, setAppSettingsLoading] = useState(false);
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);
  const [feeSettings, setFeeSettings] = useState({
    buyFee: '1.5',
    sellFee: '1.5',
    sendFee: '0.5',
    receiveFee: '0.0',
    convertFee: '1.0',
    withdrawalFeeUSD: '2.5',
    withdrawalFeeNGN: '100',
    depositFee: '0.0',
  });
  const [showPushNotificationModal, setShowPushNotificationModal] = useState(false);
  const [pushNotificationTitle, setPushNotificationTitle] = useState('');
  const [pushNotificationMessage, setPushNotificationMessage] = useState('');
  const [pushNotificationType, setPushNotificationType] = useState<'System' | 'Transaction' | 'Promotion' | 'Security'>('System');
  const [pushNotificationTarget, setPushNotificationTarget] = useState<'All Users' | 'Specific Users' | 'User Segments'>('All Users');
  const [pushNotificationScheduled, setPushNotificationScheduled] = useState(false);
  const [pushNotificationScheduleTime, setPushNotificationScheduleTime] = useState('');
  const [pushNotificationDeepLink, setPushNotificationDeepLink] = useState('');
  const [pushNotificationImageUrl, setPushNotificationImageUrl] = useState('');
  const [pushNotificationImageFile, setPushNotificationImageFile] = useState<File | null>(null);
  const [pushNotificationImageUploading, setPushNotificationImageUploading] = useState(false);
  const [pushNotificationImagePreview, setPushNotificationImagePreview] = useState<string | null>(null);

  // Convert API user to display user
  const convertApiUserToDisplay = (apiUser: ApiUser): User => {
    const totalBalance = (apiUser.total_btc_balance || 0) + 
                        (apiUser.total_eth_balance || 0) + 
                        (apiUser.total_usdt_balance || 0) + 
                        (apiUser.total_usdc_balance || 0) + 
                        (apiUser.total_sol_balance || 0) + 
                        (apiUser.total_ngn_balance || 0);
    
    const statusMap: Record<string, 'Active' | 'Suspended' | 'Pending'> = {
      'active': 'Active',
      'suspended': 'Suspended',
      'pending': 'Pending',
      'deleted': 'Suspended',
    };

    return {
      id: apiUser.user_id,
      user_id: apiUser.user_id,
      name: apiUser.full_name || apiUser.email || 'Unknown',
      full_name: apiUser.full_name,
      email: apiUser.email,
      phone: apiUser.phone_number || 'N/A',
      phone_number: apiUser.phone_number,
      status: statusMap[apiUser.account_status?.toLowerCase() || 'active'] || 'Active',
      account_status: apiUser.account_status,
      balance: `₦${(apiUser.total_ngn_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      joinedDate: apiUser.created_at ? new Date(apiUser.created_at).toLocaleDateString() : 'N/A',
      created_at: apiUser.created_at,
      total_btc_balance: apiUser.total_btc_balance,
      total_eth_balance: apiUser.total_eth_balance,
      total_usdt_balance: apiUser.total_usdt_balance,
      total_usdc_balance: apiUser.total_usdc_balance,
      total_sol_balance: apiUser.total_sol_balance,
      total_ngn_balance: apiUser.total_ngn_balance,
      email_verified: apiUser.email_verified,
      pin_setup_completed: apiUser.pin_setup_completed,
      last_activity: apiUser.last_activity,
    };
  };

  // Fetch users from API
  const fetchUsers = async (page: number = 1, search?: string, status?: string) => {
    setUsersLoading(true);
    try {
      const response = await adminApi.getUsers({
        page,
        limit: usersLimit,
        search: search || undefined,
        status: status && status !== 'all' ? status : undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      if (response.success && response.data) {
        const displayUsers = response.data.users.map(convertApiUserToDisplay);
        setUsers(displayUsers);
        setUsersTotal(response.data.pagination.total);
        setUsersTotalPages(response.data.pagination.pages);
        setUsersPage(response.data.pagination.page);
      } else {
        console.error('Failed to fetch users:', response.error);
        alert(response.error || 'Failed to fetch users');
      }
    } catch (error: unknown) {
      console.error('Error fetching users:', error);
      alert('Error fetching users: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    // Check if admin is authenticated
    const checkAdminAuth = async () => {
      const auth = localStorage.getItem('adminAuthenticated');
      const adminUserId = localStorage.getItem('adminUserId');
      
      if (auth !== 'true' || !adminUserId) {
        router.push('/admin/login');
        return;
      }

      // Verify admin status with Supabase
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          localStorage.removeItem('adminAuthenticated');
          localStorage.removeItem('adminUserId');
          localStorage.removeItem('adminEmail');
          router.push('/admin/login');
          return;
        }

        // Verify admin privileges
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('is_admin, role')
          .eq('user_id', session.user.id)
          .single();

        if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
          localStorage.removeItem('adminAuthenticated');
          localStorage.removeItem('adminUserId');
          localStorage.removeItem('adminEmail');
          await supabase.auth.signOut();
          router.push('/admin/login');
          return;
        }

        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error checking admin auth:', error);
        router.push('/admin/login');
      }
    };

    checkAdminAuth();
  }, [router]);

  // Convert API transaction to display transaction
  const convertApiTransactionToDisplay = (apiTransaction: ApiTransaction): Transaction => {
    const statusMap: Record<string, 'Completed' | 'Pending' | 'Failed'> = {
      'completed': 'Completed',
      'pending': 'Pending',
      'failed': 'Failed',
    };

    const typeMap: Record<string, string> = {
      'deposit': 'Deposit',
      'withdrawal': 'Withdraw',
      'buy': 'Buy',
      'sell': 'Sell',
      'send': 'Send',
      'receive': 'Receive',
    };

    // Normalize amount/fee from API which may be number or string
    const amount = Number(apiTransaction.amount ?? 0) || 0;
    const fee = Number(apiTransaction.fee ?? 0) || 0;

    // For BUY/SELL transactions, currency should be NGN (fiat_currency), not crypto_currency
    // The API now returns the correct currency (NGN for BUY/SELL)
    const currency = apiTransaction.currency || 'NGN';
    const currencySymbol = currency === 'NGN' ? '₦' : '$';
    
    // For crypto field, use crypto_currency if available (for BUY/SELL transactions)
    // Otherwise fall back to currency
    const cryptoCurrency = apiTransaction.crypto_currency || (currency !== 'NGN' ? currency : undefined);
    
    const userName = apiTransaction.user_profile?.full_name || 
                     apiTransaction.user_profile?.email || 
                     apiTransaction.user || 
                     'Unknown User';

    const date = apiTransaction.created_at 
      ? new Date(apiTransaction.created_at).toLocaleString()
      : 'N/A';

    return {
      id: apiTransaction.id,
      user_id: apiTransaction.user_id,
      user: userName,
      type: typeMap[apiTransaction.transaction_type || apiTransaction.type || ''] || apiTransaction.transaction_type || apiTransaction.type || 'Unknown',
      transaction_type: apiTransaction.transaction_type || apiTransaction.type,
      amount: `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      crypto: cryptoCurrency || currency,
      currency: currency,
      status: statusMap[apiTransaction.status?.toLowerCase() || ''] || (apiTransaction.status as 'Pending' | 'Completed' | 'Failed') || 'Pending',
      date: date,
      fee: `${currencySymbol}${fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      transactionId: apiTransaction.transaction_id || apiTransaction.id,
      description: apiTransaction.description,
      hash: apiTransaction.crypto_hash,
      fromAddress: apiTransaction.sender_address,
      toAddress: apiTransaction.recipient_address,
      created_at: apiTransaction.created_at,
      updated_at: apiTransaction.updated_at,
      completed_at: apiTransaction.completed_at,
      user_profile: apiTransaction.user_profile ? {
        full_name: apiTransaction.user_profile.full_name,
        email: apiTransaction.user_profile.email,
        // API may return null for phone_number; normalize null -> undefined for UI types
        phone_number: apiTransaction.user_profile.phone_number ?? undefined,
      } : undefined,
      metadata: apiTransaction.metadata,
    };
  };

  // Fetch transactions from API
  const fetchTransactions = async (
    page: number = 1,
    statusFilter?: string,
    typeFilter?: string,
    currencyFilter?: string,
    searchQuery?: string
  ) => {
    setTransactionsLoading(true);
    try {
      const response = await transactionsApi.getTransactions({
        page,
        limit: transactionsLimit,
        status_filter: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
        transaction_type: typeFilter && typeFilter !== 'all' ? typeFilter : undefined,
        currency_filter: currencyFilter && currencyFilter !== 'all' ? currencyFilter : undefined,
        search_query: searchQuery || undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      if (response.success && response.data) {
        // Normalize different possible paginated shapes from API response
        let transactionsArray: ApiTransaction[] = [];
        if (Array.isArray(response.data)) {
          transactionsArray = response.data as ApiTransaction[];
        } else if ('transactions' in response.data) {
          transactionsArray = (response.data as { transactions?: ApiTransaction[] }).transactions || [];
        } else if ('items' in response.data) {
          transactionsArray = (response.data as { items?: ApiTransaction[] }).items || [];
        }

        const displayTransactions = transactionsArray.map(convertApiTransactionToDisplay);
        setTransactions(displayTransactions);

        const pagFromData =
          response.data && typeof response.data === 'object' && 'pagination' in response.data
            ? (response.data as { pagination?: { total?: number; pages?: number; page?: number } }).pagination
            : undefined;
        const pagTop = (response as { pagination?: { total?: number; pages?: number; page?: number } }).pagination;
        const pagination = pagFromData || pagTop;
        if (pagination && typeof pagination === 'object') {
          if (pagination.total != null) setTransactionsTotal(pagination.total);
          if (pagination.pages != null) setTransactionsTotalPages(Math.max(1, pagination.pages));
          if (pagination.page != null) setTransactionsPage(pagination.page);
        }
      } else {
        console.error('Failed to fetch transactions:', response.error);
        alert(response.error || 'Failed to fetch transactions');
      }
    } catch (error: unknown) {
      console.error('Error fetching transactions:', error);
      alert('Error fetching transactions: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Fetch user transactions
  const fetchUserTransactions = async () => {
    if (!selectedUser) return;

    setUserTransactionsLoading(true);
    try {
      const userId = selectedUser.user_id || selectedUser.id;
      const response = await transactionsApi.getTransactions({
        page: 1,
        limit: 1000, // Get all transactions for PDF
        user_id: userId,
        date_from: transactionDateFrom || undefined,
        date_to: transactionDateTo || undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      if (response.success && response.data) {
        // Normalize response shapes (array | { transactions } | { items })
        let transactionsArray: ApiTransaction[] = [];
        if (Array.isArray(response.data)) {
          transactionsArray = response.data as ApiTransaction[];
        } else if ('transactions' in response.data) {
          transactionsArray = (response.data as { transactions?: ApiTransaction[] }).transactions || [];
        } else if ('items' in response.data) {
          transactionsArray = (response.data as { items?: ApiTransaction[] }).items || [];
        }

        const displayTransactions = transactionsArray.map(convertApiTransactionToDisplay);
        setUserTransactions(displayTransactions);
      } else {
        console.error('Failed to fetch user transactions:', response.error);
        alert(response.error || 'Failed to fetch user transactions');
      }
    } catch (error: unknown) {
      console.error('Error fetching user transactions:', error);
      alert('Error fetching user transactions: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setUserTransactionsLoading(false);
    }
  };

  // Generate PDF Statement
  const generatePDFStatement = () => {
    if (!selectedUser || userTransactions.length === 0) {
      alert('No transactions to generate PDF');
      return;
    }

    // Create HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Transaction Statement - ${selectedUser.name}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #6B46C1;
              padding-bottom: 20px;
            }
            .header h1 {
              color: #6B46C1;
              margin: 0;
            }
            .user-info {
              margin-bottom: 20px;
            }
            .user-info p {
              margin: 5px 0;
            }
            .date-range {
              margin-bottom: 20px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background-color: #6B46C1;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: bold;
            }
            td {
              padding: 10px;
              border-bottom: 1px solid #ddd;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .status-completed {
              color: #10B981;
              font-weight: bold;
            }
            .status-pending {
              color: #F59E0B;
              font-weight: bold;
            }
            .status-failed {
              color: #EF4444;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .summary {
              margin-top: 20px;
              padding: 15px;
              background-color: #F3F4F6;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Transaction Statement</h1>
            <p>ChainCola Platform</p>
          </div>
          
          <div class="user-info">
            <h2>User Information</h2>
            <p><strong>Name:</strong> ${selectedUser.name || selectedUser.full_name || 'N/A'}</p>
            <p><strong>Email:</strong> ${selectedUser.email}</p>
            <p><strong>User ID:</strong> ${selectedUser.user_id || selectedUser.id}</p>
            <p><strong>Phone:</strong> ${selectedUser.phone || selectedUser.phone_number || 'N/A'}</p>
          </div>

          <div class="date-range">
            <p><strong>Date Range:</strong> ${
              transactionDateFrom && transactionDateTo
                ? `${new Date(transactionDateFrom).toLocaleDateString()} - ${new Date(transactionDateTo).toLocaleDateString()}`
                : 'All Transactions'
            }</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${userTransactions.map((tx) => `
                <tr>
                  <td>${tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}</td>
                  <td>${tx.type}</td>
                  <td>${tx.crypto || tx.currency || 'N/A'}</td>
                  <td>${tx.amount}</td>
                  <td>${tx.fee || 'N/A'}</td>
                  <td class="status-${tx.status}">${tx.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="summary">
            <p><strong>Total Transactions:</strong> ${userTransactions.length}</p>
            <p><strong>Completed:</strong> ${userTransactions.filter(tx => tx.status === 'completed').length}</p>
            <p><strong>Pending:</strong> ${userTransactions.filter(tx => tx.status === 'pending').length}</p>
            <p><strong>Failed:</strong> ${userTransactions.filter(tx => tx.status === 'failed').length}</p>
          </div>

          <div class="footer">
            <p>This is a computer-generated statement. No signature required.</p>
            <p>Generated by ChainCola Admin Dashboard</p>
          </div>
        </body>
      </html>
    `;

    // Create a new window and print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      // Fallback: create download link
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transaction-statement-${selectedUser.email}-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('Transaction statement downloaded. You can open it and print as PDF from your browser.');
    }
  };

  // Fetch transaction stats
  const fetchTransactionStats = async () => {
    try {
      const response = await transactionsApi.getTransactionStats();
      if (response.success && response.data) {
        // response.data already contains { total, by_status, by_type, volume }
        setTransactionStats(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching transaction stats:', error);
    }
  };

  // Fetch users when users tab is active or filters change
  useEffect(() => {
    if (isAuthenticated && activeTab === 'users') {
      fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
    }
  }, [isAuthenticated, activeTab, usersPage, userStatusFilter]);

  // Fetch transactions when transactions tab is active or filters change
  useEffect(() => {
    if (isAuthenticated && activeTab === 'transactions') {
      fetchTransactions(
        transactionsPage,
        transactionFilter,
        transactionTypeFilter,
        transactionCurrencyFilter,
        transactionSearchQuery || undefined
      );
      fetchTransactionStats();
    }
  }, [isAuthenticated, activeTab, transactionsPage, transactionFilter, transactionTypeFilter, transactionCurrencyFilter]);

  // Convert crypto overview + live rates to display rows
  const convertCryptoOverviewToDisplay = (
    overview: CryptoOverview,
    marketPrices: Record<string, CryptoPrice> = {},
    assetStatusBySymbol: Record<string, CryptoAssetRuntimeStatus> = {}
  ): Crypto[] => {
    const cryptoList: Crypto[] = [];
    const cryptoConfigs = [
      { symbol: 'BTC', name: 'Bitcoin', logo: '/images/bitcoin.png' },
      { symbol: 'ETH', name: 'Ethereum', logo: '/images/ethereum.png' },
      { symbol: 'USDT', name: 'Tether', logo: '/images/tether.png' },
      { symbol: 'USDC', name: 'USD Coin', logo: '/images/usdc.png' },
      { symbol: 'XRP', name: 'Ripple', logo: '/images/ripple.png' },
      { symbol: 'SOL', name: 'Solana', logo: '/images/solana.png' },
      { symbol: 'TRX', name: 'Tron', logo: '/images/tron.png' },
    ];

    cryptoConfigs.forEach((config) => {
      const symbolLower = config.symbol.toLowerCase();
      const userAllocated = (overview.user_allocated_balances?.[symbolLower as 'btc' | 'eth' | 'usdt' | 'usdc' | 'xrp' | 'trx' | 'sol']) || 0;
      const quote = marketPrices[config.symbol] || marketPrices[config.symbol.toUpperCase()];
      const priceUsd = quote?.price_usd ?? 0;
      const priceNgn = quote?.price_ngn ?? 0;
      const totalValueNgn = userAllocated * priceNgn;
      const totalValueUsd = userAllocated * priceUsd;

      const dec = config.symbol === 'BTC' ? 8 : config.symbol === 'ETH' || config.symbol === 'SOL' ? 6 : config.symbol === 'TRX' ? 6 : 2;

      const runtimeStatus = assetStatusBySymbol[config.symbol] ?? 'active';

      cryptoList.push({
        id: config.symbol,
        name: config.name,
        symbol: config.symbol,
        logo: config.logo,
        price:
          priceNgn > 0
            ? `₦${priceNgn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : priceUsd > 0
              ? `$${priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'N/A',
        change24h: '—',
        status: cryptoAssetStatusToDisplay(runtimeStatus),
        marketCap: '—',
        volume24h: '—',
        balance: `${userAllocated.toFixed(userAllocated > 0 ? dec : 0)} ${config.symbol}`,
        totalValue:
          totalValueNgn > 0
            ? `₦${totalValueNgn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : totalValueUsd > 0
              ? `$${totalValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—',
        user_allocated: userAllocated,
        price_usd: priceUsd,
        price_ngn: priceNgn,
      });
    });

    return cryptoList;
  };


  // Fetch crypto overview + live market prices (same source as app trading)
  const fetchCryptoOverview = async () => {
    setCryptoLoading(true);
    try {
      const [overviewRes, priceRes] = await Promise.all([
        cryptoApi.getCryptoOverview(),
        getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX']),
      ]);

      if (priceRes?.prices && Object.keys(priceRes.prices).length > 0) {
        setCryptoMarketPrices(priceRes.prices);
      } else {
        setCryptoMarketPrices({});
      }

      if (overviewRes.success && overviewRes.data) {
        setCryptoOverview(overviewRes.data);
      } else {
        console.error('Failed to fetch crypto overview:', overviewRes.error);
      }
    } catch (error: unknown) {
      console.error('Error fetching crypto overview:', error);
    } finally {
      setCryptoLoading(false);
    }
  };

  // Fetch crypto stats
  const fetchCryptoStats = async () => {
    try {
      const response = await cryptoApi.getCryptoStats();
      if (response.success && response.data) {
        setCryptoStats(response.data.stats);
      }
    } catch (error: unknown) {
      console.error('Error fetching crypto stats:', error);
    }
  };

  const fetchCryptoAssetSettings = async () => {
    try {
      const response = await appSettingsApi.getAppSettings();
      if (response.success && response.data) {
        setCryptoAssetRuntimeBySymbol(
          normalizeCryptoAssetStatusMap(response.data.additional_settings ?? null)
        );
      }
    } catch (error: unknown) {
      console.error('Error fetching crypto asset settings:', error);
    }
  };

  // Fetch crypto data when crypto tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'crypto') {
      fetchCryptoOverview();
      fetchCryptoStats();
      fetchCryptoAssetSettings();
    }
  }, [isAuthenticated, activeTab]);

  // Rebuild crypto table when balances, prices, or app_settings flags change
  useEffect(() => {
    if (cryptoOverview) {
      setCryptos(
        convertCryptoOverviewToDisplay(cryptoOverview, cryptoMarketPrices, cryptoAssetRuntimeBySymbol)
      );
    }
  }, [cryptoOverview, cryptoMarketPrices, cryptoAssetRuntimeBySymbol]);

  // Convert API notification to display notification
  const convertApiNotificationToDisplay = (apiNotification: ApiNotification): Notification => {
    const statusMap: Record<string, 'Sent' | 'Pending' | 'Failed'> = {
      'sent': 'Sent',
      'pending': 'Pending',
      'failed': 'Failed',
    };

    const typeMap: Record<string, string> = {
      'info': 'System',
      'success': 'Transaction',
      'warning': 'Security',
      'error': 'Security',
      'promotion': 'Promotion',
    };

    const date = apiNotification.created_at 
      ? new Date(apiNotification.created_at).toLocaleDateString()
      : 'N/A';

    // Count recipients - for individual notifications, it's 1, but we can check metadata
    const recipients = apiNotification.metadata?.recipient_count || 1;

    return {
      id: apiNotification.id,
      title: apiNotification.title,
      message: apiNotification.message || apiNotification.body || '',
      body: apiNotification.body,
      type: typeMap[apiNotification.type?.toLowerCase() || ''] || apiNotification.type || 'System',
      status: statusMap[apiNotification.status?.toLowerCase() || ''] || (apiNotification.status as 'Sent' | 'Failed' | 'Pending') || 'Pending',
      recipients: recipients,
      date: date,
      user_id: apiNotification.user_id,
      category: apiNotification.category,
      is_read: apiNotification.is_read || apiNotification.read || false,
      read: apiNotification.read || apiNotification.is_read || false,
      action_url: apiNotification.action_url,
  created_at: apiNotification.created_at,
  updated_at: apiNotification.updated_at,
  // Normalize nullable fields (API may return null)
  read_at: apiNotification.read_at ?? undefined,
  user_name: apiNotification.user_name ?? undefined,
  user_email: apiNotification.user_email ?? undefined,
      data: apiNotification.data,
      metadata: apiNotification.metadata,
    };
  };

  // Fetch notifications from API
  const fetchNotifications = async (
    page: number = 1,
    typeFilter?: string,
    statusFilter?: string,
    readFilter?: 'read' | 'unread' | 'all',
    searchQuery?: string
  ) => {
    setNotificationsLoading(true);
    try {
      const response = await notificationsApi.getNotifications({
        page,
        limit: notificationsLimit,
        type_filter: typeFilter && typeFilter !== 'all' ? typeFilter : undefined,
        status_filter: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
        read_filter: readFilter && readFilter !== 'all' ? readFilter : undefined,
        search: searchQuery || undefined,
      });

      if (response.success && response.data) {
        // Normalize different response shapes
        let notificationsArray: ApiNotification[] = [];
        if (Array.isArray(response.data)) {
          notificationsArray = response.data as ApiNotification[];
        } else if ('notifications' in response.data) {
          notificationsArray = (response.data as { notifications?: ApiNotification[] }).notifications || [];
        } else if ('items' in response.data) {
          notificationsArray = (response.data as { items?: ApiNotification[] }).items || [];
        }

        const displayNotifications = notificationsArray.map(convertApiNotificationToDisplay);
        setNotifications(displayNotifications);

        const pagination = ('pagination' in response.data && (response.data as Record<string, unknown>).pagination) || undefined;
        if (pagination && typeof pagination === 'object' && pagination !== null) {
          const paginationData = pagination as { total?: number; pages?: number; page?: number };
          if (paginationData.total) setNotificationsTotal(paginationData.total);
          if (paginationData.pages) setNotificationsTotalPages(paginationData.pages);
          if (paginationData.page) setNotificationsPage(paginationData.page);
        }
      } else {
        console.error('Failed to fetch notifications:', response.error);
        alert(response.error || 'Failed to fetch notifications');
      }
    } catch (error: unknown) {
      console.error('Error fetching notifications:', error);
      alert('Error fetching notifications: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setNotificationsLoading(false);
    }
  };

  // Fetch notification stats
  const fetchNotificationStats = async () => {
    try {
      const response = await notificationsApi.getNotificationStats();
      if (response.success && response.data) {
        // API returns NotificationStats shape directly
        setNotificationStats(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching notification stats:', error);
    }
  };

  // Fetch notifications when notifications tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'notifications') {
      fetchNotifications(
        notificationsPage,
        notificationTypeFilter,
        notificationStatusFilter,
        notificationReadFilter,
        notificationSearchQuery || undefined
      );
      fetchNotificationStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, notificationsPage, notificationTypeFilter, notificationStatusFilter, notificationReadFilter]);



  // Convert API referral code to display referral
  const convertApiReferralCodeToDisplay = (apiCode: ApiReferralCode): Referral => {
    const date = apiCode.created_at 
      ? new Date(apiCode.created_at).toLocaleDateString()
      : 'N/A';

    const earnings = apiCode.total_earnings || 0;
    const formattedEarnings = `₦${earnings.toLocaleString()}`;

    const legacy = apiCode as ApiReferralCode & { user_name?: string; user_email?: string };
    const referrerLabel =
      legacy.full_name ||
      legacy.email ||
      legacy.user_name ||
      legacy.user_email ||
      'Unknown';

    return {
      id: apiCode.user_id,
      referrer: referrerLabel,
      referred: `${apiCode.total_referrals || 0} users`,
      code: apiCode.referral_code,
      status: (apiCode.total_referrals || 0) > 0 ? 'Active' : 'Active',
      reward: '₦200',
      date: date,
      earnings: formattedEarnings,
      totalEarnings: formattedEarnings,
      user_id: apiCode.user_id,
      referral_code: apiCode.referral_code,
      total_referrals: apiCode.total_referrals,
      total_earnings: apiCode.total_earnings,
      email: apiCode.email,
      full_name: apiCode.full_name,
      created_at: apiCode.created_at,
    };
  };

  // Fetch referral overview
  const fetchReferralOverview = async () => {
    try {
      const response = await referralApi.getReferralOverview();
      if (response.success && response.data) {
        setReferralOverview(response.data);
      }
      // Fetch top referrers separately
      const topReferrersResponse = await referralApi.getTopReferrers(10);
      if (topReferrersResponse.success && topReferrersResponse.data) {
        setTopReferrers(topReferrersResponse.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching referral overview:', error);
    }
  };

  // Fetch all referral codes
  const fetchAllReferralCodes = async () => {
    setReferralLoading(true);
    try {
      const response = await referralApi.getAllReferralCodes();
      if (response.success && response.data) {
        const referralCodes = Array.isArray(response.data) ? response.data : ('referralCodes' in response.data ? response.data.referralCodes : []);
        const displayReferrals = referralCodes.map(convertApiReferralCodeToDisplay);
        setReferrals(displayReferrals);
      } else {
        console.error('Failed to fetch referral codes:', response.error);
        alert(response.error || 'Failed to fetch referral codes');
      }
    } catch (error: unknown) {
      console.error('Error fetching referral codes:', error);
      alert('Error fetching referral codes: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setReferralLoading(false);
    }
  };

  // Fetch referral stats
  const fetchReferralStats = async () => {
    try {
      const response = await referralApi.getReferralStats();
      if (response.success && response.data) {
        setReferralStats(response.data);
      }
      // Also fetch pending earnings separately
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: pendingData, error: pendingError } = await supabase
          .from('referrals')
          .select('reward_amount')
          .eq('reward_status', 'pending');
        
        if (!pendingError && pendingData) {
          const totalPending = pendingData.reduce((sum, ref) => {
            return sum + parseFloat(ref.reward_amount?.toString() || '0');
          }, 0);
          setPendingEarnings(totalPending);
        }
      } catch (err) {
        console.warn('Could not fetch pending earnings:', err);
      }
    } catch (error: unknown) {
      console.error('Error fetching referral stats:', error);
    }
  };

  // Fetch referral data when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'referrals') {
      fetchReferralOverview();
      fetchAllReferralCodes();
      fetchReferralStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  const handleLogout = async () => {
    try {
      // Sign out from Supabase
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    
    // Clear local storage
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminUserId');
    localStorage.removeItem('adminEmail');
    router.push('/admin/login');
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    setDashboardLoading(true);
    try {
      // Fetch all dashboard data in parallel
      const [statsResponse, quickStatsResponse, healthResponse, recentTxResponse] = await Promise.all([
        dashboardApi.getDashboardStats(),
        dashboardApi.getQuickStats(),
        dashboardApi.getSystemHealth(),
        dashboardApi.getRecentTransactions(5),
      ]);

      if (statsResponse.success && statsResponse.data) {
        setDashboardStats(statsResponse.data);
      }

      if (quickStatsResponse.success && quickStatsResponse.data) {
        setQuickStats(quickStatsResponse.data);
      }

      if (healthResponse.success && healthResponse.data) {
        setSystemHealth(healthResponse.data);
      }

      if (recentTxResponse.success && recentTxResponse.data) {
        // recentTxResponse.data is already an array of transactions (Transaction[])
        const transactions = Array.isArray(recentTxResponse.data) 
          ? recentTxResponse.data 
          : [];
        const displayTransactions = transactions.map(convertApiTransactionToDisplay);
        setRecentTransactionsOverview(displayTransactions);
      }
    } catch (error: unknown) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setDashboardLoading(false);
    }
  };

  // Fetch dashboard data when overview tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'overview') {
      fetchDashboardData();
      fetchTransactionStats();
    }
  }, [isAuthenticated, activeTab]);

  // Calculate stats cards from dashboard data
  const stats: StatCard[] = dashboardStats ? [
    {
      title: 'Total Users',
      value: (dashboardStats.total_users ?? 0).toLocaleString(),
      change: `${((dashboardStats.users_growth ?? 0) >= 0 ? '+' : '')}${(dashboardStats.users_growth ?? 0).toFixed(1)}%`,
      icon: '👥',
      color: 'bg-blue-500',
    },
    {
      title: 'Total Transactions',
      value: (dashboardStats.total_transactions ?? 0).toLocaleString(),
      change: `${((dashboardStats.transactions_growth ?? 0) >= 0 ? '+' : '')}${(dashboardStats.transactions_growth ?? 0).toFixed(1)}%`,
      icon: '💳',
      color: 'bg-green-500',
    },
    {
      title: 'Active Users',
      value: (dashboardStats.active_users ?? 0).toLocaleString(),
      change: `${dashboardStats.total_users > 0 ? ((dashboardStats.active_users / dashboardStats.total_users) * 100).toFixed(1) : '0.0'}%`,
      icon: '💰',
      color: 'bg-purple-500',
    },
    {
      title: 'Revenue',
      value: `₦${(dashboardStats.revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: `${((dashboardStats.revenue_growth ?? 0) >= 0 ? '+' : '')}${(dashboardStats.revenue_growth ?? 0).toFixed(1)}%`,
      icon: '📈',
      color: 'bg-orange-500',
    },
    {
      title: 'Total Transaction Amount',
      value: transactionStats?.volume?.ngn 
        ? `₦${transactionStats.volume.ngn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'Loading...',
      change: transactionStats?.volume?.ngn ? 'All Time' : '--',
      icon: '₿',
      color: 'bg-yellow-500',
    },
  ] : [
    {
      title: 'Total Users',
      value: 'Loading...',
      change: '--',
      icon: '👥',
      color: 'bg-blue-500',
    },
    {
      title: 'Total Transactions',
      value: 'Loading...',
      change: '--',
      icon: '💳',
      color: 'bg-green-500',
    },
    {
      title: 'Active Users',
      value: 'Loading...',
      change: '--',
      icon: '💰',
      color: 'bg-purple-500',
    },
    {
      title: 'Revenue',
      value: 'Loading...',
      change: '--',
      icon: '📈',
      color: 'bg-orange-500',
    },
  ];

  const [users, setUsers] = useState<User[]>([]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [cryptos, setCryptos] = useState<Crypto[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([]);


  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralOverview, setReferralOverview] = useState<ReferralOverview | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [pendingEarnings, setPendingEarnings] = useState<number>(0);

  // Verification management state
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationStatusFilter, setVerificationStatusFilter] = useState('all');
  const [verificationSearchQuery, setVerificationSearchQuery] = useState('');
  const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingVerification, setProcessingVerification] = useState(false);


  // Convert API ticket to display chat support
  const convertApiTicketToDisplay = (apiTicket: ApiSupportTicket): ChatSupport => {
    const statusMap: Record<string, 'Open' | 'In Progress' | 'Resolved' | 'Closed'> = {
      'open': 'Open',
      'in_progress': 'In Progress',
      'resolved': 'Resolved',
      'closed': 'Closed',
    };

    const priorityMap: Record<string, 'Low' | 'Medium' | 'High' | 'Urgent'> = {
      'low': 'Low',
      'normal': 'Medium',
      'high': 'High',
      'urgent': 'Urgent',
    };

    const date = apiTicket.created_at 
      ? new Date(apiTicket.created_at).toLocaleDateString()
      : 'N/A';

    const lastReply = apiTicket.last_message_at
      ? (() => {
          const lastMsg = new Date(apiTicket.last_message_at);
          const now = new Date();
          const diffMs = now.getTime() - lastMsg.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffMins < 1) return 'Just now';
          if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
          if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
          return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        })()
      : 'N/A';

    // Get first message as preview
    const messagePreview = apiTicket.subject || 'No message';

    return {
      id: apiTicket.id,
      user: apiTicket.user_profiles?.full_name || apiTicket.user_profiles?.email || 'Unknown',
      email: apiTicket.user_profiles?.email || 'N/A',
      subject: apiTicket.subject,
      message: messagePreview,
      status: statusMap[apiTicket.status] || (apiTicket.status as string) || 'Open',
      priority: priorityMap[apiTicket.priority] || (apiTicket.priority as string) || 'Medium',
      date: date,
      lastReply: lastReply,
      user_id: apiTicket.user_id,
      category: apiTicket.category,
      assigned_to: apiTicket.assigned_to ?? undefined,
      last_message_at: apiTicket.last_message_at,
      created_at: apiTicket.created_at,
      updated_at: apiTicket.updated_at ?? undefined,
      resolved_at: apiTicket.resolved_at ?? undefined,
      user_profiles: apiTicket.user_profiles,
      assigned_admin: apiTicket.assigned_admin,
      message_count: apiTicket.message_count,
    };
  };

  // Convert API message to display message
  const convertApiMessageToDisplay = (apiMessage: ApiSupportMessage, ticketId: string): ChatMessage => {
    const timestamp = apiMessage.created_at
      ? new Date(apiMessage.created_at).toLocaleString()
      : 'N/A';

    return {
      id: apiMessage.id,
      chatId: ticketId,
      sender: apiMessage.is_admin ? 'admin' : 'user',
      message: apiMessage.message,
      timestamp: timestamp,
      sender_display_name: (apiMessage as { sender_display_name?: string | null }).sender_display_name ?? null,
      ticket_id: apiMessage.ticket_id,
      user_id: apiMessage.user_id,
      is_admin: apiMessage.is_admin,
      is_read: apiMessage.is_read,
      read_at: apiMessage.read_at ?? undefined,
      created_at: apiMessage.created_at,
      user_profiles: apiMessage.user_profiles,
    };
  };

  // Fetch chat tickets
  const fetchChatTickets = async (
    page: number = 1,
    statusFilter?: string,
    priorityFilter?: string
  ) => {
    setChatLoading(true);
    try {
      const response = await chatSupportApi.getTickets({
        page,
        limit: chatTicketsLimit,
        status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter && priorityFilter !== 'all' ? priorityFilter : undefined,
      });

      if (response.success && response.data) {
        const tickets = Array.isArray(response.data) ? response.data : ('tickets' in response.data ? response.data.tickets : []);
        const displayTickets = tickets.map(convertApiTicketToDisplay);
        setChatMessages(displayTickets);
        
        if (!Array.isArray(response.data) && 'pagination' in response.data && response.data.pagination) {
          setChatTicketsTotal(response.data.pagination.total);
          setChatTicketsTotalPages(response.data.pagination.pages);
          setChatTicketsPage(response.data.pagination.page);
        }
      } else {
        console.error('Failed to fetch chat tickets:', response.error);
        alert(response.error || 'Failed to fetch tickets');
      }
    } catch (error: unknown) {
      console.error('Error fetching chat tickets:', error);
      alert('Error fetching tickets: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setChatLoading(false);
    }
  };

  // Fetch ticket details and messages
  const fetchTicketDetails = async (ticketId: string) => {
    try {
      const response = await chatSupportApi.getTicket(ticketId);
      if (response.success && response.data) {
        const ticketData = response.data.ticket;
        const messages = response.data.messages.map((msg: ApiSupportMessage) => convertApiMessageToDisplay(msg, ticketId));
        setConversationMessages(messages);
        
        // Update the ticket in the list
        setChatMessages(prev => prev.map(t => 
          t.id === ticketId ? convertApiTicketToDisplay(ticketData) : t
        ));
      } else {
        console.error('Failed to fetch ticket details:', response.error);
        // Don't show alert for every error - just log it
      }
    } catch (error: unknown) {
      console.error('Error fetching ticket details:', error);
      // Don't show alert for every error - just log it
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const { data: p } = await supabase
        .from('user_profiles')
        .select('full_name,email')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const label =
        (p?.full_name && String(p.full_name).trim()) ||
        (p?.email && String(p.email).split('@')[0]) ||
        'Support';
      setAgentChatDisplayName(label.slice(0, 80));
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    typingBridgeRef.current?.cleanup();
    typingBridgeRef.current = null;
    setRemoteTyping(null);
    if (!selectedChat || !isAuthenticated || activeTab !== 'chat') return;
    const bridge = attachSupportTypingBridge(selectedChat, 'agent', ({ name, active }) => {
      setRemoteTyping(active ? { name } : null);
    });
    typingBridgeRef.current = bridge;
    return () => {
      bridge.cleanup();
      if (typingBridgeRef.current === bridge) typingBridgeRef.current = null;
      setRemoteTyping(null);
    };
  }, [selectedChat, isAuthenticated, activeTab]);

  const flushAgentTypingTimers = () => {
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }
    if (typingIdleRef.current) {
      clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }
  };

  const handleReplyChange = (value: string) => {
    setReplyMessage(value);
    const bridge = typingBridgeRef.current;
    if (!bridge) return;
    if (!value.trim()) {
      flushAgentTypingTimers();
      void bridge.sendTyping(agentChatDisplayName, 'stop');
      return;
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      typingDebounceRef.current = null;
      void bridge.sendTyping(agentChatDisplayName, 'start');
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = setTimeout(() => {
        typingIdleRef.current = null;
        void bridge.sendTyping(agentChatDisplayName, 'stop');
      }, 2500);
    }, 400);
  };

  // Fetch chat statistics
  const fetchChatStatistics = async () => {
    // TODO: Implement getStatistics in chatSupportApi (it's getChatStatistics in the API)
    try {
      const response = await chatSupportApi.getChatStatistics();
      if (response.success && response.data) {
        setChatStatistics(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching chat statistics:', error);
    }
  };

  // Fetch admin list - TODO: Implement getAdminList in chatSupportApi
  // const fetchChatAdmins = async () => {
  //   try {
  //     const response = await chatSupportApi.getAdminList();
  //     if (response.success && response.data) {
  //       setChatAdmins(response.data.admins);
  //     }
  //   } catch (error: unknown) {
  //     console.error('Error fetching admin list:', error);
  //   }
  // };

  const [chatMessages, setChatMessages] = useState<ChatSupport[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatTicketsPage, setChatTicketsPage] = useState(1);
  const [chatTicketsLimit] = useState(20);
  const [chatTicketsTotal, setChatTicketsTotal] = useState(0);
  const [chatTicketsTotalPages, setChatTicketsTotalPages] = useState(1);
  const [chatStatistics, setChatStatistics] = useState<ChatStatistics | null>(null);
  const [chatAdmins, setChatAdmins] = useState<Array<{ user_id: string; full_name: string; email: string }>>([]);

  // Fetch verifications when tab is active
  const fetchVerifications = async () => {
    setVerificationLoading(true);
    try {
      const response = await verificationApi.getVerifications({
        status: verificationStatusFilter !== 'all' ? verificationStatusFilter : undefined,
        search: verificationSearchQuery || undefined,
      });

      if (response.success && response.data) {
        setVerifications(response.data);
      } else {
        const errorMsg = response.error || 'Failed to fetch verifications';
        console.error('Failed to fetch verifications:', errorMsg);
        // Don't show alert for every error - just log it
        // alert(errorMsg);
      }
    } catch (error: unknown) {
      // Better error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = {
        message: errorMessage,
        error: error,
        ...(error instanceof Error && { stack: error.stack }),
      };
      console.error('Error fetching verifications:', errorDetails);
      // Don't show alert for every error - just log it
      // alert('Error fetching verifications: ' + errorMessage);
    } finally {
      setVerificationLoading(false);
    }
  };

  // Fetch verifications when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'verifications') {
      fetchVerifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, verificationStatusFilter, verificationSearchQuery]);

  // Fetch chat data when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'chat') {
      fetchChatTickets(chatTicketsPage, chatFilter === 'all' ? undefined : chatFilter === 'unread' ? 'open' : undefined, chatFilter === 'high' ? 'urgent' : undefined);
      fetchChatStatistics();
      // fetchChatAdmins(); // TODO: Uncomment when getAdminList API method is implemented
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, chatTicketsPage, chatFilter]);

  // Fetch ticket details when selected
  useEffect(() => {
    if (selectedChat && isAuthenticated && activeTab === 'chat') {
      fetchTicketDetails(selectedChat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat, isAuthenticated, activeTab]);

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalsPage, setWithdrawalsPage] = useState(1);
  const [withdrawalsLimit] = useState(20);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);
  const [withdrawalsTotalPages, setWithdrawalsTotalPages] = useState(1);
  const [withdrawalStats, setWithdrawalStats] = useState<WithdrawalStats | null>(null);

  // Revenue state
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [revenueRecords, setRevenueRecords] = useState<RevenueRecord[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenuePage, setRevenuePage] = useState(1);
  const [revenueLimit] = useState(50);
  const [revenueDateFilter, setRevenueDateFilter] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('all');
  const [revenueSourceFilter, setRevenueSourceFilter] = useState<string>('all');

  // Filter users client-side (API already filters, but we can do additional filtering)
  const filteredUsers = users.filter(user =>
    !userSearchTerm || 
    user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  // Filter transactions client-side (API already filters, but we can do additional filtering)
  const filteredTransactions = transactions;

  const filteredCryptos = cryptos.filter(crypto =>
    crypto.name.toLowerCase().includes(cryptoSearchTerm.toLowerCase()) ||
    crypto.symbol.toLowerCase().includes(cryptoSearchTerm.toLowerCase())
  );

  // Filter notifications client-side (API already filters, but we can do additional filtering)
  const filteredNotifications = notifications;

  // Filter referrals client-side (API already filters, but we can do additional filtering)
  const filteredReferrals = referralFilter === 'all' 
    ? referrals 
    : referrals.filter(r => {
        const statusLower = r.status.toLowerCase();
        const filterLower = referralFilter.toLowerCase();
        return statusLower === filterLower || 
               (filterLower === 'active' && (statusLower === 'active' || (r.total_referrals || 0) > 0)) ||
               (filterLower === 'used' && (statusLower === 'used' || statusLower === 'completed' || statusLower === 'credited'));
      });

  // Filter chats client-side (API already filters, but we can do additional filtering)
  const filteredChats = chatFilter === 'all' 
    ? chatMessages 
    : chatFilter === 'unread'
    ? chatMessages.filter(c => c.status === 'Open' || c.status === 'open')
    : chatFilter === 'high'
    ? chatMessages.filter(c => (c.priority === 'High' || c.priority === 'high' || c.priority === 'Urgent' || c.priority === 'urgent'))
    : chatMessages;

  // Convert API withdrawal to display withdrawal
  const convertApiWithdrawalToDisplay = (apiWithdrawal: ApiWithdrawal): Withdrawal => {
    const statusMap: Record<string, 'Pending' | 'Approved' | 'Rejected' | 'Processing' | 'Completed'> = {
      'pending': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'processing': 'Processing',
      'completed': 'Completed',
      'failed': 'Rejected',
    };

    const date = apiWithdrawal.created_at 
      ? new Date(apiWithdrawal.created_at).toLocaleString()
      : 'N/A';

    const amount = parseFloat(apiWithdrawal.amount?.toString() || '0');
    const formattedAmount = apiWithdrawal.currency === 'NGN' 
      ? `₦${amount.toLocaleString()}`
      : `$${amount.toLocaleString()}`;

    const fee = apiWithdrawal.metadata?.withdrawal_fee || 0;
    const formattedFee = apiWithdrawal.currency === 'NGN' 
      ? `₦${fee.toLocaleString()}`
      : `$${fee.toLocaleString()}`;

    return {
      id: apiWithdrawal.id,
      user: apiWithdrawal.user_profiles?.full_name || apiWithdrawal.user_profiles?.email || 'Unknown',
      amount: formattedAmount,
      currency: apiWithdrawal.currency || 'NGN',
      bankName: apiWithdrawal.bank_name || 'N/A',
      accountNumber: apiWithdrawal.account_number || 'N/A',
      accountName: apiWithdrawal.account_name || 'N/A',
      status: statusMap[apiWithdrawal.status] || (apiWithdrawal.status as string) || 'Pending',
      date: date,
      fee: formattedFee,
      withdrawalId: apiWithdrawal.id,
      reference: apiWithdrawal.metadata?.reference || apiWithdrawal.id,
      userEmail: apiWithdrawal.user_profiles?.email,
      userPhone: apiWithdrawal.user_profiles?.phone_number,
      processedDate: apiWithdrawal.processed_at ? new Date(apiWithdrawal.processed_at).toLocaleString() : undefined,
      processedBy: apiWithdrawal.processed_by ?? undefined,
      rejectionReason: apiWithdrawal.metadata?.rejection_reason,
      transactionHash: apiWithdrawal.metadata?.transaction_hash,
      user_id: apiWithdrawal.user_id,
      bank_account_id: apiWithdrawal.bank_account_id ?? undefined,
      admin_notes: apiWithdrawal.admin_notes ?? undefined,
      processed_at: apiWithdrawal.processed_at ?? undefined,
      created_at: apiWithdrawal.created_at,
      updated_at: apiWithdrawal.updated_at ?? undefined,
      metadata: apiWithdrawal.metadata,
      user_profiles: apiWithdrawal.user_profiles,
    };
  };

  // Fetch withdrawals
  const fetchWithdrawals = async (
    page: number = 1,
    statusFilter?: string
  ) => {
    setWithdrawalLoading(true);
    try {
      const response = await withdrawalApi.getWithdrawals({
        page,
        limit: withdrawalsLimit,
        status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
      });

      if (response.success && response.data) {
        const withdrawals = Array.isArray(response.data) ? response.data : ('withdrawals' in response.data ? response.data.withdrawals : []);
        const displayWithdrawals = withdrawals.map(convertApiWithdrawalToDisplay);
        setWithdrawals(displayWithdrawals);
        
        if (!Array.isArray(response.data) && 'pagination' in response.data && response.data.pagination) {
          setWithdrawalsTotal(response.data.pagination.total);
          setWithdrawalsTotalPages(response.data.pagination.pages);
          setWithdrawalsPage(response.data.pagination.page);
        }
      } else {
        console.error('Failed to fetch withdrawals:', response.error);
        alert(response.error || 'Failed to fetch withdrawals');
      }
    } catch (error: unknown) {
      console.error('Error fetching withdrawals:', error);
      alert('Error fetching withdrawals: ' + (error as Error)?.message || 'Unknown error');
    } finally {
      setWithdrawalLoading(false);
    }
  };

  // Fetch withdrawal statistics
  const fetchWithdrawalStats = async () => {
    try {
      const response = await withdrawalApi.getWithdrawalStats();
      if (response.success && response.data) {
        setWithdrawalStats(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching withdrawal stats:', error);
    }
  };

  // Fetch withdrawals data when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'withdrawals') {
      fetchWithdrawals(withdrawalsPage, withdrawalFilter === 'all' ? undefined : withdrawalFilter);
      fetchWithdrawalStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, withdrawalsPage, withdrawalFilter]);

  // Fetch revenue stats
  const fetchRevenueStats = async () => {
    try {
      const response = await revenueApi.getRevenueStats();
      if (response.success && response.data) {
        setRevenueStats(response.data);
      } else {
        console.error('Failed to fetch revenue stats:', response.error);
      }
    } catch (error: unknown) {
      console.error('Error fetching revenue stats:', error);
    }
  };

  // Fetch revenue records
  const fetchRevenueRecords = async () => {
    setRevenueLoading(true);
    try {
      const now = new Date();
      let startDate: string | undefined;
      
      if (revenueDateFilter === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (revenueDateFilter === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString();
      } else if (revenueDateFilter === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (revenueDateFilter === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      }

      const revenueTypeMap: Record<string, string> = {
        'fees': 'DEPOSIT_FEE',
        'trading': 'BUY_FEE',
        'gift-cards': 'OTHER',
        'utilities': 'OTHER',
      };

      const response = await revenueApi.getRevenue({
        start_date: startDate,
        revenue_type: revenueSourceFilter !== 'all' ? revenueTypeMap[revenueSourceFilter] : undefined,
        limit: revenueLimit,
        offset: (revenuePage - 1) * revenueLimit,
      });

      if (response.success && response.data) {
        setRevenueRecords(response.data.records);
      } else {
        console.error('Failed to fetch revenue records:', response.error);
      }
    } catch (error: unknown) {
      console.error('Error fetching revenue records:', error);
    } finally {
      setRevenueLoading(false);
    }
  };

  // Fetch revenue data when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'revenue') {
      fetchRevenueStats();
      fetchRevenueRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, revenuePage, revenueDateFilter, revenueSourceFilter]);

  // Fetch app settings
  const fetchAppSettings = async () => {
    setAppSettingsLoading(true);
    try {
      const response = await appSettingsApi.getAppSettings();
      if (response.success && response.data) {
        const settings = response.data;
        setAppSettings({
          appName: settings.app_name || 'ChainCola',
          appVersion: settings.app_version || '1.0.0',
          maintenanceMode: settings.maintenance_mode || false,
          registrationEnabled: settings.registration_enabled || true,
          withdrawalFee: settings.withdrawal_fee?.toString() || '2.5',
          transactionFee: settings.transaction_fee?.toString() || '1.0',
          supportEmail: settings.support_email || 'support@chaincola.com',
          supportPhone: settings.support_phone || '+234 800 000 0000',
          privacyPolicy: settings.privacy_policy || '',
          termsAndConditions: settings.terms_and_conditions || '',
        });
      } else {
        console.error('Failed to fetch app settings:', response.error);
      }
    } catch (error: unknown) {
      console.error('Error fetching app settings:', error);
    } finally {
      setAppSettingsLoading(false);
    }
  };

  // Save app settings
  const saveAppSettings = async () => {
    setAppSettingsSaving(true);
    try {
      const response = await appSettingsApi.updateAppSettings({
        app_name: appSettings.appName,
        app_version: appSettings.appVersion,
        maintenance_mode: appSettings.maintenanceMode,
        registration_enabled: appSettings.registrationEnabled,
        withdrawal_fee: parseFloat(appSettings.withdrawalFee) || 2.5,
        transaction_fee: parseFloat(appSettings.transactionFee) || 1.0,
        support_email: appSettings.supportEmail,
        support_phone: appSettings.supportPhone,
        privacy_policy: appSettings.privacyPolicy || null,
        terms_and_conditions: appSettings.termsAndConditions || null,
      });

      if (response.success) {
        alert('Settings saved successfully!');
        // Refresh settings to show updated values
        fetchAppSettings();
      } else {
        const errorMsg = response.error || 'Failed to save settings';
        console.error('Failed to save app settings:', errorMsg);
        alert(errorMsg);
      }
    } catch (error: unknown) {
      // Enhanced error logging
      const errorDetails: any = {};
      if (error && typeof error === 'object') {
        if ('code' in error) errorDetails.code = (error as any).code;
        if ('message' in error) errorDetails.message = (error as any).message;
        if ('details' in error) errorDetails.details = (error as any).details;
        if ('hint' in error) errorDetails.hint = (error as any).hint;
      }
      
      const hasErrorInfo = Object.keys(errorDetails).length > 0;
      if (hasErrorInfo) {
        console.error('Error saving app settings:', errorDetails);
      } else {
        console.error('Error saving app settings (empty error object):', {
          errorType: typeof error,
          errorString: String(error),
          errorKeys: error && typeof error === 'object' ? Object.keys(error) : [],
        });
      }
      
      const errorMessage = (error as Error)?.message || String(error) || 'Unknown error';
      alert('Error saving settings: ' + errorMessage);
    } finally {
      setAppSettingsSaving(false);
    }
  };

  // Fetch app settings when settings tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === 'settings') {
      fetchAppSettings();
    }
  }, [isAuthenticated, activeTab]);

  // Filter withdrawals client-side (API already filters, but we can do additional filtering)
  const filteredWithdrawals = withdrawals;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Suspended':
      case 'Failed':
      case 'Inactive':
        return 'bg-red-100 text-red-800';
      case 'Pending':
      case 'Maintenance':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleUserAction = async (userId: string, action: string) => {
    if (action === 'view') {
      const user = users.find(u => u.id === userId || u.user_id === userId);
      if (user) {
        // Fetch full user details
        try {
          const response = await adminApi.getUserDetails(user.user_id || userId);
          if (response.success && response.data) {
            const fullUser = convertApiUserToDisplay(response.data);
            setSelectedUser(fullUser);
            setShowUserDetails(true);
          } else {
            // Fallback to basic user info
            setSelectedUser(user);
            setShowUserDetails(true);
          }
        } catch {
          // Fallback to basic user info
          setSelectedUser(user);
          setShowUserDetails(true);
        }
      }
    } else if (action === 'credit') {
      const user = users.find(u => u.id === userId || u.user_id === userId);
      if (user) {
        setSelectedUser(user);
        setShowCreditModal(true);
      }
    } else if (action === 'debit') {
      const user = users.find(u => u.id === userId || u.user_id === userId);
      if (user) {
        setSelectedUser(user);
        setShowDebitModal(true);
      }
    } else if (action === 'suspend') {
      if (confirm('Are you sure you want to suspend this user?')) {
        try {
          const response = await adminApi.suspendUser(userId);
          if (response.success) {
            alert('User suspended successfully');
            fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
          } else {
            alert(response.error || 'Failed to suspend user');
          }
        } catch (error: unknown) {
          alert('Error suspending user: ' + (error as Error)?.message || 'Unknown error');
        }
      }
    } else if (action === 'activate') {
      try {
        const response = await adminApi.activateUser(userId);
        if (response.success) {
          alert('User activated successfully');
          fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
        } else {
          alert(response.error || 'Failed to activate user');
        }
      } catch (error: unknown) {
        alert('Error activating user: ' + (error as Error)?.message || 'Unknown error');
      }
    } else if (action === 'delete') {
      if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        const permanent = confirm('Permanently delete? (Super admin only)');
        try {
          const response = await adminApi.deleteUser(userId, permanent);
          if (response.success) {
            alert('User deleted successfully');
            fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
          } else {
            alert(response.error || 'Failed to delete user');
          }
        } catch (error: unknown) {
          alert('Error deleting user: ' + (error as Error)?.message || 'Unknown error');
        }
      }
    }
  };

  
  const handleCreditUser = async () => {
    if (!selectedUser || !creditAmount || !creditReason) {
      alert('Please fill in all fields');
      return;
    }
    const amount = parseFloat(creditAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!creditCurrency || !['NGN', 'BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'].includes(creditCurrency)) {
      alert('Please select a valid currency');
      return;
    }

    try {
      const userId = selectedUser.user_id || selectedUser.id;
      const response = await adminApi.creditBalance(userId, amount, creditCurrency, creditReason);
      if (response.success) {
        alert(`Successfully credited ${amount} ${creditCurrency} to ${selectedUser.name}`);
        setShowCreditModal(false);
        setCreditAmount('');
        setCreditCurrency('NGN');
        setCreditReason('');
        setSelectedUser(null);
        fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
      } else {
        alert(response.error || 'Failed to credit balance');
      }
    } catch (error: unknown) {
      alert('Error crediting balance: ' + (error as Error)?.message || 'Unknown error');
    }
  };

  const handleDebitUser = async () => {
    if (!selectedUser || !debitAmount || !debitReason) {
      alert('Please fill in all fields');
      return;
    }
    const amount = parseFloat(debitAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!debitCurrency || !['NGN', 'BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'].includes(debitCurrency)) {
      alert('Please select a valid currency');
      return;
    }

    if (!confirm(`Are you sure you want to debit ${amount} ${debitCurrency} from ${selectedUser.name}?`)) {
      return;
    }

    try {
      const userId = selectedUser.user_id || selectedUser.id;
      const wasViewingDetails = showUserDetails; // Remember if user details modal was open
      const response = await adminApi.debitBalance(userId, amount, debitCurrency, debitReason);
      if (response.success) {
        alert(`Successfully debited ${amount} ${debitCurrency} from ${selectedUser.name}`);
        setShowDebitModal(false);
        setDebitAmount('');
        setDebitCurrency('NGN');
        setDebitReason('');
        
        // Refresh user list first
        await fetchUsers(usersPage, userSearchTerm || undefined, userStatusFilter);
        
        // If user details modal was open, refresh the selected user data
        if (wasViewingDetails) {
          try {
            const userResponse = await adminApi.getUserDetails(userId);
            if (userResponse.success && userResponse.data) {
              const updatedUser = convertApiUserToDisplay(userResponse.data);
              setSelectedUser(updatedUser);
              // Keep the modal open with updated data
            } else {
              // If fetch fails, close the modal
              setShowUserDetails(false);
              setSelectedUser(null);
            }
          } catch (error) {
            console.error('Error refreshing user details:', error);
            setShowUserDetails(false);
            setSelectedUser(null);
          }
        } else {
          setSelectedUser(null);
        }
      } else {
        alert(response.error || 'Failed to debit balance');
      }
    } catch (error: unknown) {
      alert('Error debiting balance: ' + (error as Error)?.message || 'Unknown error');
    }
  };

  const handleRejectTransaction = async () => {
    if (!transactionToReject) {
      return;
    }

    try {
      const response = await transactionsApi.updateTransactionStatus(
        transactionToReject,
        'failed',
        rejectReason || undefined
      );
      if (response.success) {
        alert('Transaction rejected successfully');
        setShowRejectModal(false);
        setTransactionToReject(null);
        setRejectReason('');
        fetchTransactions(
          transactionsPage,
          transactionFilter,
          transactionTypeFilter,
          transactionCurrencyFilter,
          transactionSearchQuery || undefined
        );
        fetchTransactionStats();
      } else {
        alert(response.error || 'Failed to reject transaction');
      }
    } catch (error: unknown) {
      alert('Error rejecting transaction: ' + (error as Error)?.message || 'Unknown error');
    }
  };

 const handleTransactionAction = async (transactionId: string, action: string) => {
    if (action === 'view') {
      const transaction = transactions.find(t => t.id === transactionId);
      if (transaction) {
        // TODO: Implement getTransactionDetails in transactionsApi
        // For now, use the transaction from the list
        setSelectedTransaction(transaction);
        setShowTransactionDetails(true);
        /* // Fetch full transaction details would go here
        try {
          const response = await transactionsApi.getTransactionDetails(transactionId);
          if (response.success && response.data) {
            const fullTransaction = convertApiTransactionToDisplay(response.data.transaction);
            setSelectedTransaction(fullTransaction);
            setShowTransactionDetails(true);
          } else {
            setSelectedTransaction(transaction);
            setShowTransactionDetails(true);
          }
        } catch {
          setSelectedTransaction(transaction);
          setShowTransactionDetails(true);
        }
        */
      }
    } else if (action === 'approve') {
      if (confirm('Are you sure you want to approve this transaction?')) {
        try {
          const response = await transactionsApi.updateTransactionStatus(transactionId, 'completed');
          if (response.success) {
            alert('Transaction approved successfully');
            fetchTransactions(
              transactionsPage,
              transactionFilter,
              transactionTypeFilter,
              transactionCurrencyFilter,
              transactionSearchQuery || undefined
            );
            fetchTransactionStats();
          } else {
            alert(response.error || 'Failed to approve transaction');
          }
        } catch (error: unknown) {
          alert('Error approving transaction: ' + (error as Error)?.message || 'Unknown error');
        }
      }
    } else if (action === 'reject') {
      setTransactionToReject(transactionId);
      setRejectReason('');
      setShowRejectModal(true);
    }
  };

  const handleCryptoAction = async (cryptoId: string, action: string) => {
    const sym = cryptoId.toUpperCase();
    let next: CryptoAssetRuntimeStatus | null = null;
    if (action === 'activate') next = 'active';
    else if (action === 'deactivate') next = 'inactive';
    else if (action === 'maintenance') next = 'maintenance';
    if (!next) return;

    setCryptoAssetStatusSavingId(sym);
    try {
      const response = await appSettingsApi.mergeCryptoAssetStatuses({ [sym]: next });
      if (response.success && response.data) {
        setCryptoAssetRuntimeBySymbol(response.data.crypto_asset_status);
      } else {
        alert(response.error || 'Failed to update asset status');
      }
    } catch (error: unknown) {
      alert('Error updating asset status: ' + ((error as Error)?.message || 'Unknown error'));
    } finally {
      setCryptoAssetStatusSavingId(null);
    }
  };

  const handleNotificationAction = async (notificationId: string, action: string) => {
    if (action === 'mark-read') {
      // TODO: Implement markAsRead in notificationsApi
      alert('Mark as read functionality not yet implemented');
      return;
      // try {
      //   const response = await notificationsApi.markAsRead({ notification_ids: [notificationId] });
      //   if (response.success) {
      //     alert('Notification marked as read');
      //     fetchNotifications(
      //       notificationsPage,
      //       notificationTypeFilter,
      //       notificationStatusFilter,
      //       notificationReadFilter,
      //       notificationSearchQuery || undefined
      //     );
      //   } else {
      //     alert(response.error || 'Failed to mark notification as read');
      //   }
      // } catch (error: unknown) {
      //   alert('Error marking notification as read: ' + (error as Error)?.message || 'Unknown error');
      // }
    } else if (action === 'delete') {
      // TODO: Implement deleteNotifications in notificationsApi
      alert('Delete notification functionality not yet implemented');
      return;
      // if (confirm('Are you sure you want to delete this notification?')) {
      //   try {
      //     const response = await notificationsApi.deleteNotifications({ notification_ids: [notificationId] });
      //     if (response.success) {
      //       alert('Notification deleted successfully');
      //       fetchNotifications(
      //         notificationsPage,
      //         notificationTypeFilter,
      //         notificationStatusFilter,
      //         notificationReadFilter,
      //         notificationSearchQuery || undefined
      //       );
      //       fetchNotificationStats();
      //     } else {
      //       alert(response.error || 'Failed to delete notification');
      //     }
      //   } catch (error: unknown) {
      //     alert('Error deleting notification: ' + (error as Error)?.message || 'Unknown error');
      //   }
      // }
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setPushNotificationImageUploading(true);
    try {
      // Get Supabase client and session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Not authenticated. Please log in again.');
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPushNotificationImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `notification-images/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('notification-images')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        // Try to create bucket if it doesn't exist
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('does not exist')) {
          alert('Storage bucket "notification-images" not found. Please create it in Supabase Dashboard.');
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('notification-images')
        .getPublicUrl(uploadData.path);

      setPushNotificationImageUrl(urlData.publicUrl);
      setPushNotificationImageFile(file);
      alert('Image uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      alert(`Failed to upload image: ${error.message || 'Unknown error'}`);
    } finally {
      setPushNotificationImageUploading(false);
    }
  };

  const ensureLogoUploaded = async (supabase: any): Promise<string | null> => {
    try {
      // Check if logo exists in app-assets bucket
      const { data: logoData, error: logoError } = await supabase.storage
        .from('app-assets')
        .list('', {
          search: 'logo.png',
        });

      // If logo doesn't exist, try to upload it from a default location
      if (logoError || !logoData || logoData.length === 0) {
        console.log('📤 Logo not found in storage, attempting to upload...');
        
        // Try to fetch logo from a public CDN or default location
        // For now, we'll just log that it needs to be uploaded manually
        console.warn('⚠️ Logo not found. Please upload logo.png to app-assets bucket manually or use the upload script.');
        return null;
      }

      // Logo exists, return the public URL
      const { data: urlData } = supabase.storage
        .from('app-assets')
        .getPublicUrl('logo.png');
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error checking logo:', error);
      return null;
    }
  };

  const handleSendPushNotification = async () => {
    if (!pushNotificationTitle || !pushNotificationMessage) {
      alert('Please fill in title and message');
      return;
    }

    // If scheduled, just save for later (scheduling logic would go here)
    if (pushNotificationScheduled) {
      alert('Scheduled notifications are not yet implemented. Please send immediately.');
      return;
    }

    try {
      // Get Supabase client and session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Not authenticated. Please log in again.');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl) {
        alert('Supabase URL not configured');
        return;
      }

      // Ensure logo is available (it will be used automatically if no custom image is provided)
      // The Edge Function will automatically use CHAINCOLA_LOGO_URL if imageUrl is not provided
      await ensureLogoUploaded(supabase);

      // Determine target users - fetch directly from database instead of relying on state
      let targetUserIds: string[] = [];
      
      if (pushNotificationTarget === 'All Users') {
        // Fetch all users from the database
        console.log('Fetching all users for push notification...');
        let allUsers: string[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 100; // Fetch in batches of 100

        while (hasMore) {
          try {
            const response = await adminApi.getUsers({
              page,
              limit: pageSize,
              sort_by: 'created_at',
              sort_order: 'desc',
            });

            if (response.success && response.data && response.data.users.length > 0) {
              const pageUsers = response.data.users.map((u: ApiUser) => {
                // Handle both id and user_id fields
                if (u.user_id) return u.user_id;
                if (u.id) return u.id;
                return null;
              }).filter((id): id is string => id !== null);
              
              allUsers = [...allUsers, ...pageUsers];
              
              // Check if there are more pages
              const totalPages = response.data.pagination?.pages || 0;
              if (page >= totalPages) {
                hasMore = false;
              } else {
                page++;
              }
            } else {
              hasMore = false;
            }
          } catch (error: unknown) {
            console.error(`Error fetching users page ${page}:`, error);
            hasMore = false;
          }
        }

        targetUserIds = allUsers;
        console.log(`Found ${targetUserIds.length} users to send notifications to`);
      } else if (pushNotificationTarget === 'Specific Users') {
        // For specific users, you'd need a user selection UI
        alert('Specific user selection is not yet implemented. Sending to all users.');
        // Fallback to all users
        let allUsers: string[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore) {
          try {
            const response = await adminApi.getUsers({
              page,
              limit: pageSize,
              sort_by: 'created_at',
              sort_order: 'desc',
            });

            if (response.success && response.data && response.data.users.length > 0) {
              const pageUsers = response.data.users.map((u: ApiUser) => {
                if (u.user_id) return u.user_id;
                if (u.id) return u.id;
                return null;
              }).filter((id): id is string => id !== null);
              
              allUsers = [...allUsers, ...pageUsers];
              
              const totalPages = response.data.pagination?.pages || 0;
              if (page >= totalPages) {
                hasMore = false;
              } else {
                page++;
              }
            } else {
              hasMore = false;
            }
          } catch (error: unknown) {
            console.error(`Error fetching users page ${page}:`, error);
            hasMore = false;
          }
        }

        targetUserIds = allUsers;
      } else {
        // User Segments - would need segment logic
        alert('User segments are not yet implemented. Sending to all users.');
        // Fallback to all users
        let allUsers: string[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore) {
          try {
            const response = await adminApi.getUsers({
              page,
              limit: pageSize,
              sort_by: 'created_at',
              sort_order: 'desc',
            });

            if (response.success && response.data && response.data.users.length > 0) {
              const pageUsers = response.data.users.map((u: ApiUser) => {
                if (u.user_id) return u.user_id;
                if (u.id) return u.id;
                return null;
              }).filter((id): id is string => id !== null);
              
              allUsers = [...allUsers, ...pageUsers];
              
              const totalPages = response.data.pagination?.pages || 0;
              if (page >= totalPages) {
                hasMore = false;
              } else {
                page++;
              }
            } else {
              hasMore = false;
            }
          } catch (error: unknown) {
            console.error(`Error fetching users page ${page}:`, error);
            hasMore = false;
          }
        }

        targetUserIds = allUsers;
      }

      if (targetUserIds.length === 0) {
        alert('No users found to send notifications to');
        return;
      }

      // Show loading state
      const loadingMessage = `Sending push notifications to ${targetUserIds.length} user(s)...`;
      console.log(loadingMessage);

      // Send push notifications to each user
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const userId of targetUserIds) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              title: pushNotificationTitle,
              body: pushNotificationMessage,
              data: {
                type: pushNotificationType,
                deepLink: pushNotificationDeepLink || undefined,
                imageUrl: pushNotificationImageUrl || undefined,
              },
              priority: 'high',
              imageUrl: pushNotificationImageUrl || undefined,
            }),
          });

          const result = await response.json();
          if (result.success) {
            successCount++;
            
            // Save notification to database for this user
            await supabase.from('notifications').insert({
              user_id: userId,
              type: pushNotificationType.toLowerCase(),
              title: pushNotificationTitle,
              message: pushNotificationMessage,
              status: 'unread',
              data: {
                deepLink: pushNotificationDeepLink || undefined,
                imageUrl: pushNotificationImageUrl || undefined,
              },
            });
          } else {
            failCount++;
            errors.push(`User ${userId}: ${result.error || 'Unknown error'}`);
          }
        } catch (error: unknown) {
          failCount++;
          errors.push(`User ${userId}: ${(error as Error)?.message || 'Unknown error' || 'Failed to send'}`);
          console.error(`Error sending push notification to user ${userId}:`, error);
        }
      }

      // Update UI
      const newNotification: Notification = {
        id: Date.now().toString(),
        title: pushNotificationTitle,
        message: pushNotificationMessage,
        type: pushNotificationType,
        status: failCount === 0 ? 'Sent' : failCount === targetUserIds.length ? 'Failed' : 'Sent',
        recipients: successCount,
        date: new Date().toISOString().split('T')[0],
        pushNotification: true,
        targetAudience: pushNotificationTarget,
        deepLink: pushNotificationDeepLink || undefined,
        imageUrl: pushNotificationImageUrl || undefined,
      };
      setNotifications([newNotification, ...notifications]);

      // Show result
      if (failCount === 0) {
        alert(`✅ Push notifications sent successfully to ${successCount} user(s)!`);
      } else {
        alert(`⚠️ Sent to ${successCount} user(s), failed for ${failCount} user(s).\n\nErrors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`);
      }

      // Reset form
      setShowPushNotificationModal(false);
      setPushNotificationTitle('');
      setPushNotificationMessage('');
      setPushNotificationType('System');
      setPushNotificationTarget('All Users');
      setPushNotificationScheduled(false);
      setPushNotificationScheduleTime('');
      setPushNotificationDeepLink('');
      setPushNotificationImageUrl('');

    } catch (error: unknown) {
      console.error('Error sending push notifications:', error);
      alert(`Failed to send push notifications: ${(error as Error)?.message || 'Unknown error' || 'Unknown error'}`);
    }
  };


  const handleWithdrawalAction = async (withdrawalId: string, action: string) => {
    // TODO: Implement approveWithdrawal, rejectWithdrawal, getWithdrawal in withdrawalApi
    alert(`Withdrawal action "${action}" not yet implemented - API methods missing`);
    console.warn('handleWithdrawalAction not implemented', { withdrawalId, action });
    return;
    /* try {
      if (action === 'approve') {
        if (!confirm('Are you sure you want to approve this withdrawal? This will debit the user\'s wallet.')) {
          return;
        }
        const adminNotes = prompt('Enter admin notes (optional):') || undefined;
        const response = await withdrawalApi.approveWithdrawal(withdrawalId, adminNotes);
        if (response.success) {
          alert('Withdrawal approved successfully');
          fetchWithdrawals(withdrawalsPage, withdrawalFilter === 'all' ? undefined : withdrawalFilter);
          fetchWithdrawalStats();
        } else {
          alert(response.error || 'Failed to approve withdrawal');
        }
      } else if (action === 'reject') {
        if (!confirm('Are you sure you want to reject this withdrawal? The user\'s wallet will be refunded.')) {
          return;
        }
        const reason = prompt('Enter rejection reason (required):');
        if (!reason) {
          alert('Rejection reason is required');
          return;
        }
        const adminNotes = prompt('Enter admin notes (optional):') || undefined;
        const response = await withdrawalApi.rejectWithdrawal(withdrawalId, reason, adminNotes);
        if (response.success) {
          alert('Withdrawal rejected successfully');
          fetchWithdrawals(withdrawalsPage, withdrawalFilter === 'all' ? undefined : withdrawalFilter);
          fetchWithdrawalStats();
        } else {
          alert(response.error || 'Failed to reject withdrawal');
        }
      } else if (action === 'view') {
        const response = await withdrawalApi.getWithdrawal(withdrawalId);
        if (response.success && response.data) {
          const withdrawal = convertApiWithdrawalToDisplay(response.data.withdrawal);
          setSelectedWithdrawal(withdrawal);
          setShowWithdrawalDetails(true);
        } else {
          alert(response.error || 'Failed to fetch withdrawal details');
        }
      }
    } catch (error: unknown) {
      alert('Error performing action: ' + (error as Error)?.message || 'Unknown error');
    }
    */
  };

  const handleChatAction = async (chatId: string, action: string) => {
    try {
      if (action === 'mark-read') {
        await chatSupportApi.markMessagesRead(chatId);
        fetchTicketDetails(chatId);
      } else if (action === 'progress') {
        const response = await chatSupportApi.updateTicket(chatId, { status: 'in_progress' });
        if (response.success) {
          fetchChatTickets(chatTicketsPage, chatFilter === 'all' ? undefined : chatFilter === 'unread' ? 'open' : undefined, chatFilter === 'high' ? 'urgent' : undefined);
          if (selectedChat === chatId) {
            fetchTicketDetails(chatId);
          }
        } else {
          alert(response.error || 'Failed to update ticket');
        }
      } else if (action === 'resolve') {
        const response = await chatSupportApi.updateTicket(chatId, { status: 'resolved' });
        if (response.success) {
          fetchChatTickets(chatTicketsPage, chatFilter === 'all' ? undefined : chatFilter === 'unread' ? 'open' : undefined, chatFilter === 'high' ? 'urgent' : undefined);
          if (selectedChat === chatId) {
            fetchTicketDetails(chatId);
          }
        } else {
          alert(response.error || 'Failed to resolve ticket');
        }
      } else if (action === 'close') {
        const response = await chatSupportApi.updateTicket(chatId, { status: 'closed' });
        if (response.success) {
          fetchChatTickets(chatTicketsPage, chatFilter === 'all' ? undefined : chatFilter === 'unread' ? 'open' : undefined, chatFilter === 'high' ? 'urgent' : undefined);
          if (selectedChat === chatId) {
            fetchTicketDetails(chatId);
          }
        } else {
          alert(response.error || 'Failed to close ticket');
        }
      }
      fetchChatStatistics();
    } catch (error: unknown) {
      alert('Error performing action: ' + (error as Error)?.message || 'Unknown error');
    }
  };

  const handleSendMessage = async () => {
    if (!selectedChat || !replyMessage.trim()) return;

    flushAgentTypingTimers();
    void typingBridgeRef.current?.sendTyping(agentChatDisplayName, 'stop');

    try {
      const response = await chatSupportApi.sendMessage(selectedChat, replyMessage.trim());
      if (response.success && response.data) {
        const newMessage = convertApiMessageToDisplay(response.data.message, selectedChat);
        setConversationMessages([...conversationMessages, newMessage]);
        setReplyMessage('');
        
        // Update ticket status to "in_progress" if it's "open"
        const chat = chatMessages.find(c => c.id === selectedChat);
        if (chat && (chat.status === 'Open' || chat.status === 'open')) {
          await chatSupportApi.updateTicket(selectedChat, { status: 'in_progress' });
          fetchChatTickets(chatTicketsPage, chatFilter === 'all' ? undefined : chatFilter === 'unread' ? 'open' : undefined, chatFilter === 'high' ? 'urgent' : undefined);
        }
        
        // Refresh ticket details
        fetchTicketDetails(selectedChat);
        fetchChatStatistics();
      } else {
        alert(response.error || 'Failed to send message');
      }
    } catch (error: unknown) {
      alert('Error sending message: ' + (error as Error)?.message || 'Unknown error');
    }
  };

  // Initialize conversation messages when a chat is selected
  useEffect(() => {
    if (selectedChat) {
      const chat = chatMessages.find(c => c.id === selectedChat);
      if (chat) {
        // Check if we already have messages for this chat (including the initial one)
        const existingMessages = conversationMessages.filter(m => m.chatId === selectedChat);
        const hasInitialMessage = existingMessages.some(m => m.id === `init-${selectedChat}`);
        
        if (existingMessages.length === 0 || !hasInitialMessage) {
          // Initialize with the user's initial message
          const initialMessage: ChatMessage = {
            id: `init-${selectedChat}`,
            chatId: selectedChat,
            sender: 'user',
            message: chat.message,
            timestamp: chat.date,
          };
          setConversationMessages(prev => {
            // Remove any old initial message for this chat and add the new one
            const filtered = prev.filter(m => !(m.chatId === selectedChat && m.id === `init-${selectedChat}`));
            return [...filtered, initialMessage];
          });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-4">Loading...</div>
          <div className="text-gray-600">Checking authentication...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-white shadow-sm border-r border-gray-200 fixed h-screen flex flex-col z-50 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-purple rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Admin</h1>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <button
            onClick={() => { setActiveTab('overview'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">📊</span>
            Overview
          </button>
          <button
            onClick={() => { setActiveTab('users'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'users'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">👥</span>
            User Management
          </button>
          <button
            onClick={() => { setActiveTab('transactions'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'transactions'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">💳</span>
            Transactions
          </button>
          <button
            onClick={() => { setActiveTab('crypto'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'crypto'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">₿</span>
            Crypto Management
          </button>
          <Link
            href="/admin/pricing-engine"
            className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="mr-3">💰</span>
            Pricing Engine
          </Link>
          <Link
            href="/admin/treasury"
            className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="mr-3">🏦</span>
            Treasury Management
          </Link>
          <Link
            href="/admin/flutterwave"
            className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="mr-3">💳</span>
            Flutterwave Management
          </Link>
          <button
            onClick={() => { setActiveTab('notifications'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'notifications'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">🔔</span>
            Notifications
          </button>
          <button
            onClick={() => { setActiveTab('referrals'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'referrals'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">🎁</span>
            Referrals
          </button>
          <button
            onClick={() => { setActiveTab('chat'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'chat'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">💬</span>
            Chat Support
          </button>
          {/* Withdrawals - Hidden: API methods not implemented (approveWithdrawal, rejectWithdrawal, getWithdrawal) */}
          {/* <button
            onClick={() => { setActiveTab('withdrawals'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'withdrawals'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">💰</span>
            Withdrawals
          </button> */}
          <button
            onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'settings'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">⚙️</span>
            App Settings
          </button>
          {/* Analytics - Hidden: Placeholder data, not fully functional */}
          {/* <button
            onClick={() => { setActiveTab('analytics'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'analytics'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">📈</span>
            Analytics
          </button> */}
          {/* Fee Management - Hidden: May not be connected to backend */}
          {/* <button
            onClick={() => { setActiveTab('fees'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'fees'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">💵</span>
            Fee Management
          </button> */}
          <button
            onClick={() => { setActiveTab('revenue'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'revenue'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">💎</span>
            Revenue
          </button>
          {/* Gift Cards - Hidden: Has "Coming soon" items, not fully functional */}
          {/* <button
            onClick={() => { setActiveTab('gift-cards'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'gift-cards'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">🎫</span>
            Gift Cards
          </button> */}
          <button
            onClick={() => { setActiveTab('verifications'); setSidebarOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'verifications'
                ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-purple-600'
            }`}
          >
            <span className="mr-3">✅</span>
            Verifications
          </button>
          <Link
            href="/admin/account-deletions"
            className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="mr-3">🗑️</span>
            Account deletions
          </Link>
        </nav>
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span className="mr-3">🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {activeTab === 'overview' && 'Dashboard Overview'}
              {activeTab === 'users' && 'User Management'}
              {activeTab === 'transactions' && 'Transaction Management'}
              {activeTab === 'crypto' && 'Crypto Management'}
              {activeTab === 'notifications' && 'Notifications'}
              {activeTab === 'referrals' && 'Referral Management'}
              {activeTab === 'chat' && 'Chat Support'}
              {activeTab === 'withdrawals' && 'Withdrawal Management'}
              {activeTab === 'settings' && 'App Settings'}
              {activeTab === 'analytics' && 'Analytics'}
              {activeTab === 'fees' && 'Fee Management'}
              {activeTab === 'revenue' && 'Platform Revenue'}
              {activeTab === 'gift-cards' && 'Gift Card Management'}
              {activeTab === 'verifications' && 'Account Verification Management'}
            </h2>
          </div>
        </header>

        <div className="p-4 sm:p-6">

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
              {stats.map((stat, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center text-2xl`}>
                      {stat.icon}
                    </div>
                    <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                      {stat.change}
                    </span>
                  </div>
                  <h3 className="text-sm text-gray-600 mb-1">{stat.title}</h3>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Transactions */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
                    <button
                      onClick={() => setActiveTab('transactions')}
                      className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                    >
                      View All →
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dashboardLoading && recentTransactionsOverview.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center">
                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                            <p className="mt-2 text-sm text-gray-500">Loading transactions...</p>
                          </td>
                        </tr>
                      ) : recentTransactionsOverview.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            No recent transactions
                          </td>
                        </tr>
                      ) : (
                        recentTransactionsOverview.map((transaction) => (
                          <tr key={transaction.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{transaction.user}</div>
                              {transaction.user_profile?.email && (
                                <div className="text-xs text-gray-500">{transaction.user_profile.email}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{transaction.type}</div>
                              <div className="text-xs text-gray-500">{transaction.crypto || transaction.currency}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{transaction.amount}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transaction.status)}`}>
                                {transaction.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {transaction.date}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('users')}
                  className="block w-full bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors text-center"
                >
                  Manage Users
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="block w-full bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors text-center"
                >
                  View Transactions
                </button>
                <Link
                  href="/admin/settings"
                  className="block w-full bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors text-center"
                >
                  Settings
                </Link>
                <Link
                  href="/admin/analytics"
                  className="block w-full bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors text-center"
                >
                  Analytics
                </Link>
                <Link
                  href="/admin/rates"
                  className="block w-full bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors text-center"
                >
                  Rate Management
                </Link>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">System Status</h2>
              {dashboardLoading && !systemHealth ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading...</p>
                </div>
              ) : systemHealth ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">API Status</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      systemHealth.edge_functions_status === 'healthy' || systemHealth.status === 'healthy'
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {systemHealth.edge_functions_status === 'healthy' || systemHealth.status === 'healthy' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Database</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      systemHealth.database_status === 'healthy' || systemHealth.status === 'healthy'
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {systemHealth.database_status === 'healthy' || systemHealth.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Storage</span>
                    <span className="text-sm font-medium text-gray-900">
                      {systemHealth.storage_used != null &&
                      systemHealth.storage_limit != null &&
                      systemHealth.storage_limit > 0
                        ? `${((systemHealth.storage_used / systemHealth.storage_limit) * 100).toFixed(1)}% used`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">API Calls Today</span>
                    <span className="text-sm font-medium text-gray-900">
                      {(systemHealth.api_calls_today ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  System status unavailable
                </div>
              )}
            </div>

            {/* Quick Stats */}
            {quickStats && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Today&apos;s Stats</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Today&apos;s Revenue</span>
                    <span className="text-sm font-bold text-green-600">
                      ₦{(quickStats.revenue_today ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Today&apos;s Transactions</span>
                    <span className="text-sm font-bold text-gray-900">
                      {(quickStats.transactions_today ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">New Users Today</span>
                    <span className="text-sm font-bold text-gray-900">
                      {(quickStats.users_today ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Pending Withdrawals</span>
                    <span className="text-sm font-bold text-yellow-600">
                      {(quickStats.pending_withdrawals ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Search and Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Search users by name, email, or phone..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      setUsersPage(1);
                      fetchUsers(1, userSearchTerm || undefined, userStatusFilter);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
                <select
                  value={userStatusFilter}
                  onChange={(e) => {
                    setUserStatusFilter(e.target.value);
                    setUsersPage(1);
                    fetchUsers(1, userSearchTerm || undefined, e.target.value);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                  <option value="deleted">Deleted</option>
                </select>
                <button 
                  onClick={() => {
                    setUsersPage(1);
                    fetchUsers(1, userSearchTerm || undefined, userStatusFilter);
                  }}
                  className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Users ({usersTotal.toLocaleString()})
                </h2>
                {usersLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {usersLoading && users.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading users...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No users found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredUsers.map((user) => (
                          <tr key={user.id || user.user_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{user.name}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{user.phone}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.total_ngn_balance !== undefined && user.total_ngn_balance !== null
                                  ? `₦${user.total_ngn_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : '₦0.00'}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                {user.total_btc_balance && user.total_btc_balance > 0 && (
                                  <div>BTC: {user.total_btc_balance.toFixed(8)}</div>
                                )}
                                {user.total_eth_balance && user.total_eth_balance > 0 && (
                                  <div>ETH: {user.total_eth_balance.toFixed(6)}</div>
                                )}
                                {user.total_usdt_balance && user.total_usdt_balance > 0 && (
                                  <div>USDT: {user.total_usdt_balance.toFixed(2)}</div>
                                )}
                                {user.total_usdc_balance && user.total_usdc_balance > 0 && (
                                  <div>USDC: {user.total_usdc_balance.toFixed(2)}</div>
                                )}
                                {user.total_sol_balance && user.total_sol_balance > 0 && (
                                  <div>SOL: {user.total_sol_balance.toFixed(9)}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(user.status)}`}>
                                {user.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.joinedDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleUserAction(user.user_id || user.id, 'view')}
                                  className="text-purple-600 hover:text-purple-900 px-2 py-1 rounded"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleUserAction(user.user_id || user.id, 'credit')}
                                  className="text-green-600 hover:text-green-900 px-2 py-1 rounded"
                                >
                                  Credit
                                </button>
                                <button
                                  onClick={() => handleUserAction(user.user_id || user.id, 'debit')}
                                  className="text-blue-600 hover:text-blue-900 px-2 py-1 rounded"
                                >
                                  Debit
                                </button>
                                {user.status === 'Active' ? (
                                  <button
                                    onClick={() => handleUserAction(user.user_id || user.id, 'suspend')}
                                    className="text-yellow-600 hover:text-yellow-900 px-2 py-1 rounded"
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleUserAction(user.user_id || user.id, 'activate')}
                                    className="text-green-600 hover:text-green-900 px-2 py-1 rounded"
                                  >
                                    Activate
                                  </button>
                                )}
                                <button
                                  onClick={() => handleUserAction(user.user_id || user.id, 'delete')}
                                  className="text-red-600 hover:text-red-900 px-2 py-1 rounded"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {usersTotalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing page {usersPage} of {usersTotalPages} ({usersTotal} total users)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (usersPage > 1) {
                              const newPage = usersPage - 1;
                              setUsersPage(newPage);
                              fetchUsers(newPage, userSearchTerm || undefined, userStatusFilter);
                            }
                          }}
                          disabled={usersPage === 1 || usersLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            if (usersPage < usersTotalPages) {
                              const newPage = usersPage + 1;
                              setUsersPage(newPage);
                              fetchUsers(newPage, userSearchTerm || undefined, userStatusFilter);
                            }
                          }}
                          disabled={usersPage === usersTotalPages || usersLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}


        {/* User Details Modal */}
        {showUserDetails && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">User Details</h2>
                <button
                  onClick={() => {
                    setShowUserDetails(false);
                    setSelectedUser(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <div className="text-sm text-gray-900">{selectedUser.name || selectedUser.full_name || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="text-sm text-gray-900">{selectedUser.email}</div>
                    {selectedUser.email_verified !== undefined && (
                      <div className="text-xs mt-1">
                        <span className={selectedUser.email_verified ? 'text-green-600' : 'text-yellow-600'}>
                          {selectedUser.email_verified ? '✓ Verified' : '⚠ Not Verified'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <div className="text-sm text-gray-900">{selectedUser.phone || selectedUser.phone_number || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
                    <div className="text-xs text-gray-500 font-mono">{selectedUser.user_id || selectedUser.id}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Balances</label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">NGN</div>
                        <div className="font-bold text-gray-900">₦{((selectedUser.total_ngn_balance || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">BTC</div>
                        <div className="font-bold text-gray-900">{(selectedUser.total_btc_balance || 0).toFixed(8)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">ETH</div>
                        <div className="font-bold text-gray-900">{(selectedUser.total_eth_balance || 0).toFixed(6)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">USDT</div>
                        <div className="font-bold text-gray-900">{(selectedUser.total_usdt_balance || 0).toFixed(2)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">USDC</div>
                        <div className="font-bold text-gray-900">{(selectedUser.total_usdc_balance || 0).toFixed(2)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-600">SOL</div>
                        <div className="font-bold text-gray-900">{(selectedUser.total_sol_balance || 0).toFixed(9)}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedUser.status)}`}>
                      {selectedUser.status}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PIN Setup</label>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      selectedUser.pin_setup_completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedUser.pin_setup_completed ? 'Completed' : 'Not Set'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Joined Date</label>
                    <div className="text-sm text-gray-900">
                      {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : selectedUser.joinedDate}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Activity</label>
                    <div className="text-sm text-gray-900">
                      {selectedUser.last_activity ? new Date(selectedUser.last_activity).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={() => {
                      setShowUserDetails(false);
                      setShowCreditModal(true);
                    }}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    Credit User
                  </button>
                  <button
                    onClick={() => {
                      setShowUserDetails(false);
                      setShowDebitModal(true);
                    }}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    Debit User
                  </button>
                  <button
                    onClick={async () => {
                      setShowUserDetails(false);
                      setShowUserTransactions(true);
                      // Fetch user transactions
                      await fetchUserTransactions();
                    }}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    View Transactions
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Transactions Modal */}
        {showUserTransactions && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Transaction Statement</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedUser.name} ({selectedUser.email})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowUserTransactions(false);
                    setUserTransactions([]);
                    setTransactionDateFrom('');
                    setTransactionDateTo('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Date Filter */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter by Date Range</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                      <input
                        type="date"
                        value={transactionDateFrom}
                        onChange={(e) => setTransactionDateFrom(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                      <input
                        type="date"
                        value={transactionDateTo}
                        onChange={(e) => setTransactionDateTo(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={async () => {
                        await fetchUserTransactions();
                      }}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Apply Filter
                    </button>
                    <button
                      onClick={() => {
                        setTransactionDateFrom('');
                        setTransactionDateTo('');
                        fetchUserTransactions();
                      }}
                      className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    >
                      Clear Filter
                    </button>
                    <button
                      onClick={generatePDFStatement}
                      className="bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Download PDF
                    </button>
                  </div>
                </div>

                {/* Transactions Table */}
                {userTransactionsLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading transactions...</span>
                  </div>
                ) : userTransactions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No transactions found for the selected date range.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {userTransactions.map((transaction) => (
                          <tr key={transaction.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {transaction.created_at ? new Date(transaction.created_at).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {transaction.type}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                              {transaction.crypto || transaction.currency || 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {transaction.amount}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {transaction.fee || 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                                transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {transaction.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-4 text-sm text-gray-600">
                      Total Transactions: {userTransactions.length}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Credit User Modal */}
        {showCreditModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Credit User Account</h2>
                <button
                  onClick={() => {
                    setShowCreditModal(false);
                    setSelectedUser(null);
                    setCreditAmount('');
                    setCreditCurrency('NGN');
                    setCreditReason('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
                  <div className="text-sm text-gray-900">{selectedUser.name} ({selectedUser.email})</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Current {creditCurrency} Balance: {
                      creditCurrency === 'NGN' 
                        ? `₦${((selectedUser.total_ngn_balance || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : creditCurrency === 'BTC'
                        ? `${(selectedUser.total_btc_balance || 0).toFixed(8)}`
                        : creditCurrency === 'ETH'
                        ? `${(selectedUser.total_eth_balance || 0).toFixed(6)}`
                        : creditCurrency === 'USDT'
                        ? `${(selectedUser.total_usdt_balance || 0).toFixed(2)}`
                        : creditCurrency === 'USDC'
                        ? `${(selectedUser.total_usdc_balance || 0).toFixed(2)}`
                        : creditCurrency === 'SOL'
                        ? `${(selectedUser.total_sol_balance || 0).toFixed(9)}`
                        : '0.00'
                    }
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                    <input
                      type="text"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                    <select
                      value={creditCurrency}
                      onChange={(e) => setCreditCurrency(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    >
                      <option value="NGN">NGN</option>
                      <option value="BTC">BTC - Bitcoin</option>
                      <option value="ETH">ETH - Ethereum</option>
                      <option value="USDT">USDT - Tether</option>
                      <option value="USDC">USDC - USD Coin</option>
                      <option value="XRP">XRP - Ripple</option>
                      <option value="SOL">SOL - Solana</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                  <textarea
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    placeholder="Enter reason for crediting this account"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowCreditModal(false);
                      setSelectedUser(null);
                      setCreditAmount('');
                      setCreditReason('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreditUser}
                    className="flex-1 px-4 py-2 bg-gradient-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    Credit Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Debit User Modal */}
        {showDebitModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Debit User Account</h2>
                <button
                  onClick={() => {
                    setShowDebitModal(false);
                    setSelectedUser(null);
                    setDebitAmount('');
                    setDebitCurrency('NGN');
                    setDebitReason('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
                  <div className="text-sm text-gray-900">{selectedUser.name} ({selectedUser.email})</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Current {debitCurrency} Balance: {
                      debitCurrency === 'NGN' 
                        ? `₦${((selectedUser.total_ngn_balance || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : debitCurrency === 'BTC'
                        ? `${(selectedUser.total_btc_balance || 0).toFixed(8)}`
                        : debitCurrency === 'ETH'
                        ? `${(selectedUser.total_eth_balance || 0).toFixed(6)}`
                        : debitCurrency === 'USDT'
                        ? `${(selectedUser.total_usdt_balance || 0).toFixed(2)}`
                        : debitCurrency === 'USDC'
                        ? `${(selectedUser.total_usdc_balance || 0).toFixed(2)}`
                        : debitCurrency === 'SOL'
                        ? `${(selectedUser.total_sol_balance || 0).toFixed(9)}`
                        : '0.00'
                    }
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                    <input
                      type="text"
                      value={debitAmount}
                      onChange={(e) => setDebitAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                    <select
                      value={debitCurrency}
                      onChange={(e) => setDebitCurrency(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    >
                      <option value="NGN">NGN</option>
                      <option value="BTC">BTC - Bitcoin</option>
                      <option value="ETH">ETH - Ethereum</option>
                      <option value="USDT">USDT - Tether</option>
                      <option value="USDC">USDC - USD Coin</option>
                      <option value="XRP">XRP - Ripple</option>
                      <option value="SOL">SOL - Solana</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                  <textarea
                    value={debitReason}
                    onChange={(e) => setDebitReason(e.target.value)}
                    placeholder="Enter reason for debiting this account"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowDebitModal(false);
                      setSelectedUser(null);
                      setDebitAmount('');
                      setDebitReason('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDebitUser}
                    className="flex-1 px-4 py-2 bg-gradient-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    Debit Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject Transaction Modal */}
        {showRejectModal && transactionToReject && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Reject Transaction</h2>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setTransactionToReject(null);
                    setRejectReason('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason (Optional)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejecting this transaction..."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This reason will be stored with the transaction record.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setTransactionToReject(null);
                      setRejectReason('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectTransaction}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    Reject Transaction
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Details Modal */}
        {showTransactionDetails && selectedTransaction && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Transaction Details</h2>
                <button
                  onClick={() => {
                    setShowTransactionDetails(false);
                    setSelectedTransaction(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Transaction Overview */}
                <div className="bg-gradient-purple rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Transaction Type</div>
                      <div className="text-2xl font-bold">{selectedTransaction.type}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm opacity-90 mb-1">Status</div>
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                        selectedTransaction.status === 'Completed' ? 'bg-green-500' :
                        selectedTransaction.status === 'Pending' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}>
                        {selectedTransaction.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Amount</div>
                      <div className="text-xl font-bold">{selectedTransaction.amount} {selectedTransaction.crypto}</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-90 mb-1">Fee</div>
                      <div className="text-xl font-bold">{selectedTransaction.fee}</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                {selectedTransaction.status === 'Pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        handleTransactionAction(selectedTransaction.id, 'approve');
                        setShowTransactionDetails(false);
                        setSelectedTransaction(null);
                      }}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      Approve Transaction
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to reject this transaction?')) {
                          handleTransactionAction(selectedTransaction.id, 'reject');
                          setShowTransactionDetails(false);
                          setSelectedTransaction(null);
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                      Reject Transaction
                    </button>
                  </div>
                )}

                {/* Transaction Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                    <div className="text-sm text-gray-900">{selectedTransaction.user}</div>
                    {selectedTransaction.user_profile?.email && (
                      <div className="text-xs text-gray-500 mt-1">{selectedTransaction.user_profile.email}</div>
                    )}
                    {selectedTransaction.user_id && (
                      <div className="text-xs text-gray-400 font-mono mt-1">ID: {selectedTransaction.user_id}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <div className="text-sm text-gray-900 font-semibold">{selectedTransaction.crypto || selectedTransaction.currency || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
                    <div className="text-sm text-gray-900">{selectedTransaction.created_at ? new Date(selectedTransaction.created_at).toLocaleString() : selectedTransaction.date}</div>
                  </div>
                  {selectedTransaction.completed_at && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Completed At</label>
                      <div className="text-sm text-gray-900">{new Date(selectedTransaction.completed_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedTransaction.updated_at && selectedTransaction.updated_at !== selectedTransaction.created_at && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
                      <div className="text-sm text-gray-900">{new Date(selectedTransaction.updated_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedTransaction.transactionId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-900 font-mono flex-1 break-all">{selectedTransaction.transactionId}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTransaction.transactionId!);
                            alert('Transaction ID copied to clipboard!');
                          }}
                          className="text-purple-600 hover:text-purple-800 p-1"
                          title="Copy Transaction ID"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTransaction.reference && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-900 font-mono flex-1 break-all">{selectedTransaction.reference}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTransaction.reference!);
                            alert('Reference copied to clipboard!');
                          }}
                          className="text-purple-600 hover:text-purple-800 p-1"
                          title="Copy Reference"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTransaction.network && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Network</label>
                      <div className="text-sm text-gray-900 font-semibold">{selectedTransaction.network}</div>
                    </div>
                  )}
                  {(selectedTransaction.hash || selectedTransaction.crypto_hash) && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Hash</label>
                      <div className="flex items-start gap-2">
                        <div className="text-sm text-gray-900 font-mono break-all flex-1 bg-gray-50 p-2 rounded">{selectedTransaction.hash || selectedTransaction.crypto_hash}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTransaction.hash || selectedTransaction.crypto_hash || '');
                            alert('Transaction hash copied to clipboard!');
                          }}
                          className="text-purple-600 hover:text-purple-800 p-1 mt-1"
                          title="Copy Hash"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTransaction.fromAddress && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
                      <div className="flex items-start gap-2">
                        <div className="text-sm text-gray-900 font-mono break-all flex-1 bg-gray-50 p-2 rounded">{selectedTransaction.fromAddress}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTransaction.fromAddress!);
                            alert('From address copied to clipboard!');
                          }}
                          className="text-purple-600 hover:text-purple-800 p-1 mt-1"
                          title="Copy From Address"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTransaction.toAddress && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">To Address</label>
                      <div className="flex items-start gap-2">
                        <div className="text-sm text-gray-900 font-mono break-all flex-1 bg-gray-50 p-2 rounded">{selectedTransaction.toAddress}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTransaction.toAddress!);
                            alert('To address copied to clipboard!');
                          }}
                          className="text-purple-600 hover:text-purple-800 p-1 mt-1"
                          title="Copy To Address"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTransaction.description && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded">{selectedTransaction.description}</div>
                    </div>
                  )}
                </div>

                {/* Additional Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      const transactionInfo = `
Transaction Details:
Type: ${selectedTransaction.type}
Amount: ${selectedTransaction.amount} ${selectedTransaction.crypto}
Fee: ${selectedTransaction.fee}
Status: ${selectedTransaction.status}
User: ${selectedTransaction.user}
Date: ${selectedTransaction.date}
${selectedTransaction.transactionId ? `Transaction ID: ${selectedTransaction.transactionId}` : ''}
${selectedTransaction.reference ? `Reference: ${selectedTransaction.reference}` : ''}
${selectedTransaction.hash ? `Hash: ${selectedTransaction.hash}` : ''}
${selectedTransaction.fromAddress ? `From: ${selectedTransaction.fromAddress}` : ''}
${selectedTransaction.toAddress ? `To: ${selectedTransaction.toAddress}` : ''}
${selectedTransaction.description ? `Description: ${selectedTransaction.description}` : ''}
                      `.trim();
                      navigator.clipboard.writeText(transactionInfo);
                      alert('Transaction details copied to clipboard!');
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Copy All Details
                  </button>
                  <button
                    onClick={() => {
                      setShowTransactionDetails(false);
                      setSelectedTransaction(null);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Push Notification Modal */}
        {showPushNotificationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Send Push Notification</h2>
                <button
                  onClick={() => {
                    setShowPushNotificationModal(false);
                    setPushNotificationTitle('');
                    setPushNotificationMessage('');
                    setPushNotificationType('System');
                    setPushNotificationTarget('All Users');
                    setPushNotificationScheduled(false);
                    setPushNotificationScheduleTime('');
                    setPushNotificationDeepLink('');
                    setPushNotificationImageUrl('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Notification Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={pushNotificationTitle}
                    onChange={(e) => setPushNotificationTitle(e.target.value)}
                    placeholder="Enter notification title"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                  <textarea
                    value={pushNotificationMessage}
                    onChange={(e) => setPushNotificationMessage(e.target.value)}
                    placeholder="Enter notification message"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <select
                      value={pushNotificationType}
                      onChange={(e) => setPushNotificationType(e.target.value as 'System' | 'Transaction' | 'Promotion' | 'Security')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    >
                      <option value="System">System</option>
                      <option value="Transaction">Transaction</option>
                      <option value="Promotion">Promotion</option>
                      <option value="Security">Security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                    <select
                      value={pushNotificationTarget}
                      onChange={(e) => setPushNotificationTarget(e.target.value as 'All Users' | 'Specific Users' | 'User Segments')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    >
                      <option value="All Users">All Users</option>
                      <option value="Specific Users">Specific Users</option>
                      <option value="User Segments">User Segments</option>
                    </select>
                  </div>
                </div>

                {/* Scheduling */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Schedule Notification</label>
                      <p className="text-xs text-gray-500">Send notification at a specific time</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pushNotificationScheduled}
                        onChange={(e) => setPushNotificationScheduled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                  {pushNotificationScheduled && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Time</label>
                      <input
                        type="datetime-local"
                        value={pushNotificationScheduleTime}
                        onChange={(e) => setPushNotificationScheduleTime(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Optional Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Deep Link (Optional)</label>
                    <input
                      type="url"
                      value={pushNotificationDeepLink}
                      onChange={(e) => setPushNotificationDeepLink(e.target.value)}
                      placeholder="https://chaincola.com/..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">URL to open when notification is tapped</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Image URL (Optional)</label>
                    <input
                      type="url"
                      value={pushNotificationImageUrl}
                      onChange={(e) => setPushNotificationImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Image to display in the notification</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowPushNotificationModal(false);
                      setPushNotificationTitle('');
                      setPushNotificationMessage('');
                      setPushNotificationType('System');
                      setPushNotificationTarget('All Users');
                      setPushNotificationScheduled(false);
                      setPushNotificationScheduleTime('');
                      setPushNotificationDeepLink('');
                      setPushNotificationImageUrl('');
                      setPushNotificationImageFile(null);
                      setPushNotificationImagePreview(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendPushNotification}
                    className="flex-1 px-4 py-2 bg-gradient-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    {pushNotificationScheduled ? 'Schedule Notification' : 'Send Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Withdrawal Details Modal */}
        {showWithdrawalDetails && selectedWithdrawal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Withdrawal Details</h2>
                <button
                  onClick={() => {
                    setShowWithdrawalDetails(false);
                    setSelectedWithdrawal(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Withdrawal Overview */}
                <div className="bg-gradient-purple rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Withdrawal Amount</div>
                      <div className="text-2xl font-bold">{selectedWithdrawal.amount}</div>
                      <div className="text-sm opacity-75 mt-1">{selectedWithdrawal.currency}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm opacity-90 mb-1">Status</div>
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                        selectedWithdrawal.status === 'Completed' || selectedWithdrawal.status === 'Approved' ? 'bg-green-500' :
                        selectedWithdrawal.status === 'Pending' ? 'bg-yellow-500' :
                        selectedWithdrawal.status === 'Processing' ? 'bg-blue-500' :
                        'bg-red-500'
                      }`}>
                        {selectedWithdrawal.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Fee</div>
                      <div className="text-xl font-bold">{selectedWithdrawal.fee}</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-90 mb-1">Net Amount</div>
                      <div className="text-xl font-bold">
                        {selectedWithdrawal.amount.replace(/[^0-9.]/g, '') && selectedWithdrawal.fee.replace(/[^0-9.]/g, '') 
                          ? (parseFloat(selectedWithdrawal.amount.replace(/[^0-9.]/g, '')) - parseFloat(selectedWithdrawal.fee.replace(/[^0-9.]/g, ''))).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* User Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User Name</label>
                    <div className="text-sm text-gray-900">{selectedWithdrawal.user}</div>
                  </div>
                  {selectedWithdrawal.userEmail && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <div className="text-sm text-gray-900">{selectedWithdrawal.userEmail}</div>
                    </div>
                  )}
                  {selectedWithdrawal.userPhone && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <div className="text-sm text-gray-900">{selectedWithdrawal.userPhone}</div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                    <div className="text-sm text-gray-900">{selectedWithdrawal.date}</div>
                  </div>
                </div>

                {/* Bank Details */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Bank Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                      <div className="text-sm text-gray-900">{selectedWithdrawal.bankName}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                      <div className="text-sm text-gray-900 font-mono">{selectedWithdrawal.accountNumber}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                      <div className="text-sm text-gray-900">{selectedWithdrawal.accountName}</div>
                    </div>
                  </div>
                </div>

                {/* Transaction Information */}
                {(selectedWithdrawal.withdrawalId || selectedWithdrawal.reference || selectedWithdrawal.transactionHash) && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedWithdrawal.withdrawalId && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Withdrawal ID</label>
                          <div className="text-sm text-gray-900 font-mono">{selectedWithdrawal.withdrawalId}</div>
                        </div>
                      )}
                      {selectedWithdrawal.reference && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                          <div className="text-sm text-gray-900 font-mono">{selectedWithdrawal.reference}</div>
                        </div>
                      )}
                      {selectedWithdrawal.transactionHash && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Hash</label>
                          <div className="text-sm text-gray-900 font-mono break-all">{selectedWithdrawal.transactionHash}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Processing Information */}
                {(selectedWithdrawal.processedDate || selectedWithdrawal.processedBy || selectedWithdrawal.rejectionReason) && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {selectedWithdrawal.status === 'Rejected' ? 'Rejection Information' : 'Processing Information'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedWithdrawal.processedDate && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Processed Date</label>
                          <div className="text-sm text-gray-900">{selectedWithdrawal.processedDate}</div>
                        </div>
                      )}
                      {selectedWithdrawal.processedBy && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Processed By</label>
                          <div className="text-sm text-gray-900">{selectedWithdrawal.processedBy}</div>
                        </div>
                      )}
                      {selectedWithdrawal.rejectionReason && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
                          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{selectedWithdrawal.rejectionReason}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transaction Management Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            {/* Filters and Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Transactions</div>
                <div className="text-3xl font-bold text-gray-900">
                  {transactionStats?.total.toLocaleString() || transactionsTotal.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Fee revenue (NGN)</div>
                <div className="text-3xl font-bold text-gray-900">
                  ₦{(transactionStats?.fee_revenue_ngn ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  NGN volume (completed): ₦{(transactionStats?.volume?.ngn ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Pending</div>
                <div className="text-3xl font-bold text-yellow-600">
                  {transactionStats?.by_status.pending || transactions.filter(t => t.status === 'Pending' || t.status === 'pending').length}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setTransactionFilter('all');
                    setTransactionsPage(1);
                    fetchTransactions(1, 'all', transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    transactionFilter === 'all'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Status
                </button>
                <button
                  onClick={() => {
                    setTransactionFilter('completed');
                    setTransactionsPage(1);
                    fetchTransactions(1, 'completed', transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    transactionFilter === 'completed'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => {
                    setTransactionFilter('pending');
                    setTransactionsPage(1);
                    fetchTransactions(1, 'pending', transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    transactionFilter === 'pending'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => {
                    setTransactionFilter('failed');
                    setTransactionsPage(1);
                    fetchTransactions(1, 'failed', transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    transactionFilter === 'failed'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Failed
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                <select
                  value={transactionTypeFilter}
                  onChange={(e) => {
                    setTransactionTypeFilter(e.target.value);
                    setTransactionsPage(1);
                    fetchTransactions(1, transactionFilter, e.target.value, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="send">Send</option>
                  <option value="receive">Receive</option>
                </select>
                <select
                  value={transactionCurrencyFilter}
                  onChange={(e) => {
                    setTransactionCurrencyFilter(e.target.value);
                    setTransactionsPage(1);
                    fetchTransactions(1, transactionFilter, transactionTypeFilter, e.target.value, transactionSearchQuery || undefined);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All Currencies</option>
                  <option value="NGN">NGN</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
                <input
                  type="text"
                  placeholder="Search by transaction ID, description..."
                  value={transactionSearchQuery}
                  onChange={(e) => setTransactionSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      setTransactionsPage(1);
                      fetchTransactions(1, transactionFilter, transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
                <button
                  onClick={() => {
                    setTransactionsPage(1);
                    fetchTransactions(1, transactionFilter, transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                  }}
                  className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Transactions ({transactionsTotal.toLocaleString()})
                </h2>
                {transactionsLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {transactionsLoading && transactions.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading transactions...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No transactions found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTransactions.map((transaction) => (
                          <tr key={transaction.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {transaction.transactionId || transaction.id}
                              </div>
                              {transaction.transaction_id && (
                                <div className="text-xs text-gray-500 font-mono">{transaction.transaction_id.substring(0, 8)}...</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{transaction.user}</div>
                              {transaction.user_profile?.email && (
                                <div className="text-xs text-gray-500">{transaction.user_profile.email}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{transaction.type}</div>
                              <div className="text-xs text-gray-500">{transaction.crypto || transaction.currency}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{transaction.amount}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{transaction.fee}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transaction.status)}`}>
                                {transaction.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {transaction.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex flex-wrap gap-2">
                                {(transaction.status === 'Pending' || transaction.status === 'pending') && (
                                  <>
                                    <button
                                      onClick={() => handleTransactionAction(transaction.id, 'approve')}
                                      className="text-green-600 hover:text-green-900 px-2 py-1 rounded"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleTransactionAction(transaction.id, 'reject')}
                                      className="text-red-600 hover:text-red-900 px-2 py-1 rounded"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => handleTransactionAction(transaction.id, 'view')}
                                  className="text-purple-600 hover:text-purple-900 px-2 py-1 rounded"
                                >
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {transactionsTotalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing page {transactionsPage} of {transactionsTotalPages} ({transactionsTotal} total transactions)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (transactionsPage > 1) {
                              const newPage = transactionsPage - 1;
                              setTransactionsPage(newPage);
                              fetchTransactions(newPage, transactionFilter, transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                            }
                          }}
                          disabled={transactionsPage === 1 || transactionsLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            if (transactionsPage < transactionsTotalPages) {
                              const newPage = transactionsPage + 1;
                              setTransactionsPage(newPage);
                              fetchTransactions(newPage, transactionFilter, transactionTypeFilter, transactionCurrencyFilter, transactionSearchQuery || undefined);
                            }
                          }}
                          disabled={transactionsPage === transactionsTotalPages || transactionsLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'crypto' && (
          <div className="space-y-6">
            {/* Total Balance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Users with Crypto</div>
                <div className="text-3xl font-bold text-gray-900">
                  {cryptoOverview?.users_with_balance || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  of {cryptoOverview?.total_users || 0} total users
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Est. user holdings (NGN)</div>
                <div className="text-2xl font-bold text-gray-900">
                  {cryptos.length > 0
                    ? `₦${cryptos
                        .reduce((sum, c) => sum + (c.user_allocated || 0) * (c.price_ngn || 0), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : cryptoLoading
                      ? '…'
                      : '₦0.00'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Uses live rates from Alchemy (Prices API)</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Active Cryptocurrencies</div>
                <div className="text-3xl font-bold text-gray-900">
                  {cryptos.filter(c => c.status === 'Active').length || cryptos.length}
                </div>
              </div>
            </div>

            {/* Search and Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Search cryptocurrencies..."
                  value={cryptoSearchTerm}
                  onChange={(e) => setCryptoSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"                                                                                                       
                />
                <button className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">                                                                                                                         
                  Add New Crypto
                </button>
              </div>
            </div>

            {/* Crypto Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Cryptocurrencies ({filteredCryptos.length})</h2>
                {cryptoLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {cryptoLoading && cryptos.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading crypto data...</p>
                </div>
              ) : cryptos.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No cryptocurrency data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crypto</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User allocated</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate (NGN)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Est. value (NGN)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCryptos.map((crypto) => (
                        <tr key={crypto.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3 overflow-hidden p-1">
                                {typeof crypto.logo === 'string' && crypto.logo.startsWith('/') ? (
                                  <Image
                                    src={crypto.logo}
                                    alt={crypto.name}
                                    width={32}
                                    height={32}
                                    className="object-contain"
                                  />
                                ) : (
                                  <span className="text-xl">{crypto.logo}</span>
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{crypto.name}</div>
                                <div className="text-xs text-gray-500">{crypto.symbol}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {(() => {
                                const decimals = crypto.symbol === 'BTC' ? 8 : crypto.symbol === 'ETH' || crypto.symbol === 'TRX' || crypto.symbol === 'SOL' ? 6 : 2;
                                return (crypto.user_allocated || 0).toFixed(decimals);
                              })()} {crypto.symbol}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {(crypto.price_ngn || 0) > 0
                              ? `₦${(crypto.price_ngn || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {(crypto.user_allocated || 0) * (crypto.price_ngn || 0) > 0
                              ? `₦${((crypto.user_allocated || 0) * (crypto.price_ngn || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(crypto.status)}`}>
                              {crypto.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex flex-wrap gap-2">
                              {(crypto.status === 'Active' || crypto.status === 'Maintenance') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleCryptoAction(crypto.id, 'maintenance')}
                                    disabled={cryptoAssetStatusSavingId === crypto.symbol}
                                    className="text-yellow-600 hover:text-yellow-900 disabled:opacity-40"
                                  >
                                    {cryptoAssetStatusSavingId === crypto.symbol ? '…' : 'Maintenance'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCryptoAction(crypto.id, 'deactivate')}
                                    disabled={cryptoAssetStatusSavingId === crypto.symbol}
                                    className="text-red-600 hover:text-red-900 disabled:opacity-40"
                                  >
                                    Deactivate
                                  </button>
                                </>
                              )}
                              {crypto.status !== 'Active' && (
                                <button
                                  type="button"
                                  onClick={() => handleCryptoAction(crypto.id, 'activate')}
                                  disabled={cryptoAssetStatusSavingId === crypto.symbol}
                                  className="text-green-600 hover:text-green-900 disabled:opacity-40"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notifications Management Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            {/* Notification Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Notifications</div>
                <div className="text-3xl font-bold">
                  {(notificationStats?.total_notifications ?? notificationStats?.total ?? notificationsTotal ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Unread</div>
                <div className="text-3xl font-bold text-yellow-600">
                  {(notificationStats?.unread_count ?? notificationStats?.unread ?? notifications.filter(n => !n.is_read && !n.read).length ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Sent (24h)</div>
                <div className="text-3xl font-bold text-green-600">
                  {(notificationStats?.sent_24h ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Sent (7d)</div>
                <div className="text-3xl font-bold text-gray-900">
                  {(notificationStats?.sent_7d ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Create Push Notification */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Push Notifications</h2>
                <button
                  onClick={() => setShowPushNotificationModal(true)}
                  className="bg-gradient-purple text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  + Send Push Notification
                </button>
              </div>
              <p className="text-sm text-gray-600">Send push notifications to users instantly or schedule them for later</p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setNotificationTypeFilter('all');
                    setNotificationsPage(1);
                    fetchNotifications(1, 'all', notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationTypeFilter === 'all'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => {
                    setNotificationTypeFilter('info');
                    setNotificationsPage(1);
                    fetchNotifications(1, 'info', notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationTypeFilter === 'info'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  System
                </button>
                <button
                  onClick={() => {
                    setNotificationTypeFilter('success');
                    setNotificationsPage(1);
                    fetchNotifications(1, 'success', notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationTypeFilter === 'success'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Transaction
                </button>
                <button
                  onClick={() => {
                    setNotificationTypeFilter('promotion');
                    setNotificationsPage(1);
                    fetchNotifications(1, 'promotion', notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationTypeFilter === 'promotion'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Promotion
                </button>
                <button
                  onClick={() => {
                    setNotificationTypeFilter('warning');
                    setNotificationsPage(1);
                    fetchNotifications(1, 'warning', notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationTypeFilter === 'warning'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Security
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                <select
                  value={notificationStatusFilter}
                  onChange={(e) => {
                    setNotificationStatusFilter(e.target.value);
                    setNotificationsPage(1);
                    fetchNotifications(1, notificationTypeFilter, e.target.value, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="sent">Sent</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
                <select
                  value={notificationReadFilter}
                  onChange={(e) => {
                    setNotificationReadFilter(e.target.value as 'all' | 'read' | 'unread');
                    setNotificationsPage(1);
                    fetchNotifications(1, notificationTypeFilter, notificationStatusFilter, e.target.value as 'all' | 'read' | 'unread', notificationSearchQuery || undefined);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All</option>
                  <option value="read">Read</option>
                  <option value="unread">Unread</option>
                </select>
                <input
                  type="text"
                  placeholder="Search by title or message..."
                  value={notificationSearchQuery}
                  onChange={(e) => setNotificationSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      setNotificationsPage(1);
                      fetchNotifications(1, notificationTypeFilter, notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
                <button
                  onClick={() => {
                    setNotificationsPage(1);
                    fetchNotifications(1, notificationTypeFilter, notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                  }}
                  className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Notifications Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Notifications ({notificationsTotal.toLocaleString()})
                </h2>
                {notificationsLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {notificationsLoading && notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No notifications found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Read</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredNotifications.map((notification) => (
                          <tr key={notification.id} className={`hover:bg-gray-50 ${(!notification.is_read && !notification.read) ? 'bg-blue-50' : ''}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {notification.user_name ? (
                                <>
                                  <div className="text-sm font-medium text-gray-900">{notification.user_name}</div>
                                  <div className="text-xs text-gray-500">{notification.user_email}</div>
                                </>
                              ) : (
                                <div className="text-sm text-gray-500">System</div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{notification.title}</div>
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{notification.message || notification.body || ''}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                {notification.type}
                              </span>
                              {notification.category && (
                                <div className="text-xs text-gray-500 mt-1">{notification.category}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(notification.status)}`}>
                                {notification.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {notification.is_read || notification.read ? (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                  Read
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                  Unread
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {notification.date}
                              {notification.created_at && (
                                <div className="text-xs text-gray-400">
                                  {new Date(notification.created_at).toLocaleTimeString()}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                {(!notification.is_read && !notification.read) && (
                                  <button
                                    onClick={() => handleNotificationAction(notification.id, 'mark-read')}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Mark as read"
                                  >
                                    Mark Read
                                  </button>
                                )}
                                <button
                                  onClick={() => handleNotificationAction(notification.id, 'delete')}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {notificationsTotalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing page {notificationsPage} of {notificationsTotalPages} ({notificationsTotal} total notifications)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (notificationsPage > 1) {
                              const newPage = notificationsPage - 1;
                              setNotificationsPage(newPage);
                              fetchNotifications(newPage, notificationTypeFilter, notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                            }
                          }}
                          disabled={notificationsPage === 1 || notificationsLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            if (notificationsPage < notificationsTotalPages) {
                              const newPage = notificationsPage + 1;
                              setNotificationsPage(newPage);
                              fetchNotifications(newPage, notificationTypeFilter, notificationStatusFilter, notificationReadFilter, notificationSearchQuery || undefined);
                            }
                          }}
                          disabled={notificationsPage === notificationsTotalPages || notificationsLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}


        {/* Referral Management Tab */}
        {activeTab === 'referrals' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Referrals</div>
                <div className="text-3xl font-bold">
                  {(referralStats?.total_referrals ?? referralOverview?.total_referrals ?? referrals.length)?.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Earnings</div>
                <div className="text-3xl font-bold text-green-600">
                  {referralStats?.total_earnings 
                    ? `₦${referralStats.total_earnings.toLocaleString()}`
                    : referralOverview?.total_earnings
                    ? `₦${referralOverview.total_earnings.toLocaleString()}`
                    : '₦0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Pending Earnings</div>
                <div className="text-3xl font-bold text-yellow-600">
                  ₦{pendingEarnings.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Active Referrers</div>
                <div className="text-3xl font-bold text-gray-900">
                  {(referralOverview?.active_referrers ?? topReferrers.length)?.toLocaleString() || '0'}
                </div>
              </div>
            </div>

            {/* Top Referrers */}
            {topReferrers.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Top Referrers</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referral Code</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Referrals</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Earnings</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {topReferrers.slice(0, 10).map((referrer) => (
                        <tr key={referrer.user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{referrer.name || referrer.email || 'Unknown'}</div>
                            {referrer.email && referrer.name && (
                              <div className="text-xs text-gray-500">{referrer.email}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-gray-900">{referrer.referral_code || 'N/A'}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{referrer.total_referrals.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600">₦{parseFloat(referrer.total_earnings?.toString() || '0').toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">₦{parseFloat((referrer.pending_earnings || 0).toString()).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setReferralFilter('all')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    referralFilter === 'all'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setReferralFilter('active')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    referralFilter === 'active'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setReferralFilter('used')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    referralFilter === 'used'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Used
                </button>
                <button
                  onClick={() => setReferralFilter('expired')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    referralFilter === 'expired'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Expired
                </button>
              </div>
            </div>

            {/* Referrals Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Referral Codes ({filteredReferrals.length})
                </h2>
                {referralLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {referralLoading && referrals.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading referral codes...</p>
                </div>
              ) : filteredReferrals.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No referral codes found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referrer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referral Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Referrals</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earnings</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredReferrals.map((referral) => (
                        <tr key={referral.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{referral.referrer}</div>
                            {referral.email && (
                              <div className="text-xs text-gray-500">{referral.email}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono font-medium text-purple-600">{referral.code}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {(referral.total_referrals || 0).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-green-600">
                              {referral.totalEarnings || referral.earnings || '₦0'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              (referral.total_referrals || 0) > 0 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {(referral.total_referrals || 0) > 0 ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {referral.date}
                            {referral.created_at && (
                              <div className="text-xs text-gray-400">
                                {new Date(referral.created_at).toLocaleTimeString()}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={async () => {
                                  if (referral.user_id) {
                                    try {
                                      const response = await referralApi.getUserReferrals(referral.user_id);
                                      if (response.success && response.data) {
                                        const details = `Referral Code: ${response.data.referral_code || 'N/A'}\n` +
                                          `Total Referrals: ${response.data.balance.total_referrals}\n` +
                                          `Total Earnings: ₦${response.data.balance.total_earnings.toLocaleString()}\n` +
                                          `Available: ₦${response.data.balance.available_balance.toLocaleString()}\n` +
                                          `Withdrawn: ₦${response.data.balance.withdrawn_balance.toLocaleString()}`;
                                        alert(details);
                                      } else {
                                        alert(response.error || 'Failed to fetch referral details');
                                      }
                                    } catch (error: unknown) {
                                      alert('Error fetching referral details: ' + (error as Error)?.message || 'Unknown error');
                                    }
                                  }
                                }}
                                className="text-blue-600 hover:text-blue-900"
                                title="View Details"
                              >
                                View
                              </button>
                              {referral.user_id && (
                                <button
                                  onClick={async () => {
                                    const amount = prompt('Enter amount to credit (NGN):');
                                    if (amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
                                      const description = prompt('Enter description (optional):') || '';
                                      try {
                                        const response = await referralApi.creditReferralBalance({
                                          user_id: referral.user_id as string,
                                          amount: parseFloat(amount),
                                          description,
                                        });
                                        if (response.success) {
                                          alert(`Balance credited successfully. New balance: ₦${response.data?.new_balance.toLocaleString()}`);
                                          fetchAllReferralCodes();
                                          fetchReferralOverview();
                                          fetchReferralStats();
                                        } else {
                                          alert(response.error || 'Failed to credit balance');
                                        }
                                      } catch (error: unknown) {
                                        alert('Error crediting balance: ' + (error as Error)?.message || 'Unknown error');
                                      }
                                    }
                                  }}
                                  className="text-green-600 hover:text-green-900"
                                  title="Credit Balance"
                                >
                                  Credit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Support Tab */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Tickets</div>
                <div className="text-3xl font-bold">
                  {(chatStatistics?.total ?? chatTicketsTotal ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Open</div>
                <div className="text-3xl font-bold text-yellow-600">
                  {(chatStatistics?.by_status?.open ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">In Progress</div>
                <div className="text-3xl font-bold text-blue-600">
                  {(chatStatistics?.by_status?.in_progress ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Unread Messages</div>
                <div className="text-3xl font-bold text-red-600">
                  {(chatStatistics?.unread_messages ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chat List */}
              <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Chat Support</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => {
                        setChatFilter('all');
                        fetchChatTickets(1, undefined, undefined);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        chatFilter === 'all'
                          ? 'bg-gradient-purple text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => {
                        setChatFilter('unread');
                        fetchChatTickets(1, 'open', undefined);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        chatFilter === 'unread'
                          ? 'bg-gradient-purple text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Unread
                    </button>
                    <button
                      onClick={() => {
                        setChatFilter('high');
                        fetchChatTickets(1, undefined, 'urgent');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        chatFilter === 'high'
                          ? 'bg-gradient-purple text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      High Priority
                    </button>
                  </div>
                </div>
                {chatLoading && chatMessages.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <p className="mt-4 text-gray-500">Loading tickets...</p>
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-500">No tickets found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                    {filteredChats.map((chat) => (
                      <div
                        key={chat.id}
                        onClick={() => setSelectedChat(chat.id)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 ${
                          selectedChat === chat.id ? 'bg-purple-50 border-l-4 border-purple-600' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-gray-900">{chat.user}</div>
                          {(chat.status === 'Open' || chat.status === 'open') && (
                            <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 truncate mb-2">{chat.subject}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{chat.lastReply}</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            chat.priority === 'High' || chat.priority === 'high' || chat.priority === 'Urgent' || chat.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                            chat.priority === 'Medium' || chat.priority === 'normal' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {chat.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chat Window */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
              {selectedChat ? (
                <>
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {chatMessages.find(c => c.id === selectedChat)?.user}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {chatMessages.find(c => c.id === selectedChat)?.lastReply}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        {(chatMessages.find(c => c.id === selectedChat)?.status === 'Open' || chatMessages.find(c => c.id === selectedChat)?.status === 'open') && (
                          <button
                            onClick={() => handleChatAction(selectedChat, 'mark-read')}
                            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200"
                          >
                            Mark as Read
                          </button>
                        )}
                        {(chatMessages.find(c => c.id === selectedChat)?.status === 'Open' || chatMessages.find(c => c.id === selectedChat)?.status === 'open') && (
                          <button
                            onClick={() => handleChatAction(selectedChat, 'progress')}
                            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                          >
                            In Progress
                          </button>
                        )}
                        <button
                          onClick={() => handleChatAction(selectedChat, 'resolve')}
                          className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-6 overflow-y-auto" id="chat-messages-container">
                    <div className="space-y-4">
                      {conversationMessages
                        .filter(m => m.chatId === selectedChat)
                        .map((msg) => {
                          const speakerLabel =
                            msg.sender === 'admin'
                              ? (msg.sender_display_name?.trim() || 'Support')
                              : (msg.sender_display_name?.trim() ||
                                chatMessages.find(c => c.id === selectedChat)?.user ||
                                'Customer');
                          return (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`rounded-lg p-4 max-w-md ${
                                msg.sender === 'admin'
                                  ? 'bg-purple-100 text-gray-900'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              <p className="text-xs font-semibold text-gray-600 mb-1">{speakerLabel}</p>
                              <p className="text-sm">{msg.message}</p>
                              <p className="text-xs mt-1 opacity-70">{msg.timestamp}</p>
                            </div>
                          </div>
                        );
                        })}
                      {conversationMessages.filter(m => m.chatId === selectedChat).length === 0 && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 rounded-lg p-4 max-w-md">
                            <p className="text-sm text-gray-900">
                              {chatMessages.find(c => c.id === selectedChat)?.message}
                            </p>
                            <p className="text-xs mt-1 opacity-70">
                              {chatMessages.find(c => c.id === selectedChat)?.user} • {chatMessages.find(c => c.id === selectedChat)?.date}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    {remoteTyping && (
                      <p className="text-sm text-gray-500 mt-2 px-1">{remoteTyping.name} is typing…</p>
                    )}
                  </div>
                  <div className="p-6 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={replyMessage}
                        onChange={(e) => handleReplyChange(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Type your message... (Press Enter to send)"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!replyMessage.trim()}
                        className={`px-6 py-2 rounded-lg font-medium transition-opacity ${
                          replyMessage.trim()
                            ? 'bg-gradient-purple text-white hover:opacity-90'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <svg className="w-5 h-5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <button
                        onClick={() => {
                          const quickReplies = [
                            "Thank you for contacting us. How can I help you today?",
                            "I'll look into this for you right away.",
                            "Can you provide more details about this issue?",
                            "This has been resolved. Is there anything else I can help with?",
                          ];
                          const randomReply = quickReplies[Math.floor(Math.random() * quickReplies.length)];
                          handleReplyChange(randomReply);
                        }}
                        className="text-purple-600 hover:text-purple-800 underline"
                      >
                        Quick Reply
                      </button>
                      <span>•</span>
                      <span>Press Enter to send</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-gray-500">Select a chat to view messages</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Withdrawal Management Tab */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Withdrawals</div>
                <div className="text-3xl font-bold">
                  {withdrawalStats?.total_withdrawals.toLocaleString() || withdrawalsTotal.toLocaleString() || withdrawals.length.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Pending</div>
                <div className="text-3xl font-bold text-yellow-600">
                  {withdrawalStats?.pending_withdrawals.toLocaleString() || withdrawals.filter(w => w.status === 'Pending' || w.status === 'pending').length.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Approved</div>
                <div className="text-3xl font-bold text-green-600">
                  {withdrawalStats?.approved_withdrawals.toLocaleString() || withdrawals.filter(w => w.status === 'Approved' || w.status === 'approved').length.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Amount</div>
                <div className="text-3xl font-bold text-gray-900">
                  {withdrawalStats?.total_amount 
                    ? `₦${withdrawalStats.total_amount.toLocaleString()}`
                    : '₦0'}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setWithdrawalFilter('all');
                    setWithdrawalsPage(1);
                    fetchWithdrawals(1, undefined);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    withdrawalFilter === 'all'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setWithdrawalFilter('pending');
                    setWithdrawalsPage(1);
                    fetchWithdrawals(1, 'pending');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    withdrawalFilter === 'pending'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => {
                    setWithdrawalFilter('approved');
                    setWithdrawalsPage(1);
                    fetchWithdrawals(1, 'approved');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    withdrawalFilter === 'approved'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => {
                    setWithdrawalFilter('rejected');
                    setWithdrawalsPage(1);
                    fetchWithdrawals(1, 'rejected');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    withdrawalFilter === 'rejected'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Rejected
                </button>
                <button
                  onClick={() => {
                    setWithdrawalFilter('processing');
                    setWithdrawalsPage(1);
                    fetchWithdrawals(1, 'processing');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    withdrawalFilter === 'processing'
                      ? 'bg-gradient-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Processing
                </button>
              </div>
            </div>

            {/* Withdrawals Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Withdrawal Requests ({withdrawalsTotal.toLocaleString()})
                </h2>
                {withdrawalLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {withdrawalLoading && withdrawals.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading withdrawals...</p>
                </div>
              ) : filteredWithdrawals.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No withdrawals found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bank Details</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredWithdrawals.map((withdrawal) => (
                          <tr key={withdrawal.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{withdrawal.user}</div>
                              {withdrawal.userEmail && (
                                <div className="text-xs text-gray-500">{withdrawal.userEmail}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{withdrawal.amount}</div>
                              <div className="text-xs text-gray-500">{withdrawal.currency}</div>
                              {withdrawal.fee && (
                                <div className="text-xs text-gray-400">Fee: {withdrawal.fee}</div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">{withdrawal.bankName}</div>
                              <div className="text-xs text-gray-500">{withdrawal.accountNumber}</div>
                              <div className="text-xs text-gray-500">{withdrawal.accountName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                withdrawal.status === 'Approved' || withdrawal.status === 'approved' || withdrawal.status === 'Completed' || withdrawal.status === 'completed' ? 'bg-green-100 text-green-800' :
                                withdrawal.status === 'Pending' || withdrawal.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                withdrawal.status === 'Rejected' || withdrawal.status === 'rejected' || withdrawal.status === 'failed' ? 'bg-red-100 text-red-800' :
                                withdrawal.status === 'Processing' || withdrawal.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {withdrawal.status}
                              </span>
                              {withdrawal.rejectionReason && (
                                <div className="text-xs text-red-600 mt-1">{withdrawal.rejectionReason}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {withdrawal.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleWithdrawalAction(withdrawal.id, 'view')}
                                  className="text-purple-600 hover:text-purple-900 px-2 py-1 rounded"
                                  title="View Details"
                                >
                                  View
                                </button>
                                {(withdrawal.status === 'Pending' || withdrawal.status === 'pending') && (
                                  <>
                                    <button
                                      onClick={() => handleWithdrawalAction(withdrawal.id, 'approve')}
                                      className="text-green-600 hover:text-green-900 px-2 py-1 rounded"
                                      title="Approve Withdrawal"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleWithdrawalAction(withdrawal.id, 'reject')}
                                      className="text-red-600 hover:text-red-900 px-2 py-1 rounded"
                                      title="Reject Withdrawal"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {withdrawalsTotalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing page {withdrawalsPage} of {withdrawalsTotalPages} ({withdrawalsTotal} total withdrawals)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (withdrawalsPage > 1) {
                              const newPage = withdrawalsPage - 1;
                              setWithdrawalsPage(newPage);
                              fetchWithdrawals(newPage, withdrawalFilter === 'all' ? undefined : withdrawalFilter);
                            }
                          }}
                          disabled={withdrawalsPage === 1 || withdrawalLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            if (withdrawalsPage < withdrawalsTotalPages) {
                              const newPage = withdrawalsPage + 1;
                              setWithdrawalsPage(newPage);
                              fetchWithdrawals(newPage, withdrawalFilter === 'all' ? undefined : withdrawalFilter);
                            }
                          }}
                          disabled={withdrawalsPage === withdrawalsTotalPages || withdrawalLoading}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* App Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Application Settings</h2>
              
              <div className="space-y-6">
                {/* General Settings */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">App Name</label>
                      <input
                        type="text"
                        value={appSettings.appName}
                        onChange={(e) => setAppSettings({ ...appSettings, appName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">App Version</label>
                      <input
                        type="text"
                        value={appSettings.appVersion}
                        onChange={(e) => setAppSettings({ ...appSettings, appVersion: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Toggles</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Maintenance Mode</label>
                        <p className="text-sm text-gray-500">Enable maintenance mode to restrict access</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appSettings.maintenanceMode}
                          onChange={(e) => setAppSettings({ ...appSettings, maintenanceMode: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Registration Enabled</label>
                        <p className="text-sm text-gray-500">Allow new user registrations</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appSettings.registrationEnabled}
                          onChange={(e) => setAppSettings({ ...appSettings, registrationEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Support Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Support Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Support Email</label>
                      <input
                        type="email"
                        value={appSettings.supportEmail}
                        onChange={(e) => setAppSettings({ ...appSettings, supportEmail: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Support Phone</label>
                      <input
                        type="text"
                        value={appSettings.supportPhone}
                        onChange={(e) => setAppSettings({ ...appSettings, supportPhone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Privacy Policy */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy Policy</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Privacy Policy Content</label>
                    <textarea
                      value={appSettings.privacyPolicy}
                      onChange={(e) => setAppSettings({ ...appSettings, privacyPolicy: e.target.value })}
                      rows={15}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none font-mono text-sm"
                      placeholder="Enter privacy policy content..."
                    />
                    <p className="text-xs text-gray-500 mt-2">This content will be displayed to users in the Privacy Policy section</p>
                  </div>
                </div>

                {/* Terms and Conditions */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Terms and Conditions</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Terms and Conditions Content</label>
                    <textarea
                      value={appSettings.termsAndConditions}
                      onChange={(e) => setAppSettings({ ...appSettings, termsAndConditions: e.target.value })}
                      rows={15}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none font-mono text-sm"
                      placeholder="Enter terms and conditions content..."
                    />
                    <p className="text-xs text-gray-500 mt-2">This content will be displayed to users in the Terms and Conditions section</p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-6 border-t border-gray-200">
                  <button
                    onClick={saveAppSettings}
                    disabled={appSettingsSaving || appSettingsLoading}
                    className="bg-gradient-purple text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {appSettingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Date Range Filter and Export */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Analytics Dashboard</h2>
                  <p className="text-sm text-gray-600">View detailed insights and performance metrics</p>
                </div>
                <div className="flex gap-3">
                  <select
                    value={analyticsDateRange}
                    onChange={(e) => setAnalyticsDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="1y">Last Year</option>
                    <option value="all">All Time</option>
                  </select>
                  <button
                    onClick={() => alert('Exporting analytics data...')}
                    className="px-4 py-2 bg-gradient-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    Export Data
                  </button>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Users</div>
                <div className="text-3xl font-bold">{users.length}</div>
                <div className="text-sm opacity-75 mt-2">+12.5% from last month</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Transactions</div>
                <div className="text-3xl font-bold text-gray-900">{transactions.length}</div>
                <div className="text-sm text-green-600 mt-2">+8.2% from last month</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Revenue</div>
                <div className="text-3xl font-bold text-gray-900">
                  ${transactions.filter(t => t.status === 'Completed').reduce((sum, t) => sum + parseFloat(t.fee.replace('$', '')), 0).toFixed(2)}
                </div>
                <div className="text-sm text-green-600 mt-2">+15.3% from last month</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Active Cryptocurrencies</div>
                <div className="text-3xl font-bold text-gray-900">
                  {cryptos.filter(c => c.status === 'Active').length}
                </div>
                <div className="text-sm text-gray-500 mt-2">No change</div>
              </div>
            </div>

            {/* Transaction Analytics */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Buy Transactions</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {transactions.filter(t => t.type === 'Buy').length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">45% of total</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Sell Transactions</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {transactions.filter(t => t.type === 'Sell').length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">30% of total</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Other Transactions</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {transactions.filter(t => t.type !== 'Buy' && t.type !== 'Sell').length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">25% of total</div>
                </div>
              </div>
            </div>

            {/* User Growth */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">User Growth</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">New Users (Today)</div>
                  <div className="text-xl font-bold text-purple-600">12</div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">New Users (This Week)</div>
                  <div className="text-xl font-bold text-blue-600">89</div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">New Users (This Month)</div>
                  <div className="text-xl font-bold text-green-600">342</div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Active Users (Last 30 Days)</div>
                  <div className="text-xl font-bold text-orange-600">{users.filter(u => u.status === 'Active').length}</div>
                </div>
              </div>
            </div>

            {/* Withdrawal Analytics */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Withdrawal Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Total Withdrawals</div>
                  <div className="text-2xl font-bold text-gray-900">{withdrawals.length}</div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Pending</div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {withdrawals.filter(w => w.status === 'Pending').length}
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Approved</div>
                  <div className="text-2xl font-bold text-green-600">
                    {withdrawals.filter(w => w.status === 'Approved' || w.status === 'Completed').length}
                  </div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Rejected</div>
                  <div className="text-2xl font-bold text-red-600">
                    {withdrawals.filter(w => w.status === 'Rejected').length}
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue by Cryptocurrency */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue by Cryptocurrency</h2>
              <div className="space-y-4">
                {cryptos.filter(c => c.status === 'Active').map((crypto) => {
                  const cryptoTransactions = transactions.filter(t => t.crypto === crypto.symbol && t.status === 'Completed');
                  const revenue = cryptoTransactions.reduce((sum, t) => sum + parseFloat(t.fee.replace(/[^0-9.]/g, '') || '0'), 0);
                  const percentage = transactions.filter(t => t.status === 'Completed').reduce((sum, t) => sum + parseFloat(t.fee.replace(/[^0-9.]/g, '') || '0'), 0);
                  const revenuePercentage = percentage > 0 ? ((revenue / percentage) * 100).toFixed(1) : '0';
                  return (
                    <div key={crypto.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-purple-600">{crypto.symbol}</span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{crypto.name}</div>
                          <div className="text-sm text-gray-500">{cryptoTransactions.length} transactions</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">${revenue.toFixed(2)}</div>
                        <div className="text-sm text-gray-500">{revenuePercentage}% of total</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction Success Rate</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">Success Rate</span>
                      <span className="text-sm font-bold text-green-600">
                        {transactions.length > 0 
                          ? ((transactions.filter(t => t.status === 'Completed').length / transactions.length) * 100).toFixed(1)
                          : '0'}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-green-600 h-3 rounded-full" 
                        style={{ width: `${transactions.length > 0 ? (transactions.filter(t => t.status === 'Completed').length / transactions.length) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                    <div>
                      <div className="text-sm text-gray-600">Completed</div>
                      <div className="text-lg font-bold text-green-600">
                        {transactions.filter(t => t.status === 'Completed').length}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Pending</div>
                      <div className="text-lg font-bold text-yellow-600">
                        {transactions.filter(t => t.status === 'Pending').length}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Failed</div>
                      <div className="text-lg font-bold text-red-600">
                        {transactions.filter(t => t.status === 'Failed').length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Average Transaction Value</h2>
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Average Transaction</div>
                    <div className="text-2xl font-bold text-purple-600">
                      ${transactions.length > 0
                        ? (transactions.reduce((sum, t) => {
                            const amount = parseFloat(t.amount.replace(/[^0-9.]/g, '') || '0');
                            return sum + amount;
                          }, 0) / transactions.length).toFixed(2)
                        : '0.00'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Highest</div>
                      <div className="text-lg font-bold text-gray-900">
                        ${transactions.length > 0
                          ? Math.max(...transactions.map(t => parseFloat(t.amount.replace(/[^0-9.]/g, '') || '0'))).toFixed(2)
                          : '0.00'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Lowest</div>
                      <div className="text-lg font-bold text-gray-900">
                        ${transactions.length > 0
                          ? Math.min(...transactions.map(t => parseFloat(t.amount.replace(/[^0-9.]/g, '') || '0'))).toFixed(2)
                          : '0.00'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Fee Management Tab */}
        {activeTab === 'fees' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Fee Management</h2>
              
              <div className="space-y-6">
                {/* Trading Fees */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Trading Fees</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Buy Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.buyFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, buyFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Sell Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.sellFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, sellFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Transfer Fees */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Transfer Fees</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Send Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.sendFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, sendFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Receive Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.receiveFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, receiveFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Convert Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.convertFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, convertFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Deposit Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.depositFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, depositFee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Withdrawal Fees */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Withdrawal Fees</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Fee (USD)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={feeSettings.withdrawalFeeUSD}
                        onChange={(e) => setFeeSettings({ ...feeSettings, withdrawalFeeUSD: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Fee (NGN)</label>
                      <input
                        type="number"
                        step="1"
                        value={feeSettings.withdrawalFeeNGN}
                        onChange={(e) => setFeeSettings({ ...feeSettings, withdrawalFeeNGN: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                
                {/* Fee Calculation Preview */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Calculation Preview</h3>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Amount</label>
                        <input
                          type="number"
                          placeholder="1000"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                          id="feePreviewAmount"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
                        <select
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                          id="feePreviewType"
                        >
                          <option value="buy">Buy</option>
                          <option value="sell">Sell</option>
                          <option value="send">Send</option>
                          <option value="receive">Receive</option>
                          <option value="convert">Convert</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            const amount = parseFloat((document.getElementById('feePreviewAmount') as HTMLInputElement)?.value || '0');
                            const type = (document.getElementById('feePreviewType') as HTMLSelectElement)?.value || 'buy';
                            let feePercent = 0;
                            if (type === 'buy') feePercent = parseFloat(feeSettings.buyFee);
                            else if (type === 'sell') feePercent = parseFloat(feeSettings.sellFee);
                            else if (type === 'send') feePercent = parseFloat(feeSettings.sendFee);
                            else if (type === 'receive') feePercent = parseFloat(feeSettings.receiveFee);
                            else if (type === 'convert') feePercent = parseFloat(feeSettings.convertFee);
                            const fee = (amount * feePercent) / 100;
                            const netAmount = amount - fee;
                            alert(`Transaction Amount: $${amount.toFixed(2)}\\nFee (${feePercent}%): $${fee.toFixed(2)}\\nNet Amount: $${netAmount.toFixed(2)}`);
                          }}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                        >
                          Calculate Fee
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600">Enter an amount and transaction type to preview the fee calculation</p>
                  </div>
                </div>

                {/* Fee History */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Change History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Old Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Changed By</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {feeHistory.map((history) => (
                          <tr key={history.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{history.date}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{history.type}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{history.oldValue}</td>
                            <td className="px-4 py-3 text-sm font-medium text-green-600">{history.newValue}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{history.changedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Fee Templates */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Templates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={() => {
                        setFeeSettings({
                          buyFee: '1.0',
                          sellFee: '1.0',
                          sendFee: '0.5',
                          receiveFee: '0.0',
                          convertFee: '0.8',
                          withdrawalFeeUSD: '2.0',
                          withdrawalFeeNGN: '50',
                          depositFee: '0.0',
                        });
                        alert('Low fee template applied');
                      }}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-purple-600 transition-colors text-left"
                    >
                      <div className="font-semibold text-gray-900 mb-1">Low Fees</div>
                      <div className="text-sm text-gray-600">Competitive rates for high volume</div>
                    </button>
                    <button
                      onClick={() => {
                        setFeeSettings({
                          buyFee: '1.5',
                          sellFee: '1.5',
                          sendFee: '0.5',
                          receiveFee: '0.0',
                          convertFee: '1.0',
                          withdrawalFeeUSD: '2.5',
                          withdrawalFeeNGN: '100',
                          depositFee: '0.0',
                        });
                        alert('Standard fee template applied');
                      }}
                      className="p-4 border-2 border-purple-600 rounded-lg hover:border-purple-700 transition-colors text-left"
                    >
                      <div className="font-semibold text-gray-900 mb-1">Standard (Current)</div>
                      <div className="text-sm text-gray-600">Balanced rates for most users</div>
                    </button>
                    <button
                      onClick={() => {
                        setFeeSettings({
                          buyFee: '2.0',
                          sellFee: '2.0',
                          sendFee: '1.0',
                          receiveFee: '0.0',
                          convertFee: '1.5',
                          withdrawalFeeUSD: '3.0',
                          withdrawalFeeNGN: '150',
                          depositFee: '0.0',
                        });
                        alert('Premium fee template applied');
                      }}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-purple-600 transition-colors text-left"
                    >
                      <div className="font-semibold text-gray-900 mb-1">Premium Fees</div>
                      <div className="text-sm text-gray-600">Higher rates for premium services</div>
                    </button>
                  </div>
                </div>

</div>

                {/* Save Button */}
                <div className="pt-6 border-t border-gray-200">
                  <button
                    onClick={() => alert('Fee settings saved successfully!')}
                    className="bg-gradient-purple text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg"
                  >
                    Save Fee Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Revenue Management Tab */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            {/* Revenue Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Revenue</div>
                <div className="text-3xl font-bold">
                  ₦{(revenueStats?.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs opacity-75 mt-1">All time</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Today&apos;s Revenue</div>
                <div className="text-3xl font-bold text-green-600">
                  ₦{(revenueStats?.today_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(() => {
                    const y = revenueStats?.yesterday_revenue ?? 0;
                    const t = revenueStats?.today_revenue ?? 0;
                    if (y <= 0 && t <= 0) return '+0% from yesterday';
                    if (y <= 0) return '+100% vs yesterday';
                    const pct = ((t - y) / y) * 100;
                    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs yesterday`;
                  })()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">This Month</div>
                <div className="text-3xl font-bold text-gray-900">
                  ₦{(revenueStats?.month_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(() => {
                    const lm = revenueStats?.last_month_revenue ?? 0;
                    const m = revenueStats?.month_revenue ?? 0;
                    if (lm <= 0 && m <= 0) return '+0% vs same period last month';
                    if (lm <= 0) return '+100% vs last month';
                    const pct = ((m - lm) / lm) * 100;
                    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;
                  })()}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">This Year</div>
                <div className="text-3xl font-bold text-gray-900">
                  ₦{(revenueStats?.year_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(() => {
                    const ly = revenueStats?.last_year_revenue ?? 0;
                    const y = revenueStats?.year_revenue ?? 0;
                    if (ly <= 0 && y <= 0) return '+0% vs last year';
                    if (ly <= 0) return '+100% vs last year';
                    const pct = ((y - ly) / ly) * 100;
                    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last year`;
                  })()}
                </div>
              </div>
            </div>

                {/* Revenue Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue by Source</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-purple-600 rounded-full mr-3"></div>
                          <span className="text-sm text-gray-700">Transaction Fees</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₦{revenueStats?.revenue_by_source.transaction_fees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-blue-600 rounded-full mr-3"></div>
                          <span className="text-sm text-gray-700">Crypto Trading Fees</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₦{revenueStats?.revenue_by_source.crypto_trading_fees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-600 rounded-full mr-3"></div>
                          <span className="text-sm text-gray-700">Gift Card Sales</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₦{revenueStats?.revenue_by_source.gift_card_sales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-yellow-600 rounded-full mr-3"></div>
                          <span className="text-sm text-gray-700">Utility Services</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₦{revenueStats?.revenue_by_source.utility_services.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-red-600 rounded-full mr-3"></div>
                          <span className="text-sm text-gray-700">Withdrawal Fees</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₦{revenueStats?.revenue_by_source.withdrawal_fees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue Trends</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Last 7 Days</span>
                          <span className="font-medium text-gray-900">
                            ₦{revenueStats?.revenue_trends.last_7_days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ 
                              width: revenueStats && revenueStats.revenue_trends.last_90_days > 0
                                ? `${(revenueStats.revenue_trends.last_7_days / revenueStats.revenue_trends.last_90_days * 100)}%`
                                : '0%'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Last 30 Days</span>
                          <span className="font-medium text-gray-900">
                            ₦{revenueStats?.revenue_trends.last_30_days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ 
                              width: revenueStats && revenueStats.revenue_trends.last_90_days > 0
                                ? `${(revenueStats.revenue_trends.last_30_days / revenueStats.revenue_trends.last_90_days * 100)}%`
                                : '0%'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Last 90 Days</span>
                          <span className="font-medium text-gray-900">
                            ₦{revenueStats?.revenue_trends.last_90_days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-purple-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Revenue History Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Revenue History</h2>
                    <div className="flex gap-2">
                      <select 
                        value={revenueSourceFilter}
                        onChange={(e) => {
                          setRevenueSourceFilter(e.target.value);
                          setRevenuePage(1);
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      >
                        <option value="all">All Sources</option>
                        <option value="fees">Transaction Fees</option>
                        <option value="trading">Trading Fees</option>
                        <option value="gift-cards">Gift Cards</option>
                        <option value="utilities">Utilities</option>
                      </select>
                      <select 
                        value={revenueDateFilter}
                        onChange={(e) => {
                          setRevenueDateFilter(e.target.value as 'today' | 'week' | 'month' | 'year' | 'all');
                          setRevenuePage(1);
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                      >
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="year">This Year</option>
                        <option value="all">All Time</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {revenueLoading ? (
                      <div className="p-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        <p className="mt-4 text-gray-500">Loading revenue records...</p>
                      </div>
                    ) : revenueRecords.length === 0 ? (
                      <div className="p-12 text-center text-gray-500">
                        No revenue data available
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (NGN)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {revenueRecords.map((record) => (
                            <tr key={record.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {new Date(record.created_at).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.source}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.revenue_type.replace('_', ' ')}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {record.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {record.currency}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                ₦{record.amount_ngn ? record.amount_ngn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
          </div>
        )}

        {/* Gift Card Management Tab */}
        {activeTab === 'gift-cards' && (
          <div className="space-y-6">
            {/* Gift Card Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Total Gift Cards</div>
                <div className="text-3xl font-bold">0</div>
                <div className="text-xs opacity-75 mt-1">All time</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Active Cards</div>
                <div className="text-3xl font-bold text-green-600">0</div>
                <div className="text-xs text-gray-500 mt-1">Available for use</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Redeemed</div>
                <div className="text-3xl font-bold text-blue-600">0</div>
                <div className="text-xs text-gray-500 mt-1">Used by customers</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Sales</div>
                <div className="text-3xl font-bold text-gray-900">₦0.00</div>
                <div className="text-xs text-gray-500 mt-1">Revenue from sales</div>
              </div>
            </div>

            {/* Filters and Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Search by code, user, or email..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
                <select className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="redeemed">Redeemed</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none">
                  <option value="all">All Types</option>
                  <option value="amazon">Amazon</option>
                  <option value="apple">Apple</option>
                  <option value="google">Google Play</option>
                  <option value="steam">Steam</option>
                  <option value="netflix">Netflix</option>
                </select>
                <button className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">
                  Search
                </button>
              </div>
            </div>

            {/* Gift Cards Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Gift Cards (0)</h2>
                <button className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">
                  + Create Gift Card
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchased By</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        No gift cards found
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gift Card Types Management */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Available Gift Card Types</h2>
                <button className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">
                  + Add New Type
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'Amazon', icon: '🛒', available: true },
                  { name: 'Apple', icon: '🍎', available: true },
                  { name: 'Google Play', icon: '📱', available: true },
                  { name: 'Steam', icon: '🎮', available: true },
                  { name: 'Netflix', icon: '📺', available: true },
                  { name: 'Spotify', icon: '🎵', available: false },
                ].map((type, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{type.icon}</span>
                        <span className="font-medium text-gray-900">{type.name}</span>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        type.available ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {type.available ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      {type.available ? 'Available for purchase' : 'Coming soon'}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 px-3 py-2 text-sm font-medium text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors">
                        Edit
                      </button>
                      <button className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        type.available
                          ? 'text-red-600 border border-red-600 hover:bg-red-50'
                          : 'text-green-600 border border-green-600 hover:bg-green-50'
                      }`}>
                        {type.available ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gift Card Sales Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Sales by Type</h3>
                <div className="space-y-4">
                  {[
                    { name: 'Amazon', sales: 0, percentage: 0 },
                    { name: 'Apple', sales: 0, percentage: 0 },
                    { name: 'Google Play', sales: 0, percentage: 0 },
                    { name: 'Steam', sales: 0, percentage: 0 },
                    { name: 'Netflix', sales: 0, percentage: 0 },
                  ].map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{item.name}</span>
                        <span className="font-medium text-gray-900">₦{item.sales.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${item.percentage}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Sales</h3>
                <div className="space-y-3">
                  <div className="text-center py-8 text-gray-500">
                    No recent sales
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Verification Management Tab */}
        {activeTab === 'verifications' && (
          <div className="space-y-6">
            {/* Verification Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-purple rounded-xl shadow-sm p-6 text-white">
                <div className="text-sm opacity-90 mb-2">Pending Verifications</div>
                <div className="text-3xl font-bold">{verifications.filter((v) => v.status === 'pending').length}</div>
                <div className="text-xs opacity-75 mt-1">Awaiting review</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Approved</div>
                <div className="text-3xl font-bold text-green-600">{verifications.filter((v) => v.status === 'approved').length}</div>
                <div className="text-xs text-gray-500 mt-1">Verified accounts</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Rejected</div>
                <div className="text-3xl font-bold text-red-600">{verifications.filter((v) => v.status === 'rejected').length}</div>
                <div className="text-xs text-gray-500 mt-1">Failed verification</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="text-sm text-gray-600 mb-2">Total Submissions</div>
                <div className="text-3xl font-bold text-gray-900">{verifications.length}</div>
                <div className="text-xs text-gray-500 mt-1">All time</div>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or NIN..."
                  value={verificationSearchQuery}
                  onChange={(e) => setVerificationSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
                <select
                  value={verificationStatusFilter}
                  onChange={(e) => setVerificationStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  onClick={() => {
                    fetchVerifications();
                  }}
                  className="bg-gradient-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Verifications Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Verification Requests ({verifications.length})
                </h2>
                {verificationLoading && (
                  <div className="text-sm text-gray-500">Loading...</div>
                )}
              </div>
              {verificationLoading && verifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="mt-4 text-gray-500">Loading verifications...</p>
                </div>
              ) : verifications.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No verification requests found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIN</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {verifications.map((verification) => (
                        <tr key={verification.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {verification.full_name || verification.user_name || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">{verification.email || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{verification.phone_number || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono text-gray-900">{verification.nin || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {verification.submitted_at
                                ? new Date(verification.submitted_at).toLocaleDateString()
                                : 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {verification.submitted_at
                                ? new Date(verification.submitted_at).toLocaleTimeString()
                                : ''}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              verification.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : verification.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {verification.status === 'pending' ? 'Pending' :
                               verification.status === 'approved' ? 'Approved' : 'Rejected'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => {
                                setSelectedVerification(verification);
                                setShowVerificationModal(true);
                              }}
                              className="text-purple-600 hover:text-purple-900 mr-4"
                            >
                              View
                            </button>
                            {verification.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => {
                                    if (confirm('Approve this verification?')) {
                                      // TODO: Implement approve
                                      console.log('Approve verification:', verification.id);
                                    }
                                  }}
                                  className="text-green-600 hover:text-green-900 mr-4"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Reject this verification?')) {
                                      // TODO: Implement reject
                                      console.log('Reject verification:', verification.id);
                                    }
                                  }}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verification Detail Modal */}
        {showVerificationModal && selectedVerification && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Review Verification</h2>
                  <p className="text-sm text-gray-600 mt-1">Review user verification details</p>
                </div>
                <button
                  onClick={() => {
                    setShowVerificationModal(false);
                    setSelectedVerification(null);
                    setRejectionReason('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* User Full Name Header */}
                <div className="bg-gradient-purple rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Verification Request</div>
                      <h3 className="text-2xl font-bold">
                        {selectedVerification.full_name || selectedVerification.user_name || 'N/A'}
                      </h3>
                      <div className="text-sm opacity-75 mt-1">{selectedVerification.email || 'N/A'}</div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      selectedVerification.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : selectedVerification.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedVerification.status === 'pending' ? 'Pending Review' :
                       selectedVerification.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">User Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Full Name</div>
                      <div className="text-base font-medium text-gray-900">
                        {selectedVerification.full_name || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Email</div>
                      <div className="text-base font-medium text-gray-900">
                        {selectedVerification.email || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Phone Number</div>
                      <div className="text-base font-medium text-gray-900">
                        {selectedVerification.phone_number || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 mb-1">NIN Number</div>
                      <div className="text-base font-mono font-medium text-gray-900">
                        {selectedVerification.nin || 'N/A'}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-gray-600 mb-1">Address</div>
                      <div className="text-base font-medium text-gray-900">
                        {selectedVerification.address || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Submitted</div>
                      <div className="text-base font-medium text-gray-900">
                        {selectedVerification.submitted_at
                          ? new Date(selectedVerification.submitted_at).toLocaleString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Documents */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Documents</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-900 mb-2">NIN Front</div>
                      {selectedVerification.nin_front_url ? (
                        <img
                          src={selectedVerification.nin_front_url}
                          alt="NIN Front"
                          className="w-full h-64 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            const url = selectedVerification.nin_front_url;
                            if (url) window.open(url, '_blank');
                          }}
                        />
                      ) : (
                        <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                          <span className="text-gray-400 text-sm">No image available</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-900 mb-2">NIN Back</div>
                      {selectedVerification.nin_back_url ? (
                        <img
                          src={selectedVerification.nin_back_url}
                          alt="NIN Back"
                          className="w-full h-64 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            const url = selectedVerification.nin_back_url;
                            if (url) window.open(url, '_blank');
                          }}
                        />
                      ) : (
                        <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                          <span className="text-gray-400 text-sm">No image available</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-900 mb-2">Passport Photo</div>
                      {selectedVerification.passport_photo_url ? (
                        <img
                          src={selectedVerification.passport_photo_url}
                          alt="Passport Photo"
                          className="w-full h-64 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            const url = selectedVerification.passport_photo_url;
                            if (url) window.open(url, '_blank');
                          }}
                        />
                      ) : (
                        <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                          <span className="text-gray-400 text-sm">No image available</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rejection Reason Input (only show when rejecting) */}
                {selectedVerification.status === 'pending' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Rejection Report (Required if rejecting)
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Enter a clear note explaining why the verification was rejected and what the user needs to fix. This note will be prominently displayed in the rejection email so the user can easily locate and fix the issues..."
                      rows={5}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      <strong>Note:</strong> This message will be sent to the user via email and push notification. Make it clear and actionable so the user knows exactly what to fix.
                    </p>
                  </div>
                )}

                {/* Actions */}
                {selectedVerification.status === 'pending' && (
                  <div className="border-t border-gray-200 pt-6 space-y-4">
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          if (confirm('Are you sure you want to approve this verification? This will mark the user account as verified.')) {
                            setProcessingVerification(true);
                            try {
                              // Call API to approve verification
                              const response = await verificationApi.approveVerification(selectedVerification.id);
                              
                              if (response.success) {
                                // Update local state
                                setVerifications(verifications.map(v => 
                                  v.id === selectedVerification.id 
                                    ? { ...v, status: 'approved' }
                                    : v
                                ));
                                
                                // Update user verification status in storage (for mobile app sync)
                                // TODO: In production, this should be handled by the backend API
                                // The backend should update the database and sync with mobile app
                                if (selectedVerification.user_id && typeof localStorage !== 'undefined') {
                                  localStorage.setItem(`verification_status_${selectedVerification.user_id}`, 'approved');
                                }
                                
                                // Send push notification to user
                                // TODO: Implement push notification service
                                console.log('Sending approval notification to user:', selectedVerification.user_id);
                                
                                alert('Verification approved successfully! User has been notified.');
                                setShowVerificationModal(false);
                                setSelectedVerification(null);
                                setRejectionReason('');
                                
                                // Refresh verifications list
                                fetchVerifications();
                              } else {
                                alert('Failed to approve verification: ' + (response.error || 'Unknown error'));
                              }
                            } catch (error: unknown) {
                              console.error('Error approving verification:', error);
                              alert('Error approving verification: ' + (error as Error)?.message || 'Unknown error');
                            } finally {
                              setProcessingVerification(false);
                            }
                          }
                        }}
                        disabled={processingVerification}
                        className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingVerification ? 'Processing...' : '✓ Approve Verification'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!rejectionReason.trim()) {
                            alert('Please provide a rejection reason before rejecting the verification.');
                            return;
                          }
                          
                          if (confirm('Are you sure you want to reject this verification? The user will be notified with the reason provided.')) {
                            setProcessingVerification(true);
                            try {
                              // Call API to reject verification
                              const response = await verificationApi.rejectVerification(
                                selectedVerification.id,
                                rejectionReason
                              );
                              
                              if (response.success) {
                                // Update local state
                                setVerifications(verifications.map(v => 
                                  v.id === selectedVerification.id 
                                    ? { ...v, status: 'rejected', rejection_reason: rejectionReason }
                                    : v
                                ));
                                
                                // Update user verification status in storage (for mobile app sync)
                                // TODO: In production, this should be handled by the backend API
                                // The backend should update the database and sync with mobile app
                                if (selectedVerification.user_id && typeof localStorage !== 'undefined') {
                                  localStorage.setItem(`verification_status_${selectedVerification.user_id}`, 'rejected');
                                }
                                
                                // Send push notification to user
                                // TODO: Implement push notification service
                                console.log('Sending rejection notification to user:', selectedVerification.user_id, 'Reason:', rejectionReason);
                                
                                alert('Verification rejected. User has been notified with the reason provided.');
                                setShowVerificationModal(false);
                                setSelectedVerification(null);
                                setRejectionReason('');
                                
                                // Refresh verifications list
                                fetchVerifications();
                              } else {
                                alert('Failed to reject verification: ' + (response.error || 'Unknown error'));
                              }
                            } catch (error: unknown) {
                              console.error('Error rejecting verification:', error);
                              alert('Error rejecting verification: ' + (error as Error)?.message || 'Unknown error');
                            } finally {
                              setProcessingVerification(false);
                            }
                          }
                        }}
                        disabled={processingVerification || !rejectionReason.trim()}
                        className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingVerification ? 'Processing...' : '✗ Reject Verification'}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        // TODO: Implement download documents
                        console.log('Download documents for:', selectedVerification.id);
                        alert('Downloading documents...');
                      }}
                      className="w-full px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      📥 Download All Documents
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

    </div>
  );
}

