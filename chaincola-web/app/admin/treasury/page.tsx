'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllPricingEngineConfigs,
  setPricingEngineConfig,
  type PricingEngineConfig,
  type SetPricingEngineConfigRequest,
} from '@/lib/admin-pricing-engine-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Wallet {
  id: string;
  name: string;
  type: 'EXODUS' | 'TRUST';
  addresses: {
    BTC?: string;
    ETH?: string;
    USDT?: string;
    USDC?: string;
    XRP?: string;
    SOL?: string;
  };
  balances?: {
    BTC?: number;
    ETH?: number;
    USDT?: number;
    USDC?: number;
    XRP?: number;
    SOL?: number;
  };
}

interface InventoryBalance {
  asset: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';
  ledger_balance: number;
  on_chain_balance: number;
  difference: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'RECONCILING';
}

interface Reconciliation {
  id: string;
  asset: string;
  ledger_balance: number;
  on_chain_balance: number;
  difference: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISCREPANCY';
  created_at: string;
  completed_at?: string;
  admin_id: string;
  notes?: string;
}

interface Settlement {
  id: string;
  asset: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';
  amount: number;
  exchange: string;
  destination_address: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  transaction_hash?: string;
  confirmations?: number;
  required_confirmations?: number;
  usd_value: number;
  transaction_fee: number;
  network: string;
  admin_id: string;
  created_at: string;
  completed_at?: string;
}

/** Pricing rule from pricing engine (static buy/sell rates in NGN) */
interface PricingRule {
  id: string;
  asset: string;
  buy_rate_ngn: number | null;
  sell_rate_ngn: number | null;
  is_active: boolean;
  created_at: string;
}

interface PriceOverride {
  id: string;
  asset: string;
  market_price: number;
  override_price: number;
  account: string;
  reason: string;
  expiry_time: string;
  admin_id: string;
  status: 'ACTIVE' | 'EXPIRED';
  created_at: string;
}

interface AuditLog {
  id: string;
  action_type: string;
  admin_id: string;
  admin_name?: string;
  timestamp: string;
  asset?: string;
  amount?: number;
  reason: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: any;
}

interface TreasuryMetrics {
  current_ngn_float: number;
  crypto_inventory_value_usd: number;
  system_health_status: 'GREEN' | 'YELLOW' | 'RED';
  daily_volume_processed: number;
  liquidity_health_index: number;
}

