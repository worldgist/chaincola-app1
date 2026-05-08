-- Add hash_pin and enable_biometric columns to user_profiles table

-- Add hash_pin column to store hashed PIN
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS hash_pin TEXT;

-- Add enable_biometric column to track if user has enabled biometric authentication
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS enable_biometric BOOLEAN DEFAULT false NOT NULL;

-- Add index on enable_biometric for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_enable_biometric 
ON public.user_profiles(enable_biometric) 
WHERE enable_biometric = true;

-- Add comment to columns
COMMENT ON COLUMN public.user_profiles.hash_pin IS 'Hashed PIN for user authentication (stored securely)';
COMMENT ON COLUMN public.user_profiles.enable_biometric IS 'Whether the user has enabled biometric authentication';

-- Update RLS policies to allow users to update their own PIN and biometric settings
-- The existing "Users can update own profile" policy already covers these fields



















