import React from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from './themed-text';

interface InsufficientBalanceModalProps {
  visible: boolean;
  onClose: () => void;
  availableBalance?: string;
  requiredAmount?: string;
  cryptoSymbol?: string;
  currency?: 'crypto' | 'fiat'; // 'crypto' for crypto balances, 'fiat' for NGN
  errorMessage?: string;
}

export default function InsufficientBalanceModal({
  visible,
  onClose,
  availableBalance,
  requiredAmount,
  cryptoSymbol = 'ETH',
  currency = 'crypto',
  errorMessage,
}: InsufficientBalanceModalProps) {
  // Parse error message to extract balance information if not provided
  const parseErrorMessage = () => {
    if (!errorMessage) return null;
    
    // Try to extract available and required amounts from error message
    // Format: "Insufficient balance. Available: 0.00088282 ETH, Required: 0.00166454 ETH (including gas fee)"
    // Or: "Insufficient balance. Available: ₦1000, Required: ₦2000"
    const availableMatch = errorMessage.match(/Available:\s*([\d.,]+)\s*([₦\w]+)/i);
    const requiredMatch = errorMessage.match(/Required:\s*([\d.,]+)\s*([₦\w]+)/i);
    
    return {
      available: availableMatch ? { amount: availableMatch[1], symbol: availableMatch[2] } : null,
      required: requiredMatch ? { amount: requiredMatch[1], symbol: requiredMatch[2] } : null,
    };
  };

  const parsedInfo = parseErrorMessage();
  const displayAvailable = availableBalance || parsedInfo?.available?.amount || '0';
  const displayRequired = requiredAmount || parsedInfo?.required?.amount || '0';
  const displaySymbol = currency === 'fiat' 
    ? 'NGN' 
    : (cryptoSymbol || parsedInfo?.available?.symbol || parsedInfo?.required?.symbol || 'ETH');
  
  // Format numbers based on currency type
  const formatAmount = (value: string | number): string => {
    const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (currency === 'fiat') {
      return numValue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      return numValue.toFixed(8);
    }
  };
  
  const formatShortage = (): string => {
    const available = parseFloat(displayAvailable.toString().replace(/,/g, ''));
    const required = parseFloat(displayRequired.toString().replace(/,/g, ''));
    const shortage = required - available;
    
    if (currency === 'fiat') {
      return `₦${shortage.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `${shortage.toFixed(8)} ${displaySymbol}`;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="error-outline" size={64} color="#EF4444" />
          </View>
          
          <ThemedText 
            style={styles.modalTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Insufficient Balance
          </ThemedText>
          
          <ThemedText 
            style={styles.modalMessage}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {currency === 'fiat' 
              ? `You don't have enough NGN to complete this transaction.`
              : `You don't have enough ${displaySymbol} to complete this transaction.`}
          </ThemedText>

          <View style={styles.balanceContainer}>
            <View style={styles.balanceRow}>
              <ThemedText style={styles.balanceLabel}>Available Balance:</ThemedText>
              <ThemedText style={styles.balanceValue}>
                {currency === 'fiat' ? '₦' : ''}{formatAmount(displayAvailable)}{currency === 'crypto' ? ` ${displaySymbol}` : ''}
              </ThemedText>
            </View>
            
            <View style={styles.balanceRow}>
              <ThemedText style={styles.balanceLabel}>Required Amount:</ThemedText>
              <ThemedText style={[styles.balanceValue, styles.requiredAmount]}>
                {currency === 'fiat' ? '₦' : ''}{formatAmount(displayRequired)}{currency === 'crypto' ? ` ${displaySymbol}` : ''}
              </ThemedText>
            </View>
            
            <View style={styles.balanceDivider} />
            
            <View style={styles.balanceRow}>
              <ThemedText style={styles.shortageLabel}>Shortage:</ThemedText>
              <ThemedText style={styles.shortageValue}>
                {formatShortage()}
              </ThemedText>
            </View>
          </View>

          <ThemedText style={styles.noteText}>
            {currency === 'fiat' 
              ? 'Please fund your wallet with sufficient NGN balance to complete this transaction.'
              : 'Note: The required amount includes network gas fees. Please ensure you have sufficient balance before sending.'}
          </ThemedText>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#6B46C1', '#9333EA']}
              style={styles.closeButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText 
                style={styles.closeButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                OK
              </ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  iconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 22,
  },
  balanceContainer: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  requiredAmount: {
    color: '#EF4444',
  },
  balanceDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  shortageLabel: {
    fontSize: 15,
    color: '#11181C',
    fontWeight: '600',
  },
  shortageValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
  noteText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 16,
  },
  closeButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  closeButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

