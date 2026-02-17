import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Switch, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface AutoSellPreferences {
  auto_sell_crypto: boolean;
  auto_sell_btc: boolean;
  auto_sell_eth: boolean;
  auto_sell_sol: boolean;
  auto_sell_xrp: boolean;
}

export default function AutoSellSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<AutoSellPreferences>({
    auto_sell_crypto: true,
    auto_sell_btc: true,
    auto_sell_eth: true,
    auto_sell_sol: true,
    auto_sell_xrp: true,
  });

  useEffect(() => {
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPreferences = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_preferences')
        .select('auto_sell_crypto, auto_sell_btc, auto_sell_eth, auto_sell_sol, auto_sell_xrp')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no preferences exist yet, use defaults
        if (error.code === 'PGRST116') {
          console.log('No preferences found, using defaults');
          return;
        }
        throw error;
      }

      if (data) {
        setPreferences(data);
      }
    } catch (error) {
      console.error('Failed to load auto-sell preferences:', error);
      Alert.alert('Error', 'Failed to load auto-sell preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof AutoSellPreferences, value: boolean) => {
    if (!user?.id) return;

    try {
      setSaving(true);

      // If disabling master toggle, disable all individual toggles
      const updates: Partial<AutoSellPreferences> = { [key]: value };
      if (key === 'auto_sell_crypto' && !value) {
        updates.auto_sell_btc = false;
        updates.auto_sell_eth = false;
        updates.auto_sell_sol = false;
        updates.auto_sell_xrp = false;
      }

      // Update local state immediately for better UX
      setPreferences((prev) => ({ ...prev, ...updates }));

      // Upsert to database
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      console.log('Auto-sell preference updated:', key, value);
    } catch (error) {
      console.error('Failed to update auto-sell preference:', error);
      Alert.alert('Error', 'Failed to update preference. Please try again.');
      // Revert local state on error
      loadPreferences();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#6B46C1" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Auto-Convert Crypto to NGN</ThemedText>
        <ThemedText style={styles.sectionDesc}>
          Automatically convert received cryptocurrency to Nigerian Naira immediately upon deposit confirmation.
        </ThemedText>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingLeft}>
          <ThemedText style={styles.settingLabel}>Enable Auto-Convert</ThemedText>
          <ThemedText style={styles.settingDesc}>Master toggle for all cryptocurrencies</ThemedText>
        </View>
        <Switch
          value={preferences.auto_sell_crypto}
          onValueChange={(value) => updatePreference('auto_sell_crypto', value)}
          disabled={saving}
          trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
          thumbColor={preferences.auto_sell_crypto ? '#6B46C1' : '#F9FAFB'}
        />
      </View>

      {preferences.auto_sell_crypto && (
        <>
          <View style={styles.divider} />

          <View style={styles.section}>
            <ThemedText style={styles.subsectionTitle}>Individual Cryptocurrencies</ThemedText>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.cryptoRow}>
                <ThemedText style={styles.cryptoEmoji}>₿</ThemedText>
                <ThemedText style={styles.settingLabel}>Bitcoin (BTC)</ThemedText>
              </View>
              <ThemedText style={styles.settingDesc}>Auto-convert BTC deposits to NGN</ThemedText>
            </View>
            <Switch
              value={preferences.auto_sell_btc}
              onValueChange={(value) => updatePreference('auto_sell_btc', value)}
              disabled={saving || !preferences.auto_sell_crypto}
              trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
              thumbColor={preferences.auto_sell_btc ? '#6B46C1' : '#F9FAFB'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.cryptoRow}>
                <ThemedText style={styles.cryptoEmoji}>Ξ</ThemedText>
                <ThemedText style={styles.settingLabel}>Ethereum (ETH)</ThemedText>
              </View>
              <ThemedText style={styles.settingDesc}>Auto-convert ETH deposits to NGN</ThemedText>
            </View>
            <Switch
              value={preferences.auto_sell_eth}
              onValueChange={(value) => updatePreference('auto_sell_eth', value)}
              disabled={saving || !preferences.auto_sell_crypto}
              trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
              thumbColor={preferences.auto_sell_eth ? '#6B46C1' : '#F9FAFB'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.cryptoRow}>
                <ThemedText style={styles.cryptoEmoji}>◎</ThemedText>
                <ThemedText style={styles.settingLabel}>Solana (SOL)</ThemedText>
              </View>
              <ThemedText style={styles.settingDesc}>Auto-convert SOL deposits to NGN</ThemedText>
            </View>
            <Switch
              value={preferences.auto_sell_sol}
              onValueChange={(value) => updatePreference('auto_sell_sol', value)}
              disabled={saving || !preferences.auto_sell_crypto}
              trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
              thumbColor={preferences.auto_sell_sol ? '#6B46C1' : '#F9FAFB'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.cryptoRow}>
                <ThemedText style={styles.cryptoEmoji}>✕</ThemedText>
                <ThemedText style={styles.settingLabel}>Ripple (XRP)</ThemedText>
              </View>
              <ThemedText style={styles.settingDesc}>Auto-convert XRP deposits to NGN</ThemedText>
            </View>
            <Switch
              value={preferences.auto_sell_xrp}
              onValueChange={(value) => updatePreference('auto_sell_xrp', value)}
              disabled={saving || !preferences.auto_sell_crypto}
              trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
              thumbColor={preferences.auto_sell_xrp ? '#6B46C1' : '#F9FAFB'}
            />
          </View>
        </>
      )}

      <View style={styles.infoBox}>
        <ThemedText style={styles.infoText}>
          💡 <ThemedText style={styles.infoBold}>How it works:</ThemedText> When you receive crypto, it&apos;s automatically converted to NGN at the current market rate. A 3% platform fee applies.
        </ThemedText>
      </View>

      <View style={styles.infoBox}>
        <ThemedText style={styles.infoText}>
          ⚠️ <ThemedText style={styles.infoBold}>Note:</ThemedText> Very small amounts (below ~₦2,000) will not be auto-converted to save on network fees.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
  },
  settingLeft: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  cryptoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cryptoEmoji: {
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  infoBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  infoText: {
    fontSize: 13,
    color: '#4338CA',
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
  },
});
