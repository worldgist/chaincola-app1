import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, Alert, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from '@/lib/notification-preferences-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusModalMessage, setStatusModalMessage] = useState('');

  const fetchPreferences = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const preferences = await getUserNotificationPreferences(user.id);
      if (preferences) {
        setPushNotifications(preferences.push_notifications_enabled);
        setEmailNotifications(preferences.email_notifications_enabled);
      }
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchPreferences();
    }, [user])
  );

  const handlePushNotificationToggle = async (value: boolean) => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    setPushNotifications(value);
    setSaving(true);

    try {
      // If disabling push, remove token(s) so the user won't receive pushes on any device
      if (value === false) {
        const { unregisterPushNotifications } = await import('@/lib/push-notification-service');
        await unregisterPushNotifications(user.id);
      }

      const result = await updateUserNotificationPreferences(user.id, {
        push_notifications_enabled: value,
      });

      if (!result.success) {
        // Revert on error
        setPushNotifications(!value);
        Alert.alert('Error', result.error || 'Failed to update push notification preference.');
        return;
      }

      // If enabling push, attempt to register (permission + token upsert)
      if (value === true) {
        const { registerForPushNotificationsAsync } = await import('@/lib/push-notification-service');
        await registerForPushNotificationsAsync(user.id);
      }

      setStatusModalMessage(
        value
          ? 'You have enabled user push notifications.'
          : 'You have disabled user push notifications.',
      );
      setShowStatusModal(true);
    } catch (error: any) {
      console.error('Error updating push notifications:', error);
      setPushNotifications(!value);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailNotificationToggle = async (value: boolean) => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    setEmailNotifications(value);
    setSaving(true);

    try {
      const result = await updateUserNotificationPreferences(user.id, {
        email_notifications_enabled: value,
      });

      if (!result.success) {
        // Revert on error
        setEmailNotifications(!value);
        Alert.alert('Error', result.error || 'Failed to update email notification preference.');
        return;
      }

      setStatusModalMessage(
        value
          ? 'You have enabled user email notifications.'
          : 'You have disabled user email notifications.',
      );
      setShowStatusModal(true);
    } catch (error: any) {
      console.error('Error updating email notifications:', error);
      setEmailNotifications(!value);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
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
          <ThemedText style={styles.headerTitle}>Notification Settings</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Loading notification settings...</ThemedText>
          </View>
        ) : (
          <View style={styles.settingsContainer}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                  <MaterialIcons name="notifications-active" size={24} color="#6B46C1" />
                </View>
                <View style={styles.settingContent}>
                  <ThemedText style={styles.settingTitle}>Push Notifications</ThemedText>
                  <ThemedText style={styles.settingSubtitle}>
                    Receive push notifications on your device
                  </ThemedText>
                </View>
              </View>
              <Switch
                value={pushNotifications}
                onValueChange={handlePushNotificationToggle}
                trackColor={{ false: '#D1D5DB', true: '#6B46C1' }}
                thumbColor={pushNotifications ? '#FFFFFF' : '#F3F4F6'}
                disabled={saving}
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                  <MaterialIcons name="email" size={24} color="#6B46C1" />
                </View>
                <View style={styles.settingContent}>
                  <ThemedText style={styles.settingTitle}>Email Notifications</ThemedText>
                  <ThemedText style={styles.settingSubtitle}>
                    Receive notifications via email
                  </ThemedText>
                </View>
              </View>
              <Switch
                value={emailNotifications}
                onValueChange={handleEmailNotificationToggle}
                trackColor={{ false: '#D1D5DB', true: '#6B46C1' }}
                thumbColor={emailNotifications ? '#FFFFFF' : '#F3F4F6'}
                disabled={saving}
              />
            </View>

            {saving && (
              <View style={styles.savingIndicator}>
                <AppLoadingIndicator size="small" />
                <ThemedText style={styles.savingText}>Saving preferences...</ThemedText>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Status modal (shown after toggle updates) */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <MaterialIcons name="info" size={28} color="#6B46C1" />
            </View>
            <ThemedText style={styles.modalTitle}>Notification preference updated</ThemedText>
            <ThemedText style={styles.modalMessage}>{statusModalMessage}</ThemedText>

            <TouchableOpacity
              style={styles.modalOkButton}
              onPress={() => setShowStatusModal(false)}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#6B46C1', '#9333EA']} style={styles.modalOkGradient}>
                <ThemedText style={styles.modalOkText}>OK</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  settingsContainer: {
    gap: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  savingText: {
    fontSize: 14,
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    opacity: 0.75,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalOkButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalOkGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  modalOkText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

