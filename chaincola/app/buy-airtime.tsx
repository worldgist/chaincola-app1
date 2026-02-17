import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { purchaseAirtime } from '@/lib/utility-service';

const networks = [
  { id: 'MTN', name: 'MTN', color: '#FFCB05', logo: require('@/assets/images/mtn.png') },
  { id: 'Airtel', name: 'Airtel', color: '#ED1C24', logo: require('@/assets/images/airtel.png') },
  { id: 'Glo', name: 'Glo', color: '#8CC63F', logo: require('@/assets/images/glo.png') },
  { id: '9mobile', name: '9mobile', color: '#006F3F', logo: require('@/assets/images/9mobile.png') },
];

export default function BuyAirtimeScreen() {
  const { user } = useAuth();
  const [selectedNetwork, setSelectedNetwork] = useState<'MTN' | 'Airtel' | 'Glo' | '9mobile'>('MTN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reference, setReference] = useState('');

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  const handlePurchase = () => {
    if (!phoneNumber.trim()) {
      alert('Please enter a phone number');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) < 50) {
      alert('Minimum amount is ₦50');
      return;
    }
    if (parseFloat(amount) > 50000) {
      alert('Maximum amount is ₦50,000');
      return;
    }

    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    setShowConfirm(false);
    setProcessing(true);

    try {
      const result = await purchaseAirtime(user?.id || '', {
        phone_number: phoneNumber,
        network: selectedNetwork,
        amount: parseFloat(amount),
        currency: 'NGN',
      });

      if (result.success) {
        setReference(result.reference || '');
        setShowSuccess(true);
        setPhoneNumber('');
        setAmount('');
      } else {
        alert(result.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Airtime purchase error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Buy Airtime</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Network Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.label}>Select Network</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.networksList}>
              {networks.map((network) => (
                <TouchableOpacity
                  key={network.id}
                  style={[
                    styles.networkCard,
                    selectedNetwork === network.id && styles.networkCardActive,
                  ]}
                  onPress={() => setSelectedNetwork(network.id as any)}
                >
                  <View style={[styles.networkIcon, { backgroundColor: network.color + '20' }]}>
                    <Image source={network.logo} style={styles.networkLogo} resizeMode="contain" />
                  </View>
                  <ThemedText style={styles.networkName}>{network.name}</ThemedText>
                  {selectedNetwork === network.id && (
                    <MaterialIcons name="check-circle" size={20} color="#6B46C1" style={styles.checkIcon} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Phone Number */}
        <View style={styles.section}>
          <ThemedText style={styles.label}>Phone Number</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="phone" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              placeholder="08012345678"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={11}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Amount */}
        <View style={styles.section}>
          <ThemedText style={styles.label}>Amount</ThemedText>
          <View style={styles.inputContainer}>
            <ThemedText style={styles.currencySymbol}>₦</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          
          {/* Quick Amount Buttons */}
          <View style={styles.quickAmounts}>
            {quickAmounts.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={styles.quickAmountButton}
                onPress={() => setAmount(amt.toString())}
              >
                <ThemedText style={styles.quickAmountText}>₦{amt}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Purchase Button */}
        <TouchableOpacity
          style={[styles.purchaseButton, processing && styles.purchaseButtonDisabled]}
          onPress={handlePurchase}
          disabled={processing}
        >
          <LinearGradient
            colors={processing ? ['#9CA3AF', '#6B7280'] : ['#6B46C1', '#9333EA']}
            style={styles.purchaseButtonGradient}
          >
            {processing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="shopping-cart" size={20} color="#FFFFFF" />
                <ThemedText style={styles.purchaseButtonText}>Purchase Airtime</ThemedText>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={20} color="#6B46C1" />
          <ThemedText style={styles.infoText}>
            Airtime will be delivered instantly to the phone number provided.
          </ThemedText>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Confirm Purchase</ThemedText>
            
            <View style={styles.modalRow}>
              <ThemedText style={styles.modalLabel}>Network:</ThemedText>
              <ThemedText style={styles.modalValue}>{selectedNetwork}</ThemedText>
            </View>
            
            <View style={styles.modalRow}>
              <ThemedText style={styles.modalLabel}>Phone Number:</ThemedText>
              <ThemedText style={styles.modalValue}>{phoneNumber}</ThemedText>
            </View>
            
            <View style={styles.modalRow}>
              <ThemedText style={styles.modalLabel}>Amount:</ThemedText>
              <ThemedText style={styles.modalValue}>₦{parseFloat(amount || '0').toLocaleString()}</ThemedText>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirm(false)}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmPurchase}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.modalConfirmGradient}
                >
                  <ThemedText style={styles.modalConfirmText}>Confirm</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={60} color="#6B46C1" />
            </View>
            
            <ThemedText style={styles.successTitle}>Purchase Successful!</ThemedText>
            <ThemedText style={styles.successMessage}>
              Airtime has been sent to {phoneNumber}
            </ThemedText>
            
            {reference && (
              <View style={styles.referenceBox}>
                <ThemedText style={styles.referenceLabel}>Reference:</ThemedText>
                <ThemedText style={styles.referenceValue}>{reference}</ThemedText>
              </View>
            )}

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                setShowSuccess(false);
                router.back();
              }}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.doneButtonGradient}
              >
                <ThemedText style={styles.doneButtonText}>Done</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
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
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  networksList: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 20,
  },
  networkCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    width: 120,
    alignItems: 'center',
  },
  networkCardActive: {
    borderColor: '#6B46C1',
    backgroundColor: '#ECFDF5',
  },
  networkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  networkLogo: {
    width: 32,
    height: 32,
  },
  networkName: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickAmountButton: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B46C1',
  },
  purchaseButton: {
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3E8FF',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B46C1',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalConfirmGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  referenceBox: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  referenceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  referenceValue: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  doneButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  doneButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
