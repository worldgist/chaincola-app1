import { supabase } from './supabase';

export interface UserProfile {
  id?: string;
  user_id: string;
  name?: string; // Maps to full_name from database
  full_name?: string; // Database column name
  email?: string;
  phone?: string; // Maps to phone_number from database
  phone_number?: string; // Database column name
  address?: string;
  bio?: string;
  country?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetches user profile from Supabase
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    if (!userId) {
      console.warn('getUserProfile called with empty userId');
      return null;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // If profile doesn't exist, return null (not an error)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
        console.log('User profile not found, will be created on first update');
        return null;
      }
      
      // Handle empty or malformed error objects
      // Safely check if error is an object before accessing properties
      const errorObj = error && typeof error === 'object' ? error : {};
      const hasErrorProperties = (errorObj as any).code || (errorObj as any).message || (errorObj as any).details || (errorObj as any).hint;
      const errorKeys = errorObj ? Object.keys(errorObj) : [];
      
      if (!hasErrorProperties && errorKeys.length === 0) {
        // Empty error object - likely a network error or malformed response
        console.warn('⚠️ Empty error object received from Supabase query. This may indicate a network issue.');
        console.warn('   UserId:', userId);
        console.warn('   Check network connectivity and Supabase configuration.');
        return null;
      }
      
      // Log more details about the error
      // Handle cases where error object might not serialize properly
      const errorDetails: any = {};
      
      // Safely extract error properties
      if ((errorObj as any).code) errorDetails.code = (errorObj as any).code;
      if ((errorObj as any).message) errorDetails.message = (errorObj as any).message;
      if ((errorObj as any).details) errorDetails.details = (errorObj as any).details;
      if ((errorObj as any).hint) errorDetails.hint = (errorObj as any).hint;
      
      // Try to get all properties if standard ones are missing
      if (!hasErrorProperties && errorKeys.length > 0) {
        errorKeys.forEach(key => {
          try {
            errorDetails[key] = (errorObj as any)[key];
          } catch {
            // Skip non-serializable properties
          }
        });
      }
      
      // Log error with available information - ensure we always log something meaningful
      if (hasErrorProperties) {
        // Only log if we have meaningful error information (check for actual values, not just truthy)
        const hasErrorInfo = (errorDetails.code && String(errorDetails.code).trim()) || 
                            (errorDetails.message && String(errorDetails.message).trim()) || 
                            (errorDetails.details && String(errorDetails.details).trim()) || 
                            (errorDetails.hint && String(errorDetails.hint).trim());
        
        // Also check if errorDetails has any keys beyond what we might have added
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
              console.error('Error fetching user profile:', safeLogObject);
            } else {
              console.warn('Error fetching user profile (empty error object):', { userId });
            }
          } catch (logError) {
            // If logging fails, just warn with minimal info
            console.warn('Error fetching user profile (logging failed):', { userId });
          }
        } else {
          // Don't log empty error objects - just warn with minimal info
          console.warn('Error fetching user profile (empty error object):', {
            userId,
            errorType: typeof error,
            errorConstructor: errorObj?.constructor?.name,
          });
        }
      } else {
        // Try to stringify the entire error object for debugging
        try {
          const errorString = errorObj && typeof errorObj === 'object' 
            ? JSON.stringify(errorObj, Object.getOwnPropertyNames(errorObj))
            : String(errorObj);
          if (errorString && errorString !== '{}') {
            // Only log if we have error details or meaningful error string
            const hasDetails = Object.keys(errorDetails).length > 0;
            if (hasDetails || errorString !== '{}') {
              console.error('Error fetching user profile (unusual error format):', {
                ...errorDetails,
                rawError: errorString,
                errorType: typeof error,
                errorConstructor: errorObj?.constructor?.name,
                userId,
              });
            } else {
              console.warn('Error fetching user profile (empty error object):', {
                userId,
                errorType: typeof error,
              });
            }
          } else {
            console.warn('Error fetching user profile (empty error object):', {
              userId,
              errorType: typeof error,
            });
          }
        } catch (stringifyError) {
          console.error('Error fetching user profile (non-serializable error):', {
            ...errorDetails,
            errorType: typeof error,
            errorConstructor: errorObj?.constructor?.name,
            stringifyError: String(stringifyError),
          });
        }
      }
      return null;
    }

    if (!data) {
      return null;
    }

    // Map database fields to interface
    return {
      id: data.id,
      user_id: data.user_id,
      full_name: data.full_name,
      name: data.full_name, // Alias for compatibility
      email: data.email,
      phone_number: data.phone_number,
      phone: data.phone_number, // Alias for compatibility
      address: data.address,
      bio: data.bio,
      country: data.country,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error: any) {
    // Handle network timeouts and other exceptions
    if (error?.name === 'AbortError' || error?.message?.includes('timeout')) {
      console.warn('⚠️ User profile fetch timed out:', error.message);
    } else {
      console.error('Exception fetching user profile:', {
        message: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack,
        userId: userId,
      });
    }
    return null;
  }
}

/**
 * Updates user profile in Supabase
 */
