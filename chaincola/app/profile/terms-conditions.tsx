import { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getAppSettingsData } from '@/lib/app-settings-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


export default function TermsConditionsScreen() {
  const [termsAndConditions, setTermsAndConditions] = useState<string>('');
  const [supportEmail, setSupportEmail] = useState('support@chaincola.app');
  const [supportPhone, setSupportPhone] = useState('+234 800 000 0000');
  const [loading, setLoading] = useState(true);

  const fetchTermsAndConditions = async () => {
    try {
      const settings = await getAppSettingsData();
      if (settings) {
        if (settings.terms_and_conditions) {
          setTermsAndConditions(settings.terms_and_conditions);
        }
        if (settings.support_email) {
          setSupportEmail(settings.support_email);
        }
        if (settings.support_phone) {
          setSupportPhone(settings.support_phone);
        }
      }
    } catch (error) {
      console.error('Error fetching terms and conditions:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTermsAndConditions();
    }, [])
  );
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#11181C" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Terms and Conditions</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Loading terms and conditions...</ThemedText>
          </View>
        ) : (
          <View style={styles.content}>
            {termsAndConditions ? (
              <>
                <ThemedText style={styles.lastUpdated}>
                  Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                </ThemedText>
                {termsAndConditions.split('\n').map((line, index) => (
                  <ThemedText key={index} style={styles.termsContent}>
                    {line || ' '}
                  </ThemedText>
                ))}
                <View style={styles.contactSection}>
                  <ThemedText style={styles.sectionTitle}>Contact Information</ThemedText>
                  <ThemedText style={styles.sectionText}>
                    If you have any questions about these Terms and Conditions, please contact us at:
                  </ThemedText>
                  <ThemedText style={styles.contactInfo}>Email: {supportEmail}</ThemedText>
                  <ThemedText style={styles.contactInfo}>Phone: {supportPhone}</ThemedText>
                </View>
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>Terms and conditions content is not available at this time.</ThemedText>
                <ThemedText style={styles.contactInfo}>Please contact us at: {supportEmail}</ThemedText>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  content: {
    width: '100%',
  },
  lastUpdated: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 12,
    opacity: 0.8,
  },
  listItem: {
    fontSize: 15,
    lineHeight: 24,
    marginLeft: 16,
    marginBottom: 8,
    opacity: 0.8,
  },
  termsContent: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
    opacity: 0.8,
  },
  contactSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  contactInfo: {
    fontSize: 15,
    lineHeight: 24,
    marginLeft: 16,
    marginBottom: 8,
    opacity: 0.8,
    fontWeight: '500',
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
    textAlign: 'center',
  },
});


