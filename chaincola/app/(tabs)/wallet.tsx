import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AssetOptionsModal from '@/components/asset-options-modal';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatUsdValue, formatNgnValue, CryptoBalance, getLunoPrices, CryptoPrice, syncSolBalanceFromBlockchain } from '@/lib/crypto-price-service';
import CryptoSelectModal from '@/components/crypto-select-modal';

interface CryptoAsset {
  id: string;
  name: string;
  symbol: string;
  logo: any;
  balance: string;
  usdValue: string;
  usdValueRaw?: number; // Raw USD value for total calculation
  pricePerUnit?: string | null; // Not used - only showing NGN prices
  pricePerUnitNGN?: string; // Price per unit in NGN
}

const cryptoAssetsConfig = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: require('@/assets/images/bitcoin.png') },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: require('@/assets/images/ethereum.png') },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: require('@/assets/images/tether.png') },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: require('@/assets/images/usdc.png') },
  { id: '6', name: 'Ripple', symbol: 'XRP', logo: require('@/assets/images/ripple.png') },
  { id: '7', name: 'Solana', symbol: 'SOL', logo: require('@/assets/images/solana.png') },
];

export default function WalletScreen() {
  const params = useLocalSearchParams();
  const action = params.action as string | undefined;
  const { user } = useAuth();
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalValue, setTotalValue] = useState(0);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoModalAction, setCryptoModalAction] = useState<'buy' | 'sell' | 'send' | 'receive' | null>(null);
  const [showAssetOptions, setShowAssetOptions] = useState(false);
  const [selectedAssetForOptions, setSelectedAssetForOptions] = useState<{ id: string; name?: string; symbol?: string } | null>(null);
  const [syncingSol, setSyncingSol] = useState(false);
  
  // Wallet address modal state
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [selectedCrypto, setSelectedCrypto] = useState<{ asset: string; name: string; logo: any } | null>(null);
  const priceRefetchDoneRef = useRef(false);

  const fetchWallet = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      
      // Fetch balances and prices in parallel with separate timeouts
      const balancePromise = getUserCryptoBalances(user.id);
      const pricePromise = getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL']);
      
      // Separate timeouts: balances can take longer, prices should be faster
      const balanceTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
      );
      const priceTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Price fetch timeout')), 25000)
      );
      
      const [balancesResult, pricesResult] = await Promise.all([
        Promise.race([balancePromise, balanceTimeout]).catch(err => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timeout')) {
            console.warn('Balance fetch timeout (using defaults):', msg);
          } else {
            console.error('Balance fetch error:', msg);
          }
          return { balances: {}, error: msg || 'Failed to fetch balances' };
        }) as Promise<{ balances: Record<string, CryptoBalance>; error: any }>,
        Promise.race([pricePromise, priceTimeout]).catch(err => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timeout')) {
            console.warn('Price fetch timeout (continuing without prices):', msg);
          } else {
            console.error('Price fetch error:', msg);
          }
          return { prices: {}, error: msg || 'Failed to fetch prices' };
        }) as Promise<{ prices: Record<string, CryptoPrice>; error: any }>,
      ]);

      // Log results for debugging
      console.log('📊 Wallet fetch results:', {
        balancesCount: Object.keys(balancesResult.balances || {}).length,
        pricesCount: Object.keys(pricesResult.prices || {}).length,
        balanceError: balancesResult.error,
        priceError: pricesResult.error,
        ethBalance: balancesResult.balances?.ETH?.balance,
        btcBalance: balancesResult.balances?.BTC?.balance,
        solBalance: balancesResult.balances?.SOL?.balance,
        allBalances: balancesResult.balances,
        userId: user.id,
      });

      // Map balances to assets with prices (static rate from pricing engine)
      const assets: CryptoAsset[] = cryptoAssetsConfig.map((config) => {
        // Safely get balance, ensuring it has all required properties
        const balanceData = balancesResult.balances?.[config.symbol];
        const balance = balanceData && typeof balanceData === 'object' && 'balance' in balanceData
          ? balanceData
          : { balance: 0, usdValue: 0, ngnValue: 0, symbol: config.symbol };
        const price = pricesResult.prices?.[config.symbol];
        
        // Calculate NGN value if we have price and balance
        // Use exact balance value (not rounded) for accurate calculation
        let ngnValue = 0;
        let usdValue = 0;
        const exactBalance = balance.balance || 0; // Use exact balance from database
        if (price && exactBalance > 0) {
          if (price.price_ngn > 0) {
            ngnValue = exactBalance * price.price_ngn;
          }
          if (price.price_usd > 0) {
            usdValue = exactBalance * price.price_usd;
          }
        }
        
        // Log SOL calculation for debugging
        if (config.symbol === 'SOL') {
          console.log(`💰 SOL NGN Calculation:`, {
            exactBalance: exactBalance,
            priceNGN: price?.price_ngn,
            calculatedNGN: ngnValue,
            formattedNGN: formatNgnValue(ngnValue),
          });
        }
        
        // Format price per unit in NGN only
        let pricePerUnitNGN: string | null = null;
        
        if (price) {
          if (price.price_ngn > 0) {
            pricePerUnitNGN = formatNgnValue(price.price_ngn);
          } else {
            pricePerUnitNGN = 'N/A';
          }
        } else {
          pricePerUnitNGN = 'N/A';
        }
        
        return {
          ...config,
          balance: formatCryptoBalance(exactBalance, config.symbol), // Use exact balance for display
          // Show exact NGN balance amount calculated from exact balance
          usdValue: `₦${ngnValue.toFixed(8).replace(/\.?0+$/, '')}`, // Show exact NGN amount with up to 8 decimals, remove trailing zeros
          usdValueRaw: usdValue, // Store raw USD value for total calculation
          pricePerUnit: null, // Not used - only showing NGN prices
          pricePerUnitNGN: pricePerUnitNGN,
        };
      });
      
      console.log(`📊 Mapped ${assets.length} assets with prices`);
      
      // Log SOL asset specifically
      const solAsset = assets.find(a => a.symbol === 'SOL');
      if (solAsset) {
        console.log(`✅ SOL asset found in mapped assets:`, {
          id: solAsset.id,
          name: solAsset.name,
          symbol: solAsset.symbol,
          balance: solAsset.balance,
          usdValue: solAsset.usdValue,
          pricePerUnit: solAsset.pricePerUnit,
          pricePerUnitNGN: solAsset.pricePerUnitNGN,
        });
      } else {
        console.error(`❌ SOL asset NOT found in mapped assets! Available symbols:`, assets.map(a => a.symbol));
      }

      setCryptoAssets(assets);
      
      // Calculate total value in USD
      const total = assets.reduce((sum, asset) => {
        return sum + (asset.usdValueRaw || 0);
      }, 0);
      setTotalValue(total);
    } catch (err: any) {
      console.error('Exception fetching assets:', err);
      setError(err.message || 'An error occurred. Please try again.');
      // Set default empty assets to ensure UI shows something
      const defaultAssets = cryptoAssetsConfig.map((config) => ({
        ...config,
        balance: formatCryptoBalance(0, config.symbol),
        usdValue: '₦0.00',
        pricePerUnit: null,
        pricePerUnitNGN: 'N/A',
      }));
      setCryptoAssets(defaultAssets);
      setTotalValue(0);
    } finally {
      // Always stop loading, even on error
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [user?.id]);

  // If market prices are missing (N/A), refetch prices once so they appear
  useEffect(() => {
    if (!user?.id || cryptoAssets.length === 0) return;
    if (priceRefetchDoneRef.current) return;
    const missingPrices = cryptoAssets.some((a) => !a.pricePerUnitNGN || a.pricePerUnitNGN === 'N/A');
    if (!missingPrices) return;

    const t = setTimeout(() => {
      priceRefetchDoneRef.current = true;
      getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'])
        .then((pricesResult) => {
          if (!pricesResult.prices || Object.keys(pricesResult.prices).length === 0) return;
          setCryptoAssets((prev) =>
            prev.map((asset) => {
              const price = pricesResult.prices?.[asset.symbol];
              if (!price?.price_ngn) return asset;
              const exactBalance = parseFloat(asset.balance.replace(/,/g, '')) || 0;
              const ngnValue = exactBalance * price.price_ngn;
              const usdValue = exactBalance * (price.price_usd || 0);
              return {
                ...asset,
                pricePerUnitNGN: formatNgnValue(price.price_ngn),
                usdValue: `₦${ngnValue.toFixed(8).replace(/\.?0+$/, '')}`,
                usdValueRaw: usdValue,
              };
            })
          );
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [user?.id, cryptoAssets.length]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        fetchWallet();
      }
    }, [user?.id])
  );

  const onRefresh = () => {
    priceRefetchDoneRef.current = false;
    setRefreshing(true);
    fetchWallet();
  };

  const handleSyncSol = async () => {
    if (!user?.id) return;
    
    setSyncingSol(true);
    try {
      const result = await syncSolBalanceFromBlockchain(user.id);
      if (result.success) {
        // Wait a moment for sync to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Refresh wallet
        await fetchWallet();
        Alert.alert('Success', 'SOL balance synced successfully');
      } else {
        Alert.alert('Error', result.error || 'Failed to sync SOL balance');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sync balance');
    } finally {
      setSyncingSol(false);
    }
  };

  const handleAssetPress = (assetId: string) => {
    if (action === 'send') {
      router.push({ pathname: '/send-crypto', params: { id: assetId, from: 'wallet' } });
    }
    // Removed crypto detail navigation - no action needed when clicking on wallet items
  };

  if (loading && cryptoAssets.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B46C1" />
          <ThemedText style={styles.loadingText}>Loading wallet...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6B46C1" />
        }
      >
        <View style={styles.header}>
          <ThemedText 
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {action === 'send' ? 'Select Crypto to Send' :
             action === 'receive' ? 'Select Crypto to Receive' :
             'Wallet'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {action ? 'Choose a cryptocurrency to continue' : 'Your cryptocurrency wallet'}
          </ThemedText>
        </View>

        {!action && (
          <LinearGradient
            colors={['#6B46C1', '#9333EA', '#A855F7']}
            style={styles.purpleCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.cardContent}>
              <ThemedText style={styles.cardTitle}>Total Wallet Value</ThemedText>
              <ThemedText 
                style={styles.cardAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
              
              {/* Send, Receive, and Swap Buttons */}
              <View style={styles.balanceCardActions}>
                <TouchableOpacity 
                  style={styles.balanceActionButton}
                  onPress={() => {
                    setCryptoModalAction('send');
                    setShowCryptoModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="send" size={16} color="#6B46C1" />
                  <ThemedText style={styles.balanceActionText}>Send</ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.balanceActionButton}
                  onPress={() => {
                    setCryptoModalAction('receive');
                    setShowCryptoModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="call-received" size={16} color="#6B46C1" />
                  <ThemedText style={styles.balanceActionText}>Receive</ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.balanceActionButton}
                  onPress={() => {
                    router.push({ pathname: '/convert-crypto' });
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="swap-horiz" size={16} color="#6B46C1" />
                  <ThemedText style={styles.balanceActionText}>Swap</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        )}

        {action && (
          <View style={styles.actionInfoCard}>
            <MaterialIcons 
              name={action === 'send' ? 'send' : 'call-received'} 
              size={24} 
              color="#6B46C1" 
            />
            <ThemedText style={styles.actionInfoText}>
              {action === 'send' 
                ? 'Select the cryptocurrency you want to send'
                : 'Select the cryptocurrency you want to receive'}
            </ThemedText>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        <View style={styles.assetsList}>
          {cryptoAssets.length > 0 ? (
            cryptoAssets.map((asset) => (
              <View
                key={asset.id}
                style={[
                  styles.assetItem,
                  action && styles.assetItemAction
                ]}
              >
                <TouchableOpacity
                  activeOpacity={action ? 0.7 : 1}
                  onPress={action ? () => handleAssetPress(asset.id) : undefined}
                  disabled={!action}
                  style={styles.assetContent}
                >
                  <View style={styles.assetLeft}>
                    <Image
                      source={asset.logo}
                      style={styles.assetLogo}
                      contentFit="contain"
                    />
                    <View style={styles.assetInfo}>
                      <ThemedText style={styles.assetName}>{asset.name}</ThemedText>
                      <ThemedText style={styles.assetSymbol}>{asset.symbol}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.assetRight}>
                    <View style={styles.assetBalanceContainer}>
                      <View style={styles.balanceRow}>
                        <View style={styles.balanceInfo}>
                          <ThemedText 
                            style={styles.assetBalanceUSD}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {parseFloat(asset.balance.replace(/,/g, '')) > 0 && asset.usdValue !== '₦0.00' ? asset.usdValue : '₦0.00'}
                          </ThemedText>
                          <ThemedText 
                            style={styles.assetBalance}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {asset.balance}
                          </ThemedText>
                          {asset.pricePerUnitNGN && asset.pricePerUnitNGN !== 'N/A' ? (
                            <ThemedText style={styles.assetPrice} numberOfLines={1}>
                              {asset.pricePerUnitNGN}/unit
                            </ThemedText>
                          ) : null}
                        </View>
                        {asset.symbol === 'SOL' && !action && (
                          <TouchableOpacity
                            style={styles.syncButton}
                            onPress={handleSyncSol}
                            disabled={syncingSol}
                            activeOpacity={0.7}
                          >
                            {syncingSol ? (
                              <ActivityIndicator size="small" color="#6B46C1" />
                            ) : (
                              <MaterialIcons name="sync" size={18} color="#6B46C1" />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                
                {/* Action Buttons */}
                {!action && (
                  <View style={styles.assetActions}>
                    <TouchableOpacity
                      style={styles.assetBuyButton}
                      onPress={() => {
                        router.push({ pathname: '/buy-crypto', params: { cryptoId: asset.id } });
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="add" size={14} color="#10B981" />
                      <ThemedText style={styles.assetBuyButtonText}>Buy</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.assetSellButton}
                      onPress={() => {
                        router.push({ pathname: '/sell-crypto', params: { cryptoId: asset.id } });
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="remove" size={14} color="#EF4444" />
                      <ThemedText style={styles.assetSellButtonText}>Sell</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.assetMoreButton}
                      onPress={() => {
                        setSelectedAssetForOptions({ id: asset.id, name: asset.name, symbol: asset.symbol });
                        setShowAssetOptions(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="more-vert" size={16} color="#6B46C1" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="account-balance-wallet" size={48} color="#9CA3AF" />
              <ThemedText style={styles.emptyStateText}>
                {action ? 'No cryptocurrencies available' : 'No wallet assets found'}
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Crypto Select Modal */}
      <CryptoSelectModal
        visible={showCryptoModal}
        onClose={() => {
          setShowCryptoModal(false);
          setCryptoModalAction(null);
        }}
        onSelect={async (cryptoId) => {
          // Handle navigation based on action
          if (cryptoModalAction === 'send') {
            router.push({ pathname: '/send-crypto', params: { id: cryptoId, from: 'wallet' } });
          } else if (cryptoModalAction === 'receive') {
            // Generate and show wallet address for receive
            const assetMap: Record<string, string> = {
              '1': 'BTC',
              '2': 'ETH',
              '3': 'USDT',
              '4': 'USDC',
              '6': 'XRP',
              '7': 'SOL',
            };
            const asset = assetMap[cryptoId];
            if (asset) {
              try {
                const { getWalletAddress } = await import('@/lib/crypto-wallet-service');
                const { address, error } = await getWalletAddress(asset as any, 'mainnet');
                if (address && !error) {
                  // Navigate to crypto detail page which shows the receive modal
                  router.push({ pathname: `/crypto/${asset}`, params: { showReceive: 'true' } });
                } else {
                  Alert.alert('Error', error || 'Failed to generate wallet address');
                }
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to generate wallet address');
              }
            }
          }
          setShowCryptoModal(false);
          setCryptoModalAction(null);
        }}
        action={cryptoModalAction || undefined}
      />

      {/* Asset Options Modal (Send / Receive / View Transactions) */}
      <AssetOptionsModal
        visible={showAssetOptions}
        asset={selectedAssetForOptions}
        onClose={() => {
          setShowAssetOptions(false);
          setSelectedAssetForOptions(null);
        }}
        onSend={(assetId) => router.push({ pathname: '/send-crypto', params: { id: assetId, from: 'wallet' } })}
        onSell={(assetId) => router.push({ pathname: '/sell-crypto', params: { cryptoId: assetId } })}
        onSwap={(assetId) => router.push({ pathname: '/convert-crypto', params: { fromId: assetId } })}
        onReceive={async (assetId) => {
          // Generate and show wallet address
          const assetMap: Record<string, string> = {
            '1': 'BTC',
            '2': 'ETH',
            '3': 'USDT',
            '4': 'USDC',
            '6': 'XRP',
            '7': 'SOL',
          };
          const asset = assetMap[assetId];
          if (asset) {
            try {
              const { getWalletAddress } = await import('@/lib/crypto-wallet-service');
              const { address, error } = await getWalletAddress(asset as any, 'mainnet');
              if (address && !error) {
                const ClipboardModule = await import('expo-clipboard');
                // expo-clipboard exports functions directly on the module
                await ClipboardModule.setStringAsync(address);
                Alert.alert(
                  `${asset} Wallet Address`,
                  `Your ${asset} wallet address:\n\n${address}\n\nAddress copied to clipboard!`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert('Error', error || 'Failed to generate wallet address');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to generate wallet address');
            }
          }
        }}
        onViewTransactions={(assetId) => router.push({ pathname: '/transactions', params: assetId ? { asset: assetId } : undefined })}
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
    paddingRight: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 38,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 22,
  },
  purpleCard: {
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    minHeight: 160,
    width: '100%',
  },
  cardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 13,
    color: '#E9D5FF',
    marginBottom: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.6,
    lineHeight: 38,
    width: '100%',
    textAlign: 'center',
    includeFontPadding: false,
  },
  balanceCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    width: '100%',
    paddingHorizontal: 0,
  },
  balanceActionButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    flex: 1,
    minWidth: 0,
  },
  balanceActionText: {
    color: '#6B46C1',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardSubtext: {
    fontSize: 14,
    color: '#E9D5FF',
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  assetsList: {
    marginTop: 20,
    gap: 8,
  },
  assetItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 6,
  },
  assetContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  assetLogo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  assetSymbol: {
    fontSize: 11,
    opacity: 0.6,
  },
  assetRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  assetBalanceContainer: {
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  syncButton: {
    padding: 4,
    backgroundColor: '#F3E8FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  assetBalanceUSD: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
    opacity: 0.7,
  },
  assetBalance: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 120,
  },
  assetPriceContainer: {
    marginTop: 4,
    alignItems: 'flex-end',
    gap: 2,
  },
  assetPrice: {
    fontSize: 11,
    fontWeight: '500',
    maxWidth: 120,
    color: '#059669',
    opacity: 0.9,
    textAlign: 'right',
  },
  assetPriceUSD: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '400',
    opacity: 0.7,
    textAlign: 'right',
  },
  assetPriceNGN: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
    maxWidth: 120,
    color: '#059669',
    opacity: 0.8,
  },
  assetPriceLoading: {
    opacity: 0.6,
    fontStyle: 'italic',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  assetValue: {
    fontSize: 13,
    opacity: 0.6,
    maxWidth: 120,
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
    opacity: 0.7,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  actionInfoCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionInfoText: {
    flex: 1,
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
  },
  assetItemAction: {
    borderWidth: 2,
    borderColor: '#6B46C1',
    backgroundColor: '#FAFAFA',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 24,
  },
  emptyStateText: {
    fontSize: 16,
    opacity: 0.6,
    marginTop: 16,
    textAlign: 'center',
  },
  assetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  assetBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
    flex: 1,
    justifyContent: 'center',
  },
  assetBuyButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  assetSellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
    flex: 1,
    justifyContent: 'center',
  },
  assetSellButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF4444',
  },
});

