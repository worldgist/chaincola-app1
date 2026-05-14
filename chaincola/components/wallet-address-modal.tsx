import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import QRCode from 'react-native-qrcode-svg';
import { getDemoWallet, getAllDemoWallets } from '@/lib/demo-wallets';
import { useAuth } from '@/contexts/AuthContext';
import AppLoadingIndicator from '@/components/app-loading-indicator';
import { getWalletAddress, getWalletByAsset } from '@/lib/crypto-wallet-service';


interface WalletAddressModalProps {
  visible: boolean;
  onClose: () => void;
  asset: string; // BTC, ETH, USDT, USDC, SOL, XRP
  assetName: string; // Bitcoin, Ethereum, etc.
  logo: any; // require() image
}

const cryptoData: Record<string, { name: string; logo: any }> = {
  BTC: { name: 'Bitcoin', logo: require('@/assets/images/bitcoin.png') },
  ETH: { name: 'Ethereum', logo: require('@/assets/images/ethereum.png') },
  USDT: { name: 'Tether', logo: require('@/assets/images/tether.png') },
  USDC: { name: 'USD Coin', logo: require('@/assets/images/usdc.png') },
  XRP: { name: 'Ripple', logo: require('@/assets/images/ripple.png') },
  SOL: { name: 'Solana', logo: require('@/assets/images/solana.png') },
};

