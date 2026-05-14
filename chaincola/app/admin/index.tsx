import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/lib/admin-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


const ADMIN_MENU_ITEMS = [
  {
    id: 'transactions',
    title: 'All Transactions',
    icon: 'history',
    color: '#F59E0B',
    route: '/(tabs)/transactions',
  },
  {
    id: 'zendit',
    title: 'Zendit Management',
    icon: 'card-giftcard',
    color: '#8B5CF6',
    route: '/admin/zendit',
  },
  {
    id: 'gift-cards',
    title: 'Gift Cards',
    icon: 'redeem',
    color: '#EC4899',
    route: '/admin/gift-cards',
  },
];

export default function AdminDashboardScreen() {
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkAdmin();
    }, [user])
  );

  const checkAdmin = async () => {
    if (!user) {
      router.replace('/(tabs)/profile');
      return;
    }

    const admin = await isAdmin();
    setIsAdminUser(admin);
    
    if (!admin) {
      Alert.alert('Access Denied', 'Admin access required');
      router.replace('/(tabs)/profile');
      return;
    }

    setLoading(false);
  };

  const handleMenuPress = (route: string) => {
    router.push(route as any);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <AppLoadingIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading Admin Dashboard...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!isAdminUser) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setSidebarOpen(!sidebarOpen)}
        >
          <MaterialIcons name="menu" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Admin Dashboard</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Sidebar */}
        <View style={[styles.sidebar, sidebarOpen && styles.sidebarOpen]}>
          <ScrollView style={styles.sidebarContent}>
            <View style={styles.sidebarHeader}>
              <MaterialIcons name="admin-panel-settings" size={32} color="#6B46C1" />
              <ThemedText style={styles.sidebarTitle}>Admin Panel</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.sidebarItem, styles.sidebarItemActive]}
              onPress={() => setSidebarOpen(false)}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#6B46C120' }]}>
                <MaterialIcons name="dashboard" size={24} color="#6B46C1" />
              </View>
              <ThemedText style={[styles.sidebarItemText, styles.sidebarItemTextActive]}>Dashboard</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                handleMenuPress('/(tabs)/transactions');
                setSidebarOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#F59E0B20' }]}>
                <MaterialIcons name="history" size={24} color="#F59E0B" />
              </View>
              <ThemedText style={styles.sidebarItemText}>Transactions</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                handleMenuPress('/admin/zendit');
                setSidebarOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.sidebarIconContainer, { backgroundColor: '#8B5CF620' }]}>
                <MaterialIcons name="card-giftcard" size={24} color="#8B5CF6" />
              </View>
              <ThemedText style={styles.sidebarItemText}>Zendit Management</ThemedText>
            </TouchableOpacity>

            <View style={styles.sidebarFooter}>
              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => {
                  router.back();
                  setSidebarOpen(false);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sidebarIconContainer, { backgroundColor: '#FEE2E220' }]}>
                  <MaterialIcons name="arrow-back" size={24} color="#EF4444" />
                </View>
                <ThemedText style={styles.sidebarItemText}>Back to App</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <ScrollView style={styles.mainContent} contentContainerStyle={styles.mainContentContainer}>
          <View style={styles.welcomeCard}>
            <MaterialIcons name="admin-panel-settings" size={64} color="#6B46C1" />
            <ThemedText style={styles.welcomeTitle}>Welcome to Admin Dashboard</ThemedText>
            <ThemedText style={styles.welcomeSubtitle}>
              Manage your platform from here. Use the menu to navigate to different admin sections.
            </ThemedText>
          </View>

          <View style={styles.quickActions}>
            <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
            {/* Debug: Show count of action cards */}
            <ThemedText style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
              {ADMIN_MENU_ITEMS.length} menu items available
            </ThemedText>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  console.log('All Transactions pressed');
                  handleMenuPress('/(tabs)/transactions');
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#F59E0B20' }]}>
                  <MaterialIcons name="history" size={32} color="#F59E0B" />
                </View>
                <ThemedText style={styles.actionCardTitle}>All Transactions</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  console.log('Zendit Management pressed');
                  handleMenuPress('/admin/zendit');
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#8B5CF620' }]}>
                  <MaterialIcons name="card-giftcard" size={32} color="#8B5CF6" />
                </View>
                <ThemedText style={styles.actionCardTitle}>Zendit Management</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  console.log('Gift Cards pressed');
                  handleMenuPress('/admin/gift-cards');
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#EC489920' }]}>
                  <MaterialIcons name="redeem" size={32} color="#EC4899" />
                </View>
                <ThemedText style={styles.actionCardTitle}>Gift Cards</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    transform: [{ translateX: -280 }],
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sidebarOpen: {
    transform: [{ translateX: 0 }],
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 20,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  sidebarItemActive: {
    backgroundColor: '#F3F4F6',
    borderLeftWidth: 4,
    borderLeftColor: '#6B46C1',
  },
  sidebarIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#11181C',
  },
  sidebarItemTextActive: {
    fontWeight: '600',
    color: '#6B46C1',
  },
  sidebarFooter: {
    marginTop: 'auto',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  mainContent: {
    flex: 1,
  },
  mainContentContainer: {
    padding: 20,
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#11181C',
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  quickActions: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#11181C',
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    minWidth: '30%',
    maxWidth: '32%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 120,
    justifyContent: 'center',
  },
  actionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    textAlign: 'center',
  },
});
