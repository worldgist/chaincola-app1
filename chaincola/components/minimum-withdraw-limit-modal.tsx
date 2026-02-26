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

interface MinimumWithdrawLimitModalProps {
  visible: boolean;
  onClose: () => void;
  minimumAmount: number;
  enteredAmount?: string;
}

export default function MinimumWithdrawLimitModal({
  visible,
  onClose,
  minimumAmount,
  enteredAmount,
}: MinimumWithdrawLimitModalProps) {
  const formattedMin = minimumAmount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
            <MaterialIcons name="info-outline" size={64} color="#F59E0B" />
          </View>

          <ThemedText
            style={styles.modalTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Withdraw Failed
          </ThemedText>

          <ThemedText
            style={styles.modalMessage}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Amount is below the minimum withdrawal limit.
          </ThemedText>

          <View style={styles.balanceContainer}>
            <View style={styles.balanceRow}>
              <ThemedText style={styles.balanceLabel}>Minimum Withdrawal:</ThemedText>
              <ThemedText style={styles.balanceValue}>₦{formattedMin}</ThemedText>
            </View>
            {enteredAmount && parseFloat(enteredAmount) > 0 && (
              <View style={styles.balanceRow}>
                <ThemedText style={styles.balanceLabel}>Your Amount:</ThemedText>
                <ThemedText style={[styles.balanceValue, styles.enteredAmount]}>
                  ₦{parseFloat(enteredAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              </View>
            )}
          </View>

          <ThemedText style={styles.noteText}>
            Please enter an amount of at least ₦{formattedMin} to proceed with your withdrawal.
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
    shadowOffset: { width: 0, height: 8 },
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
  enteredAmount: {
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
