'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { appSettingsApi } from '@/lib/admin-api';
// Supabase removed

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState({
    siteName: 'ChainCola',
    maintenanceMode: false,
    emailNotifications: true,
    transactionFee: '2.5',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // UI-only: No authentication check, directly set authenticated and fetch settings
    setIsAuthenticated(true);
    fetchSettings();
  }, [router]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await appSettingsApi.getAppSettings();
      if (response.success && response.data) {
        const appSettings = response.data;
        setSettings({
          siteName: appSettings.app_name || 'ChainCola',
          maintenanceMode: appSettings.maintenance_mode || false,
          emailNotifications: true, // This is a UI-only setting
          transactionFee: appSettings.transaction_fee?.toString() || '2.5',
        });
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await appSettingsApi.updateAppSettings({
        app_name: settings.siteName,
        maintenance_mode: settings.maintenanceMode,
        transaction_fee: parseFloat(settings.transactionFee) || 2.5,
      });

      if (response.success) {
        alert('Settings saved successfully!');
      } else {
        alert(response.error || 'Failed to save settings');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert('Error saving settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-8">
          {/* General Settings */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">General Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site Name
                </label>
                <input
                  type="text"
                  value={settings.siteName}
                  onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* System Settings */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">System Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Maintenance Mode
                  </label>
                  <p className="text-sm text-gray-500">Enable to put the site in maintenance mode</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email Notifications
                  </label>
                  <p className="text-sm text-gray-500">Send email notifications for important events</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.emailNotifications}
                    onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Transaction Settings */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Transaction Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transaction Fee (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.transactionFee}
                  onChange={(e) => setSettings({ ...settings, transactionFee: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving || loading || !isAuthenticated}
              className="bg-gradient-purple text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : loading ? 'Loading...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


