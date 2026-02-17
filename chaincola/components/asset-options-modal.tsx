import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from './themed-text';

type Props = {
  visible: boolean;
  asset?: { id: string; name?: string; symbol?: string } | null;
  onClose: () => void;
  onSend: (assetId: string) => void;
  onReceive: (assetId: string) => void;
  onSell?: (assetId: string) => void;
  onSwap?: (assetId: string) => void;
  onViewTransactions: (assetId: string) => void;
};

export default function AssetOptionsModal({ visible, asset, onClose, onSend, onReceive, onSell, onSwap, onViewTransactions }: Props) {
  const assetName = asset?.name || asset?.symbol || 'Asset';
  const id = asset?.id || '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{assetName}</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={20} color="#6B46C1" />
            </TouchableOpacity>
          </View>

          <ThemedText style={styles.subtitle}>Choose an action for {assetName}</ThemedText>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionRow} onPress={() => { onSend(id); onClose(); }} activeOpacity={0.8}>
              <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                <MaterialIcons name="send" size={22} color="#6B46C1" />
              </View>
              <ThemedText style={styles.actionLabel}>Send</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={() => { onReceive(id); onClose(); }} activeOpacity={0.8}>
              <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                <MaterialIcons name="call-received" size={22} color="#6B46C1" />
              </View>
              <ThemedText style={styles.actionLabel}>Receive</ThemedText>
            </TouchableOpacity>

            {onSell && (
              <TouchableOpacity style={styles.actionRow} onPress={() => { onSell(id); onClose(); }} activeOpacity={0.8}>
                <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialIcons name="sell" size={22} color="#6B46C1" />
                </View>
                <ThemedText style={styles.actionLabel}>Sell</ThemedText>
              </TouchableOpacity>
            )}

            {onSwap && (
              <TouchableOpacity style={styles.actionRow} onPress={() => { onSwap(id); onClose(); }} activeOpacity={0.8}>
                <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialIcons name="swap-horiz" size={22} color="#6B46C1" />
                </View>
                <ThemedText style={styles.actionLabel}>Swap</ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionRow} onPress={() => { onViewTransactions(id); onClose(); }} activeOpacity={0.8}>
              <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                <MaterialIcons name="receipt-long" size={22} color="#6B46C1" />
              </View>
              <ThemedText style={styles.actionLabel}>View Transactions</ThemedText>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.8}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700' },
  closeButton: { padding: 6 },
  subtitle: { color: '#6B7280', marginTop: 8, marginBottom: 12 },
  actions: { marginTop: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 16, fontWeight: '600' },
  cancel: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: '#6B7280', fontWeight: '600' },
});
