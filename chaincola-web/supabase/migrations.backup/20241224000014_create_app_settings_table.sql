-- Create app_settings table for storing application-wide settings
-- This is a single-row table that stores all app configuration
-- Only admins can update, but public can read certain settings

CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  
  -- App Information
  app_name TEXT DEFAULT 'ChainCola' NOT NULL,
  app_version TEXT DEFAULT '1.0.0' NOT NULL,
  
  -- Feature Flags
  maintenance_mode BOOLEAN DEFAULT false NOT NULL,
  registration_enabled BOOLEAN DEFAULT true NOT NULL,
  kyc_required BOOLEAN DEFAULT false NOT NULL,
  
  -- Financial Settings
  min_withdrawal_amount DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  max_withdrawal_amount DECIMAL(20, 8) DEFAULT 1000000 NOT NULL,
  withdrawal_fee DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  transaction_fee DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  transaction_fee_percentage DECIMAL(5, 2) DEFAULT 0 NOT NULL, -- Percentage-based fee
  
  -- Support Information
  support_email TEXT,
  support_phone TEXT,
  support_address TEXT,
  
  -- Legal Documents
  privacy_policy TEXT, -- URL or content
  terms_and_conditions TEXT, -- URL or content
  
  -- Additional Settings (stored as JSONB for flexibility)
  additional_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin who last updated
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT chk_positive_amounts CHECK (
    min_withdrawal_amount >= 0 AND
    max_withdrawal_amount > 0 AND
    max_withdrawal_amount >= min_withdrawal_amount AND
    withdrawal_fee >= 0 AND
    transaction_fee >= 0 AND
    transaction_fee_percentage >= 0 AND
    transaction_fee_percentage <= 100
  )
);

-- Create index on updated_at for faster queries
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at 
  ON public.app_settings(updated_at DESC);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_settings

-- Everyone can view app settings (for public info like support email, etc.)
CREATE POLICY "Anyone can view app settings"
  ON public.app_settings
  FOR SELECT
  USING (true);

