// Verification Service
// Handles user account verification status
import { supabase } from './supabase';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | null;

export interface VerificationData {
  id: string;
  user_id: string;
  status: VerificationStatus;
  submitted_at?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  full_name?: string;
  phone_number?: string;
  address?: string;
  nin?: string;
  nin_front_url?: string;
  nin_back_url?: string;
  passport_photo_url?: string;
}

/**
 * Convert base64 string to Uint8Array (React Native compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Remove data URL prefix if present
  let base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  
  // Decode base64
  let binaryString: string;
  
  if (typeof atob !== 'undefined') {
    binaryString = atob(base64Data);
  } else {
    // Fallback for environments without atob
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let result = '';
    let i = 0;
    base64Data = base64Data.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < base64Data.length) {
      const enc1 = chars.indexOf(base64Data.charAt(i++));
      const enc2 = chars.indexOf(base64Data.charAt(i++));
      const enc3 = chars.indexOf(base64Data.charAt(i++));
      const enc4 = chars.indexOf(base64Data.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      result += String.fromCharCode(chr1);
      if (enc3 !== 64) result += String.fromCharCode(chr2);
      if (enc4 !== 64) result += String.fromCharCode(chr3);
    }
    binaryString = result;
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Upload an image file to Supabase Storage
 */
async function uploadImageToStorage(
  userId: string,
  imageUri: string,
  fileName: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Create a unique file path - user_id must be the first folder for RLS policy
    const filePath = `${userId}/${Date.now()}_${fileName}`;

    let fileData: Uint8Array;

    try {
      if (imageUri.startsWith('file://') || imageUri.startsWith('content://') || imageUri.startsWith('ph://')) {
        // React Native: Read as base64 and convert
        // Use string literal 'base64' directly (EncodingType enum may not be available)
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: 'base64' as any,
        });
        fileData = base64ToUint8Array(base64);
      } else if (imageUri.startsWith('data:')) {
        // Data URI: Extract base64 and convert
        fileData = base64ToUint8Array(imageUri);
      } else {
        // Web: Fetch the file with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        try {
          const response = await fetch(imageUri, { signal: controller.signal });
          clearTimeout(timeoutId);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          fileData = new Uint8Array(arrayBuffer);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
            throw new Error('Image read timeout. Please try again with a smaller image or check your connection.');
          }
          throw fetchError;
        }
      }
    } catch (readError: any) {
      console.error('Error reading image file:', readError);
      if (readError.message?.includes('timeout') || readError.message?.includes('aborted')) {
        return { 
          success: false, 
          error: 'Image read timeout. The image may be too large or your connection is slow. Please try again.' 
        };
      }
      return { 
        success: false, 
        error: `Failed to read image: ${readError.message || 'Unknown error'}` 
      };
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('verification-documents')
      .upload(filePath, fileData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      // Enhanced error logging for debugging
      console.error('Error uploading image:', {
        name: error.name,
        message: error.message,
        type: error.constructor?.name,
        error: String(error),
        fullError: error,
      });
      
      // Handle abort/timeout errors - check error name, message, and type
      const errorName = error.name || '';
      const errorMessage = error.message || '';
      const errorString = String(error);
      const errorType = error.constructor?.name || '';
      
      // Check for StorageUnknownError with Aborted message
      // StorageUnknownError is thrown by Supabase Storage when upload is aborted
      const isAbortedError = 
        errorName === 'StorageUnknownError' ||
        errorName.includes('StorageUnknown') ||
        errorType === 'StorageUnknownError' ||
        errorName.includes('Abort') ||
        errorName.includes('Aborted') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('Aborted') ||
        errorMessage.includes('AbortError') ||
        errorMessage.toLowerCase().includes('timeout') ||
        errorString.includes('Aborted') ||
        errorString.includes('aborted') ||
        (errorName === 'StorageUnknownError' && (errorMessage.includes('Aborted') || errorMessage === 'Aborted'));
      
      if (isAbortedError) {
        console.warn('⚠️ Upload aborted - likely due to timeout or network issue');
        return { 
          success: false, 
          error: 'Upload timeout. The image may be too large or your connection is slow. Please try again with a smaller image or check your internet connection.' 
        };
      }
      
      // Check if bucket doesn't exist - provide helpful error message
      if (
        errorMessage.includes('Bucket not found') || 
        errorMessage.includes('does not exist') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Bucket') && errorMessage.includes('not')
      ) {
        return { 
          success: false, 
          error: 'Storage bucket "verification-documents" not found. Please create it in Supabase Dashboard: Storage → New bucket → Name: verification-documents → Private' 
        };
      }
      
      // Handle network errors
      if (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Network request failed') ||
        errorMessage.toLowerCase().includes('network') ||
        errorMessage.includes('fetch failed')
      ) {
        return { 
          success: false, 
          error: 'Network error. Please check your internet connection and try again.' 
        };
      }
      
      return { success: false, error: errorMessage || String(error) || 'Failed to upload image' };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('verification-documents')
      .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl };
  } catch (error: any) {
    // Enhanced error logging for debugging
    console.error('Error uploading image to storage (catch block):', {
      name: error?.name,
      message: error?.message,
      type: error?.constructor?.name,
      error: String(error),
      fullError: error,
    });
    
    // Handle abort/timeout errors in catch block - check error name, message, and type
    const errorName = error?.name || '';
    const errorMessage = error?.message || '';
    const errorString = String(error);
    const errorType = error?.constructor?.name || '';
    
    // Check for StorageUnknownError with Aborted message
    // StorageUnknownError is thrown by Supabase Storage when upload is aborted
    const isAbortedError = 
      errorName === 'StorageUnknownError' ||
      errorName.includes('StorageUnknown') ||
      errorType === 'StorageUnknownError' ||
      errorName.includes('Abort') ||
      errorName.includes('Aborted') ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('Aborted') ||
      errorMessage.includes('AbortError') ||
      errorMessage.toLowerCase().includes('timeout') ||
      errorString.includes('Aborted') ||
      errorString.includes('aborted') ||
      (errorName === 'StorageUnknownError' && (errorMessage.includes('Aborted') || errorMessage === 'Aborted'));
    
    if (isAbortedError) {
      console.warn('⚠️ Upload aborted in catch block - likely due to timeout or network issue');
      return { 
        success: false, 
        error: 'Upload timeout. Please try again with a smaller image or check your internet connection.' 
      };
    }
    
    // Handle network errors
    if (
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('Network request failed') ||
      errorMessage.includes('fetch failed') ||
      errorMessage.toLowerCase().includes('network')
    ) {
      return { 
        success: false, 
        error: 'Network error. Please check your internet connection and try again.' 
      };
    }
    
    return { success: false, error: errorMessage || String(error) || 'Failed to upload image' };
  }
}

