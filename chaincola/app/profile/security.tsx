import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isPINSetup, getBiometricPreference } from '@/lib/pin-service';

export default function SecurityScreen() {
  const { user } = useAuth();
  const [pinStatus, setPinStatus] = useState<boolean | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityStatus();
  }, [user?.id]);

  const fetchSecurityStatus = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const [hasPin, biometric] = await Promise.all([
        isPINSetup(user.id),
        getBiometricPreference(user.id),
      ]);
      setPinStatus(hasPin);
      setBiometricEnabled(biometric);
    } catch (error) {
      console.error('Error fetching security status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = () => {
    router.push('/profile/change-pin');
  };

  const handleChangePassword = () => {
    router.push('/profile/change-password');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Security & PIN</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6B46C1" />
            <ThemedText style={styles.loadingText}>Loading security settings...</ThemedText>
          </View>
        ) : (
          <View style={styles.menuContainer}>
            {/* PIN Status */}
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <MaterialIcons name="lock" size={24} color="#6B46C1" />
                <ThemedText style={styles.statusTitle}>PIN Security</ThemedText>
              </View>
              <View style={styles.statusContent}>
                <ThemedText style={styles.statusLabel}>Status:</ThemedText>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, pinStatus ? styles.statusDotActive : styles.statusDotInactive]} />
                  <ThemedText style={[styles.statusText, pinStatus ? styles.statusTextActive : styles.statusTextInactive]}>
                    {pinStatus ? 'Enabled' : 'Not Set'}
                  </ThemedText>
                </View>
              </View>
              <TouchableOpacity
                style={styles.statusActionButton}
                onPress={handleChangePin}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.statusActionText}>
                  {pinStatus ? 'Change PIN' : 'Set Up PIN'}
                </ThemedText>
                <MaterialIcons name="chevron-right" size={20} color="#6B46C1" />
              </TouchableOpacity>
            </View>

            {/* Biometric Status */}
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <MaterialIcons name="fingerprint" size={24} color="#6B46C1" />
                <ThemedText style={styles.statusTitle}>Biometric Authentication</ThemedText>
              </View>
              <View style={styles.statusContent}>
                <ThemedText style={styles.statusLabel}>Status:</ThemedText>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, biometricEnabled ? styles.statusDotActive : styles.statusDotInactive]} />
                  <ThemedText style={[styles.statusText, biometricEnabled ? styles.statusTextActive : styles.statusTextInactive]}>
                    {biometricEnabled ? 'Enabled' : 'Disabled'}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Change Password */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleChangePassword}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                  <MaterialIcons name="vpn-key" size={20} color="#6B46C1" />
                </View>
                <View style={styles.menuItemContent}>
                  <ThemedText style={styles.menuItemTitle}>Change Password</ThemedText>
                  <ThemedText style={styles.menuItemSubtitle}>
                    Update your account password
                  </ThemedText>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    width: '100%',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  menuContainer: {
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuItemSubtitle: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    opacity: 0.7,
  },
  statusCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  statusDotInactive: {
    backgroundColor: '#9CA3AF',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#10B981',
  },
  statusTextInactive: {
    color: '#6B7280',
  },
  statusActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  statusActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
});


