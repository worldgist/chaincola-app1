import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { purchaseData } from '@/lib/utility-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


interface DataPlan {
  planId: string;
  size: string;
  price: number;
  validity: string;
}

const networks = [
  { id: 'MTN', name: 'MTN', color: '#FFCB05', logo: require('@/assets/images/mtn.png') },
  { id: 'Airtel', name: 'Airtel', color: '#ED1C24', logo: require('@/assets/images/airtel.png') },
  { id: 'Glo', name: 'Glo', color: '#8CC63F', logo: require('@/assets/images/glo.png') },
  { id: '9mobile', name: '9mobile', color: '#006F3F', logo: require('@/assets/images/9mobile.png') },
];

// Mock data plans for each network
const dataPlansData: Record<string, DataPlan[]> = {
  MTN: [
    { planId: 'mtn_1gb', size: '1GB', price: 300, validity: '30 days' },
    { planId: 'mtn_2gb', size: '2GB', price: 600, validity: '30 days' },
    { planId: 'mtn_3gb', size: '3GB', price: 850, validity: '30 days' },
    { planId: 'mtn_5gb', size: '5GB', price: 1400, validity: '30 days' },
    { planId: 'mtn_10gb', size: '10GB', price: 2700, validity: '30 days' },
  ],
  Airtel: [
    { planId: 'airtel_1gb', size: '1GB', price: 320, validity: '30 days' },
    { planId: 'airtel_2gb', size: '2GB', price: 620, validity: '30 days' },
    { planId: 'airtel_3gb', size: '3GB', price: 900, validity: '30 days' },
    { planId: 'airtel_5gb', size: '5GB', price: 1450, validity: '30 days' },
    { planId: 'airtel_10gb', size: '10GB', price: 2800, validity: '30 days' },
  ],
  Glo: [
    { planId: 'glo_1gb', size: '1GB', price: 310, validity: '30 days' },
    { planId: 'glo_2gb', size: '2GB', price: 610, validity: '30 days' },
    { planId: 'glo_3gb', size: '3GB', price: 870, validity: '30 days' },
    { planId: 'glo_5gb', size: '5GB', price: 1420, validity: '30 days' },
    { planId: 'glo_10gb', size: '10GB', price: 2750, validity: '30 days' },
  ],
  '9mobile': [
    { planId: '9mobile_1gb', size: '1GB', price: 330, validity: '30 days' },
    { planId: '9mobile_2gb', size: '2GB', price: 640, validity: '30 days' },
    { planId: '9mobile_3gb', size: '3GB', price: 920, validity: '30 days' },
    { planId: '9mobile_5gb', size: '5GB', price: 1480, validity: '30 days' },
    { planId: '9mobile_10gb', size: '10GB', price: 2850, validity: '30 days' },
  ],
};

