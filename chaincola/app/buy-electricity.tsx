import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { purchaseElectricity } from '@/lib/utility-service';

const providers = [
  { id: 'IKEDC', name: 'Ikeja Electric', color: '#EF4444', logo: require('@/assets/images/IKEDC.png') },
  { id: 'EKEDC', name: 'Eko Electric', color: '#F59E0B', logo: require('@/assets/images/EKEDC.png') },
  { id: 'IBEDC', name: 'Ibadan Electric', color: '#10B981', logo: require('@/assets/images/IBEDC.png') },
  { id: 'KEDCO', name: 'Kano Electric', color: '#3B82F6', logo: require('@/assets/images/KEDCO.png') },
  { id: 'PHEDC', name: 'Port Harcourt Electric', color: '#8B5CF6', logo: require('@/assets/images/PHEDC.png') },
  { id: 'JED', name: 'Jos Electric', color: '#EC4899', logo: require('@/assets/images/JED.png') },
  { id: 'AEDC', name: 'Abuja Electric', color: '#14B8A6', logo: require('@/assets/images/AEDC.png') },
  { id: 'BEDC', name: 'Benin Electric', color: '#F97316', logo: require('@/assets/images/BEDC.png') },
  { id: 'EEDC', name: 'Enugu Electric', color: '#06B6D4', logo: require('@/assets/images/EEDC.png') },
];

export default function BuyElectricityScreen() {
  const { user } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState('IKEDC');
  const [meterNumber, setMeterNumber] = useState('');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');

  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  const handlePurchase = () => {
    if (!meterNumber.trim()) {
      alert('Please enter your meter number');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) < 1000) {
      alert('Minimum amount is ₦1,000');
      return;
    }
    if (parseFloat(amount) > 100000) {
      alert('Maximum amount is ₦100,000');
      return;
    }

    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    if (!user) return;

    setShowConfirm(false);
    setProcessing(true);

    try {
      const result = await purchaseElectricity(user.id, {
        meter_number: meterNumber,
        meter_type: meterType,
        provider: selectedProvider,
        amount: parseFloat(amount),
        currency: 'NGN',
      });

      if (!result.success) {
        throw new Error(result.error || 'Purchase failed');
      }

      setReference(result.reference || '');
      setToken(result.transaction_id?.substring(0, 20).toUpperCase() || '');
      setShowSuccess(true);
      setMeterNumber('');
      setAmount('');
    } catch (error: any) {
      alert(error.message || 'Failed to purchase electricity. Please try again.');
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
          <ThemedText style={styles.headerTitle}>Buy Electricity</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Provider Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Select Provider (DISCO)</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.providerList}>
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerCard,
                    selectedProvider === provider.id && styles.providerCardSelected,
                  ]}
                  onPress={() => setSelectedProvider(provider.id)}
                >
                  <View
                    style={[
                      styles.providerIcon,
                      { backgroundColor: provider.color + '20' },
                    ]}
                  >
                    <Image source={provider.logo} style={styles.providerLogo} resizeMode="contain" />
                  </View>
                  <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                  {selectedProvider === provider.id && (
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color="#6B46C1"
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Meter Type */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Meter Type</ThemedText>
          <View style={styles.meterTypeContainer}>
            <TouchableOpacity
              style={[
                styles.meterTypeButton,
                meterType === 'prepaid' && styles.meterTypeButtonSelected,
              ]}
              onPress={() => setMeterType('prepaid')}
            >
              <ThemedText
                style={[
                  styles.meterTypeText,
                  meterType === 'prepaid' && styles.meterTypeTextSelected,
                ]}
              >
                Prepaid
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.meterTypeButton,
                meterType === 'postpaid' && styles.meterTypeButtonSelected,
              ]}
              onPress={() => setMeterType('postpaid')}
            >
              <ThemedText
                style={[
                  styles.meterTypeText,
                  meterType === 'postpaid' && styles.meterTypeTextSelected,
                ]}
              >
                Postpaid
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Meter Number Input */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Meter Number</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="electric-meter" size={20} color="#6B7280" />
            <TextInput
              style={styles.input}
              placeholder="Enter meter number"
              placeholderTextColor="#9CA3AF"
              value={meterNumber}
              onChangeText={setMeterNumber}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Amount Input */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Amount (₦)</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="attach-money" size={20} color="#6B7280" />
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              placeholderTextColor="#9CA3AF"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
          </View>
          
          {/* Quick Amounts */}
          <View style={styles.quickAmounts}>
            {quickAmounts.map((quickAmount) => (
              <TouchableOpacity
                key={quickAmount}
                style={styles.quickAmountButton}
                onPress={() => setAmount(quickAmount.toString())}
              >
                <ThemedText style={styles.quickAmountText}>
                  ₦{quickAmount.toLocaleString()}
                </ThemedText>
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
                <ThemedText style={styles.purchaseButtonText}>
                  Purchase Electricity
                </ThemedText>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <MaterialIcons name="info" size={20} color="#6B46C1" />
          <ThemedText style={styles.infoText}>
            Tokens are delivered instantly after payment. Please ensure your meter number is correct.
          </ThemedText>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirm}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <MaterialIcons name="info" size={48} color="#6B46C1" />
            <ThemedText style={styles.confirmTitle}>Confirm Purchase</ThemedText>
            <View style={styles.confirmDetails}>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Provider:</ThemedText>
                <ThemedText style={styles.confirmValue}>
                  {providers.find(p => p.id === selectedProvider)?.name}
                </ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Meter Type:</ThemedText>
                <ThemedText style={styles.confirmValue}>
                  {meterType.charAt(0).toUpperCase() + meterType.slice(1)}
                </ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Meter Number:</ThemedText>
                <ThemedText style={styles.confirmValue}>{meterNumber}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Amount:</ThemedText>
                <ThemedText style={styles.confirmValue}>
                  ₦{parseFloat(amount).toLocaleString()}
                </ThemedText>
              </View>
            </View>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowConfirm(false)}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmPurchase}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.confirmButtonGradient}
                >
                  <ThemedText style={styles.confirmButtonText}>Confirm</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccess}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowSuccess(false);
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <MaterialIcons name="check-circle" size={60} color="#10B981" />
            </View>
            <ThemedText style={styles.successTitle}>Purchase Successful!</ThemedText>
            <ThemedText style={styles.successMessage}>
              Your token has been generated
            </ThemedText>
            <View style={styles.tokenContainer}>
              <ThemedText style={styles.tokenLabel}>Token:</ThemedText>
              <ThemedText style={styles.tokenValue}>{token}</ThemedText>
            </View>
            <View style={styles.referenceContainer}>
              <ThemedText style={styles.referenceLabel}>Reference:</ThemedText>
              <ThemedText style={styles.referenceValue}>{reference}</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                setShowSuccess(false);
                router.back();
              }}
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626']}
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
    flexGrow: 1,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  providerList: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 20,
  },
  providerCard: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    width: 120,
  },
  providerCardSelected: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3E8FF',
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  providerLogo: {
    width: 32,
    height: 32,
  },
  providerName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  checkIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  meterTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  meterTypeButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meterTypeButtonSelected: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3E8FF',
  },
  meterTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  meterTypeTextSelected: {
    color: '#6B46C1',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickAmountButton: {
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
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
  confirmModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 20,
  },
  confirmDetails: {
    width: '100%',
    marginBottom: 24,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  confirmLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  successIconContainer: {
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
  tokenContainer: {
    backgroundColor: '#F3E8FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
  },
  tokenLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  tokenValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#6B46C1',
    letterSpacing: 2,
  },
  referenceContainer: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
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
    width: '100%',
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
