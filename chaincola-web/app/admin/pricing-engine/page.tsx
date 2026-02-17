'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  getAllPricingEngineConfigs, 
  setPricingEngineConfig, 
  freezePricingGlobally,
  type PricingEngineConfig, 
  type SetPricingEngineConfigRequest 
} from '@/lib/admin-pricing-engine-service';

interface ConfigFormData {
  asset: string;
  buy_rate_ngn: string;
  sell_rate_ngn: string;
  trading_enabled: boolean;
  price_frozen: boolean;
  notes: string;
}

const ASSET_OPTIONS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'TRX', name: 'Tron' },
];

export default function PricingEnginePage() {
  const router = useRouter();
  const [configs, setConfigs] = useState<PricingEngineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<PricingEngineConfig | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [globalFreezeLoading, setGlobalFreezeLoading] = useState(false);
  const [formData, setFormData] = useState<ConfigFormData>({
    asset: '',
    buy_rate_ngn: '',
    sell_rate_ngn: '',
    trading_enabled: true,
    price_frozen: false,
    notes: '',
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedConfigs = await getAllPricingEngineConfigs();
      setConfigs(fetchedConfigs);
    } catch (err: any) {
      console.error('Error fetching configs:', err);
      setError(err.message || 'Failed to fetch pricing engine configs');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ConfigFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = (config: PricingEngineConfig) => {
    setEditingConfig(config);
    setFormData({
      asset: config.asset,
      buy_rate_ngn: config.override_buy_price_ngn != null ? config.override_buy_price_ngn.toString() : '',
      sell_rate_ngn: config.override_sell_price_ngn != null ? config.override_sell_price_ngn.toString() : '',
      trading_enabled: config.trading_enabled,
      price_frozen: config.price_frozen,
      notes: config.notes || '',
    });
    setShowAddForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditingConfig(null);
    setShowAddForm(false);
    setFormData({
      asset: '',
      buy_rate_ngn: '',
      sell_rate_ngn: '',
      trading_enabled: true,
      price_frozen: false,
      notes: '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.asset) {
        setError('Please select an asset');
        setSaving(false);
        return;
      }

      const buyRateRaw = formData.buy_rate_ngn.trim();
      const sellRateRaw = formData.sell_rate_ngn.trim();
      const buyRate = buyRateRaw ? parseFloat(buyRateRaw) : null;
      const sellRate = sellRateRaw ? parseFloat(sellRateRaw) : null;
      if (buyRateRaw) {
        const b = parseFloat(buyRateRaw);
        if (isNaN(b) || b <= 0) {
          setError('Buy rate must be a valid positive number');
          setSaving(false);
          return;
        }
      }
      if (sellRateRaw) {
        const s = parseFloat(sellRateRaw);
        if (isNaN(s) || s <= 0) {
          setError('Sell rate must be a valid positive number');
          setSaving(false);
          return;
        }
      }

      const request: SetPricingEngineConfigRequest = {
        asset: formData.asset,
        buy_spread_percentage: 0,
        sell_spread_percentage: 0,
        override_buy_price_ngn: buyRate,
        override_sell_price_ngn: sellRate,
        trading_enabled: formData.trading_enabled,
        price_frozen: formData.price_frozen,
        notes: formData.notes || undefined,
      };

      const result = await setPricingEngineConfig(request);

      if (result.success) {
        setSuccess(editingConfig ? 'Configuration updated successfully' : 'Configuration created successfully');
        setEditingConfig(null);
        setShowAddForm(false);
        setFormData({
          asset: '',
          buy_rate_ngn: '',
          sell_rate_ngn: '',
          trading_enabled: true,
          price_frozen: false,
          notes: '',
        });
        await fetchConfigs();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleGlobalFreeze = async (freeze: boolean) => {
    if (!confirm(`Are you sure you want to ${freeze ? 'freeze' : 'unfreeze'} prices globally for all assets?`)) {
      return;
    }

    setGlobalFreezeLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await freezePricingGlobally(freeze);
      
      if (result.success) {
        setSuccess(`Prices ${freeze ? 'frozen' : 'unfrozen'} globally for ${result.updatedCount || 0} assets`);
        await fetchConfigs();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || `Failed to ${freeze ? 'freeze' : 'unfreeze'} prices`);
      }
    } catch (err: any) {
      console.error('Error freezing/unfreezing prices:', err);
      setError(err.message || `Failed to ${freeze ? 'freeze' : 'unfreeze'} prices`);
    } finally {
      setGlobalFreezeLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isGlobalFreezeActive = configs.some(c => c.price_frozen);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pricing Engine Management</h1>
              <p className="mt-1 text-sm text-gray-500">Set buy and sell NGN rates per asset, enable/disable trading, and freeze prices</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/admin/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Dashboard
              </Link>
              {isGlobalFreezeActive ? (
                <button
                  onClick={() => handleGlobalFreeze(false)}
                  disabled={globalFreezeLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {globalFreezeLoading ? 'Unfreezing...' : 'Unfreeze Prices Globally'}
                </button>
              ) : (
                <button
                  onClick={() => handleGlobalFreeze(true)}
                  disabled={globalFreezeLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {globalFreezeLoading ? 'Freezing...' : 'Freeze Prices Globally'}
                </button>
              )}
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                >
                  Add New Configuration
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
            {success}
          </div>
        )}

        {/* Global Freeze Warning */}
        {isGlobalFreezeActive && (
          <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-md">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">Prices are currently frozen globally. All assets will use frozen prices instead of live market data.</span>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingConfig ? 'Edit Configuration' : 'Add New Configuration'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.asset}
                    onChange={(e) => handleInputChange('asset', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                    disabled={!!editingConfig}
                  >
                    <option value="">Select asset</option>
                    {ASSET_OPTIONS.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name} ({asset.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trading Status
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.trading_enabled}
                      onChange={(e) => handleInputChange('trading_enabled', e.target.checked)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {formData.trading_enabled ? 'Trading Enabled' : 'Trading Disabled'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buy Rate (NGN per unit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.buy_rate_ngn}
                    onChange={(e) => handleInputChange('buy_rate_ngn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g. 1520 (leave empty for market)"
                  />
                  <p className="mt-1 text-xs text-gray-500">NGN rate when users buy this asset</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sell Rate (NGN per unit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sell_rate_ngn}
                    onChange={(e) => handleInputChange('sell_rate_ngn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g. 1480 (leave empty for market)"
                  />
                  <p className="mt-1 text-xs text-gray-500">NGN rate when users sell this asset</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Freeze Price for This Asset
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.price_frozen}
                      onChange={(e) => handleInputChange('price_frozen', e.target.checked)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {formData.price_frozen ? 'Price Frozen' : 'Price Active'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Freeze this asset's price (use last known price)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Add any notes about this configuration..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingConfig ? 'Update Configuration' : 'Create Configuration'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Configurations Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Asset Configurations</h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading configurations...</p>
            </div>
          ) : configs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">No configurations found. Click "Add New Configuration" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Asset
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Buy Rate (NGN)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sell Rate (NGN)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trading
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {configs.map((config) => (
                    <tr key={config.id} className={!config.trading_enabled ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{config.asset}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {config.override_buy_price_ngn != null
                            ? formatCurrency(config.override_buy_price_ngn)
                            : <span className="text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {config.override_sell_price_ngn != null
                            ? formatCurrency(config.override_sell_price_ngn)
                            : <span className="text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            config.trading_enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {config.trading_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            config.price_frozen
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {config.price_frozen ? 'Frozen' : 'Active'}
                        </span>
                        {config.frozen_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(config.frozen_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(config.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(config)}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