export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string;
    full_name?: string; // Database column name (preferred)
    phone?: string;
    phone_number?: string; // Database column name (preferred)
    email?: string;
    address?: string;
    bio?: string;
    country?: string;
  }
): Promise<{ error: any }> {
  try {
    // Map interface fields to database column names
    const dbUpdates: any = {
      updated_at: new Date().toISOString(),
    };

    // Prefer full_name over name, but accept both
    if (updates.full_name !== undefined) {
      dbUpdates.full_name = updates.full_name;
    } else if (updates.name !== undefined) {
      dbUpdates.full_name = updates.name;
    }
    
    // Prefer phone_number over phone, but accept both
    if (updates.phone_number !== undefined) {
      dbUpdates.phone_number = updates.phone_number || null;
    } else if (updates.phone !== undefined) {
      dbUpdates.phone_number = updates.phone || null;
    }
    
    // Handle email update carefully - check for conflicts
    if (updates.email !== undefined && updates.email !== null && updates.email !== '') {
      // Check if email already exists for another user
      const { data: existingUser } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('email', updates.email)
        .neq('user_id', userId)
        .maybeSingle();

      if (existingUser) {
        return { 
          error: { 
            message: 'This email is already associated with another account',
            code: '23505'
          } 
        };
      }
      dbUpdates.email = updates.email;
    }
    
    if (updates.address !== undefined) {
      dbUpdates.address = updates.address || null;
    }
    if (updates.bio !== undefined) {
      dbUpdates.bio = updates.bio || null;
    }
    if (updates.country !== undefined) {
      dbUpdates.country = updates.country || null;
    }

    // Check if profile exists
    const existingProfile = await getUserProfile(userId);

    if (existingProfile) {
      // Update existing profile
      const { error } = await supabase
        .from('user_profiles')
        .update(dbUpdates)
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating user profile:', error);
        return { error };
      }
    } else {
      // Create new profile if it doesn't exist
      const { data: { user } } = await supabase.auth.getUser();
      
      const newProfile = {
        user_id: userId,
        email: user?.email || updates.email || null,
        full_name: dbUpdates.full_name || user?.email?.split('@')[0] || 'User',
        phone_number: dbUpdates.phone_number || null,
        address: dbUpdates.address || null,
        bio: dbUpdates.bio || null,
        country: dbUpdates.country || null,
        ...dbUpdates,
      };

      const { error } = await supabase
        .from('user_profiles')
        .insert(newProfile);

      if (error) {
        console.error('Error creating user profile:', error);
        return { error };
      }
    }

    // Also update auth user metadata if name changed
    if (dbUpdates.full_name) {
      try {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            full_name: dbUpdates.full_name,
            phone_number: dbUpdates.phone_number,
            address: dbUpdates.address,
          },
        });

        if (metadataError) {
          console.error('Error updating auth metadata:', metadataError);
          // Don't fail the whole operation if metadata update fails
        }
      } catch (metadataError) {
        console.error('Exception updating auth metadata:', metadataError);
        // Don't fail the whole operation
      }
    }

    return { error: null };
  } catch (error: any) {
    console.error('Exception updating user profile:', error);
    return { error };
  }
}

function parseSignupAvailabilityPayload(data: unknown): {
  emailExists: boolean;
  phoneExists: boolean;
} | null {
  if (data == null) return null;
  if (typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    return {
      emailExists: Boolean(o.email_exists ?? o.emailExists),
      phoneExists: Boolean(o.phone_exists ?? o.phoneExists),
    };
  }
  return null;
}

/**
 * Checks if email or phone number already exists (signup-safe for anonymous users).
 * Uses DB RPC `check_signup_availability` (SECURITY DEFINER) so RLS on user_profiles does not hide rows.
 * Pass empty string for either field to skip that side of the check (e.g. debounced email-only validation).
 */
export async function checkDuplicateUser(
  email: string,
  phoneNumber: string
): Promise<{
  emailExists: boolean;
  phoneExists: boolean;
  error?: string;
}> {
  const trimmedEmail = (email ?? '').trim();
  const trimmedPhone = (phoneNumber ?? '').trim();

  try {
    const { data, error } = await supabase.rpc('check_signup_availability', {
      p_email: trimmedEmail,
      p_phone: trimmedPhone,
    });

    if (error) {
      console.error('check_signup_availability RPC error:', error);
      return {
        emailExists: false,
        phoneExists: false,
        error: error.message,
      };
    }

    const parsed = parseSignupAvailabilityPayload(data);
    if (parsed) {
      return parsed;
    }

    console.warn('check_signup_availability: unexpected payload', data);
    return { emailExists: false, phoneExists: false, error: 'Unexpected response' };
  } catch (error: any) {
    console.error('Error checking duplicate user:', error);
    return {
      emailExists: false,
      phoneExists: false,
      error: error.message || 'Failed to check for duplicate users',
    };
  }
}

/**
 * Generates user initials from name or email
 */
export function getUserInitials(name?: string, email?: string): string {
  if (name && name.trim().length > 0) {
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      // First and last name initials
      return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    } else if (nameParts.length === 1) {
      // Single name - use first two characters
      const nameStr = nameParts[0];
      if (nameStr.length >= 2) {
        return nameStr.substring(0, 2).toUpperCase();
      }
      return nameStr[0].toUpperCase();
    }
  }

  // Fallback to email initials
  if (email && email.trim().length > 0) {
    const emailLocal = email.split('@')[0];
    if (emailLocal.length >= 2) {
      return emailLocal.substring(0, 2).toUpperCase();
    }
    return emailLocal[0].toUpperCase();
  }

  // Default fallback
  return 'U';
}

