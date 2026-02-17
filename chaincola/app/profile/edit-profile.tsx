import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, updateUserProfile } from '@/lib/user-service';
// Supabase removed

export default function EditProfileScreen() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user profile
      const profile = await getUserProfile(user.id);
      
      if (profile) {
        setFullName(profile.name || profile.full_name || '');
        setEmail(profile.email || user.email || '');
        setPhoneNumber(profile.phone || profile.phone_number || '');
        setAddress(profile.address || '');
      } else {
        // Fallback to auth metadata
        setFullName(user.metadata?.full_name || user.metadata?.name || '');
        setEmail(user.email || '');
        setPhoneNumber(user.metadata?.phone || '');
        setAddress(user.metadata?.address || '');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Fallback to auth metadata
      setFullName(user?.metadata?.full_name || user?.metadata?.name || '');
      setEmail(user?.email || '');
      setPhoneNumber(user?.metadata?.phone || '');
      setAddress(user?.metadata?.address || '');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    // Validation
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    // Email validation (read-only but check format)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      // Update user profile
      const result = await updateUserProfile(user.id, {
        name: fullName.trim(),
        phone: phoneNumber.trim() || undefined,
        address: address.trim() || undefined,
      });

      if (result.error) {
        console.error('Error updating profile:', result.error);
        Alert.alert('Error', result.error?.message || 'Failed to update profile. Please try again.');
        setSaving(false);
        return;
      }

      // Refresh user data after successful update
      await fetchUserData();

      // Show success modal
      setShowSuccessModal(true);
      setSaving(false);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    // Optionally navigate back
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#11181C" />
            </TouchableOpacity>
            <ThemedText style={styles.headerTitle}>Edit Profile</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.form}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6B46C1" />
                <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Full Name</ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor="#9CA3AF"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoComplete="name"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Email</ThemedText>
                  <TextInput
                    style={[styles.input, styles.disabledInput]}
                    placeholder="Enter your email"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    editable={false}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                  <ThemedText style={styles.helperText}>
                    Email cannot be changed. Contact support if you need to update your email.
                  </ThemedText>
                </View>

                <View style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Phone Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#9CA3AF"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Address</ThemedText>
                  <TextInput
                    style={[styles.input, styles.addressInput]}
                    placeholder="Enter your address (optional)"
                    placeholderTextColor="#9CA3AF"
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoCapitalize="words"
                    autoComplete="street-address"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, (loading || saving) && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  disabled={loading || saving}
                >
                  <LinearGradient
                    colors={['#6B46C1', '#9333EA']}
                    style={styles.saveButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText style={styles.modalTitle}>Success!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your profile has been updated successfully
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleCloseModal}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.modalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.modalButtonText}>OK</ThemedText>
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
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#11181C',
  },
  disabledInput: {
    backgroundColor: '#F3F4F6',
    opacity: 0.7,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  addressInput: {
    minHeight: 100,
    paddingTop: 16,
  },
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    lineHeight: 22,
  },
  modalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  modalButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});


