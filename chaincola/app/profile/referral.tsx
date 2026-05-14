import { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, Share, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserReferralCode,
  generateReferralCode,
  getReferralStats,
  getRecentReferrals,
} from '@/lib/referral-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';
// Supabase removed

export default function ReferralScreen() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    totalEarnings: 0,
    totalRewards: 0,
  });
  const [recentReferrals, setRecentReferrals] = useState<Array<{
    id: string;
    referred_user_id: string;
    referral_code: string;
    reward_amount: number;
    reward_status: string;
    created_at: string;
  }>>([]);

  const fetchReferralData = async (isRefresh = false) => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Get or generate referral code
      const { code: existingCode, error: codeError } = await getUserReferralCode(user.id);
      
      let code = existingCode;
      
      if (!code && !codeError) {
        // Generate a new referral code if user doesn't have one
        const { code: newCode, error: generateError } = await generateReferralCode(user.id);
        if (newCode && !generateError) {
          code = newCode;
        } else if (generateError) {
          console.error('Error generating referral code:', generateError);
          
          // Handle different error types
          const errorMessage = generateError.message || generateError.details || 'Unknown error';
          
          if (generateError.code === '42501' || errorMessage.includes('row-level security') || errorMessage.includes('permission')) {
            setError('Permission error. Please ensure you are signed in and try again. If the issue persists, contact support.');
          } else if (errorMessage.includes('profile') || errorMessage.includes('set up')) {
            setError('Unable to create user profile. Please try signing out and back in, or contact support.');
          } else if (errorMessage) {
            setError(`Failed to generate referral code: ${errorMessage}`);
          } else {
            setError('Failed to generate referral code. Please try again.');
          }
        }
      } else if (codeError) {
        console.error('Error fetching referral code:', codeError);
        
        // Handle RLS policy errors specifically
        if (codeError.code === '42501' || codeError.message?.includes('row-level security')) {
          setError('Permission error. Please ensure you are signed in and try again.');
        } else if (codeError.message) {
          setError(`Failed to load referral code: ${codeError.message}`);
        } else {
          setError('Failed to load referral code. Please try again.');
        }
      }

      if (code) {
        setReferralCode(code);
        setReferralLink(`https://chaincola.app/ref/${code}`);
      } else if (!code && !codeError) {
        setError('Unable to generate referral code. Please try again.');
      }

      // Fetch referral statistics
      const referralStats = await getReferralStats(user.id);
      if (referralStats && !referralStats.error) {
        setStats({
          totalReferrals: referralStats.totalReferrals,
          activeReferrals: referralStats.pendingReferrals || 0,
          totalEarnings: referralStats.paidEarnings || referralStats.totalEarnings,
          totalRewards: referralStats.totalEarnings,
        });
      } else if (referralStats?.error) {
        console.error('Error fetching referral stats:', referralStats.error);
        // Set default values on error
        setStats({
          totalReferrals: 0,
          activeReferrals: 0,
          totalEarnings: 0,
          totalRewards: 0,
        });
      }

      // Fetch recent referrals
      const { referrals, error: recentError } = await getRecentReferrals(user.id, 5);
      if (!recentError && referrals) {
        setRecentReferrals(referrals);
      } else if (recentError) {
        console.error('Error fetching recent referrals:', recentError);
        setRecentReferrals([]);
      }
    } catch (error: any) {
      console.error('Error fetching referral data:', error);
      setError('Failed to load referral data. Please pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    fetchReferralData(true);
  }, [user?.id]);

  const handleRetryGenerateCode = async () => {
    if (!user?.id) {
      setError('User not found. Please sign in again.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { code: newCode, error: generateError } = await generateReferralCode(user.id);
      
      if (newCode && !generateError) {
        setReferralCode(newCode);
        setReferralLink(`https://chaincola.app/ref/${newCode}`);
        setError(null);
        } else if (generateError) {
          console.error('Error generating referral code on retry:', generateError);
          
          // Handle different error types
          const errorMessage = generateError.message || generateError.details || 'Unknown error';
          
          if (generateError.code === '42501' || errorMessage.includes('row-level security') || errorMessage.includes('permission')) {
            setError('Permission error. Please ensure you are signed in and try again. If the issue persists, contact support.');
          } else if (errorMessage.includes('profile') || errorMessage.includes('set up')) {
            setError('Unable to create user profile. Please try signing out and back in, or contact support.');
          } else if (errorMessage) {
            setError(`Failed to generate referral code: ${errorMessage}`);
          } else {
            setError('Failed to generate referral code. Please try again.');
          }
        }
    } catch (error: any) {
      console.error('Exception generating referral code on retry:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchReferralData();
    }, [user?.id])
  );

  const handleCopyCode = async () => {
    if (!referralCode) return;
    
    try {
      await Clipboard.setStringAsync(referralCode);
      Alert.alert('Copied!', 'Referral code copied to clipboard');
    } catch (error) {
      console.error('Error copying code:', error);
      Alert.alert('Error', 'Failed to copy referral code');
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    
    try {
      await Clipboard.setStringAsync(referralLink);
      Alert.alert('Copied!', 'Referral link copied to clipboard');
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert('Error', 'Failed to copy referral link');
    }
  };

  const handleShare = async () => {
    if (!referralLink || !referralCode) return;

    try {
      const result = await Share.share({
        message: `Join ChainCola using my referral code: ${referralCode}\n\n${referralLink}\n\nEarn ₦200 when you sign up with my code!`,
        title: 'Invite Friends to ChainCola',
      });

      if (result.action === Share.sharedAction) {
        console.log('Content shared successfully');
      }
    } catch (error: any) {
      console.error('Error sharing:', error);
      Alert.alert('Error', 'Failed to share referral link');
    }
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Referral</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Loading referral data...</ThemedText>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={['#6B46C1', '#9333EA', '#A855F7']}
              style={styles.referralCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.cardContent}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="card-giftcard" size={48} color="#FFFFFF" />
                </View>
                <ThemedText style={styles.cardTitle}>Invite Friends</ThemedText>
                <ThemedText style={styles.cardSubtitle}>
                  Share your referral code and earn ₦200 per referral
                </ThemedText>

                {referralCode ? (
                  <View style={styles.referralCodeContainer}>
                    <ThemedText style={styles.referralCodeLabel}>Your Referral Code</ThemedText>
                    <View style={styles.referralCodeBox}>
                      <ThemedText 
                        style={styles.referralCode}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {referralCode}
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={handleCopyCode}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="content-copy" size={20} color="#6B46C1" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.errorContainer}>
                    <MaterialIcons name="error-outline" size={32} color="#FFFFFF" style={{ marginBottom: 12 }} />
                    <ThemedText style={styles.errorText}>
                      {error || 'Unable to load referral code. Please pull to refresh.'}
                    </ThemedText>
                    {error?.includes('Permission error') && (
                      <ThemedText style={styles.errorHint}>
                        This may be a temporary issue. Please try signing out and signing back in.
                      </ThemedText>
                    )}
                    <View style={styles.retryButtonContainer}>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={handleRetryGenerateCode}
                        activeOpacity={0.7}
                        disabled={loading}
                      >
                        {loading ? (
                          <AppLoadingIndicator size="small" variant="onPrimary" />
                        ) : (
                          <ThemedText style={styles.retryButtonText}>Generate Code</ThemedText>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.retryButton, styles.retryButtonSecondary]}
                        onPress={() => fetchReferralData()}
                        activeOpacity={0.7}
                        disabled={loading}
                      >
                        <ThemedText style={[styles.retryButtonText, styles.retryButtonTextSecondary]}>Refresh</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </LinearGradient>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <ThemedText style={styles.statValue}>{stats.totalReferrals}</ThemedText>
                <ThemedText style={styles.statLabel}>Total Referrals</ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText style={styles.statValue}>{stats.activeReferrals}</ThemedText>
                <ThemedText style={styles.statLabel}>Pending</ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText style={styles.statValue}>
                  ₦{stats.totalEarnings.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={styles.statLabel}>Total Earnings</ThemedText>
              </View>
            </View>
          </>
        )}

        {!loading && referralCode && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyLink}
              activeOpacity={0.8}
              disabled={!referralLink}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.actionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <MaterialIcons name="link" size={20} color="#FFFFFF" />
                <ThemedText style={styles.actionButtonText}>Copy Referral Link</ThemedText>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.shareButton]}
              onPress={handleShare}
              activeOpacity={0.8}
              disabled={!referralLink}
            >
              <View style={styles.shareButtonContent}>
                <MaterialIcons name="share" size={20} color="#6B46C1" />
                <ThemedText style={styles.shareButtonText}>Share</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {recentReferrals.length > 0 && (
          <View style={styles.recentReferralsContainer}>
            <ThemedText style={styles.recentReferralsTitle}>Recent Referrals</ThemedText>
            {recentReferrals.map((referral) => (
              <View key={referral.id} style={styles.referralItem}>
                <View style={styles.referralItemLeft}>
                  <MaterialIcons 
                    name={referral.reward_status === 'paid' ? 'check-circle' : 'pending'} 
                    size={20} 
                    color={referral.reward_status === 'paid' ? '#10B981' : '#F59E0B'} 
                  />
                  <View style={styles.referralItemInfo}>
                    <ThemedText style={styles.referralItemCode}>
                      Referred User
                    </ThemedText>
                    <ThemedText style={styles.referralItemDate}>
                      {new Date(referral.created_at).toLocaleDateString('en-NG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.referralItemRight}>
                  <ThemedText style={styles.referralItemAmount}>
                    ₦{referral.reward_amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </ThemedText>
                  <ThemedText style={[
                    styles.referralItemStatus,
                    referral.reward_status === 'paid' && styles.referralItemStatusSuccess,
                    referral.reward_status === 'pending' && styles.referralItemStatusPending,
                    referral.reward_status === 'cancelled' && styles.referralItemStatusCancelled,
                  ]}>
                    {referral.reward_status === 'paid' ? 'Paid' : referral.reward_status === 'cancelled' ? 'Cancelled' : 'Pending'}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoContainer}>
          <ThemedText style={styles.infoTitle}>How it works</ThemedText>
          <View style={styles.infoItem}>
            <MaterialIcons name="check-circle" size={20} color="#10B981" />
            <ThemedText style={styles.infoText}>
              Share your referral code with friends
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <MaterialIcons name="check-circle" size={20} color="#10B981" />
            <ThemedText style={styles.infoText}>
              They sign up using your code
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <MaterialIcons name="check-circle" size={20} color="#10B981" />
            <ThemedText style={styles.infoText}>
              You earn ₦200 for each successful referral
            </ThemedText>
          </View>
        </View>
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
  referralCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    width: '100%',
  },
  cardContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#E9D5FF',
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.9,
  },
  referralCodeContainer: {
    width: '100%',
    marginTop: 8,
  },
  referralCodeLabel: {
    fontSize: 14,
    color: '#E9D5FF',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  referralCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  referralCode: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 4,
    textAlign: 'center',
    includeFontPadding: false,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  shareButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#6B46C1',
  },
  shareButtonContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6B46C1',
  },
  infoContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    marginBottom: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.8,
    lineHeight: 18,
  },
  retryButtonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  retryButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  retryButtonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  retryButtonTextSecondary: {
    opacity: 0.9,
  },
  recentReferralsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentReferralsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  referralItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  referralItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  referralItemInfo: {
    flex: 1,
  },
  referralItemCode: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  referralItemDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  referralItemRight: {
    alignItems: 'flex-end',
  },
  referralItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#10B981',
  },
  referralItemStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  referralItemStatusSuccess: {
    color: '#10B981',
  },
  referralItemStatusPending: {
    color: '#F59E0B',
  },
  referralItemStatusCancelled: {
    color: '#EF4444',
  },
});