-- Only admins can insert (should only happen once during setup)
CREATE POLICY "Admins can insert app settings"
  ON public.app_settings
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Only admins can update app settings
CREATE POLICY "Admins can update app settings"
  ON public.app_settings
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Only admins can delete app settings
CREATE POLICY "Admins can delete app settings"
  ON public.app_settings
  FOR DELETE
  USING (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on settings update
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_app_settings_updated_at();

-- Function to get app settings (public, returns all settings)
CREATE OR REPLACE FUNCTION public.get_app_settings()
RETURNS TABLE (
  id INTEGER,
  app_name TEXT,
  app_version TEXT,
  maintenance_mode BOOLEAN,
  registration_enabled BOOLEAN,
  kyc_required BOOLEAN,
  min_withdrawal_amount DECIMAL,
  max_withdrawal_amount DECIMAL,
  withdrawal_fee DECIMAL,
  transaction_fee DECIMAL,
  transaction_fee_percentage DECIMAL,
  support_email TEXT,
  support_phone TEXT,
  support_address TEXT,
  privacy_policy TEXT,
  terms_and_conditions TEXT,
  additional_settings JSONB,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    aset.id,
    aset.app_name,
    aset.app_version,
    aset.maintenance_mode,
    aset.registration_enabled,
    aset.kyc_required,
    aset.min_withdrawal_amount,
    aset.max_withdrawal_amount,
    aset.withdrawal_fee,
    aset.transaction_fee,
    aset.transaction_fee_percentage,
    aset.support_email,
    aset.support_phone,
    aset.support_address,
    aset.privacy_policy,
    aset.terms_and_conditions,
    aset.additional_settings,
    aset.updated_at
  FROM public.app_settings aset
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update app settings (admin only)
CREATE OR REPLACE FUNCTION public.update_app_settings(
  p_app_name TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_maintenance_mode BOOLEAN DEFAULT NULL,
  p_registration_enabled BOOLEAN DEFAULT NULL,
  p_kyc_required BOOLEAN DEFAULT NULL,
  p_min_withdrawal_amount DECIMAL DEFAULT NULL,
  p_max_withdrawal_amount DECIMAL DEFAULT NULL,
  p_withdrawal_fee DECIMAL DEFAULT NULL,
  p_transaction_fee DECIMAL DEFAULT NULL,
  p_transaction_fee_percentage DECIMAL DEFAULT NULL,
  p_support_email TEXT DEFAULT NULL,
  p_support_phone TEXT DEFAULT NULL,
  p_support_address TEXT DEFAULT NULL,
  p_privacy_policy TEXT DEFAULT NULL,
  p_terms_and_conditions TEXT DEFAULT NULL,
  p_additional_settings JSONB DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_settings_id INTEGER;
BEGIN
  -- Check if admin
  IF p_admin_user_id IS NOT NULL AND NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can update app settings';
  END IF;

  -- Use current user if admin_user_id not provided
  IF p_admin_user_id IS NULL THEN
    IF NOT public.is_user_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can update app settings';
    END IF;
    p_admin_user_id := auth.uid();
  END IF;

  -- Update or insert settings
  INSERT INTO public.app_settings (
    id,
    app_name,
    app_version,
    maintenance_mode,
    registration_enabled,
    kyc_required,
    min_withdrawal_amount,
    max_withdrawal_amount,
    withdrawal_fee,
    transaction_fee,
    transaction_fee_percentage,
    support_email,
    support_phone,
    support_address,
    privacy_policy,
    terms_and_conditions,
    additional_settings,
    updated_by
  ) VALUES (
    1,
    COALESCE(p_app_name, 'ChainCola'),
    COALESCE(p_app_version, '1.0.0'),
    COALESCE(p_maintenance_mode, false),
    COALESCE(p_registration_enabled, true),
    COALESCE(p_kyc_required, false),
    COALESCE(p_min_withdrawal_amount, 0),
    COALESCE(p_max_withdrawal_amount, 1000000),
    COALESCE(p_withdrawal_fee, 0),
    COALESCE(p_transaction_fee, 0),
    COALESCE(p_transaction_fee_percentage, 0),
    p_support_email,
    p_support_phone,
    p_support_address,
    p_privacy_policy,
    p_terms_and_conditions,
    COALESCE(p_additional_settings, '{}'::jsonb),
    p_admin_user_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    app_name = COALESCE(EXCLUDED.app_name, app_settings.app_name),
    app_version = COALESCE(EXCLUDED.app_version, app_settings.app_version),
    maintenance_mode = COALESCE(EXCLUDED.maintenance_mode, app_settings.maintenance_mode),
    registration_enabled = COALESCE(EXCLUDED.registration_enabled, app_settings.registration_enabled),
    kyc_required = COALESCE(EXCLUDED.kyc_required, app_settings.kyc_required),
    min_withdrawal_amount = COALESCE(EXCLUDED.min_withdrawal_amount, app_settings.min_withdrawal_amount),
    max_withdrawal_amount = COALESCE(EXCLUDED.max_withdrawal_amount, app_settings.max_withdrawal_amount),
    withdrawal_fee = COALESCE(EXCLUDED.withdrawal_fee, app_settings.withdrawal_fee),
    transaction_fee = COALESCE(EXCLUDED.transaction_fee, app_settings.transaction_fee),
    transaction_fee_percentage = COALESCE(EXCLUDED.transaction_fee_percentage, app_settings.transaction_fee_percentage),
    support_email = COALESCE(EXCLUDED.support_email, app_settings.support_email),
    support_phone = COALESCE(EXCLUDED.support_phone, app_settings.support_phone),
    support_address = COALESCE(EXCLUDED.support_address, app_settings.support_address),
    privacy_policy = COALESCE(EXCLUDED.privacy_policy, app_settings.privacy_policy),
    terms_and_conditions = COALESCE(EXCLUDED.terms_and_conditions, app_settings.terms_and_conditions),
    additional_settings = COALESCE(EXCLUDED.additional_settings, app_settings.additional_settings),
    updated_by = p_admin_user_id,
    updated_at = NOW()
  RETURNING id INTO v_settings_id;

  -- Return the id (always 1)
  v_settings_id := 1;
  RETURN v_settings_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public app settings (returns only public-facing settings)
CREATE OR REPLACE FUNCTION public.get_public_app_settings()
RETURNS TABLE (
  app_name TEXT,
  app_version TEXT,
  support_email TEXT,
  support_phone TEXT,
  support_address TEXT,
  privacy_policy TEXT,
  terms_and_conditions TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    aset.app_name,
    aset.app_version,
    aset.support_email,
    aset.support_phone,
    aset.support_address,
    aset.privacy_policy,
    aset.terms_and_conditions
  FROM public.app_settings aset
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_app_settings() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_app_settings(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO authenticated, anon;

-- Add comments
COMMENT ON TABLE public.app_settings IS 'Application-wide settings stored in a single row';
COMMENT ON COLUMN public.app_settings.app_name IS 'Application name';
COMMENT ON COLUMN public.app_settings.app_version IS 'Application version';
COMMENT ON COLUMN public.app_settings.maintenance_mode IS 'Whether the app is in maintenance mode';
COMMENT ON COLUMN public.app_settings.registration_enabled IS 'Whether new user registration is enabled';
COMMENT ON COLUMN public.app_settings.kyc_required IS 'Whether KYC verification is required';
COMMENT ON COLUMN public.app_settings.min_withdrawal_amount IS 'Minimum withdrawal amount';
COMMENT ON COLUMN public.app_settings.max_withdrawal_amount IS 'Maximum withdrawal amount';
COMMENT ON COLUMN public.app_settings.withdrawal_fee IS 'Fixed withdrawal fee';
COMMENT ON COLUMN public.app_settings.transaction_fee IS 'Fixed transaction fee';
COMMENT ON COLUMN public.app_settings.transaction_fee_percentage IS 'Percentage-based transaction fee (0-100)';
COMMENT ON COLUMN public.app_settings.additional_settings IS 'Additional settings stored as JSONB for flexibility';
COMMENT ON FUNCTION public.get_app_settings IS 'Get all app settings (public)';
COMMENT ON FUNCTION public.update_app_settings IS 'Update app settings (admin only)';
COMMENT ON FUNCTION public.get_public_app_settings IS 'Get public-facing app settings only';

