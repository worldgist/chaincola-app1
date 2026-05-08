import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, getUserInitials } from '@/lib/user-service';
import { isBiometricEnabled, saveBiometricPreference, getBiometricType } from '@/lib/auth-utils';
import { getUserVerificationStatus, type VerificationStatus } from '@/lib/verification-service';
import { getUserTransactionsForStatement } from '@/lib/transaction-service';
import { supabase } from '@/lib/supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(null);
  
  // Statement generation state
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // 30 days ago
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [sendToEmail, setSendToEmail] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [generatingStatement, setGeneratingStatement] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchUserData();
        // Also refresh verification status when screen comes into focus
        if (user.id) {
          getUserVerificationStatus(user.id).then(setVerificationStatus).catch(console.error);
        }
      }
    }, [user?.id])
  );

  const fetchUserData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user profile
      const profile = await getUserProfile(user.id);
      if (profile) {
        setUserProfile(profile);
      }

      // Check if biometric is enabled
      const biometricStatus = await isBiometricEnabled(user.id);
      setBiometricEnabled(biometricStatus);

      // Check verification status
      const status = await getUserVerificationStatus(user.id);
      setVerificationStatus(status);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = () => {
    if (userProfile?.name || userProfile?.full_name) {
      return userProfile.name || userProfile.full_name;
    }
    if (user?.metadata?.full_name || user?.metadata?.name) {
      return user.metadata.full_name || user.metadata.name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User Profile';
  };

  const getUserEmail = () => {
    if (userProfile?.email) {
      return userProfile.email;
    }
    if (user?.email) {
      return user.email;
    }
    return '';
  };

  const getUserAvatar = () => {
    return getUserInitials(userProfile?.name || user?.metadata?.name, user?.email);
  };

  const handleEditProfile = () => {
    router.push('/profile/edit-profile');
  };

  const handleVerifyAccount = () => {
    router.push('/profile/verify-account');
  };

  const handleSecurityPin = () => {
    router.push('/profile/security');
  };

  const handleNotifications = () => {
    router.push('/profile/notification-settings');
  };

  const handleReferral = () => {
    router.push('/profile/referral');
  };

  const handleContactUs = () => {
    router.push('/profile/contact-us');
  };

  const handleChatSupport = () => {
    router.push('/profile/chat-support');
  };

  const handleDeleteAccount = () => {
    router.push('/profile/delete-account');
  };

  const handleTermsConditions = () => {
    router.push('/profile/terms-conditions');
  };

  const handlePrivacyPolicy = () => {
    router.push('/profile/privacy-policy');
  };

  const handleGenerateStatement = () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }
    
    // Set default email to user's email
    setEmailAddress(getUserEmail());
    // Initialize date inputs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    setStartDate(thirtyDaysAgo);
    setEndDate(new Date());
    setStartDateInput(formatDateForInput(thirtyDaysAgo));
    setEndDateInput(formatDateForInput(new Date()));
    setShowStatementModal(true);
  };

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateInput = (dateString: string): Date | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  };

  const formatDateForDisplay = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForQuery = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const handleStartDateChange = (text: string) => {
    setStartDateInput(text);
    const date = parseDateInput(text);
    if (date) {
      setStartDate(date);
    }
  };

  const handleEndDateChange = (text: string) => {
    setEndDateInput(text);
    const date = parseDateInput(text);
    if (date) {
      setEndDate(date);
    }
  };

  const generateStatementPDF = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    // Parse date inputs
    const parsedStartDate = parseDateInput(startDateInput) || startDate;
    const parsedEndDate = parseDateInput(endDateInput) || endDate;

    if (!parsedStartDate || !parsedEndDate) {
      Alert.alert('Error', 'Please enter valid dates.');
      return;
    }

    if (sendToEmail && !emailAddress.trim()) {
      Alert.alert('Error', 'Please enter an email address.');
      return;
    }

    if (parsedStartDate > parsedEndDate) {
      Alert.alert('Error', 'Start date must be before end date.');
      return;
    }

    // Update dates from inputs
    setStartDate(parsedStartDate);
    setEndDate(parsedEndDate);

    setGeneratingStatement(true);
    setShowStatementModal(false);

    try {
      const { rows: transactionsData, error: fetchErr } = await getUserTransactionsForStatement(
        user.id,
        parsedStartDate,
        parsedEndDate,
        2000,
      );

      if (fetchErr) {
        Alert.alert('Error', fetchErr || 'Failed to fetch transactions. Please try again.');
        setGeneratingStatement(false);
        return;
      }

      if (!transactionsData || transactionsData.length === 0) {
        Alert.alert(
          'No Transactions',
          `You have no transactions between ${formatDateForDisplay(parsedStartDate)} and ${formatDateForDisplay(parsedEndDate)}.`,
        );
        setGeneratingStatement(false);
        return;
      }

      const escapeHtml = (s: string) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const userName = getUserName();
      const userEmail = getUserEmail();
      const rawPhone = userProfile?.phone_number || userProfile?.phone;
      const userPhone =
        rawPhone != null && String(rawPhone).trim() !== '' ? String(rawPhone).trim() : '';

      const statementRef = (tx: Record<string, unknown>) => {
        const ext = [tx.external_reference, tx.external_order_id, tx.external_transaction_id].find(
          (v) => v != null && String(v).trim() !== '',
        );
        if (ext) return escapeHtml(String(ext));
        const hash = tx.transaction_hash ? String(tx.transaction_hash) : '';
        if (hash.length > 10) return escapeHtml(`${hash.slice(0, 14)}…`);
        return escapeHtml(String(tx.id ?? '').slice(0, 8));
      };

      const statementAmountDisplay = (tx: Record<string, unknown>) => {
        const cryptoCur = tx.crypto_currency != null ? String(tx.crypto_currency) : '';
        const fiatCur = tx.fiat_currency != null ? String(tx.fiat_currency) : 'NGN';
        const cryptoAmt =
          tx.crypto_amount != null && tx.crypto_amount !== '' ? Number(tx.crypto_amount) : NaN;
        const fiatAmt =
          tx.fiat_amount != null && tx.fiat_amount !== '' ? Number(tx.fiat_amount) : NaN;
        const isCryptoRow =
          cryptoCur && cryptoCur !== 'FIAT' && !Number.isNaN(cryptoAmt) && cryptoAmt !== 0;
        if (isCryptoRow) {
          const n = Math.abs(cryptoAmt);
          const cryptoPart = `${cryptoCur} ${n.toLocaleString('en-US', {
            minimumFractionDigits: 6,
            maximumFractionDigits: 8,
          })}`;
          if (!Number.isNaN(fiatAmt) && fiatAmt !== 0) {
            const fiatPart =
              fiatCur === 'NGN'
                ? `₦${Math.abs(fiatAmt).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : `${fiatCur} ${Math.abs(fiatAmt).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`;
            return escapeHtml(`${fiatPart} (≈ ${cryptoPart})`);
          }
          return escapeHtml(cryptoPart);
        }
        if (!Number.isNaN(fiatAmt)) {
          const n = Math.abs(fiatAmt);
          if (fiatCur === 'NGN') {
            return escapeHtml(
              `₦${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            );
          }
          return escapeHtml(
            `${fiatCur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          );
        }
        if (!Number.isNaN(cryptoAmt) && cryptoAmt !== 0) {
          return escapeHtml(String(Math.abs(cryptoAmt)));
        }
        return '—';
      };

      const statementFee = (tx: Record<string, unknown>) => {
        const f = tx.fee_amount;
        if (f == null || f === '') return '—';
        const n = Number(f);
        if (Number.isNaN(n) || n === 0) return '—';
        const cur = String(tx.fee_currency || tx.fiat_currency || 'NGN');
        if (cur === 'NGN') {
          return escapeHtml(
            `₦${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          );
        }
        return escapeHtml(
          `${cur} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`,
        );
      };

      const formatDate = (dateString: string) => {
        try {
          return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          return dateString;
        }
      };

      const safeName = escapeHtml(userName);
      const safeEmail = escapeHtml(userEmail || '—');
      const safePhone = userPhone ? escapeHtml(userPhone) : '';

      // Generate HTML for PDF
      const htmlContent = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8">
                    <title>Transaction Statement - ${safeName}</title>
                    <style>
                      body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        color: #333;
                      }
                      .header {
                        text-align: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #6B46C1;
                        padding-bottom: 20px;
                      }
                      .header h1 {
                        color: #6B46C1;
                        margin: 0;
                      }
                      .user-info {
                        margin-bottom: 20px;
                      }
                      .user-info p {
                        margin: 5px 0;
                      }
                      .date-range {
                        margin-bottom: 20px;
                        color: #666;
                      }
                      table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                        font-size: 12px;
                      }
                      th {
                        background-color: #6B46C1;
                        color: white;
                        padding: 12px;
                        text-align: left;
                        font-weight: bold;
                      }
                      td {
                        padding: 10px;
                        border-bottom: 1px solid #ddd;
                      }
                      tr:nth-child(even) {
                        background-color: #f9f9f9;
                      }
                      .status-completed {
                        color: #10B981;
                        font-weight: bold;
                      }
                      .status-pending {
                        color: #F59E0B;
                        font-weight: bold;
                      }
                      .status-failed {
                        color: #EF4444;
                        font-weight: bold;
                      }
                      .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                      }
                      .summary {
                        margin-top: 20px;
                        padding: 15px;
                        background-color: #F3F4F6;
                        border-radius: 8px;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <h1>Transaction Statement</h1>
                      <p>ChainCola Platform</p>
                    </div>
                    
                    <div class="user-info">
                      <h2>User Information</h2>
                      <p><strong>Name:</strong> ${safeName}</p>
                      <p><strong>Email:</strong> ${safeEmail}</p>
                      ${safePhone ? `<p><strong>Phone:</strong> ${safePhone}</p>` : ''}
                      <p><strong>Account ID:</strong> ${escapeHtml(user.id)}</p>
                    </div>
                    
                    <div class="date-range">
                      <p><strong>Statement Period:</strong> ${formatDateForDisplay(parsedStartDate)} - ${formatDateForDisplay(parsedEndDate)}</p>
                      <p><strong>Total Transactions:</strong> ${transactionsData.length}</p>
                    </div>
                    
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Reference</th>
                          <th>Type</th>
                          <th>Asset</th>
                          <th>Amount</th>
                          <th>Fee</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${transactionsData
                          .map((tx: Record<string, unknown>) => {
                            const status = String(tx.status || '').toUpperCase();
                            const statusClass =
                              status === 'COMPLETED' || status === 'CONFIRMED'
                                ? 'status-completed'
                                : status === 'FAILED' || status === 'CANCELLED'
                                  ? 'status-failed'
                                  : 'status-pending';
                            const statusText =
                              status === 'COMPLETED' || status === 'CONFIRMED'
                                ? 'Completed'
                                : status === 'FAILED' || status === 'CANCELLED'
                                  ? 'Failed'
                                  : 'Pending';

                            const currency =
                              tx.crypto_currency && String(tx.crypto_currency) !== 'FIAT'
                                ? String(tx.crypto_currency)
                                : String(tx.fiat_currency || 'NGN');

                            const transactionType = String(tx.transaction_type || '').toUpperCase() || 'N/A';
                            const created = typeof tx.created_at === 'string' ? tx.created_at : '';

                            return `
                            <tr>
                              <td>${formatDate(created)}</td>
                              <td>${statementRef(tx)}</td>
                              <td>${escapeHtml(transactionType)}</td>
                              <td>${escapeHtml(currency)}</td>
                              <td>${statementAmountDisplay(tx)}</td>
                              <td>${statementFee(tx)}</td>
                              <td class="${statusClass}">${statusText}</td>
                            </tr>
                          `;
                          })
                          .join('')}
                      </tbody>
                    </table>
                    
                    <div class="summary">
                      <h3>Summary</h3>
                      <p><strong>Total Transactions:</strong> ${transactionsData.length}</p>
                      <p><strong>Completed:</strong> ${transactionsData.filter((t: any) => (t.status || '').toUpperCase() === 'COMPLETED' || (t.status || '').toUpperCase() === 'CONFIRMED').length}</p>
                      <p><strong>Pending:</strong> ${transactionsData.filter((t: any) => (t.status || '').toUpperCase() !== 'COMPLETED' && (t.status || '').toUpperCase() !== 'CONFIRMED' && (t.status || '').toUpperCase() !== 'FAILED' && (t.status || '').toUpperCase() !== 'CANCELLED').length}</p>
                      <p><strong>Failed:</strong> ${transactionsData.filter((t: any) => (t.status || '').toUpperCase() === 'FAILED' || (t.status || '').toUpperCase() === 'CANCELLED').length}</p>
                    </div>
                    
                    <div class="footer">
                      <p>Generated on ${new Date().toLocaleString()}</p>
                      <p>This is an automated statement from ChainCola Platform</p>
                    </div>
                  </body>
                </html>
              `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      // If send to email is enabled, send via email
      if (sendToEmail && emailAddress.trim()) {
        try {
          // Read PDF file as base64 using legacy FileSystem API
          // Use string literal 'base64' directly (EncodingType enum may not be available)
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">Transaction Statement</h1>
                <p style="color: #E9D5FF; margin: 8px 0 0 0;">ChainCola Platform</p>
              </div>
              <div style="background: #FFFFFF; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #E5E7EB; border-top: none;">
                <p style="font-size: 16px; color: #374151; margin-bottom: 16px;">Dear ${safeName},</p>
                <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 16px;">
                  Please find attached your transaction statement for the period <strong>${formatDateForDisplay(parsedStartDate)}</strong> to <strong>${formatDateForDisplay(parsedEndDate)}</strong>.
                </p>
                <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Total Transactions:</strong> ${transactionsData.length}</p>
                </div>
                <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-top: 20px;">
                  If you have any questions, please contact our support team at <a href="mailto:support@chaincola.com" style="color: #6B46C1;">support@chaincola.com</a>.
                </p>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                  <p style="margin: 0; font-size: 14px; color: #6B7280;">Best regards,<br><strong style="color: #6B46C1;">ChainCola Team</strong></p>
                </div>
              </div>
            </div>
          `;

          type SendEmailResult = { success?: boolean; error?: string; skipped?: boolean; message?: string };
          const { data: fnData, error: fnError } = await supabase.functions.invoke<SendEmailResult>('send-email', {
            body: {
              to: emailAddress.trim(),
              subject: `Transaction Statement - ${formatDateForDisplay(parsedStartDate)} to ${formatDateForDisplay(parsedEndDate)}`,
              html: emailHtml,
              userId: user.id,
              type: 'statement',
              attachments: [
                {
                  filename: `statement-${formatDateForQuery(parsedStartDate)}-to-${formatDateForQuery(parsedEndDate)}.pdf`,
                  content: base64,
                  type: 'application/pdf',
                },
              ],
            },
          });

          if (fnError) {
            throw new Error(
              fnError.message ||
                'Could not reach send-email. Check network and that the edge function is deployed.',
            );
          }

          const result = fnData;
          if (result?.success && !result.skipped) {
            setSuccessMessage(`Statement PDF has been sent to ${emailAddress.trim()}`);
            setShowSuccessModal(true);
          } else if (result?.skipped) {
            throw new Error('Email was not sent (notifications disabled). Try sharing the PDF instead.');
          } else {
            throw new Error(result?.error || 'Failed to send email');
          }
        } catch (emailError: any) {
          console.error('Error sending email:', emailError);
          Alert.alert(
            'Email Error',
            `Failed to send email: ${emailError?.message || 'Unknown error'}. The PDF has been generated locally.`,
            [
              { text: 'OK' },
              {
                text: 'Share Instead',
                onPress: async () => {
                  const isAvailable = await Sharing.isAvailableAsync();
                  if (isAvailable) {
                    await Sharing.shareAsync(uri, {
                      mimeType: 'application/pdf',
                      dialogTitle: `Transaction Statement - ${userName}`,
                    });
                  }
                },
              },
            ]
          );
        }
      } else {
        // Share PDF locally
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Transaction Statement - ${userName}`,
          });
          setSuccessMessage('Statement generated and shared successfully!');
          setShowSuccessModal(true);
        } else {
          setSuccessMessage('Statement generated successfully! However, sharing is not available on this device.');
          setShowSuccessModal(true);
        }
      }
    } catch (error: any) {
      console.error('Error generating statement:', error);
      Alert.alert('Error', `Failed to generate statement: ${error?.message || 'Unknown error'}`);
    } finally {
      setGeneratingStatement(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/auth/signin');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const toggleBiometric = async (value: boolean) => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please sign in again.');
      return;
    }

    try {
      // If turning OFF, also remove stored biometric credentials so biometric login is not possible.
      // The sign-in screen enables biometric login based on stored credentials presence.
      if (value === false) {
        const { deleteBiometricCredentials } = await import('@/lib/biometric-service');
        await deleteBiometricCredentials();
      }

      const biometricType = await getBiometricType();
      const success = await saveBiometricPreference(user.id, value, biometricType || undefined);
      
      if (success) {
        setBiometricEnabled(value);
        Alert.alert(
          'Success',
          value 
            ? 'Biometric authentication has been enabled.' 
            : 'Biometric authentication has been disabled.'
        );
      } else {
        Alert.alert('Error', 'Failed to update biometric preference. Please try again.');
      }
    } catch (error) {
      console.error('Error toggling biometric:', error);
      Alert.alert('Error', 'Failed to update biometric preference. Please try again.');
    }
  };

  const toggleNetworkMode = async (value: boolean) => {
    try {
      const newMode = value ? 'testnet' : 'mainnet';
      await setNetworkMode(newMode);
      Alert.alert(
        'Network Mode Changed',
        `Switched to ${value ? 'Test Mode' : 'Live Mode'}. Please restart the app for changes to take full effect.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error toggling network mode:', error);
      Alert.alert('Error', 'Failed to update network mode. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText 
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Profile
          </ThemedText>
          <ThemedText style={styles.subtitle}>Your account settings</ThemedText>
        </View>

        <LinearGradient
          colors={['#6B46C1', '#9333EA', '#A855F7']}
          style={styles.purpleCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.cardContent}>
            {loading ? (
              <ActivityIndicator size="large" color="#FFFFFF" />
            ) : (
              <>
                <View style={styles.avatarContainer}>
                  <ThemedText style={styles.avatarText}>{getUserAvatar()}</ThemedText>
                </View>
                <View style={styles.nameContainer}>
                  <ThemedText 
                    style={styles.cardTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {getUserName()}
                  </ThemedText>
                  {verificationStatus === 'verified' && (
                    <MaterialIcons 
                      name="verified" 
                      size={20} 
                      color="#10B981" 
                      style={styles.verifiedBadge}
                    />
                  )}
                </View>
                <ThemedText 
                  style={styles.cardSubtext}
                  numberOfLines={2}
                >
                  {getUserEmail()}
                </ThemedText>
                {verificationStatus === 'pending' && (
                  <View style={styles.statusBadge}>
                    <ThemedText style={styles.statusBadgeText}>Under Review</ThemedText>
                  </View>
                )}
                {verificationStatus === 'rejected' && (
                  <View style={[styles.statusBadge, styles.statusBadgeRejected]}>
                    <ThemedText style={styles.statusBadgeText}>Failed - Try Again</ThemedText>
                  </View>
                )}
              </>
            )}
          </View>
        </LinearGradient>

        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="edit" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Edit Profile</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.menuItem,
              (!verificationStatus || verificationStatus === 'rejected') && styles.menuItemUnverified
            ]}
            onPress={handleVerifyAccount}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[
                styles.iconContainer,
                (!verificationStatus || verificationStatus === 'rejected')
                  ? { backgroundColor: '#FEE2E2' }
                  : { backgroundColor: '#EDE9FE' }
              ]}>
                <MaterialIcons
                  name={(!verificationStatus || verificationStatus === 'rejected') ? 'flag' : 'verified-user'}
                  size={18}
                  color={(!verificationStatus || verificationStatus === 'rejected') ? '#EF4444' : '#6B46C1'}
                />
              </View>
              <View style={styles.menuItemContent}>
                <View style={styles.menuItemTextContainer}>
                  <ThemedText style={styles.menuItemText}>Verify Account</ThemedText>
                  {(!verificationStatus || verificationStatus === 'rejected') && (
                    <View style={styles.redFlagBadge}>
                      <MaterialIcons name="flag" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                {verificationStatus === 'approved' && (
                  <ThemedText style={[styles.menuItemSubtitle, { color: '#10B981' }]}>✓ Verified</ThemedText>
                )}
                {verificationStatus === 'pending' && (
                  <ThemedText style={[styles.menuItemSubtitle, { color: '#F59E0B' }]}>Under Review</ThemedText>
                )}
                {verificationStatus === 'rejected' && (
                  <ThemedText style={[styles.menuItemSubtitle, { color: '#EF4444' }]}>Failed - Try Again</ThemedText>
                )}
                {!verificationStatus && (
                  <ThemedText style={[styles.menuItemSubtitle, { color: '#EF4444', fontWeight: '600' }]}>
                    ⚠️ Account not verified
                  </ThemedText>
                )}
              </View>
            </View>
            <View style={styles.menuItemRight}>
              {(!verificationStatus || verificationStatus === 'rejected') && (
                <View style={styles.urgentIndicator}>
                  <MaterialIcons name="priority-high" size={14} color="#EF4444" />
                </View>
              )}
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={(!verificationStatus || verificationStatus === 'rejected') ? '#EF4444' : '#9CA3AF'}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="fingerprint" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Biometric Authentication</ThemedText>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometric}
              trackColor={{ false: '#D1D5DB', true: '#6B46C1' }}
              thumbColor={biometricEnabled ? '#FFFFFF' : '#F3F4F6'}
            />
          </View>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleSecurityPin}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="lock" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Security & PIN</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleNotifications}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="notifications" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Notifications</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleReferral}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="card-giftcard" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Referral</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleContactUs}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="support-agent" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Contact Us</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleChatSupport}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="chat" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Live Chat</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleGenerateStatement}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="description" size={18} color="#6B46C1" />
              </View>
              <ThemedText style={styles.menuItemText}>Generate Statement</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleTermsConditions}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="description" size={18} color="#EF4444" />
              </View>
              <ThemedText style={styles.menuItemText}>Terms and Conditions</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handlePrivacyPolicy}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="privacy-tip" size={18} color="#EF4444" />
              </View>
              <ThemedText style={styles.menuItemText}>Privacy Policy</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.deleteItem]}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
              </View>
              <ThemedText style={[styles.menuItemText, styles.deleteText]}>Delete Account</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#EF4444" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#EF4444', '#DC2626']}
              style={styles.logoutButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <MaterialIcons name="logout" size={18} color="#FFFFFF" />
              <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Statement Generation Modal */}
      <Modal
        visible={showStatementModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowStatementModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Generate Statement</ThemedText>
              <TouchableOpacity
                onPress={() => setShowStatementModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Date Range Selection */}
              <View style={styles.dateRangeSection}>
                <ThemedText style={styles.sectionLabel}>Select Date Range</ThemedText>
                
                <View style={styles.dateInputContainer}>
                  <ThemedText style={styles.dateLabel}>Start Date</ThemedText>
                  <View style={styles.dateInputWrapper}>
                    <MaterialIcons name="calendar-today" size={20} color="#6B46C1" style={styles.dateIcon} />
                    <TextInput
                      style={styles.dateInput}
                      value={startDateInput}
                      onChangeText={handleStartDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      maxLength={10}
                    />
                  </View>
                  <ThemedText style={styles.dateHint}>
                    Selected: {formatDateForDisplay(startDate)}
                  </ThemedText>
                </View>

                <View style={styles.dateInputContainer}>
                  <ThemedText style={styles.dateLabel}>End Date</ThemedText>
                  <View style={styles.dateInputWrapper}>
                    <MaterialIcons name="calendar-today" size={20} color="#6B46C1" style={styles.dateIcon} />
                    <TextInput
                      style={styles.dateInput}
                      value={endDateInput}
                      onChangeText={handleEndDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      maxLength={10}
                    />
                  </View>
                  <ThemedText style={styles.dateHint}>
                    Selected: {formatDateForDisplay(endDate)}
                  </ThemedText>
                </View>
              </View>

              {/* Email Option */}
              <View style={styles.emailSection}>
                <View style={styles.switchContainer}>
                  <ThemedText style={styles.switchLabel}>Send to Email</ThemedText>
                  <Switch
                    value={sendToEmail}
                    onValueChange={setSendToEmail}
                    trackColor={{ false: '#D1D5DB', true: '#A78BFA' }}
                    thumbColor={sendToEmail ? '#6B46C1' : '#F3F4F6'}
                  />
                </View>

                {sendToEmail && (
                  <View style={styles.emailInputContainer}>
                    <ThemedText style={styles.emailLabel}>Email Address</ThemedText>
                    <TextInput
                      style={styles.emailInput}
                      value={emailAddress}
                      onChangeText={setEmailAddress}
                      placeholder="Enter email address"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowStatementModal(false)}
                disabled={generatingStatement}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.generateButton, generatingStatement && styles.disabledButton]}
                onPress={generateStatementPDF}
                disabled={generatingStatement}
              >
                {generatingStatement ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="description" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.generateButtonText}>
                      {sendToEmail ? 'Generate & Send' : 'Generate PDF'}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Modal */}
      <Modal
        visible={generatingStatement}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.loadingModalOverlay}>
          <View style={styles.loadingModalContent}>
            <LinearGradient
              colors={['#6B46C1', '#9333EA', '#A855F7']}
              style={styles.loadingGradientCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <ActivityIndicator size="large" color="#FFFFFF" />
            </LinearGradient>
            <ThemedText style={styles.loadingModalTitle}>
              {sendToEmail ? 'Generating & Sending Statement' : 'Generating Statement'}
            </ThemedText>
            <ThemedText style={styles.loadingModalSubtext}>
              {sendToEmail 
                ? 'Please wait while we generate your PDF and send it to your email...'
                : 'Please wait while we generate your PDF statement...'}
            </ThemedText>
            <View style={styles.loadingSteps}>
              <View style={styles.loadingStep}>
                <MaterialIcons name="check-circle" size={20} color="#10B981" />
                <ThemedText style={styles.loadingStepText}>Fetching transactions</ThemedText>
              </View>
              <View style={styles.loadingStep}>
                <MaterialIcons name="description" size={20} color="#6B46C1" />
                <ThemedText style={styles.loadingStepText}>Generating PDF</ThemedText>
              </View>
              {sendToEmail && (
                <View style={styles.loadingStep}>
                  <MaterialIcons name="email" size={20} color="#6B46C1" />
                  <ThemedText style={styles.loadingStepText}>Sending email</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowSuccessModal(false);
          setGeneratingStatement(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <LinearGradient
              colors={['#6B46C1', '#9333EA', '#A855F7']}
              style={styles.successIconContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialIcons name="check-circle" size={64} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText style={styles.successModalTitle}>
              Success!
            </ThemedText>
            <ThemedText style={styles.successModalMessage}>
              {successMessage}
            </ThemedText>
            <TouchableOpacity
              style={styles.successModalButton}
              onPress={() => {
                setShowSuccessModal(false);
                setGeneratingStatement(false);
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA']}
                style={styles.successModalButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.successModalButtonText}>Done</ThemedText>
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
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    width: '100%',
    paddingRight: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 38,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 22,
  },
  purpleCard: {
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    minHeight: 160,
    width: '100%',
  },
  cardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 4,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 24,
  },
  cardTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 6,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  cardSubtext: {
    fontSize: 13,
    color: '#E9D5FF',
    opacity: 0.9,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  menuContainer: {
    marginTop: 20,
    gap: 3,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  menuItemSubtitle: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
  menuItemTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuItemUnverified: {
    borderColor: '#FEE2E2',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
  },
  redFlagBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgentIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  statusBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    alignSelf: 'center',
  },
  statusBadgeRejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  deleteItem: {
    borderColor: '#FEE2E2',
  },
  deleteText: {
    color: '#EF4444',
  },
  logoutButton: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  logoutButtonGradient: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '96%',
    maxWidth: 440,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  dateRangeSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  dateInputContainer: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateIcon: {
    marginRight: 12,
  },
  dateInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    padding: 0,
  },
  dateHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    marginLeft: 4,
  },
  emailSection: {
    marginTop: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  emailInputContainer: {
    marginTop: 12,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  emailInput: {
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 15,
    color: '#111827',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  generateButton: {
    backgroundColor: '#6B46C1',
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 320,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  loadingGradientCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingModalSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  loadingSteps: {
    width: '100%',
    gap: 12,
  },
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  loadingStepText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    margin: 20,
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
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#11181C',
  },
  successModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
    lineHeight: 22,
    color: '#374151',
  },
  successModalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  successModalButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successModalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

