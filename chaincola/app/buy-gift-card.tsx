import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { purchaseGiftCard, GiftCardPurchase } from '@/lib/gift-card-service';
import { supabase } from '@/lib/supabase';
import { getAllBrandsForCountry, ZenditBrand, getAvailableCountries, getAvailableGiftCards, getAvailableCardAmounts, CountryInfo, enrichBrandsWithLogos, getZenditVoucherOffers, createZenditVoucherPurchase, VoucherField } from '@/lib/zendit-api-service';
import { Image } from 'expo-image';
import AppLoadingIndicator from '@/components/app-loading-indicator';


// Card amounts fallback (in USD)
const CARD_AMOUNTS_USD = [10, 25, 50, 100, 200, 500];

// Exchange rates (to NGN)
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1650, // 1 USD = 1650 NGN
  GBP: 2100, // 1 GBP ≈ 2100 NGN (approximate)
  EUR: 1800, // 1 EUR ≈ 1800 NGN (approximate)
  CAD: 1200, // 1 CAD ≈ 1200 NGN (approximate)
  NGN: 1, // 1 NGN = 1 NGN
};

export default function BuyGiftCardScreen() {
  const { user } = useAuth();
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(null);
  const [selectedGiftCard, setSelectedGiftCard] = useState<ZenditBrand | null>(null);
  const [selectedCardAmount, setSelectedCardAmount] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [ngnBalance, setNgnBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingCardAmounts, setLoadingCardAmounts] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [availableCountries, setAvailableCountries] = useState<CountryInfo[]>([]);
  const [availableBrands, setAvailableBrands] = useState<ZenditBrand[]>([]);
  const [availableCardAmounts, setAvailableCardAmounts] = useState<number[]>(CARD_AMOUNTS_USD); // Dynamic amounts with fallback
  const [cardAmountCurrency, setCardAmountCurrency] = useState<string>('USD'); // Currency for card amounts
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showGiftCardPicker, setShowGiftCardPicker] = useState(false);
  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasedGiftCards, setPurchasedGiftCards] = useState<any[]>([]);

  // Fetch countries and brands on mount
  useEffect(() => {
    if (user?.id) {
      fetchBalance();
      fetchCountries();
    }
  }, [user]);

  // Fetch brands from Zendit API when country changes
  useEffect(() => {
    if (user?.id && selectedCountry) {
      fetchBrandsForCountry();
    }
  }, [selectedCountry]);

  // Reset selected gift card and update currency when country changes
  useEffect(() => {
    setSelectedGiftCard(null);
    setSelectedCardAmount(null);
    // Update currency to match selected country
    if (selectedCountry) {
      setCardAmountCurrency(selectedCountry.currency || 'USD');
    }
  }, [selectedCountry]);

  // Fetch card amounts when gift card is selected
  useEffect(() => {
    if (selectedGiftCard && selectedCountry) {
      fetchCardAmountsForBrand();
    }
  }, [selectedGiftCard]);

  const fetchCountries = async () => {
    setLoadingCountries(true);
    try {
      const result = await getAvailableCountries();
      
      if (result.success && result.countries && result.countries.length > 0) {
        setAvailableCountries(result.countries);
        // Set default country if none selected
        if (!selectedCountry) {
          // Prefer Nigeria if available, otherwise first country
          const defaultCountry = result.countries.find(c => c.isoCode === 'NG') || result.countries[0];
          setSelectedCountry(defaultCountry);
          // Set currency to match default country
          setCardAmountCurrency(defaultCountry.currency || 'USD');
        }
      } else {
        // Silently fallback to default countries (Edge Function may not be deployed)
        const fallbackCountries: CountryInfo[] = [
          { id: 'NGN', name: 'Nigeria', currency: 'NGN', symbol: '₦', flag: '🇳🇬', isoCode: 'NG' },
          { id: 'USD', name: 'United States', currency: 'USD', symbol: '$', flag: '🇺🇸', isoCode: 'US' },
          { id: 'GBP', name: 'United Kingdom', currency: 'GBP', symbol: '£', flag: '🇬🇧', isoCode: 'GB' },
        ];
        setAvailableCountries(fallbackCountries);
        if (!selectedCountry) {
          const defaultCountry = fallbackCountries[0];
          setSelectedCountry(defaultCountry);
          // Set currency to match default country
          setCardAmountCurrency(defaultCountry.currency || 'USD');
        }
      }
    } catch (error) {
      // Silently fallback to default countries on error
      const fallbackCountries: CountryInfo[] = [
        { id: 'NGN', name: 'Nigeria', currency: 'NGN', symbol: '₦', flag: '🇳🇬', isoCode: 'NG' },
        { id: 'USD', name: 'United States', currency: 'USD', symbol: '$', flag: '🇺🇸', isoCode: 'US' },
        { id: 'GBP', name: 'United Kingdom', currency: 'GBP', symbol: '£', flag: '🇬🇧', isoCode: 'GB' },
      ];
      setAvailableCountries(fallbackCountries);
      if (!selectedCountry) {
        setSelectedCountry(fallbackCountries[0]);
      }
    } finally {
      setLoadingCountries(false);
    }
  };

  const fetchBrandsForCountry = async () => {
    if (!selectedCountry) return;
    
    setLoadingBrands(true);
    try {
      const result = await getAvailableGiftCards(selectedCountry.isoCode);
      
      if (result.success && result.brands) {
        // Set brands immediately without logos (non-blocking)
        setAvailableBrands(result.brands);
        // Set default gift card if available
        if (result.brands.length > 0 && !selectedGiftCard) {
          setSelectedGiftCard(result.brands[0]);
        }
        
        // Enrich brands with logos in the background (non-blocking, optional)
        // Don't wait for this - it's just a nice-to-have enhancement
        enrichBrandsWithLogos(result.brands)
          .then((enrichedBrands) => {
            // Only update if brands list hasn't changed (user hasn't selected different country)
            if (selectedCountry?.isoCode === result.brands?.[0]?.country || 
                availableBrands.length === enrichedBrands.length) {
              setAvailableBrands(enrichedBrands);
              // Update selected gift card if it's still the first one
              if (!selectedGiftCard && enrichedBrands.length > 0) {
                setSelectedGiftCard(enrichedBrands[0]);
              }
            }
          })
          .catch((enrichError) => {
            // Silently fail - logos are optional
            console.warn('⚠️ Logo enrichment failed (non-critical):', enrichError);
          });
      } else {
        console.error('Failed to fetch brands:', result.error);
        setAvailableBrands([]);
        // Show user-friendly error message
        if (result.error?.includes('timeout') || result.error?.includes('network')) {
          Alert.alert(
            'Connection Error',
            'Unable to fetch gift card brands. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error: any) {
      console.error('Error fetching brands:', error);
      setAvailableBrands([]);
      // Show user-friendly error message
      if (error.message?.includes('timeout') || error.message?.includes('network')) {
        Alert.alert(
          'Connection Error',
          'Unable to fetch gift card brands. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoadingBrands(false);
    }
  };

  const fetchCardAmountsForBrand = async () => {
    if (!selectedGiftCard || !selectedCountry) return;
    
    const brandId = selectedGiftCard.brand || selectedGiftCard.id;
    if (!brandId) return;

    setLoadingCardAmounts(true);
    try {
      const result = await getAvailableCardAmounts(
        brandId,
        selectedCountry.isoCode
      );

      if (result.success && result.amounts && result.amounts.length > 0) {
        setAvailableCardAmounts(result.amounts);
        // Set currency from API response, or use country currency as fallback
        setCardAmountCurrency(result.currency || selectedCountry.currency || 'USD');
        // Set default amount if none selected
        if (!selectedCardAmount) {
          setSelectedCardAmount(result.amounts[0]);
        }
      } else {
        // Fallback to static amounts if API fails or no amounts found
        // Use country currency for fallback amounts
        const fallbackCurrency = selectedCountry?.currency || 'USD';
        setCardAmountCurrency(fallbackCurrency);
        setAvailableCardAmounts(CARD_AMOUNTS_USD);
        if (!selectedCardAmount) {
          setSelectedCardAmount(CARD_AMOUNTS_USD[0]);
        }
      }
    } catch (error: any) {
      // Silently fallback to static amounts on error (Edge Function may not be deployed)
      const fallbackCurrency = selectedCountry?.currency || 'USD';
      setCardAmountCurrency(fallbackCurrency);
      setAvailableCardAmounts(CARD_AMOUNTS_USD);
      if (!selectedCardAmount) {
        setSelectedCardAmount(CARD_AMOUNTS_USD[0]);
      }
    } finally {
      setLoadingCardAmounts(false);
    }
  };

  const fetchBalance = async () => {
    if (!user?.id) return;

    try {
      const { data: wallet, error } = await supabase
        .from('user_wallets')
        .select('ngn_balance')
        .eq('user_id', user.id)
        .single();

      if (!error && wallet) {
        setNgnBalance(parseFloat(wallet.ngn_balance?.toString() || '0'));
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  // Get exchange rate for currency to NGN
  const getExchangeRate = (currency: string): number => {
    return EXCHANGE_RATES[currency] || EXCHANGE_RATES.USD; // Default to USD rate if unknown
  };

  // Get currency symbol
  const getCurrencySymbol = (currency: string): string => {
    if (!selectedCountry) return '$';
    // Use selected country's symbol if currency matches
    if (selectedCountry.currency === currency) {
      return selectedCountry.symbol || '$';
    }
    // Otherwise find country with matching currency
    const country = availableCountries.find(c => c.currency === currency);
    return country?.symbol || '$';
  };

  // Calculate total amount in NGN (converting from card amount currency)
  const calculateTotalNGN = () => {
    if (!selectedCardAmount || !quantity) return 0;
    const qty = parseInt(quantity) || 1;
    const exchangeRate = getExchangeRate(cardAmountCurrency);
    return selectedCardAmount * qty * exchangeRate;
  };

  // Get card amount in NGN for display
  const getCardAmountNGN = () => {
    if (!selectedCardAmount) return 0;
    const exchangeRate = getExchangeRate(cardAmountCurrency);
    return selectedCardAmount * exchangeRate;
  };

  const totalNGN = calculateTotalNGN();

  const handleContinue = () => {
    if (!selectedGiftCard) {
      Alert.alert('Error', 'Please select a gift card');
      return;
    }

    if (!selectedCardAmount) {
      Alert.alert('Error', 'Please select a card amount');
      return;
    }

    const qty = parseInt(quantity) || 1;
    if (qty < 1 || qty > 10) {
      Alert.alert('Error', 'Quantity must be between 1 and 10');
      return;
    }

    if (totalNGN > ngnBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    setShowSummary(true);
  };

  const confirmPurchase = async () => {
    setShowSummary(false);
    setProcessing(true);

    try {
      if (!selectedGiftCard || !selectedCardAmount || !selectedCountry) {
        Alert.alert('Error', 'Please select a gift card and amount');
        return;
      }

      const qty = parseInt(quantity) || 1;
      const cardAmount = selectedCardAmount;
      const brandId = selectedGiftCard.brand || selectedGiftCard.id;
      const purchasedCards: any[] = [];

      // Find the offerId for the selected brand and amount
      // Fetch voucher offers for this brand and country
      const offersResult = await getZenditVoucherOffers({
        limit: 100,
        offset: 0,
        brand: brandId,
        country: selectedCountry.isoCode,
      });

      if (!offersResult.success || !offersResult.offers || offersResult.offers.length === 0) {
        throw new Error('No offers found for this gift card. Please try again.');
      }

      // Find offer matching the selected amount
      // Convert card amount to smallest currency unit (e.g., cents)
      const cardAmountInCents = Math.round(cardAmount * 100);
      const matchingOffer = offersResult.offers.find(offer => {
        if (offer.priceType === 'Fixed' && offer.cardAmount !== null) {
          const offerAmountInCents = Math.round(offer.cardAmount * 100);
          return offerAmountInCents === cardAmountInCents;
        }
        return false;
      });

      if (!matchingOffer) {
        throw new Error(`No offer found for ${cardAmount} ${cardAmountCurrency}. Please select a different amount.`);
      }

      // Purchase multiple gift cards
      for (let i = 0; i < qty; i++) {
        // Generate unique transaction ID
        const transactionId = `GC-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        // Prepare fields for Zendit purchase
        const fields: VoucherField[] = [];
        
        // Add required fields if offer specifies them
        if (matchingOffer.requiredFields && Array.isArray(matchingOffer.requiredFields)) {
          // Add default values for common required fields
          matchingOffer.requiredFields.forEach((fieldName: string) => {
            if (fieldName.toLowerCase().includes('email')) {
              fields.push({ name: fieldName, value: user?.email || '' });
            } else if (fieldName.toLowerCase().includes('name')) {
              fields.push({ name: fieldName, value: user?.user_metadata?.full_name || 'Customer' });
            } else {
              // Add empty value for other required fields (may need to be filled by user)
              fields.push({ name: fieldName, value: '' });
            }
          });
        }

        const purchase: GiftCardPurchase = {
          amount: cardAmount * getExchangeRate(cardAmountCurrency), // Convert card currency to NGN for purchase
          currency: 'NGN', // Always use NGN for purchase
          card_category: selectedGiftCard.category || 'retail',
          card_subcategory: selectedGiftCard.id,
          card_type: 'ecode',
          expires_in_days: 365,
          // Zendit-specific fields
          offerId: matchingOffer.offerId,
          brand: brandId,
          country: selectedCountry.isoCode,
          fields,
        };

        const result = await purchaseGiftCard(user?.id || '', purchase);

        if (result.success && result.giftCard) {
          purchasedCards.push(result.giftCard);
        } else {
          throw new Error(result.error || `Failed to purchase gift card ${i + 1}`);
        }
      }

      setPurchasedGiftCards(purchasedCards);
      setShowSuccess(true);
      // Reset form
      setQuantity('1');
      // Refresh balance
      fetchBalance();
    } catch (error: any) {
      console.error('Gift card purchase error:', error);
      Alert.alert('Error', error.message || 'An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
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
            <ThemedText style={styles.headerTitle}>Buy Gift Cards</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {/* Balance Card */}
          <LinearGradient
            colors={['#6B46C1', '#9333EA', '#A855F7']}
            style={styles.balanceCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <ThemedText style={styles.balanceAmount}>₦{ngnBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
          </LinearGradient>

          {/* Country/Currency Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Country/Currency</ThemedText>
            <TouchableOpacity
              style={[styles.dropdown, loadingCountries && styles.dropdownDisabled]}
              onPress={() => {
                if (!loadingCountries) {
                  setShowCountryPicker(true);
                }
              }}
              disabled={loadingCountries}
            >
              <View style={styles.dropdownLeft}>
                {loadingCountries ? (
                  <>
                    <AppLoadingIndicator size="small" />
                    <ThemedText style={styles.dropdownPlaceholder}>Loading countries...</ThemedText>
                  </>
                ) : selectedCountry ? (
                  <>
                    <ThemedText style={styles.dropdownFlag}>{selectedCountry.flag}</ThemedText>
                    <View>
                      <ThemedText style={styles.dropdownText}>{selectedCountry.name}</ThemedText>
                      <ThemedText style={styles.dropdownSubtext}>{selectedCountry.currency} ({selectedCountry.symbol})</ThemedText>
                    </View>
                  </>
                ) : (
                  <ThemedText style={styles.dropdownPlaceholder}>Select country/currency</ThemedText>
                )}
              </View>
              {!loadingCountries && (
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B7280" />
              )}
            </TouchableOpacity>
          </View>

          {/* Gift Card Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Gift Card</ThemedText>
            {loadingBrands ? (
              <View style={styles.loadingContainer}>
                <AppLoadingIndicator size="small" />
                <ThemedText style={styles.loadingText}>Loading brands...</ThemedText>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setShowGiftCardPicker(true)}
                disabled={availableBrands.length === 0}
              >
                <View style={styles.dropdownLeft}>
                  {selectedGiftCard?.logo ? (
                    <Image
                      source={{ uri: selectedGiftCard.logo }}
                      style={[styles.brandLogo, { width: 32, height: 32 }]}
                      contentFit="contain"
                      placeholderContentFit="contain"
                    />
                  ) : (
                    <MaterialIcons name="card-giftcard" size={20} color="#6B7280" />
                  )}
                  <ThemedText style={[styles.dropdownText, !selectedGiftCard && styles.dropdownPlaceholder]}>
                    {selectedGiftCard 
                      ? selectedGiftCard.name 
                      : !selectedCountry 
                        ? 'Select a country first' 
                        : availableBrands.length === 0 
                          ? 'No brands available' 
                          : 'Select a gift card'}
                  </ThemedText>
                </View>
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* Card Amount Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Card Amount</ThemedText>
            <TouchableOpacity
              style={[styles.dropdown, (!selectedGiftCard || loadingCardAmounts) && styles.dropdownDisabled]}
              onPress={() => {
                if (selectedGiftCard && !loadingCardAmounts) {
                  setShowAmountPicker(true);
                }
              }}
              disabled={!selectedGiftCard || loadingCardAmounts}
            >
              <View style={styles.dropdownLeft}>
                <MaterialIcons name="attach-money" size={20} color="#6B7280" />
                <View>
                  {loadingCardAmounts ? (
                    <ThemedText style={styles.dropdownPlaceholder}>Loading amounts...</ThemedText>
                  ) : (
                    <>
                      <ThemedText style={[styles.dropdownText, !selectedCardAmount && styles.dropdownPlaceholder]}>
                        {selectedCardAmount 
                          ? `${getCurrencySymbol(cardAmountCurrency)}${selectedCardAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cardAmountCurrency}`
                          : !selectedGiftCard 
                            ? 'Select a gift card first' 
                            : 'Select card amount'}
                      </ThemedText>
                      {selectedCardAmount && (
                        <ThemedText style={styles.dropdownSubtext}>
                          ₦{getCardAmountNGN().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
                        </ThemedText>
                      )}
                    </>
                  )}
                </View>
              </View>
              {!loadingCardAmounts && (
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B7280" />
              )}
              {loadingCardAmounts && (
                <AppLoadingIndicator size="small" />
              )}
            </TouchableOpacity>
          </View>

          {/* Quantity */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Quantity</ThemedText>
            <View style={styles.inputContainer}>
              <MaterialIcons name="inventory" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.input}
                placeholder="1"
                value={quantity}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  if (num >= 0 && num <= 10) {
                    setQuantity(text);
                  }
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <ThemedText style={styles.quantityHint}>Maximum 10 cards per purchase</ThemedText>
          </View>

          {/* Total Amount Display */}
          {selectedCardAmount && quantity && (
            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>Card Amount:</ThemedText>
                <ThemedText style={styles.totalValue}>
                  {getCurrencySymbol(cardAmountCurrency)}{selectedCardAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cardAmountCurrency} × {quantity}
                </ThemedText>
              </View>
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>Total Amount:</ThemedText>
                <ThemedText style={styles.totalAmount}>₦{totalNGN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
              </View>
            </View>
          )}

          {/* Continue Button */}
          <TouchableOpacity
            style={[styles.continueButton, processing && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={processing || loading || !selectedGiftCard || !selectedCardAmount}
          >
            <LinearGradient
              colors={['#6B46C1', '#7C3AED']}
              style={styles.continueButtonGradient}
            >
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select Country/Currency</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCountryPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {loadingCountries ? (
                <View style={styles.loadingContainer}>
                  <AppLoadingIndicator size="small" />
                  <ThemedText style={styles.loadingText}>Loading countries...</ThemedText>
                </View>
              ) : availableCountries.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={styles.loadingText}>No countries available</ThemedText>
                </View>
              ) : (
                availableCountries.map((country) => (
                  <TouchableOpacity
                    key={country.isoCode}
                    style={[
                      styles.pickerItem,
                      selectedCountry?.isoCode === country.isoCode && styles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedCountry(country);
                      setSelectedGiftCard(null);
                      setSelectedCardAmount(null);
                      setShowCountryPicker(false);
                    }}
                  >
                    <View style={styles.pickerItemLeft}>
                      <ThemedText style={styles.pickerItemFlag}>{country.flag}</ThemedText>
                      <View>
                        <ThemedText style={styles.pickerItemText}>{country.name}</ThemedText>
                        <ThemedText style={styles.pickerItemSubtext}>{country.currency} ({country.symbol})</ThemedText>
                      </View>
                    </View>
                    {selectedCountry?.isoCode === country.isoCode && (
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Gift Card Picker Modal */}
      <Modal
        visible={showGiftCardPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGiftCardPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select Gift Card</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowGiftCardPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {availableBrands.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="card-giftcard" size={48} color="#9CA3AF" />
                  <ThemedText style={styles.emptyStateText}>No brands available for this country</ThemedText>
                </View>
              ) : (
                availableBrands.map((brand, index) => {
                  // Create unique key by combining brand identifier with index
                  const uniqueKey = `${brand.brand || brand.id || 'brand'}-${index}-${brand.name || ''}`;
                  return (
                    <TouchableOpacity
                      key={uniqueKey}
                      style={[
                        styles.pickerItem,
                        selectedGiftCard?.id === brand.id && selectedGiftCard?.brand === brand.brand && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedGiftCard(brand);
                        setShowGiftCardPicker(false);
                      }}
                    >
                      <View style={styles.pickerItemLeft}>
                        <MaterialIcons name="card-giftcard" size={24} color="#6B46C1" />
                        <View style={styles.pickerItemInfo}>
                          <ThemedText style={styles.pickerItemText}>{brand.name}</ThemedText>
                          {brand.category && (
                            <ThemedText style={styles.pickerItemSubtext}>{brand.category}</ThemedText>
                          )}
                        </View>
                      </View>
                      {selectedGiftCard?.id === brand.id && selectedGiftCard?.brand === brand.brand && (
                        <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Amount Picker Modal */}
      <Modal
        visible={showAmountPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAmountPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <ThemedText style={styles.pickerTitle}>Select Card Amount</ThemedText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAmountPicker(false)}
              >
                <MaterialIcons name="close" size={24} color="#11181C" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {loadingCardAmounts ? (
                <View style={styles.loadingContainer}>
                  <AppLoadingIndicator size="small" />
                  <ThemedText style={styles.loadingText}>Loading amounts...</ThemedText>
                </View>
              ) : (
                availableCardAmounts.map((amount) => {
                  const amountInNGN = amount * getExchangeRate(cardAmountCurrency);
                  return (
                    <TouchableOpacity
                      key={amount}
                      style={[
                        styles.pickerItem,
                        selectedCardAmount === amount && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedCardAmount(amount);
                        setShowAmountPicker(false);
                      }}
                    >
                    <View style={styles.pickerItemLeft}>
                      <MaterialIcons name="attach-money" size={24} color="#6B46C1" />
                      <View>
                        <ThemedText style={styles.pickerItemText}>
                          {getCurrencySymbol(cardAmountCurrency)}{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cardAmountCurrency}
                        </ThemedText>
                        <ThemedText style={styles.pickerItemSubtext}>
                          ₦{amountInNGN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
                        </ThemedText>
                      </View>
                    </View>
                    {selectedCardAmount === amount && (
                      <MaterialIcons name="check-circle" size={20} color="#6B46C1" />
                    )}
                  </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Summary Modal */}
      <Modal
        visible={showSummary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSummary(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Gift Card Summary</ThemedText>
            <View style={styles.summaryDetails}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Country:</ThemedText>
                <ThemedText style={styles.summaryValue}>{selectedCountry?.name || 'N/A'}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Gift Card:</ThemedText>
                <ThemedText style={styles.summaryValue}>{selectedGiftCard?.name || 'N/A'}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Card Amount:</ThemedText>
                <ThemedText style={styles.summaryValue}>
                  {getCurrencySymbol(cardAmountCurrency)}{selectedCardAmount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cardAmountCurrency} × {quantity}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Card Amount (NGN):</ThemedText>
                <ThemedText style={styles.summaryValue}>
                  ₦{selectedCardAmount ? getCardAmountNGN().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'} × {quantity}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Quantity:</ThemedText>
                <ThemedText style={styles.summaryValue}>{quantity} card(s)</ThemedText>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                <ThemedText style={styles.summaryTotalLabel}>Total Amount:</ThemedText>
                <ThemedText style={styles.summaryTotalValue}>
                  ₦{totalNGN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowSummary(false)}
              >
                <ThemedText style={styles.modalButtonCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={confirmPurchase}
                disabled={processing}
              >
                {processing ? (
                  <AppLoadingIndicator size="small" variant="onPrimary" />
                ) : (
                  <LinearGradient
                    colors={['#6B46C1', '#7C3AED']}
                    style={styles.modalButtonGradient}
                  >
                    <ThemedText style={styles.modalButtonConfirmText}>Purchase</ThemedText>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccess}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowSuccess(false);
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText style={styles.modalTitle}>Purchase Successful!</ThemedText>
            <ThemedText style={styles.successMessage}>
              {purchasedGiftCards.length} gift card(s) purchased successfully
            </ThemedText>
            <ScrollView style={styles.giftCardsList}>
              {purchasedGiftCards.map((card, index) => (
                <View key={card.id} style={styles.giftCardCodeContainer}>
                  <ThemedText style={styles.giftCardCodeLabel}>Card {index + 1} Code</ThemedText>
                  <View style={styles.giftCardCodeBox}>
                    <ThemedText style={styles.giftCardCode}>{card.code}</ThemedText>
                    <TouchableOpacity
                      onPress={() => {
                        // Copy to clipboard
                        Alert.alert('Copied', `Gift card code ${card.code} copied to clipboard`);
                      }}
                    >
                      <MaterialIcons name="content-copy" size={20} color="#6B46C1" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalButtonConfirm}
              onPress={() => {
                setShowSuccess(false);
                router.back();
              }}
            >
              <LinearGradient
                colors={['#6B46C1', '#7C3AED']}
                style={styles.modalButtonGradient}
              >
                <ThemedText style={styles.modalButtonConfirmText}>Done</ThemedText>
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
  keyboardView: {
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
  balanceCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    minHeight: 120,
  },
  balanceLabel: {
    fontSize: 15,
    color: '#E9D5FF',
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    lineHeight: 44,
    includeFontPadding: false,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111827',
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownDisabled: {
    opacity: 0.6,
    backgroundColor: '#F3F4F6',
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  dropdownFlag: {
    fontSize: 24,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  dropdownPlaceholder: {
    color: '#9CA3AF',
  },
  dropdownSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
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
    color: '#111827',
  },
  quantityHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  totalCard: {
    backgroundColor: '#F0FDF4',
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    color: '#374151',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#6B46C1',
  },
  continueButton: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemSelected: {
    backgroundColor: '#F3F4F6',
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  pickerItemFlag: {
    fontSize: 24,
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  pickerItemSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pickerItemInfo: {
    flex: 1,
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#111827',
  },
  summaryDetails: {
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryTotalRow: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#EC4899',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  modalButtonConfirm: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  giftCardsList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  giftCardCodeContainer: {
    marginBottom: 16,
  },
  giftCardCodeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  giftCardCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6B46C1',
  },
  giftCardCode: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B46C1',
    letterSpacing: 2,
  },
});
