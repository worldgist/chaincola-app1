import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { submitVerification, getUserVerificationStatus, verifyBVNOrNIN, type VerificationStatus } from '@/lib/verification-service';
import { useFocusEffect } from 'expo-router';
import { createDemoVerification } from '@/lib/demo-verification-service';
import AppLoadingIndicator from '@/components/app-loading-indicator';


type VerificationStep = 1 | 2 | 3 | 4 | 5;

export default function VerifyAccountScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const showPrompt = params.prompt === 'true';
  const [currentStep, setCurrentStep] = useState<VerificationStep>(1);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(null);
  const [showPromptBanner, setShowPromptBanner] = useState(showPrompt);

  // Step 1: Choose verification method
  // Step 2: Personal Information
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');

  // Step 3: BVN or NIN input
  const [verificationMethod, setVerificationMethod] = useState<'bvn' | 'nin'>('bvn');
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [bvnVerifying, setBvnVerifying] = useState(false);

  // Step 4: NIN Documents
  const [ninFront, setNinFront] = useState<string | null>(null);
  const [ninBack, setNinBack] = useState<string | null>(null);

  // Step 5: Passport/Snap
  const [passportPhoto, setPassportPhoto] = useState<string | null>(null);

  useEffect(() => {
    // Request camera and media library permissions
    (async () => {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'We need camera and photo library access to upload your verification documents.'
        );
      }
    })();
  }, []);

  const fetchVerificationStatus = async () => {
    if (!user?.id) return;
    
    try {
      const status = await getUserVerificationStatus(user.id);
      setVerificationStatus(status);
      
      // If already verified or rejected, show appropriate message
      if (status === 'approved') {
        // User is verified, could show a message or redirect
      } else if (status === 'rejected') {
        // User was rejected, allow resubmission
      }
    } catch (error) {
      console.error('Error fetching verification status:', error);
    }
  };

  // Fetch verification status on mount and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        fetchVerificationStatus();
      }
    }, [user?.id])
  );

  const validateStep1 = (): boolean => {
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }

    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return false;
    }

    const phoneRegex = /^(0|\+234)[789][01]\d{8}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      Alert.alert('Error', 'Please enter a valid Nigerian phone number');
      return false;
    }

    if (!address.trim()) {
      Alert.alert('Error', 'Please enter your address');
      return false;
    }

    return true;
  };

  const validateStep2 = (): boolean => {
    if (verificationMethod === 'bvn') {
      if (!bvn.trim()) {
        Alert.alert('Error', 'Please enter your BVN');
        return false;
      }
      const bvnRegex = /^\d{11}$/;
      if (!bvnRegex.test(bvn.replace(/\s/g, ''))) {
        Alert.alert('Error', 'Please enter a valid 11-digit BVN');
        return false;
      }
      return true;
    }
    // NIN
    if (!nin.trim()) {
      Alert.alert('Error', 'Please enter your NIN');
      return false;
    }
    const ninRegex = /^\d{11}$/;
    if (!ninRegex.test(nin.replace(/\s/g, ''))) {
      Alert.alert('Error', 'Please enter a valid 11-digit NIN');
      return false;
    }
    return true;
  };

  const handleVerifyBVN = async () => {
    if (!validateStep1() || !validateStep2()) return;
    if (verificationMethod !== 'bvn' || !user?.id) return;

    setBvnVerifying(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';

      const result = await verifyBVNOrNIN({
        bvn: bvn.replace(/\s/g, ''),
        firstName,
        lastName,
        phoneNumber: phoneNumber.trim() || undefined,
      });

      if (result.success && result.verified && result.data) {
        setVerificationStatus('approved');
        setShowSuccessModal(true);
      } else {
        Alert.alert(
          'Verification Failed',
          result.error || 'Unable to verify BVN. Please check the number and try again, or use NIN with documents.'
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Verification failed. Please try again.');
    } finally {
      setBvnVerifying(false);
    }
  };

  const validateStep3 = (): boolean => {
    if (!ninFront) {
      Alert.alert('Error', 'Please upload the front of your NIN');
      return false;
    }

    if (!ninBack) {
      Alert.alert('Error', 'Please upload the back of your NIN');
      return false;
    }

    return true;
  };

  const validateStep4 = (): boolean => {
    if (!passportPhoto) {
      Alert.alert('Error', 'Please upload your passport photo or selfie');
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      // Method chosen, proceed to personal info
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (validateStep1()) {
        setCurrentStep(3);
      }
    } else if (currentStep === 3) {
      if (verificationMethod === 'bvn') {
        handleVerifyBVN();
      } else if (validateStep2()) {
        setCurrentStep(4);
      }
    } else if (currentStep === 4) {
      if (validateStep3()) {
        setCurrentStep(5);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as VerificationStep);
    }
  };

  const totalSteps = verificationMethod === 'bvn' ? 3 : 5;

  const pickImage = async (type: 'ninFront' | 'ninBack' | 'passport') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (type === 'ninFront') {
          setNinFront(uri);
        } else if (type === 'ninBack') {
          setNinBack(uri);
        } else if (type === 'passport') {
          setPassportPhoto(uri);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async (type: 'ninFront' | 'ninBack' | 'passport') => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (type === 'ninFront') {
          setNinFront(uri);
        } else if (type === 'ninBack') {
          setNinBack(uri);
        } else if (type === 'passport') {
          setPassportPhoto(uri);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const showImagePickerOptions = (type: 'ninFront' | 'ninBack' | 'passport') => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: () => takePhoto(type) },
        { text: 'Photo Library', onPress: () => pickImage(type) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleVerify = async () => {
    if (!validateStep4()) return;

    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    setProcessing(true);
    try {
      // Submit verification documents
      const result = await submitVerification(user.id, {
        fullName,
        phoneNumber,
        address,
        nin,
        ninFront: ninFront || '',
        ninBack: ninBack || '',
        passportPhoto: passportPhoto || '',
      });

      if (result.success) {
        // Update local status
        setVerificationStatus('pending');
        setShowSuccessModal(true);
      } else {
        Alert.alert('Error', result.error || 'Failed to submit verification. Please try again.');
      }
    } catch (error: any) {
      console.error('Error submitting verification:', error);
      Alert.alert('Error', error.message || 'Failed to submit verification. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
    return (
      <View style={styles.stepIndicator}>
        {steps.map((step) => (
          <View key={step} style={styles.stepContainer}>
            <View
              style={[
                styles.stepCircle,
                currentStep >= step && styles.stepCircleActive,
                currentStep === step && styles.stepCircleCurrent,
              ]}
            >
              {currentStep > step ? (
                <MaterialIcons name="check" size={16} color="#FFFFFF" />
              ) : (
                <ThemedText style={[styles.stepNumber, currentStep >= step && styles.stepNumberActive]}>
                  {step}
                </ThemedText>
              )}
            </View>
            {step < totalSteps && (
              <View
                style={[
                  styles.stepLine,
                  currentStep > step && styles.stepLineActive,
                ]}
              />
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Choose Verification Method</ThemedText>
      <ThemedText style={styles.stepDescription}>
        How would you like to verify your identity? Select one option to proceed.
      </ThemedText>

      <View style={styles.methodToggle}>
        <TouchableOpacity
          style={[
            styles.methodOption,
            verificationMethod === 'bvn' && styles.methodOptionActive,
          ]}
          onPress={() => setVerificationMethod('bvn')}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="account-balance"
            size={24}
            color={verificationMethod === 'bvn' ? '#6B46C1' : '#6B7280'}
          />
          <ThemedText style={[styles.methodLabel, verificationMethod === 'bvn' && styles.methodLabelActive]}>
            BVN
          </ThemedText>
          <ThemedText style={[styles.methodHint, verificationMethod === 'bvn' && styles.methodHintActive]}>
            Instant verification via Flutterwave
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.methodOption,
            verificationMethod === 'nin' && styles.methodOptionActive,
          ]}
          onPress={() => setVerificationMethod('nin')}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="badge"
            size={24}
            color={verificationMethod === 'nin' ? '#6B46C1' : '#6B7280'}
          />
          <ThemedText style={[styles.methodLabel, verificationMethod === 'nin' && styles.methodLabelActive]}>
            NIN
          </ThemedText>
          <ThemedText style={[styles.methodHint, verificationMethod === 'nin' && styles.methodHintActive]}>
            Document upload (NIN + passport photos)
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Personal Information</ThemedText>
      <ThemedText style={styles.stepDescription}>
        Please provide your personal details for verification
      </ThemedText>

      <View style={styles.inputSection}>
        <ThemedText style={styles.inputLabel}>Full Name</ThemedText>
        <View style={styles.inputContainer}>
          <MaterialIcons name="person" size={20} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>
      </View>

      <View style={styles.inputSection}>
        <ThemedText style={styles.inputLabel}>Phone Number</ThemedText>
        <View style={styles.inputContainer}>
          <MaterialIcons name="phone" size={20} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="08012345678"
            placeholderTextColor="#9CA3AF"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>
      </View>

      <View style={styles.inputSection}>
        <ThemedText style={styles.inputLabel}>Address</ThemedText>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Enter your full address"
          placeholderTextColor="#9CA3AF"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>
        {verificationMethod === 'bvn' ? 'Bank Verification Number' : 'National Identification Number'}
      </ThemedText>
      <ThemedText style={styles.stepDescription}>
        {verificationMethod === 'bvn'
          ? 'Enter your 11-digit BVN for instant verification'
          : 'Enter your 11-digit NIN. You will upload documents in the next steps.'}
      </ThemedText>

      {verificationMethod === 'bvn' ? (
        <View style={styles.inputSection}>
          <ThemedText style={styles.inputLabel}>Bank Verification Number (BVN)</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="account-balance" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your 11-digit BVN"
              placeholderTextColor="#9CA3AF"
              value={bvn}
              onChangeText={setBvn}
              keyboardType="number-pad"
              maxLength={11}
              editable={!bvnVerifying}
            />
          </View>
          <ThemedText style={styles.inputHint}>
            Verified instantly via Flutterwave. Your BVN is linked to your bank account.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.inputSection}>
          <ThemedText style={styles.inputLabel}>National Identification Number (NIN)</ThemedText>
          <View style={styles.inputContainer}>
            <MaterialIcons name="badge" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your 11-digit NIN"
              placeholderTextColor="#9CA3AF"
              value={nin}
              onChangeText={setNin}
              keyboardType="number-pad"
              maxLength={11}
            />
          </View>
          <ThemedText style={styles.inputHint}>
            You will need to upload NIN and passport photos in the next steps
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>NIN Documents</ThemedText>
      <ThemedText style={styles.stepDescription}>
        Upload clear photos of the front and back of your NIN card
      </ThemedText>

      <View style={styles.uploadSection}>
        <ThemedText style={styles.uploadLabel}>NIN Front</ThemedText>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => showImagePickerOptions('ninFront')}
          activeOpacity={0.7}
        >
          {ninFront ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: ninFront }} style={styles.uploadedImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setNinFront(null)}
              >
                <MaterialIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <MaterialIcons name="add-photo-alternate" size={48} color="#6B7280" />
              <ThemedText style={styles.uploadPlaceholderText}>Tap to upload</ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.uploadSection}>
        <ThemedText style={styles.uploadLabel}>NIN Back</ThemedText>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => showImagePickerOptions('ninBack')}
          activeOpacity={0.7}
        >
          {ninBack ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: ninBack }} style={styles.uploadedImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setNinBack(null)}
              >
                <MaterialIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <MaterialIcons name="add-photo-alternate" size={48} color="#6B7280" />
              <ThemedText style={styles.uploadPlaceholderText}>Tap to upload</ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Passport Photo</ThemedText>
      <ThemedText style={styles.stepDescription}>
        Upload a clear passport photo or selfie for identity verification
      </ThemedText>

      <View style={styles.uploadSection}>
        <ThemedText style={styles.uploadLabel}>Passport Photo / Selfie</ThemedText>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => showImagePickerOptions('passport')}
          activeOpacity={0.7}
        >
          {passportPhoto ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: passportPhoto }} style={styles.uploadedImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setPassportPhoto(null)}
              >
                <MaterialIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <MaterialIcons name="camera-alt" size={48} color="#6B7280" />
              <ThemedText style={styles.uploadPlaceholderText}>Tap to upload</ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // Show status screens based on verification status
  if (verificationStatus === 'approved') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Verify Account</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statusContainer}>
            <MaterialIcons name="verified" size={48} color="#10B981" />
            <ThemedText style={styles.statusTitle}>Account Verified</ThemedText>
            <ThemedText style={styles.statusMessage}>
              Your account has been successfully verified. Thank you!
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  if (verificationStatus === 'pending') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#11181C" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Verify Account</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.pendingStatusContainer}>
          <MaterialIcons name="hourglass-empty" size={56} color="#F59E0B" />
          <ThemedText style={styles.pendingStatusTitle}>Under Review</ThemedText>
          <ThemedText style={styles.pendingStatusMessage}>
            Your verification documents are being reviewed. We will notify you once the review is complete.
          </ThemedText>
          <TouchableOpacity
            style={styles.pendingDoneButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#6B46C1', '#9333EA']}
              style={styles.pendingDoneButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText style={styles.pendingDoneButtonText}>Done</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  if (verificationStatus === 'rejected') {
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
              <ThemedText style={styles.headerTitle}>Verify Account</ThemedText>
              <View style={styles.placeholder} />
            </View>
            <View style={styles.rejectedContainer}>
              <MaterialIcons name="error-outline" size={64} color="#EF4444" />
              <ThemedText style={styles.statusTitle}>Verification Failed</ThemedText>
              <ThemedText style={styles.statusMessage}>
                Your verification was not approved. Please review your documents and try again.
              </ThemedText>
              <ThemedText style={styles.retryMessage}>
                Tap "Try Again" below to resubmit your verification documents.
              </ThemedText>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setVerificationStatus(null);
                  setCurrentStep(1);
                  setFullName('');
                  setPhoneNumber('');
                  setAddress('');
                  setVerificationMethod('bvn');
                  setBvn('');
                  setNin('');
                  setNinFront(null);
                  setNinBack(null);
                  setPassportPhoto(null);
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.retryButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

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
            <ThemedText style={styles.headerTitle}>Verify Account</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {/* Prompt Banner - shown when redirected from login */}
          {showPromptBanner && (
            <View style={styles.promptBanner}>
              <View style={styles.promptBannerContent}>
                <MaterialIcons name="warning" size={24} color="#F59E0B" />
                <View style={styles.promptBannerText}>
                  <ThemedText style={styles.promptBannerTitle}>
                    Account Verification Required
                  </ThemedText>
                  <ThemedText style={styles.promptBannerMessage}>
                    {verificationStatus === 'pending' 
                      ? 'Your verification is currently pending review. Please wait for admin approval before accessing all features.'
                      : verificationStatus === 'rejected'
                      ? 'Your previous verification was rejected. Please submit a new verification request to continue.'
                      : 'Please verify your account to continue using ChainCola. This helps us ensure security and compliance.'
                    }
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPromptBanner(false)}
                  style={styles.promptBannerClose}
                >
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Show status message if verification is pending or rejected */}
          {verificationStatus === 'pending' && !showPromptBanner && (
            <View style={styles.statusBanner}>
              <MaterialIcons name="info" size={20} color="#3B82F6" />
              <ThemedText style={styles.statusBannerText}>
                Your verification is currently pending review. You will be notified once it's approved.
              </ThemedText>
            </View>
          )}

          {verificationStatus === 'rejected' && !showPromptBanner && (
            <View style={styles.statusBannerRejected}>
              <MaterialIcons name="error-outline" size={20} color="#EF4444" />
              <ThemedText style={styles.statusBannerTextRejected}>
                Your verification was rejected. Please submit a new verification request with correct information.
              </ThemedText>
            </View>
          )}

          {renderStepIndicator()}

          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}

          <View style={styles.buttonContainer}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={styles.backButtonStyle}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.backButtonText}>Back</ThemedText>
              </TouchableOpacity>
            )}
            {currentStep < 5 ? (
              <TouchableOpacity
                style={[styles.nextButton, bvnVerifying && styles.verifyButtonDisabled]}
                onPress={handleNext}
                activeOpacity={0.8}
                disabled={bvnVerifying}
              >
                <LinearGradient
                  colors={['#6B46C1', '#9333EA']}
                  style={styles.nextButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {currentStep === 3 && verificationMethod === 'bvn' ? (
                    bvnVerifying ? (
                      <AppLoadingIndicator size="small" variant="onPrimary" />
                    ) : (
                      <ThemedText style={styles.nextButtonText}>Verify with BVN</ThemedText>
                    )
                  ) : (
                    <ThemedText style={styles.nextButtonText}>Next</ThemedText>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.verifyButton, processing && styles.verifyButtonDisabled]}
                  onPress={handleVerify}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#6B46C1', '#9333EA']}
                    style={styles.verifyButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {processing ? (
                      <AppLoadingIndicator size="small" variant="onPrimary" />
                    ) : (
                      <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                {/* Demo Verify Button - Only visible for demo users */}
                {user?.email?.toLowerCase() === 'demo@chaincola.com' && (
                  <TouchableOpacity
                    style={[styles.demoButton, processing && styles.demoButtonDisabled]}
                    onPress={async () => {
                    Alert.alert(
                      'Demo Verification',
                      'This will create a demo verification record (pending status). Continue?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Create Pending',
                          onPress: async () => {
                            setProcessing(true);
                            try {
                              const result = await createDemoVerification({ autoApprove: false });
                              if (result.success) {
                                Alert.alert(
                                  'Demo Verification Created',
                                  'Demo verification record created with pending status. You can check your verification status.',
                                  [{ text: 'OK', onPress: () => fetchVerificationStatus() }]
                                );
                              } else {
                                Alert.alert('Error', result.error || 'Failed to create demo verification');
                              }
                            } catch (error: any) {
                              Alert.alert('Error', error.message || 'Failed to create demo verification');
                            } finally {
                              setProcessing(false);
                            }
                          },
                        },
                        {
                          text: 'Create Approved',
                          onPress: async () => {
                            setProcessing(true);
                            try {
                              const result = await createDemoVerification({ autoApprove: true });
                              if (result.success) {
                                Alert.alert(
                                  'Demo Verification Created',
                                  'Demo verification record created with approved status. Your account is now verified!',
                                  [{ text: 'OK', onPress: () => fetchVerificationStatus() }]
                                );
                              } else {
                                Alert.alert('Error', result.error || 'Failed to create demo verification');
                              }
                            } catch (error: any) {
                              Alert.alert('Error', error.message || 'Failed to create demo verification');
                            } finally {
                              setProcessing(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#F59E0B', '#F97316']}
                    style={styles.demoButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <MaterialIcons name="science" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.demoButtonText}>Demo Verify</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
                )}
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
        onRequestClose={() => {
          setShowSuccessModal(false);
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <ThemedText style={styles.modalTitle}>Thank You!</ThemedText>
            <ThemedText style={styles.successMessage}>
              Thank you for submitting your verification documents. We are reviewing your account and will get back to you within 24 hours.
            </ThemedText>
            <ThemedText style={styles.statusText}>
              Your verification status is now: Pending
            </ThemedText>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                setShowSuccessModal(false);
                router.back();
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.doneButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#6B46C1',
  },
  stepCircleCurrent: {
    borderWidth: 3,
    borderColor: '#9333EA',
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#6B46C1',
  },
  stepContent: {
    gap: 24,
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 24,
  },
  inputSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  methodToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  methodOption: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    gap: 4,
  },
  methodOptionActive: {
    borderColor: '#6B46C1',
    backgroundColor: 'rgba(107, 70, 193, 0.1)',
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  methodLabelActive: {
    color: '#6B46C1',
  },
  methodHint: {
    fontSize: 11,
    opacity: 0.7,
    color: '#6B7280',
  },
  methodHintActive: {
    color: '#6B46C1',
    opacity: 0.9,
  },
  uploadSection: {
    gap: 12,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  uploadButton: {
    width: '100%',
    minHeight: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F9FAFB',
  },
  uploadPlaceholderText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  backButtonStyle: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  verifyButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  verifyButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  demoButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginLeft: 12,
  },
  demoButtonDisabled: {
    opacity: 0.6,
  },
  demoButtonGradient: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  demoButtonText: {
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
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 16,
    lineHeight: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 24,
    textAlign: 'center',
  },
  doneButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  doneButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
    minHeight: 200,
  },
  pendingStatusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 20,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  pendingStatusTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  pendingStatusMessage: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  pendingDoneButton: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  pendingDoneButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 400,
  },
  retryMessage: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  retryButton: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  retryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  promptBanner: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 12,
  },
  promptBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  promptBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  promptBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  promptBannerMessage: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  promptBannerClose: {
    padding: 4,
    marginLeft: 8,
  },
  statusBanner: {
    backgroundColor: '#DBEAFE',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    marginLeft: 12,
    lineHeight: 18,
  },
  statusBannerRejected: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusBannerTextRejected: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    marginLeft: 12,
    lineHeight: 18,
  },
});

