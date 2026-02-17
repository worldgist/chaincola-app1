import { createClient } from './supabase/client';

const supabase = createClient();

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
      if (error.code === 'PGRST116') {
        console.log('User profile not found, will be created on first update');
        return null;
      }
      
      // Handle empty or malformed error objects
      const hasErrorProperties = error.code || error.message || error.details || error.hint;
      const errorKeys = error ? Object.keys(error) : [];
      
      if (!hasErrorProperties && errorKeys.length === 0) {
        // Empty error object - likely a network error or malformed response
        console.warn('⚠️ Empty error object received from Supabase query. This may indicate a network issue.');
        console.warn('   UserId:', userId);
        console.warn('   Check network connectivity and Supabase configuration.');
        return null;
      }
      
      // Log more details about the error
      // Handle cases where error object might not serialize properly (e.g. PostgrestError)
      const errorDetails: Record<string, unknown> = {
        userId,
        errorString: String(error),
        ...(error?.code != null && { code: error.code }),
        ...(error?.message && { message: error.message }),
        ...(error?.details != null && { details: error.details }),
        ...(error?.hint && { hint: error.hint }),
      };

      // Try to get all properties if standard ones are missing
      if (!hasErrorProperties && errorKeys.length > 0) {
        errorKeys.forEach(key => {
          try {
            const val = (error as Record<string, unknown>)[key];
            if (val !== undefined) errorDetails[key] = val;
          } catch {
            // Skip non-serializable properties
          }
        });
      }
      
      // Log error with available information - always include userId and errorString
      if (hasErrorProperties) {
        console.error('Error fetching user profile:', errorDetails);
      } else {
        // Try to stringify the entire error object for debugging
        try {
          const errorString = JSON.stringify(error, Object.getOwnPropertyNames(error));
          if (errorString && errorString !== '{}') {
            console.error('Error fetching user profile (unusual error format):', {
              ...errorDetails,
              rawError: errorString,
              errorType: typeof error,
              errorConstructor: error?.constructor?.name,
            });
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
            errorConstructor: error?.constructor?.name,
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
  } catch (error: unknown) {
    // Handle network timeouts and other exceptions
    if (error instanceof Error) {
      // Check for network-related errors from our custom fetch wrapper
      if (error.name === 'TimeoutError' || error.name === 'AbortError' || error.message?.includes('timeout')) {
        console.warn('⚠️ User profile fetch timed out:', error.message);
        return null;
      }
      
      if (error.name === 'NetworkError' || error.message?.includes('Network error') || error.message?.includes('Failed to fetch')) {
        console.warn('⚠️ Network error fetching user profile:', error.message);
        console.warn('   UserId:', userId);
        console.warn('   This may be a temporary connectivity issue.');
        return null;
      }
      
      // Log other errors with full details
      console.error('Exception fetching user profile:', {
        message: error.message || 'Unknown error',
        name: error.name,
        stack: error.stack,
        userId: userId,
        // Include original error if it was wrapped
        originalError: (error as any).originalError ? String((error as any).originalError) : undefined,
      });
    } else {
      // Handle non-Error objects
      console.error('Exception fetching user profile (non-Error object):', {
        error: String(error),
        errorType: typeof error,
        userId: userId,
        // Try to stringify if possible
        errorString: typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error as object)) : undefined,
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception updating user profile:', msg);
    return { error };
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

