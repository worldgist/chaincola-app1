-- Create user_profiles table
-- This table stores additional user information beyond what's in auth.users

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  phone_number TEXT,
  address TEXT,
  bio TEXT,
  country TEXT,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Create index on referral_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_referral_code ON public.user_profiles(referral_code);

-- Create index on referred_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_referred_by ON public.user_profiles(referred_by);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role can do everything"
  ON public.user_profiles
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create user profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  referral_code_value TEXT;
BEGIN
  -- Generate a unique 7-character referral code from user ID
  referral_code_value := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 7));
  
  -- Ensure uniqueness by appending random characters if needed
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE referral_code = referral_code_value) LOOP
    referral_code_value := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 5) || 
                                  SUBSTRING(MD5(RANDOM()::TEXT), 1, 2));
  END LOOP;
  
  -- Insert user profile
  INSERT INTO public.user_profiles (
    user_id,
    email,
    full_name,
    phone_number,
    referral_code
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone_number',
    referral_code_value
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add comment to table
COMMENT ON TABLE public.user_profiles IS 'Stores additional user profile information';
COMMENT ON COLUMN public.user_profiles.user_id IS 'References auth.users.id';
COMMENT ON COLUMN public.user_profiles.referral_code IS 'Unique 7-character referral code for the user';
COMMENT ON COLUMN public.user_profiles.referred_by IS 'Referral code of the user who referred this user';



















