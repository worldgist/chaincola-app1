import { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';

interface Service {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string[];
  route?: string;
}

const services: Service[] = [
  // Gift cards are temporarily hidden
  // {
  //   id: 'gift-card',
  //   name: 'Gift Cards',
  //   description: 'Buy and redeem gift cards',
  //   icon: 'card-giftcard',
  //   color: ['#EC4899', '#DB2777'],
  //   route: '/buy-gift-card',
  // },
];

export default function AllServicesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleServicePress = (service: Service) => {
    if (service.route) {
      router.push(service.route as any);
    } else {
      // Show coming soon message
      alert(`${service.name} service is coming soon!`);
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
          <ThemedText style={styles.headerTitle}>Services</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Services List */}
        <View style={styles.servicesContainer}>
          {services.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="inventory" size={64} color="#9CA3AF" />
              <ThemedText style={styles.emptyText}>No services available</ThemedText>
              <ThemedText style={styles.emptySubtext}>Services will be available soon</ThemedText>
            </View>
          ) : (
            <View style={styles.servicesList}>
              {services.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  style={styles.serviceRow}
                  onPress={() => handleServicePress(service)}
                  activeOpacity={0.7}
                >
                  <View style={styles.serviceRowLeft}>
                    <View style={[styles.serviceIconWrapper, { backgroundColor: service.color[0] + '20' }]}>
                      <MaterialIcons
                        name={service.icon as any}
                        size={24}
                        color={service.color[0]}
                      />
                    </View>
                    <View style={styles.serviceRowInfo}>
                      <View style={styles.serviceNameRow}>
                        <ThemedText style={styles.serviceRowName}>{service.name}</ThemedText>
                        {!service.route && (
                          <View style={styles.comingSoonBadge}>
                            <ThemedText style={styles.comingSoonText}>Coming Soon</ThemedText>
                          </View>
                        )}
                      </View>
                      <ThemedText style={styles.serviceRowDescription}>
                        {service.description}
                      </ThemedText>
                    </View>
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={24}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

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
    marginBottom: 32,
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
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  servicesContainer: {
    width: '100%',
    marginBottom: 32,
  },
  servicesList: {
    gap: 0,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  serviceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serviceIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceRowInfo: {
    flex: 1,
  },
  serviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  serviceRowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoonBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  serviceRowDescription: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B46C1',
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
    marginTop: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});