type TabType = 
  | 'dashboard' 
  | 'wallets' 
  | 'inventory' 
  | 'reconciliation' 
  | 'ngn-float' 
  | 'settlements' 
  | 'risk-controls' 
  | 'pricing' 
  | 'audit-logs' 
  | 'reports';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TreasuryManagementPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // State management
  const [metrics, setMetrics] = useState<TreasuryMetrics | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<InventoryBalance[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [priceOverrides, setPriceOverrides] = useState<PriceOverride[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingInventoryBalances, setLoadingInventoryBalances] = useState(false);
  
  // Modal states
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [showRemoveInventoryModal, setShowRemoveInventoryModal] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [showAddNgnModal, setShowAddNgnModal] = useState(false);
  const [showRemoveNgnModal, setShowRemoveNgnModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showPricingRuleModal, setShowPricingRuleModal] = useState(false);
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [showEditWalletAddressModal, setShowEditWalletAddressModal] = useState(false);
  const [editingWalletAddress, setEditingWalletAddress] = useState<{
    asset: string;
    currentAddress: string;
  } | null>(null);
  
  // Form states
  const [inventoryForm, setInventoryForm] = useState({
    asset: 'BTC' as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL',
    amount: '',
    reason: '',
  });
  
  const [reconciliationForm, setReconciliationForm] = useState({
    asset: 'BTC' as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL',
  });
  
  const [ngnForm, setNgnForm] = useState({
    amount: '',
    reason: '',
  });
  
  const [settlementForm, setSettlementForm] = useState({
    asset: 'BTC' as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL',
    amount: '',
    exchange: '',
    destination_address: '',
  });
  
  const [pricingRuleForm, setPricingRuleForm] = useState({
    asset: 'BTC',
    buy_rate_ngn: '',
    sell_rate_ngn: '',
  });
  
  const [priceOverrideForm, setPriceOverrideForm] = useState({
    asset: 'BTC',
    override_price: '',
    account: '',
    reason: '',
    expiry_hours: '24',
  });
  
  const [walletAddressForm, setWalletAddressForm] = useState({
    address: '',
  });
  
  // Filter states
  const [auditFilters, setAuditFilters] = useState({
    start_date: '',
    end_date: '',
    action_type: '',
    asset: '',
    admin_id: '',
  });
  
  const [reportFilters, setReportFilters] = useState({
    report_type: 'DAILY' as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM',
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'wallets') {
      loadWallets();
    } else if (activeTab === 'inventory') {
      loadInventoryBalances();
    } else if (activeTab === 'reconciliation') {
      loadReconciliations();
    } else if (activeTab === 'settlements') {
      loadSettlements();
    } else if (activeTab === 'pricing') {
      loadPricingData();
    } else if (activeTab === 'audit-logs') {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMetrics(),
        loadWallets(),
        loadInventoryBalances(),
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getMetrics' }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setMetrics(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  };

  const loadWallets = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getWallets' }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setWallets(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading wallets:', error);
    }
  };

  const loadInventoryBalances = async () => {
    setLoadingInventoryBalances(true);
    try {
      console.log('🔄 Starting to load inventory balances...');
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getInventoryBalances' }),
      });
      
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP error loading inventory balances:', response.status, errorText);
        setInventoryBalances([]);
        setLoadingInventoryBalances(false);
        return;
      }

      const result = await response.json();
      console.log('📊 Full API Response:', JSON.stringify(result, null, 2));
      
      if (result.success && Array.isArray(result.data)) {
        console.log('✅ Inventory balances loaded successfully:', result.data.length, 'items');
        console.log('📊 Data:', result.data);
        setInventoryBalances(result.data);
      } else {
        console.error('❌ Failed to load inventory balances:', result.error || 'Invalid response format');
        console.error('❌ Response structure:', result);
        setInventoryBalances([]);
      }
    } catch (error: any) {
      console.error('❌ Exception loading inventory balances:', error);
      console.error('❌ Error details:', error.message, error.stack);
      setInventoryBalances([]);
    } finally {
      setLoadingInventoryBalances(false);
    }
  };

  const loadReconciliations = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getReconciliations' }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setReconciliations(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading reconciliations:', error);
    }
  };

  const loadSettlements = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getSettlements' }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSettlements(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading settlements:', error);
    }
  };

  const loadPricingData = async () => {
    try {
      const [configs, overridesResponse] = await Promise.all([
        getAllPricingEngineConfigs(),
        fetch('/api/admin/treasury', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getPriceOverrides' }),
        }),
      ]);
      const rules: PricingRule[] = configs.map((c: PricingEngineConfig) => ({
        id: c.id,
        asset: c.asset,
        buy_rate_ngn: c.override_buy_price_ngn ?? null,
        sell_rate_ngn: c.override_sell_price_ngn ?? null,
        is_active: c.trading_enabled,
        created_at: c.updated_at,
      }));
      setPricingRules(rules);
      if (overridesResponse.ok) {
        const overridesResult = await overridesResponse.json();
        if (overridesResult.success) {
          setPriceOverrides(overridesResult.data);
        }
      }
    } catch (error) {
      console.error('Error loading pricing data:', error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'getAuditLogs',
          filters: auditFilters,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAuditLogs(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);
    }
  };

  const handleAddInventory = async () => {
    if (!inventoryForm.amount || !inventoryForm.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addInventory',
          asset: inventoryForm.asset,
          amount: parseFloat(inventoryForm.amount),
          reason: inventoryForm.reason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Inventory added successfully');
          setShowAddInventoryModal(false);
          setInventoryForm({ asset: 'BTC', amount: '', reason: '' });
          await loadInventoryBalances();
          await loadMetrics();
        } else {
          alert(result.error || 'Failed to add inventory');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add inventory');
    }
  };

  const handleRemoveInventory = async () => {
    if (!inventoryForm.amount || !inventoryForm.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeInventory',
          asset: inventoryForm.asset,
          amount: parseFloat(inventoryForm.amount),
          reason: inventoryForm.reason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Inventory removed successfully');
          setShowRemoveInventoryModal(false);
          setInventoryForm({ asset: 'BTC', amount: '', reason: '' });
          await loadInventoryBalances();
          await loadMetrics();
        } else {
          alert(result.error || 'Failed to remove inventory');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to remove inventory');
    }
  };

  const handleStartReconciliation = async () => {
    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'startReconciliation',
          asset: reconciliationForm.asset,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Reconciliation started successfully');
          setShowReconciliationModal(false);
          await loadReconciliations();
          await loadInventoryBalances();
        } else {
          alert(result.error || 'Failed to start reconciliation');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to start reconciliation');
    }
  };

  const handleAddNgnFloat = async () => {
    if (!ngnForm.amount || !ngnForm.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addNgnFloat',
          amount: parseFloat(ngnForm.amount),
          reason: ngnForm.reason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('NGN float added successfully');
          setShowAddNgnModal(false);
          setNgnForm({ amount: '', reason: '' });
          await loadMetrics();
        } else {
          alert(result.error || 'Failed to add NGN float');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add NGN float');
    }
  };

  const handleRemoveNgnFloat = async () => {
    if (!ngnForm.amount || !ngnForm.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    if (!metrics) {
      alert('Metrics not loaded');
      return;
    }

    const newBalance = metrics.current_ngn_float - parseFloat(ngnForm.amount);
    if (newBalance < 1000000) {
      if (!confirm(`Removing this amount will drop NGN float below minimum threshold (₦1,000,000). Continue?`)) {
        return;
      }
    }

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeNgnFloat',
          amount: parseFloat(ngnForm.amount),
          reason: ngnForm.reason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('NGN float removed successfully');
          setShowRemoveNgnModal(false);
          setNgnForm({ amount: '', reason: '' });
          await loadMetrics();
        } else {
          alert(result.error || 'Failed to remove NGN float');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to remove NGN float');
    }
  };

  const handleCreateSettlement = async () => {
    if (!settlementForm.amount || !settlementForm.exchange || !settlementForm.destination_address) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createSettlement',
          asset: settlementForm.asset,
          amount: parseFloat(settlementForm.amount),
          exchange: settlementForm.exchange,
          destination_address: settlementForm.destination_address,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Settlement created successfully');
          setShowSettlementModal(false);
          setSettlementForm({ asset: 'BTC', amount: '', exchange: '', destination_address: '' });
          await loadSettlements();
        } else {
          alert(result.error || 'Failed to create settlement');
        }
      }
    } catch (error: any) {
      alert(error.message || 'Failed to create settlement');
    }
  };

  const handleUpdateWalletAddress = async () => {
    if (!editingWalletAddress || !walletAddressForm.address.trim()) {
      alert('Please enter a valid wallet address');
      return;
    }

    try {
      // Map asset names to backend format
      let backendAsset = editingWalletAddress.asset;
      if (backendAsset === 'USDT') {
        backendAsset = 'USDT_ETH'; // Default to Ethereum network for USDT
      } else if (backendAsset === 'USDC') {
        backendAsset = 'USDC_ETH'; // Default to Ethereum network for USDC
      }

      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMainWalletAddress',
          asset: backendAsset,
          address: walletAddressForm.address.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Wallet address updated successfully');
          setShowEditWalletAddressModal(false);
          setEditingWalletAddress(null);
          setWalletAddressForm({ address: '' });
          await loadWallets(); // Reload wallets to show updated address
        } else {
          alert(result.error || 'Failed to update wallet address');
        }
      } else {
        const errorText = await response.text();
        alert(`Failed to update wallet address: ${errorText}`);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to update wallet address');
    }
  };

  const getAssetDisplayName = (asset: string): string => {
    if (asset === 'USDT') return 'USDT (Ethereum)';
    if (asset === 'USDC') return 'USDC (Ethereum)';
    return asset;
  };

  const formatAmount = (amount: number, decimals: number = 2): string => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
    if (currency === 'NGN') {
      return `₦${formatAmount(amount)}`;
    } else if (currency === 'USD') {
      return `$${formatAmount(amount)}`;
    }
    return `${formatAmount(amount)} ${currency}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Treasury Management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Treasury Management</h1>
          <p className="text-gray-600 mt-2">Complete control and visibility over crypto and fiat operations</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'wallets', label: 'Wallets', icon: '💼' },
              { id: 'inventory', label: 'Inventory', icon: '📦' },
              { id: 'reconciliation', label: 'Reconciliation', icon: '🔄' },
              { id: 'ngn-float', label: 'NGN Float', icon: '💵' },
              { id: 'settlements', label: 'Settlements', icon: '💳' },
              { id: 'risk-controls', label: 'Risk Controls', icon: '⚡' },
              { id: 'pricing', label: 'Pricing', icon: '💰' },
              { id: 'audit-logs', label: 'Audit Logs', icon: '📋' },
              { id: 'reports', label: 'Reports', icon: '📈' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            {metrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Current NGN Float</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCurrency(metrics.current_ngn_float)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">💵</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Crypto Inventory Value</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCurrency(metrics.crypto_inventory_value_usd, 'USD')}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📦</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">System Health</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        metrics.system_health_status === 'GREEN' ? 'text-green-600' :
                        metrics.system_health_status === 'YELLOW' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {metrics.system_health_status}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      metrics.system_health_status === 'GREEN' ? 'bg-green-100' :
                      metrics.system_health_status === 'YELLOW' ? 'bg-yellow-100' :
                      'bg-red-100'
                    }`}>
                      <span className="text-2xl">🟢</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Daily Volume</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCurrency(metrics.daily_volume_processed)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📈</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Liquidity Health</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {metrics.liquidity_health_index}%
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">💧</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Crypto Inventory Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Crypto Inventory Balances</h2>
                <button
                  onClick={loadInventoryBalances}
                  disabled={loadingInventoryBalances}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingInventoryBalances ? '🔄 Loading...' : '🔄 Refresh'}
                </button>
              </div>
              {loadingInventoryBalances ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-500">Loading inventory balances...</p>
                </div>
              ) : inventoryBalances.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {inventoryBalances.map((balance) => (
                    <div key={balance.asset} className="p-4 border border-gray-200 rounded-lg">
                      <div className="text-sm font-medium text-gray-600 mb-1">{balance.asset}</div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatAmount(balance.ledger_balance, balance.asset === 'BTC' || balance.asset === 'ETH' || balance.asset === 'SOL' ? 8 : 2)}
                      </div>
                      <div className={`text-xs mt-1 ${
                        balance.status === 'MATCHED' ? 'text-green-600' : 
                        balance.status === 'DISCREPANCY' ? 'text-red-600' : 
                        'text-yellow-600'
                      }`}>
                        {balance.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No inventory balances found</p>
                  <p className="text-sm text-gray-400 mb-4">Check browser console (F12) for error details</p>
                  <button
                    onClick={loadInventoryBalances}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    🔄 Retry Loading
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => setShowAddInventoryModal(true)}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  + Add Inventory
                </button>
                <button
                  onClick={() => setShowReconciliationModal(true)}
                  className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                >
                  🔄 Reconcile
                </button>
                <button
                  onClick={() => setShowSettlementModal(true)}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  💳 New Settlement
                </button>
                <button
                  onClick={() => setActiveTab('audit-logs')}
                  className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  📋 View Logs
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{log.action_type}</p>
                      <p className="text-xs text-gray-500">{log.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Wallets Tab */}
        {activeTab === 'wallets' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Main Wallets</h2>
                  <p className="text-sm text-gray-600 mt-1">Exodus Wallet (Primary) & Trust Wallet (Secondary)</p>
                </div>
                <button
                  onClick={loadWallets}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🔄 Refresh Balances
                </button>
              </div>

              {wallets.map((wallet) => (
                <div key={wallet.id} className="mb-6 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{wallet.name}</h3>
                    <span className="px-3 py-1 text-sm bg-purple-100 text-purple-800 rounded">
                      {wallet.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const).map((asset) => {
                      const address = wallet.addresses[asset];
                      const balance = wallet.balances?.[asset] || 0;
                      
                      return (
                        <div key={asset} className="p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-900">{asset}</span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (address) {
                                    navigator.clipboard.writeText(address);
                                    alert('Address copied!');
                                  }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                                disabled={!address}
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => {
                                  setEditingWalletAddress({
                                    asset,
                                    currentAddress: address || '',
                                  });
                                  setWalletAddressForm({ address: address || '' });
                                  setShowEditWalletAddressModal(true);
                                }}
                                className="text-xs text-green-600 hover:text-green-800"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                          {address ? (
                            <>
                              <code className="text-xs text-gray-600 font-mono block mb-2 break-all">
                                {address.substring(0, 20)}...{address.substring(address.length - 10)}
                              </code>
                              <p className="text-sm font-semibold text-gray-900">
                                Balance: {formatAmount(balance, asset === 'BTC' || asset === 'ETH' || asset === 'SOL' ? 8 : 2)} {asset}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-500 italic">No address configured</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Inventory Management</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddInventoryModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    + Add Inventory
                  </button>
                  <button
                    onClick={() => setShowRemoveInventoryModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    - Remove Inventory
                  </button>
                </div>
              </div>

              {/* Ledger vs On-Chain Comparison */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ledger vs On-Chain Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ledger Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Chain Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {inventoryBalances.map((balance) => {
                        const isMatched = balance.status === 'MATCHED';
                        const isDiscrepancy = balance.status === 'DISCREPANCY';
                        
                        return (
                          <tr key={balance.asset} className={isDiscrepancy ? 'bg-red-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{balance.asset}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatAmount(balance.ledger_balance, balance.asset === 'BTC' || balance.asset === 'ETH' || balance.asset === 'SOL' ? 8 : 2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatAmount(balance.on_chain_balance, balance.asset === 'BTC' || balance.asset === 'ETH' || balance.asset === 'SOL' ? 8 : 2)}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                              Math.abs(balance.difference) > 0.00000001 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {formatAmount(Math.abs(balance.difference), balance.asset === 'BTC' || balance.asset === 'ETH' || balance.asset === 'SOL' ? 8 : 2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                isMatched ? 'bg-green-100 text-green-800' :
                                isDiscrepancy ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {balance.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reconciliation Tab */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Reconciliation Workflow</h2>
                <button
                  onClick={() => setShowReconciliationModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  + Start New Reconciliation
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ledger Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Chain Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reconciliations.map((recon) => (
                      <tr key={recon.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{recon.asset}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatAmount(recon.ledger_balance, recon.asset === 'BTC' || recon.asset === 'ETH' || recon.asset === 'SOL' ? 8 : 2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatAmount(recon.on_chain_balance, recon.asset === 'BTC' || recon.asset === 'ETH' || recon.asset === 'SOL' ? 8 : 2)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                          Math.abs(recon.difference) > 0.00000001 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {formatAmount(Math.abs(recon.difference), recon.asset === 'BTC' || recon.asset === 'ETH' || recon.asset === 'SOL' ? 8 : 2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            recon.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            recon.status === 'DISCREPANCY' ? 'bg-red-100 text-red-800' :
                            recon.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {recon.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(recon.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* NGN Float Tab */}
        {activeTab === 'ngn-float' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">NGN Float Management</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Current Float: {metrics ? formatCurrency(metrics.current_ngn_float) : 'Loading...'} | 
                    Minimum Threshold: {formatCurrency(1000000)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddNgnModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    + Add Float
                  </button>
                  <button
                    onClick={() => setShowRemoveNgnModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    - Remove Float
                  </button>
                </div>
              </div>

              {metrics && (
                <div className={`p-4 rounded-lg border-2 ${
                  metrics.current_ngn_float >= 1000000 
                    ? 'bg-green-50 border-green-300' 
                    : 'bg-red-50 border-red-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Status</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        metrics.current_ngn_float >= 1000000 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metrics.current_ngn_float >= 1000000 ? 'Healthy' : 'Below Minimum'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Current Balance</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCurrency(metrics.current_ngn_float)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settlements Tab */}
        {activeTab === 'settlements' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Settlement Management</h2>
                <button
                  onClick={() => setShowSettlementModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  + Create New Settlement
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exchange</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confirmations</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {settlements.map((settlement) => (
                      <tr key={settlement.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{settlement.asset}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatAmount(settlement.amount, settlement.asset === 'BTC' || settlement.asset === 'ETH' || settlement.asset === 'SOL' ? 8 : 2)} {settlement.asset}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{settlement.exchange}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            settlement.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            settlement.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                            settlement.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {settlement.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {settlement.confirmations !== undefined && settlement.required_confirmations !== undefined
                            ? `${settlement.confirmations}/${settlement.required_confirmations}`
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(settlement.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {settlement.transaction_hash && (
                            <a
                              href={`https://blockchain.info/tx/${settlement.transaction_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Risk Controls Tab */}
        {activeTab === 'risk-controls' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Risk Controls & Emergency Features</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Buy & Sell Controls</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'] as const).map((asset) => (
                      <div key={asset} className="p-4 border border-gray-200 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-3">{asset}</h4>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">Enable Buy</span>
                            <input type="checkbox" className="w-4 h-4" defaultChecked />
                          </label>
                          <label className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">Enable Sell</span>
                            <input type="checkbox" className="w-4 h-4" defaultChecked />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Freeze Options</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button className="p-4 border-2 border-red-300 rounded-lg hover:bg-red-50 transition-colors">
                      <p className="font-semibold text-red-900">Freeze All Trading</p>
                      <p className="text-sm text-red-700 mt-1">Stop all buy/sell activity</p>
                    </button>
                    <button className="p-4 border-2 border-red-300 rounded-lg hover:bg-red-50 transition-colors">
                      <p className="font-semibold text-red-900">Halt Withdrawals</p>
                      <p className="text-sm text-red-700 mt-1">Prevent user fund withdrawals</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Pricing (static rates)</h2>
                <div className="flex items-center gap-3">
                  <Link
                    href="/admin/pricing-engine"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Open Pricing Engine
                  </Link>
                  <button
                    onClick={() => setShowPricingRuleModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    + Set rates
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing engine (static rates)</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Buy and sell rates in NGN per unit. Managed via the pricing engine; same data as{' '}
                  <Link href="/admin/pricing-engine" className="text-blue-600 hover:underline">Pricing Engine</Link>.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buy Rate (NGN)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sell Rate (NGN)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pricingRules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rule.asset}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {rule.buy_rate_ngn != null ? formatAmount(rule.buy_rate_ngn) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {rule.sell_rate_ngn != null ? formatAmount(rule.sell_rate_ngn) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {rule.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Active Price Overrides</h3>
                  <button
                    onClick={() => setShowPriceOverrideModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    + Override Price
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Market Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Override Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {priceOverrides.map((override) => (
                        <tr key={override.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{override.asset}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatAmount(override.market_price)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-purple-900">${formatAmount(override.override_price)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{override.account}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(override.expiry_time).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              override.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {override.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit-logs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Audit Logs</h2>
                <button
                  onClick={loadAuditLogs}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={auditFilters.start_date}
                    onChange={(e) => setAuditFilters({ ...auditFilters, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={auditFilters.end_date}
                    onChange={(e) => setAuditFilters({ ...auditFilters, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                  <select
                    value={auditFilters.action_type}
                    onChange={(e) => setAuditFilters({ ...auditFilters, action_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All</option>
                    <option value="CREDIT">Credit</option>
                    <option value="DEBIT">Debit</option>
                    <option value="ADJUSTMENT">Adjustment</option>
                    <option value="SETTLEMENT">Settlement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
                  <select
                    value={auditFilters.asset}
                    onChange={(e) => setAuditFilters({ ...auditFilters, asset: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All</option>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="XRP">XRP</option>
                    <option value="SOL">SOL</option>
                    <option value="NGN">NGN</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={loadAuditLogs}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.action_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.admin_name || log.admin_id.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.asset || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.amount ? formatAmount(log.amount) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{log.reason}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Reports & Analytics</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                  <select
                    value={reportFilters.report_type}
                    onChange={(e) => setReportFilters({ ...reportFilters, report_type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="DAILY">Daily Summary</option>
                    <option value="WEEKLY">Weekly Overview</option>
                    <option value="MONTHLY">Monthly Analysis</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </div>

                {reportFilters.report_type === 'CUSTOM' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={reportFilters.start_date}
                        onChange={(e) => setReportFilters({ ...reportFilters, start_date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                      <input
                        type="date"
                        value={reportFilters.end_date}
                        onChange={(e) => setReportFilters({ ...reportFilters, end_date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Export CSV
                  </button>
                  <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Export PDF
                  </button>
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {/* Add Inventory Modal */}
      {showAddInventoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add Inventory</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={inventoryForm.asset}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, asset: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <input
                  type="number"
                  step="any"
                  value={inventoryForm.amount}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <textarea
                  value={inventoryForm.reason}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Reason for adding inventory..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddInventoryModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddInventory}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Inventory Modal */}
      {showRemoveInventoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Remove Inventory</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={inventoryForm.asset}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, asset: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <input
                  type="number"
                  step="any"
                  value={inventoryForm.amount}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <textarea
                  value={inventoryForm.reason}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Reason for removing inventory..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRemoveInventoryModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveInventory}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Remove Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      {showReconciliationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Start New Reconciliation</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={reconciliationForm.asset}
                  onChange={(e) => setReconciliationForm({ asset: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowReconciliationModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartReconciliation}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Start Reconciliation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add NGN Float Modal */}
      {showAddNgnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add NGN Float</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (NGN)</label>
                <input
                  type="number"
                  value={ngnForm.amount}
                  onChange={(e) => setNgnForm({ ...ngnForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <textarea
                  value={ngnForm.reason}
                  onChange={(e) => setNgnForm({ ...ngnForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Reason for adding NGN float..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddNgnModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNgnFloat}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Float
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove NGN Float Modal */}
      {showRemoveNgnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Remove NGN Float</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (NGN)</label>
                <input
                  type="number"
                  value={ngnForm.amount}
                  onChange={(e) => setNgnForm({ ...ngnForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
                {metrics && ngnForm.amount && (
                  <p className="text-xs text-gray-500 mt-1">
                    New balance: {formatCurrency(metrics.current_ngn_float - parseFloat(ngnForm.amount))}
                    {metrics.current_ngn_float - parseFloat(ngnForm.amount) < 1000000 && (
                      <span className="text-red-600 font-semibold"> (Below minimum threshold!)</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <textarea
                  value={ngnForm.reason}
                  onChange={(e) => setNgnForm({ ...ngnForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Reason for removing NGN float..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRemoveNgnModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveNgnFloat}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Remove Float
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Settlement Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Settlement</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={settlementForm.asset}
                  onChange={(e) => setSettlementForm({ ...settlementForm, asset: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <input
                  type="number"
                  step="any"
                  value={settlementForm.amount}
                  onChange={(e) => setSettlementForm({ ...settlementForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Exchange</label>
                <select
                  value={settlementForm.exchange}
                  onChange={(e) => setSettlementForm({ ...settlementForm, exchange: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select exchange</option>
                  <option value="Luno">Luno</option>
                  <option value="Kraken">Kraken</option>
                  <option value="Binance">Binance</option>
                  <option value="Coinbase">Coinbase</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Destination Address</label>
                <input
                  type="text"
                  value={settlementForm.destination_address}
                  onChange={(e) => setSettlementForm({ ...settlementForm, destination_address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="Enter wallet address..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettlementModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSettlement}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Create Settlement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set rates modal (pricing engine) */}
      {showPricingRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Set buy & sell rates (NGN)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={pricingRuleForm.asset}
                  onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, asset: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                  <option value="TRX">TRX</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Buy rate (NGN per unit)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricingRuleForm.buy_rate_ngn}
                  onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, buy_rate_ngn: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. 1520"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sell rate (NGN per unit)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricingRuleForm.sell_rate_ngn}
                  onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, sell_rate_ngn: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. 1480"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPricingRuleModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const buyRate = pricingRuleForm.buy_rate_ngn.trim() ? parseFloat(pricingRuleForm.buy_rate_ngn) : null;
                    const sellRate = pricingRuleForm.sell_rate_ngn.trim() ? parseFloat(pricingRuleForm.sell_rate_ngn) : null;
                    if (buyRate != null && (isNaN(buyRate) || buyRate <= 0)) {
                      alert('Buy rate must be a valid positive number');
                      return;
                    }
                    if (sellRate != null && (isNaN(sellRate) || sellRate <= 0)) {
                      alert('Sell rate must be a valid positive number');
                      return;
                    }
                    const request: SetPricingEngineConfigRequest = {
                      asset: pricingRuleForm.asset,
                      buy_spread_percentage: 0,
                      sell_spread_percentage: 0,
                      override_buy_price_ngn: buyRate ?? null,
                      override_sell_price_ngn: sellRate ?? null,
                      trading_enabled: true,
                    };
                    const result = await setPricingEngineConfig(request);
                    if (result.success) {
                      setShowPricingRuleModal(false);
                      setPricingRuleForm({ asset: 'BTC', buy_rate_ngn: '', sell_rate_ngn: '' });
                      await loadPricingData();
                    } else {
                      alert(result.error || 'Failed to save rates');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save rates
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Price Override Modal */}
      {showPriceOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Override Asset Price</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                <select
                  value={priceOverrideForm.asset}
                  onChange={(e) => setPriceOverrideForm({ ...priceOverrideForm, asset: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Override Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={priceOverrideForm.override_price}
                  onChange={(e) => setPriceOverrideForm({ ...priceOverrideForm, override_price: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                <select
                  value={priceOverrideForm.account}
                  onChange={(e) => setPriceOverrideForm({ ...priceOverrideForm, account: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select account</option>
                  <option value="Main Operations">Main Operations</option>
                  <option value="Trading Account">Trading Account</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                <textarea
                  value={priceOverrideForm.reason}
                  onChange={(e) => setPriceOverrideForm({ ...priceOverrideForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                  placeholder="Reason for override..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (Hours)</label>
                <select
                  value={priceOverrideForm.expiry_hours}
                  onChange={(e) => setPriceOverrideForm({ ...priceOverrideForm, expiry_hours: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="1">1 Hour</option>
                  <option value="6">6 Hours</option>
                  <option value="12">12 Hours</option>
                  <option value="24">24 Hours</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPriceOverrideModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Handle create price override
                    alert('Price override creation will be implemented');
                    setShowPriceOverrideModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Override Price
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Wallet Address Modal */}
      {showEditWalletAddressModal && editingWalletAddress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Edit {getAssetDisplayName(editingWalletAddress.asset)} Wallet Address
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Address
                </label>
                <code className="block w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs break-all">
                  {editingWalletAddress.currentAddress || 'No address configured'}
                </code>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Address
                </label>
                <input
                  type="text"
                  value={walletAddressForm.address}
                  onChange={(e) => setWalletAddressForm({ address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder={`Enter new ${editingWalletAddress.asset} wallet address...`}
                  autoFocus
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">
                  ⚠️ <strong>Warning:</strong> Changing the wallet address will affect where future deposits are sent. 
                  Make sure this is the correct address for the {editingWalletAddress.asset} network.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEditWalletAddressModal(false);
                    setEditingWalletAddress(null);
                    setWalletAddressForm({ address: '' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateWalletAddress}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Update Address
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
