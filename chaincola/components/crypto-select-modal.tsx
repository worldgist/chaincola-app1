import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatUsdValue, formatNgnValue, getLunoPrices } from '@/lib/crypto-price-service';

interface CryptoAsset {
  id: string;
  name: string;
  symbol: string;
  logo: any;
  balance: string;
  pricePerUnit?: string;
  pricePerUnitNGN?: string;
}

const cryptoAssetsConfig = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: require('@/assets/images/bitcoin.png') },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: require('@/assets/images/ethereum.png') },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: require('@/assets/images/tether.png') },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: require('@/assets/images/usdc.png') },
  { id: '6', name: 'Ripple', symbol: 'XRP', logo: require('@/assets/images/ripple.png') },
  { id: '7', name: 'Solana', symbol: 'SOL', logo: require('@/assets/images/solana.png') },
];

interface CryptoSelectModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (cryptoId: string) => void;
  action?: 'send' | 'receive' | 'buy' | 'sell';
}

export default function CryptoSelectModal({
  visible,
  onClose,
  onSelect,
  action,
}: CryptoSelectModalProps) {
  const { user } = useAuth();
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log('🔵 Modal opened, setting default assets...');
      console.log('👤 User:', user?.id ? 'exists' : 'not found');
      console.log('📋 Config count:', cryptoAssetsConfig.length);
      
      // All cryptocurrencies are supported for receive (USDT and USDC use ETH addresses as ERC-20 tokens)
      const filteredConfig = cryptoAssetsConfig;
      
      // Always show default assets immediately when modal opens
      // Fetch prices immediately for better UX
      let defaultAssets = filteredConfig.map((config) => ({
        ...config,
        balance: '0.00',
        pricePerUnit: 'Loading...',
        pricePerUnitNGN: 'Loading...',
        rawBalance: 0, // Temporary field for filtering
      }));
      
      // For sell action, we'll filter after fetching balances
      // For now, show all assets (they'll be filtered when real balances load)
      
      // Fetch prices immediately (don't wait for user data)
      getLunoPrices(filteredConfig.map(c => c.symbol))
        .then((pricesResult) => {
          if (pricesResult && pricesResult.prices) {
            const updatedAssets = defaultAssets.map((asset) => {
              const config = filteredConfig.find(c => c.id === asset.id);
              if (config && pricesResult.prices[config.symbol]) {
                const price = pricesResult.prices[config.symbol];
                return {
                  ...asset,
                  pricePerUnit: formatUsdValue(price.price_usd),
                  pricePerUnitNGN: formatNgnValue(price.price_ngn),
                };
              }
              return asset;
            });
            // Remove rawBalance before setting
            const cleanedAssets = updatedAssets.map(({ rawBalance, ...asset }) => asset);
            setCryptoAssets(cleanedAssets);
          }
        })
        .catch((error) => {
          console.warn('⚠️ Error fetching prices for default assets:', error);
        });
      
      console.log('📦 Default assets created:', defaultAssets.length);
      console.log('📦 First asset:', defaultAssets[0]);
      
      // Set assets and loading state synchronously (remove rawBalance)
      const cleanedDefaultAssets = defaultAssets.map(({ rawBalance, ...asset }) => asset);
      setCryptoAssets(cleanedDefaultAssets);
      setLoading(false);
      
      console.log('✅ State updated - assets:', defaultAssets.length, 'loading: false');
      
      // Then fetch real data if user is available (in background)
      if (user?.id) {
        console.log('👤 User ID found, fetching real data in background...');
        // Use a small delay to ensure state is set first
        const timer = setTimeout(() => {
          fetchCryptoAssets();
        }, 50);
        return () => clearTimeout(timer);
      } else {
        console.log('⚠️ No user ID available, using default assets only');
      }
    } else {
      console.log('🔴 Modal closed, resetting...');
      // Reset when modal closes
      setCryptoAssets([]);
      setLoading(false);
    }
  }, [visible, user?.id, action]);

  const fetchCryptoAssets = async () => {
    if (!user?.id) {
      console.log('⚠️ No user ID, keeping default assets');
      return;
    }

    try {
      // Don't set loading to true - we already have default assets showing
      console.log('🔄 Fetching crypto assets for modal...');

      // All cryptocurrencies are supported for receive (USDT and USDC use ETH addresses as ERC-20 tokens)
      const filteredConfig = cryptoAssetsConfig;

      // Fetch balances and prices in parallel
      const [balancesResult, pricesResult] = await Promise.all([
        getUserCryptoBalances(user.id),
        getLunoPrices(filteredConfig.map(c => c.symbol)),
      ]);

      console.log('💼 Balances result:', balancesResult);
      console.log('💰 Prices result:', pricesResult);

      // Map balances and prices to assets
      let assets: CryptoAsset[] = filteredConfig.map((config) => {
        // Handle balance structure - balancesResult.balances might be an object or the result might have a different structure
        let balance = { balance: 0, usdValue: 0, ngnValue: 0 };
        
        if (balancesResult && balancesResult.balances) {
          balance = balancesResult.balances[config.symbol] || { balance: 0, usdValue: 0, ngnValue: 0 };
        } else if (balancesResult && typeof balancesResult === 'object' && config.symbol in balancesResult) {
          // Fallback: balancesResult might be the balances object directly
          balance = (balancesResult as any)[config.symbol] || { balance: 0, usdValue: 0, ngnValue: 0 };
        }

        // Get price from Luno API
        let pricePerUnit: string | null = 'N/A';
        let pricePerUnitNGN: string | null = 'N/A';
        
        if (pricesResult && pricesResult.prices && pricesResult.prices[config.symbol]) {
          const price = pricesResult.prices[config.symbol];
          pricePerUnit = formatUsdValue(price.price_usd);
          pricePerUnitNGN = formatNgnValue(price.price_ngn);
        }

        return {
          ...config,
          balance: formatCryptoBalance(balance.balance || 0, config.symbol),
          pricePerUnit: pricePerUnit,
          pricePerUnitNGN: pricePerUnitNGN,
          rawBalance: balance.balance || 0, // Store raw balance for filtering
        };
      });

      // Filter out assets with zero balance when action is 'sell'
      if (action === 'sell') {
        assets = assets.filter(asset => (asset as any).rawBalance > 0);
        console.log(`🔍 Filtered assets for sell: ${assets.length} with balance > 0`);
      }

      // Remove rawBalance before setting state (clean up)
      assets = assets.map(({ rawBalance, ...asset }) => asset);

      console.log('✅ Mapped assets:', assets.length, assets);
      setCryptoAssets(assets);
    } catch (error) {
      console.error('❌ Error fetching crypto assets:', error);
      // Keep default assets on error - they're already showing
      // No need to update since we already have default assets displayed
    }
  };

  const handleSelect = (cryptoId: string) => {
    onSelect(cryptoId);
    onClose();
  };

  const getActionTitle = () => {
    switch (action) {
      case 'send':
        return 'Select Crypto to Send';
      case 'receive':
        return 'Select Crypto to Receive';
      case 'buy':
        return 'Select Crypto to Buy';
      case 'sell':
        return 'Select Crypto to Sell';
      default:
        return 'Select Cryptocurrency';
    }
  };

  const getActionIcon = () => {
    switch (action) {
      case 'send':
        return 'send';
      case 'receive':
        return 'call-received';
      case 'buy':
        return 'add';
      case 'sell':
        return 'remove';
      default:
        return 'account-balance-wallet';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <MaterialIcons
                  name={getActionIcon() as any}
                  size={24}
                  color="#6B46C1"
                />
                <ThemedText style={styles.title}>{getActionTitle()}</ThemedText>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6B46C1" />
                <ThemedText style={styles.loadingText}>Loading cryptocurrencies...</ThemedText>
              </View>
            ) : cryptoAssets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons 
                  name={action === 'sell' ? 'remove-circle-outline' : 'account-balance-wallet'} 
                  size={48} 
                  color="#9CA3AF" 
                />
                <ThemedText style={styles.emptyText}>
                  {action === 'sell' 
                    ? 'No cryptocurrencies available to sell' 
                    : 'No cryptocurrencies available'}
                </ThemedText>
                {action === 'sell' && (
                  <ThemedText style={styles.emptySubtext}>
                    You need to have a balance greater than 0 to sell
                  </ThemedText>
                )}
              </View>
            ) : (
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {cryptoAssets.map((asset) => (
                  <TouchableOpacity
                    key={asset.id}
                    style={styles.cryptoItem}
                    activeOpacity={0.7}
                    onPress={() => handleSelect(asset.id)}
                  >
                    <View style={styles.cryptoLeft}>
                      <Image
                        source={asset.logo}
                        style={styles.cryptoLogo}
                        contentFit="contain"
                      />
                      <View style={styles.cryptoInfo}>
                        <ThemedText style={styles.cryptoName}>{asset.name}</ThemedText>
                        <ThemedText style={styles.cryptoSymbol}>{asset.symbol}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.cryptoRight}>
                      <ThemedText style={styles.cryptoBalance}>{asset.balance}</ThemedText>
                      {asset.pricePerUnitNGN && asset.pricePerUnitNGN !== 'Loading...' && asset.pricePerUnitNGN !== 'N/A' ? (
                        <ThemedText style={styles.cryptoPriceNgn} numberOfLines={1}>
                          {asset.pricePerUnitNGN}/unit
                        </ThemedText>
                      ) : asset.pricePerUnitNGN === 'Loading...' ? (
                        <ThemedText style={styles.cryptoPriceLoading}>…</ThemedText>
                      ) : null}
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={24}
                      color="#9CA3AF"
                      style={styles.chevron}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '70%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    opacity: 0.7,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.6,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    minHeight: 400,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  cryptoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 80,
  },
  cryptoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  cryptoLogo: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  cryptoInfo: {
    flex: 1,
  },
  cryptoName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cryptoSymbol: {
    fontSize: 14,
    opacity: 0.6,
  },
  cryptoRight: {
    alignItems: 'flex-end',
    marginRight: 8,
    maxWidth: '46%',
    flexShrink: 1,
  },
  cryptoBalance: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cryptoPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
    marginBottom: 2,
  },
  cryptoPriceNGN: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
    opacity: 0.8,
  },
  cryptoPriceUnavailable: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  cryptoPriceLoading: {
    fontSize: 12,
    opacity: 0.7,
    color: '#6B46C1',
    fontStyle: 'italic',
  },
  chevron: {
    marginLeft: 8,
  },
});

