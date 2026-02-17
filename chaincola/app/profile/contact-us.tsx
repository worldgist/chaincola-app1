import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getAppSettingsData } from '@/lib/app-settings-service';

export default function ContactUsScreen() {
  const [contactEmail, setContactEmail] = useState('support@chaincola.app');
  const [contactPhone, setContactPhone] = useState('+234 800 000 0000');
  const [contactAddress, setContactAddress] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchContactInfo = async () => {
    try {
      const settings = await getAppSettingsData();
      if (settings) {
        if (settings.support_email) {
          setContactEmail(settings.support_email);
        }
        if (settings.support_phone) {
          setContactPhone(settings.support_phone);
        }
        if (settings.support_address) {
          setContactAddress(settings.support_address);
        }
      }
    } catch (error) {
      console.error('Error fetching contact info:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchContactInfo();
    }, [])
  );

  const handleEmailPress = () => {
    Linking.openURL(`mailto:${contactEmail}`);
  };

  const handlePhonePress = () => {
    Linking.openURL(`tel:${contactPhone.replace(/[^0-9+]/g, '')}`);
  };

  const handleAddressPress = () => {
    // Open maps with the address
    const encodedAddress = encodeURIComponent(contactAddress);
    Linking.openURL(`https://maps.google.com/?q=${encodedAddress}`);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Contact Us</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6B46C1" />
            <ThemedText style={styles.loadingText}>Loading contact information...</ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.introContainer}>
              <ThemedText style={styles.introTitle}>We're Here to Help</ThemedText>
              <ThemedText style={styles.introText}>
                Get in touch with us through any of the following channels. We'll get back to you as soon as possible.
              </ThemedText>
            </View>

            <View style={styles.contactContainer}>
          <TouchableOpacity
            style={styles.contactItem}
            onPress={handleEmailPress}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#6B46C1', '#9333EA']}
              style={styles.contactIconContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialIcons name="email" size={28} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.contactContent}>
              <ThemedText style={styles.contactLabel}>Email</ThemedText>
              <ThemedText 
                style={styles.contactValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {contactEmail}
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={handlePhonePress}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#6B46C1', '#9333EA']}
              style={styles.contactIconContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialIcons name="phone" size={28} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.contactContent}>
              <ThemedText style={styles.contactLabel}>Phone Number</ThemedText>
              <ThemedText 
                style={styles.contactValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {contactPhone}
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
          </TouchableOpacity>


            {contactAddress ? (
              <TouchableOpacity
                style={styles.contactItem}
                onPress={handleAddressPress}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.contactIconContainer}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <MaterialIcons name="location-on" size={28} color="#FFFFFF" />
                </LinearGradient>
                <View style={styles.contactContent}>
                  <ThemedText style={styles.contactLabel}>Address</ThemedText>
                  <ThemedText 
                    style={styles.contactValue}
                    numberOfLines={2}
                  >
                    {contactAddress}
                  </ThemedText>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.hoursContainer}>
            <ThemedText style={styles.hoursTitle}>Business Hours</ThemedText>
            <View style={styles.hoursItem}>
              <ThemedText style={styles.hoursDay}>Monday - Friday</ThemedText>
              <ThemedText style={styles.hoursTime}>9:00 AM - 6:00 PM</ThemedText>
            </View>
            <View style={styles.hoursItem}>
              <ThemedText style={styles.hoursDay}>Saturday</ThemedText>
              <ThemedText style={styles.hoursTime}>10:00 AM - 4:00 PM</ThemedText>
            </View>
            <View style={styles.hoursItem}>
              <ThemedText style={styles.hoursDay}>Sunday</ThemedText>
              <ThemedText style={styles.hoursTime}>Closed</ThemedText>
            </View>
          </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    width: '100%',
  },
  backButton: {
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
  introContainer: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  contactContainer: {
    gap: 16,
    marginBottom: 24,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactContent: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 6,
    fontWeight: '500',
  },
  contactValue: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  hoursContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hoursTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  hoursItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hoursDay: {
    fontSize: 15,
    fontWeight: '500',
  },
  hoursTime: {
    fontSize: 15,
    opacity: 0.7,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
});

