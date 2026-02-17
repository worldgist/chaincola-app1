import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/lib/admin-service';
import { supabase } from '@/lib/supabase';
import { 
  getAllCustomGiftCards, 
  createCustomGiftCard, 
  cancelCustomGiftCard,
  reloadCustomGiftCard,
  type CustomGiftCard,
  type CreateCustomGiftCardParams 
} from '@/lib/custom-gift-card-service';
import { getAllGiftCards, cancelGiftCard as cancelPurchasedGiftCard } from '@/lib/gift-card-service';

interface GiftCard {
  id: string;
  user_id: string;
  code: string;
  amount: number;
  currency: 'NGN' | 'USD';
  card_category: string;
  card_subcategory: string;
  card_type: 'ecode' | 'physical';
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  recipient_email?: string;
  recipient_name?: string;
  message?: string;
  expires_at?: string;
  redeemed_at?: string;
  redeemed_by?: string;
  transaction_id?: string;
  created_at: string;
  updated_at: string;
}

interface GiftCardStats {
  total: number;
  active: number;
  redeemed: number;
  expired: number;
  cancelled: number;
  totalValue: number;
}

export default function AdminGiftCardsScreen() {
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [customGiftCards, setCustomGiftCards] = useState<CustomGiftCard[]>([]);
  const [activeTab, setActiveTab] = useState<'purchased' | 'custom'>('purchased');
  const [stats, setStats] = useState<GiftCardStats | null>(null);
  const [selectedCard, setSelectedCard] = useState<GiftCard | CustomGiftCard | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReloadModal, setShowReloadModal] = useState(false);
  const [reloadAmount, setReloadAmount] = useState('');
  const [reloading, setReloading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  
  // Create custom gift card form state
  const [createForm, setCreateForm] = useState<CreateCustomGiftCardParams>({
    amount: 0,
    currency: 'NGN',
    card_type: 'digital',
    expires_in_days: 365,
    is_reloadable: false,
    is_transferable: true,
  });
  
  const itemsPerPage = 20;

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
    fetchGiftCards();
    fetchStats();
  };

  const fetchGiftCards = async (page: number = 1, status?: string) => {
    try {
      setRefreshing(true);
      setError(null);

      // Use the service function with pagination and search
      const offset = (page - 1) * itemsPerPage;
      const result = await getAllGiftCards(
        status,
        itemsPerPage,
        offset,
        searchQuery || undefined
      );

      if (result.error) {
        console.error('Error fetching gift cards:', result.error);
        setError(result.error.message || 'Failed to fetch gift cards');
        return;
      }

      setGiftCards(result.giftCards);
      setTotalPages(Math.ceil((result.total || 0) / itemsPerPage));
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Exception fetching gift cards:', err);
      setError(err.message || 'Failed to fetch gift cards');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error: statsError } = await supabase
        .from('gift_cards')
        .select('status, amount, currency');

      if (statsError) {
        console.error('Error fetching stats:', statsError);
        return;
      }

      const cards = data || [];
      const stats: GiftCardStats = {
        total: cards.length,
        active: cards.filter((c: any) => c.status === 'active').length,
        redeemed: cards.filter((c: any) => c.status === 'redeemed').length,
        expired: cards.filter((c: any) => c.status === 'expired').length,
        cancelled: cards.filter((c: any) => c.status === 'cancelled').length,
        totalValue: cards.reduce((sum: number, c: any) => {
          const amount = parseFloat(c.amount.toString());
          return sum + amount;
        }, 0),
      };

      setStats(stats);
    } catch (err: any) {
      console.error('Exception fetching stats:', err);
    }
  };

  const fetchCustomGiftCards = async (page: number = 1, status?: string) => {
    try {
      setRefreshing(true);
      setError(null);

      // Use the service function with pagination
      const offset = (page - 1) * itemsPerPage;
      const result = await getAllCustomGiftCards(status, itemsPerPage, offset);

      if (result.error) {
        console.error('Error fetching custom gift cards:', result.error);
        setError(result.error.message || 'Failed to fetch custom gift cards');
        return;
      }

      // Apply search filter client-side if needed (or we can enhance the service function)
      let filteredCards = result.giftCards;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredCards = result.giftCards.filter((card) =>
          card.code.toLowerCase().includes(query) ||
          card.title?.toLowerCase().includes(query) ||
          card.description?.toLowerCase().includes(query)
        );
      }

      setCustomGiftCards(filteredCards);
      setTotalPages(Math.ceil((result.total || 0) / itemsPerPage));
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Exception fetching custom gift cards:', err);
      setError(err.message || 'Failed to fetch custom gift cards');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusFilter = (status: string) => {
    const newStatus = status === statusFilter ? '' : status;
    setStatusFilter(newStatus);
    setCurrentPage(1);
    if (activeTab === 'purchased') {
      fetchGiftCards(1, newStatus || undefined);
    } else {
      fetchCustomGiftCards(1, newStatus || undefined);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    // Debounce search
    setTimeout(() => {
      if (activeTab === 'purchased') {
        fetchGiftCards(1, statusFilter || undefined);
      } else {
        fetchCustomGiftCards(1, statusFilter || undefined);
      }
    }, 500);
  };

  const cancelGiftCard = async (card: GiftCard | CustomGiftCard) => {
    Alert.alert(
      'Cancel Gift Card',
      'Are you sure you want to cancel this gift card? This action cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'custom' && 'code' in card) {
                // Cancel custom gift card
                const result = await cancelCustomGiftCard(user?.id || '', card.code);
                if (result.success) {
                  Alert.alert('Success', 'Custom gift card cancelled successfully');
                  fetchCustomGiftCards(currentPage, statusFilter || undefined);
                  setShowDetailsModal(false);
                } else {
                  Alert.alert('Error', result.error || 'Failed to cancel gift card');
                }
              } else {
                // Cancel purchased gift card using service function
                const result = await cancelPurchasedGiftCard(card.id);
                if (result.success) {
                  Alert.alert('Success', 'Gift card cancelled successfully');
                  fetchGiftCards(currentPage, statusFilter || undefined);
                  fetchStats();
                  setShowDetailsModal(false);
                } else {
                  Alert.alert('Error', result.error || 'Failed to cancel gift card');
                }
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel gift card');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    if (activeTab === 'purchased') {
      await Promise.all([
        fetchGiftCards(currentPage, statusFilter || undefined),
        fetchStats(),
      ]);
    } else {
      await fetchCustomGiftCards(currentPage, statusFilter || undefined);
    }
  }, [currentPage, statusFilter, activeTab]);

  const handleCreateCustomGiftCard = async () => {
    if (!user || !createForm.amount || createForm.amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setCreating(true);
    try {
      const result = await createCustomGiftCard(user.id, createForm);

      if (result.success) {
        Alert.alert(
          'Success',
          `Custom gift card created successfully!\nCode: ${result.code}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowCreateModal(false);
                setCreateForm({
                  amount: 0,
                  currency: 'NGN',
                  card_type: 'digital',
                  expires_in_days: 365,
                  is_reloadable: false,
                  is_transferable: true,
                });
                fetchCustomGiftCards(currentPage, statusFilter || undefined);
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create custom gift card');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create custom gift card');
    } finally {
      setCreating(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'redeemed':
      case 'used':
        return '#3B82F6';
      case 'expired':
        return '#F59E0B';
      case 'cancelled':
        return '#EF4444';
      case 'pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading Gift Card Management...</ThemedText>
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
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Gift Card Management</ThemedText>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={refreshing}
        >
          <MaterialIcons 
            name="refresh" 
            size={24} 
            color={refreshing ? "#9CA3AF" : "#11181C"} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <MaterialIcons name="card-giftcard" size={24} color="#6B46C1" />
              <ThemedText style={styles.statValue}>{stats.total}</ThemedText>
              <ThemedText style={styles.statLabel}>Total Cards</ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="check-circle" size={24} color="#10B981" />
              <ThemedText style={styles.statValue}>{stats.active}</ThemedText>
              <ThemedText style={styles.statLabel}>Active</ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="done" size={24} color="#3B82F6" />
              <ThemedText style={styles.statValue}>{stats.redeemed}</ThemedText>
              <ThemedText style={styles.statLabel}>Redeemed</ThemedText>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="attach-money" size={24} color="#F59E0B" />
              <ThemedText style={styles.statValue}>
                {formatCurrency(stats.totalValue, 'NGN')}
              </ThemedText>
              <ThemedText style={styles.statLabel}>Total Value</ThemedText>
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by code, category, or subcategory..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                if (activeTab === 'purchased') {
                  fetchGiftCards(1, statusFilter || undefined);
                } else {
                  fetchCustomGiftCards(1, statusFilter || undefined);
                }
              }}
            >
              <MaterialIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Filters */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
            {(activeTab === 'purchased' 
              ? ['', 'active', 'redeemed', 'expired', 'cancelled']
              : ['', 'active', 'used', 'expired', 'cancelled', 'pending']
            ).map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterChip,
                  statusFilter === status && styles.filterChipActive,
                ]}
                onPress={() => handleStatusFilter(status)}
              >
                <ThemedText
                  style={[
                    styles.filterChipText,
                    statusFilter === status && styles.filterChipTextActive,
                  ]}
                >
                  {status || 'All'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={24} color="#EF4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Gift Cards List */}
        <View style={styles.cardsContainer}>
          <ThemedText style={styles.sectionTitle}>
            {activeTab === 'purchased' ? 'Purchased Gift Cards' : 'Custom Gift Cards'} ({activeTab === 'purchased' ? giftCards.length : customGiftCards.length})
          </ThemedText>

          {refreshing && (activeTab === 'purchased' ? giftCards.length === 0 : customGiftCards.length === 0) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6B46C1" />
            </View>
          ) : (activeTab === 'purchased' ? giftCards.length === 0 : customGiftCards.length === 0) ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="card-giftcard" size={64} color="#9CA3AF" />
              <ThemedText style={styles.emptyText}>
                {activeTab === 'custom' ? 'No custom gift cards found. Create one to get started!' : 'No gift cards found'}
              </ThemedText>
            </View>
          ) : (
            <>
              {(activeTab === 'purchased' ? giftCards : customGiftCards).map((card) => {
                const isCustom = activeTab === 'custom';
                const customCard = isCustom ? card as CustomGiftCard : null;
                const purchasedCard = !isCustom ? card as GiftCard : null;
                
                return (
                <TouchableOpacity
                  key={card.id}
                  style={styles.cardItem}
                  onPress={() => {
                    setSelectedCard(card);
                    setShowDetailsModal(true);
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardInfo}>
                      <ThemedText style={styles.cardCode}>{card.code}</ThemedText>
                      {isCustom && customCard?.title ? (
                        <ThemedText style={styles.cardCategory}>{customCard.title}</ThemedText>
                      ) : purchasedCard ? (
                        <ThemedText style={styles.cardCategory}>
                          {purchasedCard.card_subcategory} • {purchasedCard.card_category}
                        </ThemedText>
                      ) : null}
                      {isCustom && customCard?.description && (
                        <ThemedText style={[styles.cardCategory, { fontSize: 12, marginTop: 4 }]}>
                          {customCard.description}
                        </ThemedText>
                      )}
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${getStatusColor(card.status)}20` },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.statusText,
                          { color: getStatusColor(card.status) },
                        ]}
                      >
                        {card.status.toUpperCase()}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.cardDetails}>
                    <ThemedText style={styles.cardAmount}>
                      {formatCurrency(isCustom && customCard ? customCard.balance : card.amount, card.currency)}
                    </ThemedText>
                    {isCustom && customCard && customCard.balance < customCard.amount && (
                      <ThemedText style={[styles.cardDate, { fontSize: 11 }]}>
                        Original: {formatCurrency(customCard.amount, customCard.currency)}
                      </ThemedText>
                    )}
                    <ThemedText style={styles.cardDate}>
                      Created: {formatDate(card.created_at)}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      currentPage === 1 && styles.paginationButtonDisabled,
                    ]}
                    onPress={() => {
                      if (currentPage > 1) {
                        if (activeTab === 'purchased') {
                          fetchGiftCards(currentPage - 1, statusFilter || undefined);
                        } else {
                          fetchCustomGiftCards(currentPage - 1, statusFilter || undefined);
                        }
                      }
                    }}
                    disabled={currentPage === 1}
                  >
                    <MaterialIcons name="chevron-left" size={24} color={currentPage === 1 ? "#9CA3AF" : "#11181C"} />
                  </TouchableOpacity>
                  <ThemedText style={styles.paginationText}>
                    Page {currentPage} of {totalPages}
                  </ThemedText>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      currentPage === totalPages && styles.paginationButtonDisabled,
                    ]}
                    onPress={() => {
                      if (currentPage < totalPages) {
                        if (activeTab === 'purchased') {
                          fetchGiftCards(currentPage + 1, statusFilter || undefined);
                        } else {
                          fetchCustomGiftCards(currentPage + 1, statusFilter || undefined);
                        }
                      }
                    }}
                    disabled={currentPage === totalPages}
                  >
                    <MaterialIcons name="chevron-right" size={24} color={currentPage === totalPages ? "#9CA3AF" : "#11181C"} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Details Modal */}
      <Modal
        visible={showDetailsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Gift Card Details</ThemedText>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>

            {selectedCard && (
              <ScrollView style={styles.modalBody}>
                {(() => {
                  const isCustom = activeTab === 'custom';
                  const customCard = isCustom ? selectedCard as CustomGiftCard : null;
                  const purchasedCard = !isCustom ? selectedCard as GiftCard : null;
                  
                  return (
                    <>
                      <View style={styles.detailRow}>
                        <ThemedText style={styles.detailLabel}>Code:</ThemedText>
                        <ThemedText style={styles.detailValue}>{selectedCard.code}</ThemedText>
                      </View>
                      {isCustom && customCard?.title && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Title:</ThemedText>
                          <ThemedText style={styles.detailValue}>{customCard.title}</ThemedText>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <ThemedText style={styles.detailLabel}>
                          {isCustom && customCard ? 'Balance:' : 'Amount:'}
                        </ThemedText>
                        <ThemedText style={styles.detailValue}>
                          {formatCurrency(
                            isCustom && customCard ? customCard.balance : selectedCard.amount,
                            selectedCard.currency
                          )}
                        </ThemedText>
                      </View>
                      {isCustom && customCard && customCard.balance < customCard.amount && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Original Amount:</ThemedText>
                          <ThemedText style={styles.detailValue}>
                            {formatCurrency(customCard.amount, customCard.currency)}
                          </ThemedText>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <ThemedText style={styles.detailLabel}>Status:</ThemedText>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: `${getStatusColor(selectedCard.status)}20` },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.statusText,
                              { color: getStatusColor(selectedCard.status) },
                            ]}
                          >
                            {selectedCard.status.toUpperCase()}
                          </ThemedText>
                        </View>
                      </View>
                      {isCustom && customCard?.description && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Description:</ThemedText>
                          <ThemedText style={styles.detailValue}>{customCard.description}</ThemedText>
                        </View>
                      )}
                      {!isCustom && purchasedCard && (
                        <>
                          <View style={styles.detailRow}>
                            <ThemedText style={styles.detailLabel}>Category:</ThemedText>
                            <ThemedText style={styles.detailValue}>{purchasedCard.card_category}</ThemedText>
                          </View>
                          <View style={styles.detailRow}>
                            <ThemedText style={styles.detailLabel}>Subcategory:</ThemedText>
                            <ThemedText style={styles.detailValue}>{purchasedCard.card_subcategory}</ThemedText>
                          </View>
                        </>
                      )}
                      <View style={styles.detailRow}>
                        <ThemedText style={styles.detailLabel}>Type:</ThemedText>
                        <ThemedText style={styles.detailValue}>{selectedCard.card_type}</ThemedText>
                      </View>
                      {isCustom && customCard && (
                        <>
                          <View style={styles.detailRow}>
                            <ThemedText style={styles.detailLabel}>Reloadable:</ThemedText>
                            <ThemedText style={styles.detailValue}>
                              {customCard.is_reloadable ? 'Yes' : 'No'}
                            </ThemedText>
                          </View>
                          <View style={styles.detailRow}>
                            <ThemedText style={styles.detailLabel}>Transferable:</ThemedText>
                            <ThemedText style={styles.detailValue}>
                              {customCard.is_transferable ? 'Yes' : 'No'}
                            </ThemedText>
                          </View>
                          {customCard.usage_count > 0 && (
                            <View style={styles.detailRow}>
                              <ThemedText style={styles.detailLabel}>Usage Count:</ThemedText>
                              <ThemedText style={styles.detailValue}>{customCard.usage_count}</ThemedText>
                            </View>
                          )}
                        </>
                      )}
                      {selectedCard.recipient_email && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Recipient Email:</ThemedText>
                          <ThemedText style={styles.detailValue}>{selectedCard.recipient_email}</ThemedText>
                        </View>
                      )}
                      {selectedCard.recipient_name && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Recipient Name:</ThemedText>
                          <ThemedText style={styles.detailValue}>{selectedCard.recipient_name}</ThemedText>
                        </View>
                      )}
                      {isCustom && customCard?.personal_message && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Personal Message:</ThemedText>
                          <ThemedText style={styles.detailValue}>{customCard.personal_message}</ThemedText>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <ThemedText style={styles.detailLabel}>Created:</ThemedText>
                        <ThemedText style={styles.detailValue}>
                          {formatDate(selectedCard.created_at)}
                        </ThemedText>
                      </View>
                      {selectedCard.expires_at && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>Expires:</ThemedText>
                          <ThemedText style={styles.detailValue}>
                            {formatDate(selectedCard.expires_at)}
                          </ThemedText>
                        </View>
                      )}
                      {(selectedCard.redeemed_at || (isCustom && customCard?.used_at)) && (
                        <View style={styles.detailRow}>
                          <ThemedText style={styles.detailLabel}>
                            {isCustom ? 'Used:' : 'Redeemed:'}
                          </ThemedText>
                          <ThemedText style={styles.detailValue}>
                            {formatDate(isCustom && customCard?.used_at ? customCard.used_at : selectedCard.redeemed_at)}
                          </ThemedText>
                        </View>
                      )}
                      {selectedCard.status === 'active' && (
                        <>
                          {isCustom && customCard && customCard.is_reloadable && (
                            <TouchableOpacity
                              style={[styles.cancelButton, { backgroundColor: '#3B82F6', marginBottom: 12 }]}
                              onPress={() => {
                                Alert.prompt(
                                  'Reload Gift Card',
                                  'Enter amount to add:',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Reload',
                                      onPress: async (amount) => {
                                        if (!amount || parseFloat(amount) <= 0) {
                                          Alert.alert('Error', 'Please enter a valid amount');
                                          return;
                                        }
                                        try {
                                          const result = await reloadCustomGiftCard({
                                            code: customCard.code,
                                            amount: parseFloat(amount),
                                          });
                                          if (result.success) {
                                            Alert.alert('Success', `Gift card reloaded! New balance: ${formatCurrency(result.new_balance || 0, customCard.currency)}`);
                                            fetchCustomGiftCards(currentPage, statusFilter || undefined);
                                            setShowDetailsModal(false);
                                          } else {
                                            Alert.alert('Error', result.error || 'Failed to reload gift card');
                                          }
                                        } catch (err: any) {
                                          Alert.alert('Error', err.message || 'Failed to reload gift card');
                                        }
                                      },
                                    },
                                  ],
                                  'plain-text'
                                );
                              }}
                            >
                              <MaterialIcons name="add-circle" size={20} color="#FFFFFF" />
                              <ThemedText style={[styles.cancelButtonText, { color: '#FFFFFF' }]}>Reload Gift Card</ThemedText>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => cancelGiftCard(selectedCard)}
                          >
                            <MaterialIcons name="cancel" size={20} color="#EF4444" />
                            <ThemedText style={styles.cancelButtonText}>Cancel Gift Card</ThemedText>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Custom Gift Card Modal */}
      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Create Custom Gift Card</ThemedText>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Amount *</ThemedText>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter amount"
                  value={createForm.amount > 0 ? createForm.amount.toString() : ''}
                  onChangeText={(text) => {
                    const num = parseFloat(text);
                    setCreateForm({ ...createForm, amount: isNaN(num) ? 0 : num });
                  }}
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Currency *</ThemedText>
                <View style={styles.currencyButtons}>
                  {['NGN', 'USD', 'GBP', 'EUR'].map((curr) => (
                    <TouchableOpacity
                      key={curr}
                      style={[
                        styles.currencyButton,
                        createForm.currency === curr && styles.currencyButtonActive,
                      ]}
                      onPress={() => setCreateForm({ ...createForm, currency: curr as any })}
                    >
                      <ThemedText
                        style={[
                          styles.currencyButtonText,
                          createForm.currency === curr && styles.currencyButtonTextActive,
                        ]}
                      >
                        {curr}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Title</ThemedText>
                <TextInput
                  style={styles.formInput}
                  placeholder="Gift card title (optional)"
                  value={createForm.title || ''}
                  onChangeText={(text) => setCreateForm({ ...createForm, title: text })}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Description</ThemedText>
                <TextInput
                  style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Description (optional)"
                  value={createForm.description || ''}
                  onChangeText={(text) => setCreateForm({ ...createForm, description: text })}
                  multiline
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Card Type</ThemedText>
                <View style={styles.typeButtons}>
                  {['digital', 'physical', 'virtual'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        createForm.card_type === type && styles.typeButtonActive,
                      ]}
                      onPress={() => setCreateForm({ ...createForm, card_type: type as any })}
                    >
                      <ThemedText
                        style={[
                          styles.typeButtonText,
                          createForm.card_type === type && styles.typeButtonTextActive,
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Expires In (Days)</ThemedText>
                <TextInput
                  style={styles.formInput}
                  placeholder="365"
                  value={createForm.expires_in_days?.toString() || '365'}
                  onChangeText={(text) => {
                    const num = parseInt(text);
                    setCreateForm({ ...createForm, expires_in_days: isNaN(num) ? 365 : num });
                  }}
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Recipient Email</ThemedText>
                <TextInput
                  style={styles.formInput}
                  placeholder="recipient@example.com (optional)"
                  value={createForm.recipient_email || ''}
                  onChangeText={(text) => setCreateForm({ ...createForm, recipient_email: text })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Recipient Name</ThemedText>
                <TextInput
                  style={styles.formInput}
                  placeholder="Recipient name (optional)"
                  value={createForm.recipient_name || ''}
                  onChangeText={(text) => setCreateForm({ ...createForm, recipient_name: text })}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Personal Message</ThemedText>
                <TextInput
                  style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Personal message (optional)"
                  value={createForm.personal_message || ''}
                  onChangeText={(text) => setCreateForm({ ...createForm, personal_message: text })}
                  multiline
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    createForm.is_reloadable && styles.checkboxActive,
                  ]}
                  onPress={() =>
                    setCreateForm({ ...createForm, is_reloadable: !createForm.is_reloadable })
                  }
                >
                  <MaterialIcons
                    name={createForm.is_reloadable ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={createForm.is_reloadable ? '#6B46C1' : '#9CA3AF'}
                  />
                  <ThemedText style={styles.checkboxLabel}>Reloadable</ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    createForm.is_transferable && styles.checkboxActive,
                  ]}
                  onPress={() =>
                    setCreateForm({ ...createForm, is_transferable: !createForm.is_transferable })
                  }
                >
                  <MaterialIcons
                    name={createForm.is_transferable ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={createForm.is_transferable ? '#6B46C1' : '#9CA3AF'}
                  />
                  <ThemedText style={styles.checkboxLabel}>Transferable</ThemedText>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.createSubmitButton, creating && styles.createSubmitButtonDisabled]}
                onPress={handleCreateCustomGiftCard}
                disabled={creating || !createForm.amount || createForm.amount <= 0}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="add-circle" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.createSubmitButtonText}>Create Gift Card</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reload Custom Gift Card Modal */}
      <Modal
        visible={showReloadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReloadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Reload Gift Card</ThemedText>
              <TouchableOpacity onPress={() => setShowReloadModal(false)}>
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedCard && activeTab === 'custom' && (() => {
                const customCard = selectedCard as CustomGiftCard;
                return (
                  <>
                    <View style={styles.detailRow}>
                      <ThemedText style={styles.detailLabel}>Card Code:</ThemedText>
                      <ThemedText style={styles.detailValue}>{customCard.code}</ThemedText>
                    </View>
                    <View style={styles.detailRow}>
                      <ThemedText style={styles.detailLabel}>Current Balance:</ThemedText>
                      <ThemedText style={styles.detailValue}>
                        {formatCurrency(customCard.balance, customCard.currency)}
                      </ThemedText>
                    </View>
                    <View style={styles.formGroup}>
                      <ThemedText style={styles.formLabel}>Amount to Add *</ThemedText>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Enter amount"
                        value={reloadAmount}
                        onChangeText={setReloadAmount}
                        keyboardType="numeric"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.createSubmitButton, (reloading || !reloadAmount || parseFloat(reloadAmount) <= 0) && styles.createSubmitButtonDisabled]}
                      onPress={async () => {
                        if (!reloadAmount || parseFloat(reloadAmount) <= 0) {
                          Alert.alert('Error', 'Please enter a valid amount');
                          return;
                        }
                        setReloading(true);
                        try {
                          const customCard = selectedCard as CustomGiftCard;
                          const result = await reloadCustomGiftCard({
                            code: customCard.code,
                            amount: parseFloat(reloadAmount),
                          });
                          if (result.success) {
                            Alert.alert(
                              'Success',
                              `Gift card reloaded!\nNew balance: ${formatCurrency(result.new_balance || 0, customCard.currency)}`,
                              [
                                {
                                  text: 'OK',
                                  onPress: () => {
                                    setShowReloadModal(false);
                                    setReloadAmount('');
                                    fetchCustomGiftCards(currentPage, statusFilter || undefined);
                                    setShowDetailsModal(false);
                                  },
                                },
                              ]
                            );
                          } else {
                            Alert.alert('Error', result.error || 'Failed to reload gift card');
                          }
                        } catch (err: any) {
                          Alert.alert('Error', err.message || 'Failed to reload gift card');
                        } finally {
                          setReloading(false);
                        }
                      }}
                      disabled={reloading || !reloadAmount || parseFloat(reloadAmount) <= 0}
                    >
                      {reloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialIcons name="add-circle" size={20} color="#FFFFFF" />
                          <ThemedText style={styles.createSubmitButtonText}>Reload Gift Card</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                );
              })()}
            </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#11181C',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
  },
  filtersContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  filters: {
    marginHorizontal: -4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  filterChipText: {
    fontSize: 14,
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    marginLeft: 12,
    color: '#DC2626',
    flex: 1,
  },
  cardsContainer: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardCode: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardCategory: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B46C1',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  paginationButton: {
    padding: 8,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#11181C',
  },
  currencyButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  currencyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  currencyButtonActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  currencyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  currencyButtonTextActive: {
    color: '#FFFFFF',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  typeButtonActive: {
    backgroundColor: '#6B46C1',
    borderColor: '#6B46C1',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxActive: {
    // Additional styling if needed
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#11181C',
  },
  createSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6B46C1',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 32,
    gap: 8,
  },
  createSubmitButtonDisabled: {
    opacity: 0.5,
  },
  createSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
