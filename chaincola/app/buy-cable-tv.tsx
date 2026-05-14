import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { purchaseCableTv } from '@/lib/utility-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


const providers = [
  { id: 'DSTV', name: 'DStv', color: '#1E3A8A', logo: require('@/assets/images/dstv.png') },
  { id: 'GOTV', name: 'GOtv', color: '#DC2626', logo: require('@/assets/images/gotv.png') },
  { id: 'STARTIMES', name: 'StarTimes', color: '#EA580C', logo: require('@/assets/images/startimes.png') },
];

const bouquets: Record<string, { name: string; price: number }[]> = {
  DSTV: [
    { name: 'DStv Padi', price: 2500 },
    { name: 'DStv Yanga', price: 4200 },
    { name: 'DStv Confam', price: 7400 },
    { name: 'DStv Compact', price: 12500 },
    { name: 'DStv Compact Plus', price: 19800 },
    { name: 'DStv Premium', price: 29500 },
  ],
  GOTV: [
    { name: 'GOtv Smallie', price: 1300 },
    { name: 'GOtv Jinja', price: 2250 },
    { name: 'GOtv Jolli', price: 3300 },
    { name: 'GOtv Max', price: 5700 },
  ],
  STARTIMES: [
    { name: 'Nova', price: 1200 },
    { name: 'Basic', price: 2100 },
    { name: 'Smart', price: 3000 },
    { name: 'Classic', price: 3800 },
    { name: 'Super', price: 6200 },
  ],
};

export default function BuyCableTvScreen() {
  const { user } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<'DSTV' | 'GOTV' | 'STARTIMES'>('DSTV');
  const [smartcardNumber, setSmartcardNumber] = useState('');
  const [selectedBouquet, setSelectedBouquet] = useState<{ name: string; price: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showBouquets, setShowBouquets] = useState(false);
  const [reference, setReference] = useState('');

  const handlePurchase = () => {
    if (!smartcardNumber.trim()) {
      alert('Please enter your smartcard/IUC number');
      return;
    }
    if (!selectedBouquet) {
      alert('Please select a package');
      return;
    }

    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    if (!user || !selectedBouquet) return;

    setShowConfirm(false);
    setProcessing(true);

    try {
      const result = await purchaseCableTv(user.id, {
        smartcard_number: smartcardNumber,
        provider: selectedProvider,
        bouquet: selectedBouquet.name,
        amount: selectedBouquet.price,
        currency: 'NGN',
      });

      if (!result.success) {
        throw new Error(result.error || 'Purchase failed');
      }

      setReference(result.reference || '');
      setShowSuccess(true);
      setSmartcardNumber('');
      setSelectedBouquet(null);
    } catch (error: any) {
      alert(error.message || 'Failed to purchase cable subscription. Please try again.');
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
          <ThemedText style={styles.headerTitle}>Cable TV</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Provider Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Select Provider</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.providerList}>
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerCard,
                    selectedProvider === provider.id && styles.providerCardSelected,
                  ]}
                  onPress={() => {
                    setSelectedProvider(provider.id as any);
                    setSelectedBouquet(null);
                  }}
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

        {/* Smartcard Number Input */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Smartcard/IUC Number</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="credit-card" size={20} color="#6B7280" />
            <TextInput
              style={styles.input}
              placeholder="Enter smartcard or IUC number"
              placeholderTextColor="#9CA3AF"
              value={smartcardNumber}
              onChangeText={setSmartcardNumber}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Bouquet Selection */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Select Package</ThemedText>
          <TouchableOpacity
            style={styles.bouquetSelector}
            onPress={() => setShowBouquets(true)}
          >
            <View style={styles.bouquetSelectorLeft}>
              <MaterialIcons name="tv" size={20} color="#6B7280" />
              <ThemedText style={styles.bouquetSelectorText}>
                {selectedBouquet
                  ? `${selectedBouquet.name} - ₦${selectedBouquet.price.toLocaleString()}`
                  : 'Choose a package'}
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
                  Purchase Subscription
                </ThemedText>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Bouquets Modal */}
      <Modal
        visible={showBouquets}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBouquets(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {selectedProvider} Packages
              </ThemedText>
              <TouchableOpacity onPress={() => setShowBouquets(false)}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bouquetsList}>
              {bouquets[selectedProvider]?.map((bouquet, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.bouquetItem,
                    selectedBouquet?.name === bouquet.name && styles.bouquetItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedBouquet(bouquet);
                    setShowBouquets(false);
                  }}
                >
                  <View style={styles.bouquetItemLeft}>
                    <ThemedText style={styles.bouquetName}>{bouquet.name}</ThemedText>
                    <ThemedText style={styles.bouquetPeriod}>Monthly</ThemedText>
                  </View>
                  <ThemedText style={styles.bouquetPrice}>
                    ₦{bouquet.price.toLocaleString()}
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
                <ThemedText style={styles.confirmLabel}>Provider:</ThemedText>
                <ThemedText style={styles.confirmValue}>{selectedProvider}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Smartcard:</ThemedText>
                <ThemedText style={styles.confirmValue}>{smartcardNumber}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Package:</ThemedText>
                <ThemedText style={styles.confirmValue}>{selectedBouquet?.name}</ThemedText>
              </View>
              <View style={styles.confirmRow}>
                <ThemedText style={styles.confirmLabel}>Amount:</ThemedText>
                <ThemedText style={styles.confirmValue}>
                  ₦{selectedBouquet?.price.toLocaleString()}
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
              Your subscription has been activated
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
                colors={['#F59E0B', '#D97706']}
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
  providerInitial: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  providerName: {
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
  bouquetSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bouquetSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bouquetSelectorText: {
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
  bouquetsList: {
    maxHeight: 400,
  },
  bouquetItem: {
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
  bouquetItemSelected: {
    borderColor: '#6B46C1',
    backgroundColor: '#F3E8FF',
  },
  bouquetItemLeft: {
    flex: 1,
  },
  bouquetName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  bouquetPeriod: {
    fontSize: 14,
    color: '#6B7280',
  },
  bouquetPrice: {
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
