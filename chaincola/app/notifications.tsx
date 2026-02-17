import React, { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  formatRelativeTime,
  getNotificationIcon,
  type Notification,
} from '@/lib/notification-service';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const data = await getUserNotifications(user.id);
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [user])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark notification as read when pressed
    if (notification.status === 'unread') {
      const result = await markNotificationAsRead(notification.id);
      if (result.success) {
        setNotifications(prevNotifications =>
          prevNotifications.map(n =>
            n.id === notification.id ? { ...n, status: 'read' as const } : n
          )
        );
      }
    }
    
    // Navigate to relevant screen based on notification type
    if (notification.type === 'transaction' && notification.data?.transactionId) {
      // Navigate to transaction detail if applicable
      // router.push(`/transaction-detail?id=${notification.data.transactionId}`);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;

    const result = await markAllNotificationsAsRead(user.id);
    if (result.success) {
      setNotifications(prevNotifications =>
        prevNotifications.map(notification => ({ ...notification, status: 'read' as const }))
      );
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllAsRead}
          >
            <ThemedText style={styles.markAllText}>Mark all read</ThemedText>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6B46C1" />
            <ThemedText style={styles.loadingText}>Loading notifications...</ThemedText>
          </View>
        ) : (
          <>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <ThemedText style={styles.unreadText}>
                  {unreadCount} {unreadCount === 1 ? 'unread notification' : 'unread notifications'}
                </ThemedText>
              </View>
            )}

            <View style={styles.notificationsList}>
              {notifications.map((notification) => {
                const { icon, color } = getNotificationIcon(notification.type);
                const isUnread = notification.status === 'unread';
                
                return (
                  <TouchableOpacity
                    key={notification.id}
                    style={[
                      styles.notificationItem,
                      isUnread && styles.unreadNotification,
                    ]}
                    onPress={() => handleNotificationPress(notification)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.notificationLeft}>
                      <View
                        style={[
                          styles.iconContainer,
                          { backgroundColor: `${color}20` },
                        ]}
                      >
                        <MaterialIcons
                          name={icon as any}
                          size={24}
                          color={color}
                        />
                      </View>
                      <View style={styles.notificationContent}>
                        <View style={styles.notificationHeader}>
                          <ThemedText style={styles.notificationTitle}>
                            {notification.title}
                          </ThemedText>
                          {isUnread && <View style={styles.unreadDot} />}
                        </View>
                        <ThemedText 
                          style={styles.notificationMessage}
                          numberOfLines={2}
                        >
                          {notification.message}
                        </ThemedText>
                        <ThemedText style={styles.notificationTime}>
                          {formatRelativeTime(notification.created_at)}
                        </ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {notifications.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="notifications-off" size={64} color="#9CA3AF" />
                <ThemedText style={styles.emptyText}>No notifications</ThemedText>
                <ThemedText style={styles.emptySubtext}>
                  You're all caught up!
                </ThemedText>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 14,
    color: '#6B46C1',
    fontWeight: '600',
  },
  placeholder: {
    width: 80,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  unreadBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  unreadText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  notificationsList: {
    gap: 12,
  },
  notificationItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unreadNotification: {
    backgroundColor: '#FFFFFF',
    borderColor: '#6B46C1',
    borderWidth: 1.5,
  },
  notificationLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cryptoIcon: {
    width: 32,
    height: 32,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6B46C1',
  },
  notificationMessage: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 6,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    opacity: 0.7,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
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
});

