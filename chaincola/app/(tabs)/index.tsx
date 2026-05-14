import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/lib/user-service';
import { getUnreadNotificationsCount } from '@/lib/notification-service';
import { getWalletBalances, formatBalance, getUsdBalance } from '@/lib/wallet-service';
import { getUserCryptoBalances, getLunoPrices, formatNgnValue } from '@/lib/crypto-price-service';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '@/lib/push-notification-service';
import { getUserVerificationStatus } from '@/lib/verification-service';
import CryptoSelectModal from '@/components/crypto-select-modal';
import BiometricSetupPrompt from '@/components/biometric-setup-prompt';
import WalletAddressModal from '@/components/wallet-address-modal';
import AppLoadingIndicator from '@/components/app-loading-indicator';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Store subscription references
  const notificationChannelRef = React.useRef<any>(null);
  const notificationPollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Balance data - fetched from database
  const [usdBalance, setUsdBalance] = useState('0.00'); // Total crypto portfolio value in USD
  const [nairaBalance, setNairaBalance] = useState('0.00');
  const [cryptoBalances, setCryptoBalances] = useState<Record<string, any>>({});
  const [usdWalletBalance, setUsdWalletBalance] = useState(0); // Direct USD balance from wallet
  
  // Crypto select modal state
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoAction, setCryptoAction] = useState<'send' | 'receive' | undefined>(undefined);
  
  // Wallet address modal state
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [selectedCrypto, setSelectedCrypto] = useState<{ asset: string; name: string; logo: any } | null>(null);
  const homePriceRefetchDoneRef = React.useRef(false);

  // Helper function to add timeout to promises
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`${errorMessage} (timeout after ${timeoutMs}ms)`)), timeoutMs)
      )
    ]);
  };

  // Safety timeout: Always stop loading after 12 seconds to prevent infinite loading (allows slower networks)
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⚠️ Safety timeout: Forcing loading to false after 12 seconds');
        setLoading(false);
      }
    }, 12000);

    return () => clearTimeout(safetyTimeout);
  }, [loading]);

  // Cleanup notification subscription
  const cleanupNotificationSubscription = useCallback(() => {
    // Cleanup realtime subscription
    if (notificationChannelRef.current) {
      try {
        const channel = notificationChannelRef.current;
        // Check if channel has unsubscribe method before calling
        if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
        // Also try removeChannel if available
        import('@/lib/supabase').then(({ supabase }) => {
          try {
            if (channel) {
              supabase.removeChannel(channel);
            }
          } catch (err) {
            // Ignore cleanup errors
            console.warn('Error removing channel:', err);
          }
        }).catch(() => {
          // Ignore cleanup errors
        });
      } catch (err) {
        // Ignore cleanup errors
        console.warn('Error cleaning up notification channel:', err);
      } finally {
        notificationChannelRef.current = null;
      }
    }
    
    // Cleanup polling interval
    if (notificationPollIntervalRef.current) {
      clearInterval(notificationPollIntervalRef.current as any);
      notificationPollIntervalRef.current = null;
    }
  }, []);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      cleanupNotificationSubscription();
    };
  }, [cleanupNotificationSubscription]);

  useEffect(() => {
    if (user) {
      // Check verification status first
      const checkVerification = async () => {
        try {
          const verificationStatus = await getUserVerificationStatus(user.id);
          if (verificationStatus !== 'approved') {
            // Redirect to verification page with prompt
            router.push('/profile/verify-account?prompt=true');
            return;
          }
        } catch (error) {
          console.error('Error checking verification:', error);
          // Continue even if check fails
        }
        
        // If verified, proceed with normal flow
        fetchUserData();
      };
      
      checkVerification();
      
      // Register for push notifications (using static imports to avoid bundle loading errors)
      // Register push token
      registerForPushNotificationsAsync(user.id)
        .then((token) => {
          if (token) {
            console.log('✅ Push notification token registered:', token);
          } else {
            console.warn('⚠️ Push notification registration returned no token');
          }
        })
        .catch((err) => {
          console.error('❌ Could not register for push notifications:', err);
        });
      
      // Setup notification listeners
      const cleanup = setupNotificationListeners(
        (notification) => {
          console.log('📬 Push notification received:', notification.request.content.title);
          // Refresh notification count when notification is received
          if (user?.id) {
            getUnreadNotificationsCount(user.id)
              .then((count) => setUnreadCount(count || 0))
              .catch((err) => console.warn('Error refreshing notification count:', err));
          }
        },
        (response) => {
          console.log('👆 Push notification tapped:', response.notification.request.content.data);
          // Handle notification tap - navigate based on notification type
          const data = response.notification.request.content.data;
          
          if (data?.type === 'crypto_deposit' && data?.transactionHash) {
            // Navigate to transaction detail
            router.push(`/transaction-detail?id=${data.transactionHash}`);
          } else if (data?.type === 'wallet_funding') {
            router.push('/(tabs)/wallet');
          } else if (data?.type === 'kyc_approved') {
            // KYC approved - refresh user data and navigate to profile/verification status
            // The app should reload to show new verification status
            console.log('✅ KYC approved notification tapped - refreshing app state');
            // Refresh user data by fetching verification status
            if (user?.id) {
              // Navigate to profile to show verification status
              router.push('/(tabs)/profile');
              // Also refresh the current screen data
              fetchUserData();
            }
          }
        }
      );
      
      // Return cleanup function
      return cleanup;
    } else {
      setLoading(false);
    }
  }, [user]);

  // Set up real-time notification subscription
  const setupNotificationSubscription = useCallback(() => {
    if (!user?.id) return;

    import('@/lib/supabase').then(({ supabase }) => {
      // Clean up any existing subscription first
      if (notificationChannelRef.current) {
        try {
          const oldChannel = notificationChannelRef.current;
          // Unsubscribe first if method exists
          if (oldChannel && typeof oldChannel.unsubscribe === 'function') {
            oldChannel.unsubscribe();
          }
          // Then remove channel
          supabase.removeChannel(oldChannel);
        } catch (err) {
          console.warn('Error cleaning up old notification channel:', err);
        } finally {
          notificationChannelRef.current = null;
        }
      }

      // Subscribe to notification changes for this user
      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 Notification change detected:', payload.eventType);
            // Refresh notification count when changes occur
            if (user?.id) {
              getUnreadNotificationsCount(user.id)
                .then((count) => {
                  setUnreadCount(count || 0);
                })
                .catch((err) => {
                  console.warn('Error refreshing notification count:', err);
                });
            }
          }
        )
        .subscribe();

      // Store channel reference for cleanup
      notificationChannelRef.current = channel;
    }).catch((err) => {
      console.warn('Could not set up notification subscription:', err);
    });
  }, [user?.id]);

  
  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchUserData();
        // Set up real-time subscription for notifications
        setupNotificationSubscription();
      }
      
      // Cleanup subscription when screen loses focus
      return () => {
        cleanupNotificationSubscription();
      };
    }, [user, setupNotificationSubscription, cleanupNotificationSubscription])
  );

  const fetchBalances = async () => {
    if (!user?.id) return;
    
    setBalanceLoading(true);
    try {
      // Fetch NGN wallet balance (fiat, timeout after 10 seconds for slow networks)
      try {
        const walletBalances = await withTimeout(
          getWalletBalances(user.id),
          10000,
          'getWalletBalances'
        );
        setNairaBalance(formatBalance(walletBalances.ngn, 'NGN'));
      } catch (walletError: any) {
        if (walletError?.message?.includes('timeout')) {
          console.warn('Could not fetch wallet balances (using defaults):', walletError?.message || walletError);
        } else {
          console.error('Error fetching wallet balances:', walletError?.message || walletError);
        }
        setNairaBalance('0.00');
      }
      
      // Fetch crypto portfolio value in USD (price fetching has been removed)
      console.log('💰 Fetching crypto portfolio value for user:', user.id);
      
      // Get user crypto balances (timeout after 15 seconds to allow for slow queries)
      try {
        const balancesResult = await withTimeout(
          getUserCryptoBalances(user.id),
          15000,
          'getUserCryptoBalances'
        );
        
        if (balancesResult.error) {
          console.error('❌ Error fetching crypto balances:', balancesResult.error);
          // Don't return early - still try to get USD balance even if crypto balance fetch failed
          // balancesResult.balances might still have data even with an error
        }
        
        // Calculate total USD value
        let totalUsdValue = 0;
        
        // First, get USD balance directly from wallet_balances (most reliable)
        // This includes USD from deposits, crypto sales, etc.
        try {
          const usdBal = await getUsdBalance(user.id);
          setUsdWalletBalance(usdBal);
          if (usdBal > 0) {
            totalUsdValue += usdBal;
            console.log('✅ USD wallet balance:', usdBal);
          } else {
            console.log('⚠️ USD wallet balance is 0');
          }
        } catch (e: any) {
          console.error('❌ Could not fetch USD wallet balance:', e?.message || e);
          // Don't fail completely, try to continue with crypto balances
        }
        
        // Then add crypto balances converted to USD
        if (balancesResult.balances) {
          for (const symbol of Object.keys(balancesResult.balances)) {
            const balance = balancesResult.balances[symbol];
            // Use usdValue if available (from price calculation)
            if (balance.usdValue && balance.usdValue > 0) {
              totalUsdValue += balance.usdValue;
              console.log(`💰 ${symbol} USD value (from prices): ${balance.usdValue}`);
            } else if (balance.balance > 0) {
              // If price fetch failed but we have balance, try to get USD value from wallet_balances
              // This handles cases where USD was credited directly
              console.log(`⚠️ No USD value for ${symbol} from prices, balance: ${balance.balance}`);
              // The USD balance should already be included from getUsdBalance above
            }
          }
        }
        
        // Store crypto balances for assets display
        if (balancesResult.balances) {
          setCryptoBalances(balancesResult.balances);
        }
        
        console.log('💰 Total USD value calculated:', totalUsdValue);
        
        // Fallback: If total is still 0, try direct query to wallet_balances
        if (totalUsdValue === 0) {
          try {
            const { supabase } = await import('@/lib/supabase');
            const { data: usdBalanceData, error: usdError } = await supabase
              .from('wallet_balances')
              .select('balance')
              .eq('user_id', user.id)
              .eq('currency', 'USD')
              .single();
            
            if (!usdError && usdBalanceData?.balance) {
              totalUsdValue = parseFloat(usdBalanceData.balance.toString());
              setUsdWalletBalance(totalUsdValue);
              console.log('✅ Fallback: Got USD balance directly from wallet_balances:', totalUsdValue);
            } else {
              // Try wallets table as last resort
              const { data: walletData, error: walletError } = await supabase
                .from('wallets')
                .select('usd_balance')
                .eq('user_id', user.id)
                .single();
              
              if (!walletError && walletData?.usd_balance) {
                totalUsdValue = parseFloat(walletData.usd_balance.toString());
                setUsdWalletBalance(totalUsdValue);
                console.log('✅ Fallback: Got USD balance from wallets table:', totalUsdValue);
              }
            }
          } catch (fallbackError: any) {
            console.error('❌ All USD balance fetch methods failed:', fallbackError?.message);
          }
        }
        
        setUsdBalance(totalUsdValue.toFixed(2));
        console.log('✅ Final USD balance displayed:', totalUsdValue.toFixed(2));
      } catch (cryptoError: any) {
        if (cryptoError?.message?.includes('timeout')) {
          console.warn('Could not fetch crypto data (using defaults):', cryptoError?.message || cryptoError);
        } else {
          console.error('Error fetching crypto data:', cryptoError?.message || cryptoError);
        }
        setUsdBalance('0.00');
      }
    } catch (error: any) {
      console.error('❌ Error fetching balances:', error?.message || error);
      // Keep default values on error
      setUsdBalance('0.00');
      setNairaBalance('0.00');
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchUserData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user profile (don't fail if this errors, timeout after 10 seconds for slow networks)
      try {
        const profile = await withTimeout(
          getUserProfile(user.id),
          10000,
          'getUserProfile'
        );
        if (profile) {
          setUserProfile(profile);
        }
      } catch (profileError: any) {
        console.warn('Could not fetch user profile (continuing):', profileError?.message || profileError);
      }

      // Fetch unread notifications count (don't fail if this errors, timeout after 10 seconds for slow networks)
      try {
        const count = await withTimeout(
          getUnreadNotificationsCount(user.id),
          10000,
          'getUnreadNotificationsCount'
        );
        setUnreadCount(count || 0);
      } catch (notificationError: any) {
        console.warn('Could not fetch notifications count (continuing):', notificationError?.message || notificationError);
        setUnreadCount(0);
      }
      
      // Set up polling for notification count (fallback if realtime doesn't work)
      // Clean up any existing interval first
      if (notificationPollIntervalRef.current) {
        clearInterval(notificationPollIntervalRef.current);
      }
      
      notificationPollIntervalRef.current = setInterval(async () => {
        if (user?.id) {
          try {
            const count = await getUnreadNotificationsCount(user.id);
            setUnreadCount(count || 0);
          } catch {
            // Silently fail - don't spam console
          }
        }
      }, 30000); // Poll every 30 seconds

      // Fetch wallet balances - it has its own timeout handling, so just call it directly
      // Don't wrap in another timeout to avoid double-wrapping
      await fetchBalances();
    } catch (error: any) {
      console.error('Error fetching user data:', error?.message || error);
    } finally {
      // Always set loading to false, even if there were errors
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    homePriceRefetchDoneRef.current = false;
    setRefreshing(true);
    try {
      if (user?.id) {
        // Fetch all data again
        const profile = await getUserProfile(user.id);
        if (profile) {
          setUserProfile(profile);
        }

        // Refresh notification count with timeout
        try {
          const count = await withTimeout(
            getUnreadNotificationsCount(user.id),
            10000,
            'getUnreadNotificationsCount'
          );
          setUnreadCount(count || 0);
        } catch (notificationError: any) {
          console.warn('Could not refresh notifications count:', notificationError?.message || notificationError);
        }

        await fetchBalances();
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  // If crypto assets have no market prices, refetch prices once so they appear on home
  React.useEffect(() => {
    if (!user?.id) return;
    const keys = Object.keys(cryptoBalances);
    if (keys.length === 0 || homePriceRefetchDoneRef.current) return;
    const missingPrice = keys.some(
      (sym) => !cryptoBalances[sym]?.price_ngn && cryptoBalances[sym]?.balance != null
    );
    if (!missingPrice) return;

    const t = setTimeout(() => {
      homePriceRefetchDoneRef.current = true;
      getLunoPrices(keys, { retailOverlay: false })
        .then(({ prices }) => {
          if (!prices || Object.keys(prices).length === 0) return;
          setCryptoBalances((prev) => {
            const next = { ...prev };
            for (const symbol of keys) {
              const balance = prev[symbol];
              const price = prices[symbol];
              if (!balance || !price?.price_ngn) continue;
              const b = balance.balance ?? 0;
              next[symbol] = {
                ...balance,
                price_ngn: price.price_ngn,
                price_usd: price.price_usd,
                ngnValue: b * price.price_ngn,
                usdValue: b * (price.price_usd || 0),
              };
            }
            return next;
          });
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [user?.id, Object.keys(cryptoBalances).length]);

  const getUserName = () => {
    let fullName = '';
    
    if (userProfile?.name || userProfile?.full_name) {
      fullName = userProfile.name || userProfile.full_name;
    } else if (user?.metadata?.full_name || user?.metadata?.name) {
      fullName = user?.metadata?.full_name || user?.metadata?.name || '';
    } else if (user?.email) {
      return user.email.split('@')[0];
    } else {
      return 'User';
    }
    
    // Extract first name only
    if (fullName) {
      const firstName = fullName.trim().split(' ')[0];
      return firstName;
    }
    
    return 'User';
  };
  
  const handleFundWallet = () => {
    router.push('/fund-wallet');
  };
  
  const handleWithdraw = () => {
    router.push('/withdraw');
  };

  const handleNotificationPress = () => {
    router.push('/notifications');
  };

  const handleSend = () => {
    setCryptoAction('send');
    setShowCryptoModal(true);
  };

  const handleReceive = () => {
    setCryptoAction('receive');
    setShowCryptoModal(true);
  };

  const handleAllServices = () => {
    router.push('/all-services');
  };

  const handleSwap = () => {
    router.push('/convert-crypto');
  };

  const cryptoAssetsMap: Record<string, { asset: string; name: string; logo: any }> = {
    '1': { asset: 'BTC', name: 'Bitcoin', logo: require('@/assets/images/bitcoin.png') },
    '2': { asset: 'ETH', name: 'Ethereum', logo: require('@/assets/images/ethereum.png') },
    '3': { asset: 'USDT', name: 'Tether', logo: require('@/assets/images/tether.png') },
    '4': { asset: 'USDC', name: 'USD Coin', logo: require('@/assets/images/usdc.png') },
    '6': { asset: 'XRP', name: 'Ripple', logo: require('@/assets/images/ripple.png') },
    '7': { asset: 'SOL', name: 'Solana', logo: require('@/assets/images/solana.png') },
  };

  const handleCryptoSelect = async (cryptoId: string) => {
    if (cryptoAction === 'send') {
      router.push({ pathname: '/send-crypto', params: { id: cryptoId } });
    } else if (cryptoAction === 'receive') {
      const crypto = cryptoAssetsMap[cryptoId];
      if (crypto) {
        setSelectedCrypto(crypto);
        setShowWalletModal(true);
      }
    }
  };

  const handleCloseModal = () => {
    setShowCryptoModal(false);
    setCryptoAction(undefined);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6B46C1"
            colors={['#6B46C1']}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              {loading ? (
                <AppLoadingIndicator size="small" />
              ) : (
                <>
                  <ThemedText 
                    style={styles.greeting}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Welcome back, {getUserName()}!
                  </ThemedText>
                  <ThemedText style={styles.subtitle}>Your wallet balance</ThemedText>
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.notificationButton}
              onPress={handleNotificationPress}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name="notifications"
                size={24}
                color={Colors[colorScheme ?? 'light'].icon}
              />
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <ThemedText 
                    style={styles.notificationBadgeText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <LinearGradient
          colors={['#6B46C1', '#9333EA', '#A855F7']}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.balanceContent}>
            <View style={styles.balanceItem}>
              <ThemedText style={styles.currencyLabel}>NGN Balance</ThemedText>
              {balanceLoading ? (
                <AppLoadingIndicator size="small" variant="onPrimary" style={{ marginTop: 8 }} />
              ) : (
                <ThemedText 
                  style={styles.balanceAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  ₦{nairaBalance}
                </ThemedText>
              )}
            </View>
          </View>

          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleFundWallet}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FFFFFF', '#F3F4F6']}
                style={styles.actionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.actionButtonText}>Fund Wallet</ThemedText>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.withdrawButton]}
              onPress={handleWithdraw}
              activeOpacity={0.8}
            >
              <View style={styles.withdrawButtonContent}>
                <ThemedText style={styles.withdrawButtonText}>Withdraw</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={styles.quickActionsContainer}>
          <ThemedText style={styles.quickActionsTitle}>Quick Actions</ThemedText>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleSend}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIconContainer}>
                <MaterialIcons
                  name="send"
                  size={20}
                  color="#6B46C1"
                />
              </View>
              <ThemedText style={styles.quickActionLabel}>Send</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleReceive}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIconContainer}>
                <MaterialIcons
                  name="call-received"
                  size={20}
                  color="#6B46C1"
                />
              </View>
              <ThemedText style={styles.quickActionLabel}>Receive</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleSwap}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIconContainer}>
                <MaterialIcons
                  name="swap-horiz"
                  size={20}
                  color="#6B46C1"
                />
              </View>
              <ThemedText style={styles.quickActionLabel}>Swap</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Crypto Assets list (matches app layout) */}
        <View style={styles.assetsContainerLarge}>
          <View style={styles.assetsHeaderLarge}>
            <ThemedText style={styles.assetsTitleLarge}>Crypto Assets</ThemedText>
            <TouchableOpacity style={styles.livePricesPill} onPress={() => { /* optional: navigate to prices */ }}>
              <ThemedText style={styles.livePricesText}>Live Prices</ThemedText>
            </TouchableOpacity>
          </View>

          {/* NGN card (tap to open NGN wallet) */}
          <TouchableOpacity style={styles.assetCardLarge} onPress={() => router.push('/wallet-ngn')} activeOpacity={0.85}>
            <View style={styles.assetLeft}>
              <View style={styles.assetIconCircle}>
                <Image source={require('../../assets/images/naira.png')} style={styles.assetIcon} />
              </View>
              <View style={styles.assetInfo}>
                <ThemedText style={styles.assetName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Nigerian Naira</ThemedText>
                <ThemedText style={styles.assetSymbol} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>NGN</ThemedText>
              </View>
            </View>
            <View style={styles.assetRight}>
              <ThemedText style={styles.assetRightValue}>₦{Number(String(nairaBalance).replace(/[^0-9.-]+/g, '') || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})}</ThemedText>
            </View>
          </TouchableOpacity>

          {/* BTC card */}
          <TouchableOpacity style={styles.assetCardLarge} onPress={() => router.push('/crypto/BTC')} activeOpacity={0.85}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconCircle, { backgroundColor: '#FFF7ED' }]}>
                <Image source={require('../../assets/images/bitcoin.png')} style={styles.assetIcon} />
              </View>
              <View style={styles.assetInfo}>
                <ThemedText style={styles.assetName}>Bitcoin</ThemedText>
                <ThemedText style={styles.assetSymbol}>BTC</ThemedText>
              </View>
            </View>
            <View style={styles.assetRight}>
              <ThemedText style={styles.assetRightValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>₦{(cryptoBalances?.BTC?.ngnValue || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})}</ThemedText>
              <ThemedText style={styles.assetSubText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {Number(cryptoBalances?.BTC?.price_ngn) > 0
                  ? `${formatNgnValue(Number(cryptoBalances.BTC.price_ngn))} · ${cryptoBalances?.BTC?.balance ?? 0} BTC`
                  : `${cryptoBalances?.BTC?.balance ?? 0} BTC`}
              </ThemedText>
            </View>
          </TouchableOpacity>

          {/* ETH card */}
          <TouchableOpacity style={styles.assetCardLarge} onPress={() => router.push('/crypto/ETH')} activeOpacity={0.85}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconCircle, { backgroundColor: '#EEF2FF' }]}>
                <Image source={require('../../assets/images/ethereum.png')} style={styles.assetIcon} />
              </View>
              <View style={styles.assetInfo}>
                <ThemedText style={styles.assetName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Ethereum</ThemedText>
                <ThemedText style={styles.assetSymbol} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>ETH</ThemedText>
              </View>
            </View>
            <View style={styles.assetRight}>
              <ThemedText style={styles.assetRightValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>₦{(cryptoBalances?.ETH?.ngnValue || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})}</ThemedText>
              <ThemedText style={styles.assetSubText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {Number(cryptoBalances?.ETH?.price_ngn) > 0
                  ? `${formatNgnValue(Number(cryptoBalances.ETH.price_ngn))} · ${cryptoBalances?.ETH?.balance ?? 0} ETH`
                  : `${cryptoBalances?.ETH?.balance ?? 0} ETH`}
              </ThemedText>
            </View>
          </TouchableOpacity>

          {/* SOL card */}
          <TouchableOpacity style={styles.assetCardLarge} onPress={() => router.push('/crypto/SOL')} activeOpacity={0.85}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconCircle, { backgroundColor: '#F0FDF4' }]}>
                <Image source={require('../../assets/images/solana.png')} style={styles.assetIcon} />
              </View>
              <View style={styles.assetInfo}>
                <ThemedText style={styles.assetName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Solana</ThemedText>
                <ThemedText style={styles.assetSymbol} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>SOL</ThemedText>
              </View>
            </View>
            <View style={styles.assetRight}>
              <ThemedText style={styles.assetRightValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>₦{(cryptoBalances?.SOL?.ngnValue || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})}</ThemedText>
              <ThemedText style={styles.assetSubText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {Number(cryptoBalances?.SOL?.price_ngn) > 0
                  ? `${formatNgnValue(Number(cryptoBalances.SOL.price_ngn))} · ${cryptoBalances?.SOL?.balance ?? 0} SOL`
                  : `${cryptoBalances?.SOL?.balance ?? 0} SOL`}
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Crypto Select Modal */}
      <CryptoSelectModal
        visible={showCryptoModal}
        onClose={handleCloseModal}
        onSelect={handleCryptoSelect}
        action={cryptoAction}
      />

      {/* Wallet Address Modal */}
      {selectedCrypto && (
        <WalletAddressModal
          visible={showWalletModal}
          onClose={() => {
            setShowWalletModal(false);
            setSelectedCrypto(null);
          }}
          asset={selectedCrypto.asset}
          assetName={selectedCrypto.name}
          logo={selectedCrypto.logo}
        />
      )}

      {/* Biometric Setup Prompt */}
      {user?.id && (
        <BiometricSetupPrompt
          userId={user.id}
        />
      )}
      
      {/* Bottom action bar removed per design (Fund/Withdraw moved elsewhere) */}
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
    marginBottom: 24,
    width: '100%',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  testModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  testModeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 6,
    lineHeight: 30,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 22,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 13,
    includeFontPadding: false,
    textAlign: 'center',
  },
  balanceCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    minHeight: 180,
  },
  balanceContent: {
    width: '100%',
    gap: 16,
    paddingVertical: 4,
    marginBottom: 12,
  },
  balanceItem: {
    width: '100%',
    minHeight: 60,
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
  },
  currencyLabel: {
    fontSize: 12,
    color: '#E9D5FF',
    marginBottom: 6,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    lineHeight: 32,
    width: '100%',
    includeFontPadding: false,
    flexShrink: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  actionButtonGradient: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6B46C1',
  },
  withdrawButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  withdrawButtonContent: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  quickActionsContainer: {
    marginTop: 8,
    width: '100%',
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#11181C',
  },
  assetsContainer: {
    marginTop: 8,
    marginBottom: 32,
    width: '100%',
  },
  assetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  assetsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  assetsTitleLarge: {
    fontSize: 16,
    fontWeight: '600',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B46C1',
  },
  assetsList: {
    gap: 12,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  assetIconContainer: {
    marginRight: 12,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  assetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  assetSymbol: {
    fontSize: 12,
    opacity: 0.6,
  },
  assetBalance: {
    alignItems: 'flex-end',
  },
  assetBalanceAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  assetBalanceLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  emptyAssets: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  emptyAssetsText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyAssetsSubtext: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  assetsContainerLarge: {
    width: '100%',
    gap: 10,
    marginTop: 8,
    marginBottom: 24,
  },
  assetsHeaderLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  livePricesPill: {
    backgroundColor: '#6B46C1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  livePricesText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  assetCardLarge: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  assetRight: {
    alignItems: 'flex-end',
    minWidth: 140,
  },
  assetRightValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  assetSubText: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 4,
    color: '#10B981', // Green color for market price
  },
  // (styles for asset icons/info defined earlier to avoid duplicates)
  assetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  assetCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#F3E8FF', // light purple accent to match app
    borderRadius: 12,
    borderWidth: 0,
  },
  assetLabel: {
    fontSize: 13,
    color: '#6B46C1',
    marginBottom: 6,
    fontWeight: '600',
  },
  assetValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4C1D95',
  },
  // Bottom bar removed per design
});