export default function BuyDataScreen() {
  const { user } = useAuth();
  const [selectedNetwork, setSelectedNetwork] = useState<'MTN' | 'Airtel' | 'Glo' | '9mobile'>('MTN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [reference, setReference] = useState('');

  useEffect(() => {
    // Load data plans for selected network
    setDataPlans(dataPlansData[selectedNetwork] || []);
    setSelectedPlan(null);
  }, [selectedNetwork]);

  const handlePurchase = () => {
    if (!phoneNumber.trim()) {
      alert('Please enter a phone number');
      return;
    }
    if (!selectedPlan) {
      alert('Please select a data plan');
      return;
    }

    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    if (!user || !selectedPlan) return;

    setShowConfirm(false);
    setProcessing(true);

    try {
      const result = await purchaseData(user.id, {
        phone_number: phoneNumber,
        network: selectedNetwork,
        data_plan: selectedPlan.planId,
        amount: selectedPlan.price,
        currency: 'NGN',
      });

      if (!result.success) {
        throw new Error(result.error || 'Purchase failed');
      }

      setReference(result.reference || '');
      setShowSuccess(true);
      setPhoneNumber('');
      setSelectedPlan(null);
    } catch (error: any) {
      alert(error.message || 'Failed to purchase data. Please try again.');
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
          <ThemedText style={styles.headerTitle}>Buy Data</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Network Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Select Network</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.networkList}>
              {networks.map((network) => (
                <TouchableOpacity
                  key={network.id}
                  style={[
                    styles.networkCard,
                    selectedNetwork === network.id && styles.networkCardSelected,
                  ]}
                  onPress={() => setSelectedNetwork(network.id as any)}
                >
                  <View
                    style={[
                      styles.networkIcon,
                      { backgroundColor: network.color + '20' },
                    ]}
                  >
                    <Image source={network.logo} style={styles.networkLogo} resizeMode="contain" />
                  </View>
                  <ThemedText style={styles.networkName}>{network.name}</ThemedText>
                  {selectedNetwork === network.id && (
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

        {/* Phone Number Input */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Phone Number</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="phone" size={20} color="#6B7280" />
            <TextInput
              style={styles.input}
              placeholder="Enter phone number"
              placeholderTextColor="#9CA3AF"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={11}
            />
          </View>
        </View>

        {/* Data Plan Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Select Data Plan</ThemedText>
          <TouchableOpacity
            style={styles.planSelector}
            onPress={() => setShowPlans(true)}
          >
            <View style={styles.planSelectorLeft}>
              <MaterialIcons name="data-usage" size={20} color="#6B7280" />
              <ThemedText style={styles.planSelectorText}>
                {selectedPlan
                  ? `${selectedPlan.size} - ₦${selectedPlan.price.toLocaleString()}`
                  : 'Choose a data plan'}
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
          </TouchableOpacity>
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
              <AppLoadingIndicator size="small" variant="onPrimary" />
            ) : (
              <>
                <MaterialIcons name="shopping-cart" size={20} color="#FFFFFF" />
                <ThemedText style={styles.purchaseButtonText}>
                  Purchase Data
                </ThemedText>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Data Plans Modal */}
      <Modal
        visible={showPlans}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlans(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {selectedNetwork} Data Plans
              </ThemedText>
              <TouchableOpacity onPress={() => setShowPlans(false)}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.plansList}>
              {dataPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.planId}
                  style={[
                    styles.planItem,
                    selectedPlan?.planId === plan.planId && styles.planItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedPlan(plan);
                    setShowPlans(false);
                  }}
                >
                  <View style={styles.planItemLeft}>
                    <ThemedText style={styles.planSize}>{plan.size}</ThemedText>
                    <ThemedText style={styles.planValidity}>{plan.validity}</ThemedText>
                  </View>
                  <ThemedText style={styles.planPrice}>
                    ₦{plan.price.toLocaleString()}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                <ThemedText style={styles.confirmLabel}>Network:</ThemedText>
                <ThemedText style={styles.confirmValue}>{selectedNetwork}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Phone:</ThemedText>
                <ThemedText style={styles.confirmValue}>{phoneNumber}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Plan:</ThemedText>
                <ThemedText style={styles.confirmValue}>{selectedPlan?.size}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Amount:</ThemedText>
                <ThemedText style={styles.confirmValue}>
                  ₦{selectedPlan?.price.toLocaleString()}
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
              Data has been sent to {phoneNumber}
            </ThemedText>
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
                colors={['#3B82F6', '#2563EB']}
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
  networkList: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 20,
  },
  networkCard: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    width: 120,
  },
  networkCardSelected: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3E8FF',
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
  networkInitial: {
    fontSize: 20,
    fontWeight: 'bold',
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
    paddingVertical: 12,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#11181C',
  },
  planSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  planSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planSelectorText: {
    fontSize: 16,
    color: '#11181C',
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
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
  },
  plansList: {
    maxHeight: 400,
  },
  planItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planItemSelected: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3E8FF',
  },
  planItemLeft: {
    flex: 1,
  },
  planSize: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  planValidity: {
    fontSize: 14,
    color: '#6B7280',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B46C1',
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