/**
 * Get user verification status from database
 */
export async function getUserVerificationStatus(userId: string): Promise<VerificationStatus> {
  try {
    const { data, error } = await supabase
      .from('account_verifications')
      .select('status')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // Safely check if error is an object before accessing properties
      const errorObj = error && typeof error === 'object' ? error : {};
      
      // If no record found, return null (not an error)
      if ((errorObj as any).code === 'PGRST116') {
        return null;
      }
      
      // Silently return on abort (user navigated away, request cancelled)
      const isAbortError = (errorObj as any).name === 'AbortError' || 
                          (errorObj as any).message?.includes?.('Aborted');
      if (isAbortError) {
        return null;
      }
      
      // Handle empty or malformed error objects
      const hasErrorProperties = (errorObj as any).code || (errorObj as any).message || (errorObj as any).details || (errorObj as any).hint;
      
      if (!hasErrorProperties) {
        // Empty error object - likely a network error
        console.warn('⚠️ Empty error object when fetching verification status. UserId:', userId);
        return null;
      }
      
      // Log error with available information
      const errorDetails: any = {};
      if ((errorObj as any).code) errorDetails.code = (errorObj as any).code;
      if ((errorObj as any).message) errorDetails.message = (errorObj as any).message;
      if ((errorObj as any).details) errorDetails.details = (errorObj as any).details;
      
      // Only log if we have actual error information (check for actual values, not just truthy)
      const hasErrorInfo = (errorDetails.code && String(errorDetails.code).trim()) || 
                          (errorDetails.message && String(errorDetails.message).trim()) || 
                          (errorDetails.details && String(errorDetails.details).trim());
      
      // Also check if errorDetails has any keys with serializable values
      const errorDetailsKeys = Object.keys(errorDetails).filter(key => {
        const value = errorDetails[key];
        return value !== null && 
               value !== undefined && 
               String(value).trim() !== '' &&
               typeof value !== 'function';
      });
      
      if (hasErrorInfo && errorDetailsKeys.length > 0) {
        // Safely log error - catch any serialization errors
        try {
          // Build a safe log object with only serializable values
          const safeLogObject: any = { userId };
          errorDetailsKeys.forEach(key => {
            try {
              const value = errorDetails[key];
              // Only include serializable values
              if (value !== null && value !== undefined && typeof value !== 'function') {
                safeLogObject[key] = String(value);
              }
            } catch {
              // Skip non-serializable properties
            }
          });
          
          if (Object.keys(safeLogObject).length > 1) { // More than just userId
            console.error('Error fetching verification status:', safeLogObject);
          } else {
            console.warn('Error fetching verification status (empty error object):', { userId });
          }
        } catch (logError) {
          // If logging fails, just warn with minimal info
          console.warn('Error fetching verification status (logging failed):', { userId });
        }
      } else {
        // Don't log empty error objects
        console.warn('Error fetching verification status (empty error object):', { userId });
      }
      return null;
    }

    return data?.status || null;
  } catch (error: any) {
    // Silently return on abort (request cancelled, user navigated away)
    if (error?.name === 'AbortError' || error?.message?.includes?.('Aborted')) {
      return null;
    }
    console.error('Error fetching verification status:', error);
    return null;
  }
}