export default function WalletAddressModal({
  visible,
  onClose,
  asset,
  assetName,
  logo,
}: WalletAddressModalProps) {
  const { user } = useAuth();
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [destinationTag, setDestinationTag] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      fetchWalletAddress();
    } else {
      // Reset when modal closes
      setWalletAddress('');
      setLoading(true);
      setDestinationTag(null);
    }
  }, [visible, asset]);

  const fetchWalletAddress = async () => {
    try {
      setLoading(true);
      const { address, error } = await getWalletAddress(asset as any, 'mainnet');
      
      if (address && !error) {
        setWalletAddress(address);
        
        // Get destination tag for XRP if available
        if (asset === 'XRP') {
          const { wallet } = await getWalletByAsset('XRP', 'mainnet');
          if (wallet?.destination_tag) {
            setDestinationTag(wallet.destination_tag);
          }
        }
      } else {
        Alert.alert('Error', error || 'Failed to generate wallet address');
        onClose();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate wallet address');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    try {
      const ClipboardModule = await import('expo-clipboard');
      let textToCopy = walletAddress;
      if (asset === 'XRP' && destinationTag) {
        textToCopy = `${walletAddress}\nDestination Tag: ${destinationTag}`;
      }
      await ClipboardModule.setStringAsync(textToCopy);
      Alert.alert('Copied', 'Wallet address copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy address');
    }
  };

  const handleShare = async () => {
    try {
      const { Share } = await import('react-native');
      let shareMessage = `My ${assetName} (${asset}) wallet address:\n\n${walletAddress}`;
      
      if (asset === 'XRP' && destinationTag) {
        shareMessage += `\n\nDestination Tag: ${destinationTag}\n\n⚠️ IMPORTANT: Include the destination tag when sending XRP to this address.`;
      } else {
        shareMessage += `\n\nSend ${asset} to this address`;
      }
      
      await Share.share({
        message: shareMessage,
        title: `Share ${asset} Wallet Address`,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to share wallet address');
    }
  };

  const crypto = cryptoData[asset] || { name: assetName, logo };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Receive {asset}</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Crypto Info Card */}
            <View style={styles.cryptoCard}>
              <Image
                source={crypto.logo}
                style={styles.cryptoLogo}
                contentFit="contain"
              />
              <View style={styles.cryptoInfo}>
                <ThemedText 
                  style={styles.cryptoName}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {crypto.name}
                </ThemedText>
                <ThemedText style={styles.cryptoSubtext}>
                  {asset} Wallet Address
                </ThemedText>
              </View>
            </View>

            {/* QR Code Section */}
            {loading ? (
              <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                  <AppLoadingIndicator size="large" />
                  <ThemedText style={styles.loadingText}>Generating address...</ThemedText>
                </View>
              </View>
            ) : walletAddress ? (
              <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                  <QRCode
                    value={walletAddress}
                    size={240}
                    color="#11181C"
                    backgroundColor="#FFFFFF"
                    logo={crypto.logo}
                    logoSize={50}
                    logoBackgroundColor="#FFFFFF"
                    logoMargin={10}
                    logoBorderRadius={8}
                  />
                </View>
                <ThemedText style={styles.qrInstruction}>
                  Scan this QR code to send {asset} to your wallet
                </ThemedText>
              </View>
            ) : (
              <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                  <MaterialIcons name="error-outline" size={48} color="#EF4444" />
                  <ThemedText style={styles.errorText}>Failed to load address</ThemedText>
                </View>
              </View>
            )}

            {/* Wallet Address Section */}
            {walletAddress && !loading && (
              <View style={styles.addressSection}>
                <ThemedText style={styles.addressLabel}>
                  Your {asset} Wallet Address
                </ThemedText>
                <View style={styles.addressContainer}>
                  <ThemedText 
                    style={styles.addressText}
                    numberOfLines={3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {walletAddress}
                  </ThemedText>
                </View>

                {/* XRP Destination Tag */}
                {asset === 'XRP' && destinationTag && (
                  <View style={styles.destinationTagSection}>
                    <View style={styles.destinationTagHeader}>
                      <MaterialIcons name="info-outline" size={18} color="#6B46C1" />
                      <ThemedText style={styles.destinationTagLabel}>
                        Destination Tag (Required)
                      </ThemedText>
                    </View>
                    <View style={styles.destinationTagContainer}>
                      <ThemedText 
                        style={styles.destinationTagText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {destinationTag}
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.destinationTagCopyButton}
                        onPress={async () => {
                          const ClipboardModule = await import('expo-clipboard');
                          await ClipboardModule.setStringAsync(destinationTag);
                          Alert.alert('Copied', 'Destination tag copied to clipboard');
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="content-copy" size={18} color="#6B46C1" />
                      </TouchableOpacity>
                    </View>
                    <ThemedText style={styles.destinationTagWarning}>
                      ⚠️ Always include this destination tag when sending XRP to this address. Missing or incorrect tags may result in loss of funds.
                    </ThemedText>
                  </View>
                )}

                {/* Demo Address Section - Only visible for demo users */}
                {user?.email?.toLowerCase() === 'demo@chaincola.com' && (
                  <View style={styles.demoSection}>
                    <View style={styles.demoHeader}>
                      <MaterialIcons name="science" size={18} color="#F59E0B" />
                      <ThemedText style={styles.demoTitle}>Demo Addresses for Testing</ThemedText>
                    </View>
                    <ThemedText style={styles.demoDescription}>
                      Use these addresses to test send/receive functionality:
                    </ThemedText>
                    {getAllDemoWallets()
                      .filter(w => w.symbol === asset || (asset === 'USDT' && w.symbol === 'ETH') || (asset === 'USDC' && w.symbol === 'ETH'))
                      .map((demoWallet) => (
                        <TouchableOpacity
                          key={demoWallet.symbol}
                          style={styles.demoAddressCard}
                          onPress={async () => {
                            const ClipboardModule = await import('expo-clipboard');
                            await ClipboardModule.setStringAsync(demoWallet.address);
                            Alert.alert('Copied', `Demo ${demoWallet.name} address copied to clipboard`);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.demoAddressInfo}>
                            <ThemedText style={styles.demoAddressLabel}>{demoWallet.name}</ThemedText>
                            <ThemedText style={styles.demoAddressValue} numberOfLines={1}>
                              {demoWallet.address}
                            </ThemedText>
                          </View>
                          <MaterialIcons name="content-copy" size={18} color="#F59E0B" />
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            )}

            {/* Network Info */}
            <View style={styles.networkSection}>
              <View style={styles.networkRow}>
                <ThemedText style={styles.networkLabel}>Network:</ThemedText>
                <ThemedText style={styles.networkValue}>
                  {asset === 'BTC' ? 'Bitcoin Mainnet' : 
                   asset === 'ETH' || asset === 'USDT' || asset === 'USDC' ? 'Ethereum (ERC-20)' :
                   asset === 'XRP' ? 'Ripple (XRP Ledger)' :
                   asset === 'SOL' ? 'Solana (SPL)' : 'Mainnet'}
                </ThemedText>
              </View>
              <View style={styles.networkRow}>
                <ThemedText style={styles.networkLabel}>Network Fee:</ThemedText>
                <ThemedText style={styles.networkValue}>Paid by sender</ThemedText>
              </View>
            </View>

            {/* Warning Section */}
            <View style={styles.warningSection}>
              <MaterialIcons name="info" size={20} color="#6B46C1" />
              <View style={styles.warningContent}>
                <ThemedText style={styles.warningTitle}>Important</ThemedText>
                <ThemedText style={styles.warningText}>
                  • Only send {asset} to this address{'\n'}
                  {asset === 'XRP' && destinationTag && '• Always include the destination tag when sending XRP\n'}
                  • Sending other cryptocurrencies may result in permanent loss{'\n'}
                  • Double-check the address before sending{'\n'}
                  • Transactions are irreversible
                </ThemedText>
              </View>
            </View>
          </ScrollView>

          {/* Bottom action bar (always visible when address is ready) */}
          {walletAddress && !loading && (
            <View style={styles.bottomActionBar}>
              <TouchableOpacity
                style={[styles.bottomActionButton, styles.bottomActionPrimary]}
                onPress={handleCopyAddress}
                activeOpacity={0.85}
              >
                <MaterialIcons name="content-copy" size={20} color="#FFFFFF" />
                <ThemedText style={[styles.bottomActionText, styles.bottomActionTextPrimary]}>
                  Copy
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomActionButton, styles.bottomActionSecondary]}
                onPress={handleShare}
                activeOpacity={0.85}
              >
                <MaterialIcons name="share" size={20} color="#6B46C1" />
                <ThemedText style={styles.bottomActionText}>Share</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ThemedView>
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  closeButton: {
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  bottomActionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  bottomActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  bottomActionPrimary: {
    backgroundColor: '#6B46C1',
  },
  bottomActionSecondary: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  bottomActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B46C1',
  },
  bottomActionTextPrimary: {
    color: '#FFFFFF',
  },
  cryptoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  cryptoLogo: {
    width: 56,
    height: 56,
  },
  cryptoInfo: {
    flex: 1,
  },
  cryptoName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cryptoSubtext: {
    fontSize: 14,
    opacity: 0.7,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
    width: 288,
    height: 288,
  },
  qrInstruction: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  addressSection: {
    marginBottom: 24,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.8,
  },
  addressContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  addressText: {
    fontSize: 14,
    color: '#11181C',
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 20,
  },
  destinationTagSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  destinationTagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  destinationTagLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  destinationTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 12,
  },
  destinationTagText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
    fontFamily: 'monospace',
  },
  destinationTagCopyButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  destinationTagWarning: {
    marginTop: 12,
    fontSize: 12,
    color: '#DC2626',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B46C1',
  },
  networkSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  networkLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  networkValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  warningSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6B46C1',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B46C1',
    opacity: 0.8,
  },
  demoSection: {
    marginTop: 24,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  demoDescription: {
    fontSize: 12,
    color: '#78350F',
    marginBottom: 12,
    lineHeight: 18,
  },
  demoAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  demoAddressInfo: {
    flex: 1,
    marginRight: 8,
  },
  demoAddressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  demoAddressValue: {
    fontSize: 11,
    color: '#78350F',
    fontFamily: 'monospace',
  },
});