/**
 * Get full verification data for a user
 */
export async function getUserVerificationData(userId: string): Promise<VerificationData | null> {
  try {
    const { data, error } = await supabase
      .from('account_verifications')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching verification data:', error);
      return null;
    }

    return data as VerificationData;
  } catch (error) {
    console.error('Error fetching verification data:', error);
    return null;
  }
}

/**
 * Verify BVN or NIN using Flutterwave API (Edge Function)
 * Flutterwave supports BVN verification. NIN-only returns an error asking for BVN.
 */
export async function verifyBVNOrNIN(
  options: {
    bvn?: string;
    nin?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
  }
): Promise<{ success: boolean; verified?: boolean; data?: any; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl ||
                         process.env.NEXT_PUBLIC_SUPABASE_URL ||
                         process.env.EXPO_PUBLIC_SUPABASE_URL ||
                         'https://slleojsdpctxhlsoyenr.supabase.co';

    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-nin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        bvn: options.bvn,
        nin: options.nin,
        first_name: options.firstName,
        last_name: options.lastName,
        phone_number: options.phoneNumber,
        date_of_birth: options.dateOfBirth,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.status === 'error') {
      return {
        success: false,
        verified: false,
        error: result.message || 'Failed to verify',
      };
    }

    return {
      success: true,
      verified: result.verified || false,
      data: result.data,
    };
  } catch (error: any) {
    console.error('Exception verifying BVN/NIN:', error);
    return { success: false, error: error.message || 'Failed to verify' };
  }
}

/** @deprecated Use verifyBVNOrNIN instead */
export async function verifyNIN(
  nin: string,
  firstName?: string,
  lastName?: string,
  phoneNumber?: string,
  dateOfBirth?: string
): Promise<{ success: boolean; verified?: boolean; data?: any; error?: string }> {
  return verifyBVNOrNIN({ nin, firstName, lastName, phoneNumber, dateOfBirth });
}

/**
 * Submit verification documents
 */
export async function submitVerification(
  userId: string,
  data: {
    fullName: string;
    phoneNumber: string;
    address: string;
    nin: string;
    ninFront: string;
    ninBack: string;
    passportPhoto: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📤 Submitting verification documents for user:', userId);

    // Step 1: Upload images to Supabase Storage
    console.log('📤 Uploading NIN front image...');
    const ninFrontUpload = await uploadImageToStorage(
      userId,
      data.ninFront,
      'nin_front.jpg'
    );
    if (!ninFrontUpload.success) {
      return { success: false, error: `Failed to upload NIN front: ${ninFrontUpload.error}` };
    }

    console.log('📤 Uploading NIN back image...');
    const ninBackUpload = await uploadImageToStorage(
      userId,
      data.ninBack,
      'nin_back.jpg'
    );
    if (!ninBackUpload.success) {
      return { success: false, error: `Failed to upload NIN back: ${ninBackUpload.error}` };
    }

    console.log('📤 Uploading passport photo...');
    const passportUpload = await uploadImageToStorage(
      userId,
      data.passportPhoto,
      'passport_photo.jpg'
    );
    if (!passportUpload.success) {
      return { success: false, error: `Failed to upload passport photo: ${passportUpload.error}` };
    }

    // Step 2: Check if there's an existing pending verification
    // If so, we need to delete it first (due to unique constraint)
    const { data: existingVerification } = await supabase
      .from('account_verifications')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existingVerification) {
      console.log('🗑️ Removing existing pending verification...');
      await supabase
        .from('account_verifications')
        .delete()
        .eq('id', existingVerification.id);
    }

    // Step 3: Create verification record in database
    console.log('💾 Creating verification record...');
    const { data: verificationData, error: insertError } = await supabase
      .from('account_verifications')
      .insert({
        user_id: userId,
        full_name: data.fullName.trim(),
        phone_number: data.phoneNumber.trim(),
        address: data.address.trim(),
        nin: data.nin.trim(),
        nin_front_url: ninFrontUpload.url,
        nin_back_url: ninBackUpload.url,
        passport_photo_url: passportUpload.url,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating verification record:', insertError);
      return {
        success: false,
        error: insertError.message || 'Failed to create verification record',
      };
    }

    console.log('✅ Verification submitted successfully:', verificationData.id);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error submitting verification:', error);
    return { success: false, error: error.message || 'Failed to submit verification' };
  }
}

/**
 * Get verification details by ID (for admin use)
 */
export async function getVerificationById(verificationId: string): Promise<VerificationData | null> {
  try {
    const { data, error } = await supabase
      .from('account_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (error) {
      console.error('Error fetching verification by ID:', error);
      return null;
    }

    return data as VerificationData;
  } catch (error) {
    console.error('Error fetching verification by ID:', error);
    return null;
  }
}
