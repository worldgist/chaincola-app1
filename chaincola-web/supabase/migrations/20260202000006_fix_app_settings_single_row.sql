-- Fix app_settings table to ensure single row and fix JSON coercion error
-- The error "Cannot coerce the result to a single JSON object" occurs when:
-- 1. Multiple rows exist in app_settings (should only have id=1)
-- 2. Function returns TABLE instead of JSONB when expected

-- Ensure app_settings table exists
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
  transaction_fee_percentage DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  
  -- Support Information
  support_email TEXT,
  support_phone TEXT,
  support_address TEXT,
  
  -- Legal Documents
  privacy_policy TEXT,
  terms_and_conditions TEXT,
  
  -- Additional Settings
  additional_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- CRITICAL FIX: Remove any duplicate rows, keep only id=1
-- If multiple rows exist, merge them and keep the most recent one
DO $$
DECLARE
  v_row_count INTEGER;
  v_keep_id INTEGER;
BEGIN
  -- Count rows
  SELECT COUNT(*) INTO v_row_count FROM public.app_settings;
  
  IF v_row_count > 1 THEN
    -- Find the row with the latest updated_at (or id=1 if exists)
    SELECT id INTO v_keep_id
    FROM public.app_settings
    WHERE id = 1
    LIMIT 1;
    
    -- If id=1 doesn't exist, use the most recent one
    IF v_keep_id IS NULL THEN
      SELECT id INTO v_keep_id
      FROM public.app_settings
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1;
    END IF;
    
    -- Merge all settings into id=1, then delete others
    -- First, ensure id=1 exists (create if needed)
    INSERT INTO public.app_settings (id, app_name, app_version)
    VALUES (1, 'ChainCola', '1.0.0')
    ON CONFLICT (id) DO NOTHING;
    
    -- Update id=1 with values from the most recent row
    UPDATE public.app_settings AS target
    SET
      app_name = COALESCE(source.app_name, target.app_name),
      app_version = COALESCE(source.app_version, target.app_version),
      maintenance_mode = COALESCE(source.maintenance_mode, target.maintenance_mode),
      registration_enabled = COALESCE(source.registration_enabled, target.registration_enabled),
      kyc_required = COALESCE(source.kyc_required, target.kyc_required),
      min_withdrawal_amount = COALESCE(source.min_withdrawal_amount, target.min_withdrawal_amount),
      max_withdrawal_amount = COALESCE(source.max_withdrawal_amount, target.max_withdrawal_amount),
      withdrawal_fee = COALESCE(source.withdrawal_fee, target.withdrawal_fee),
      transaction_fee = COALESCE(source.transaction_fee, target.transaction_fee),
      transaction_fee_percentage = COALESCE(source.transaction_fee_percentage, target.transaction_fee_percentage),
      support_email = COALESCE(source.support_email, target.support_email),
      support_phone = COALESCE(source.support_phone, target.support_phone),
      support_address = COALESCE(source.support_address, target.support_address),
      privacy_policy = COALESCE(source.privacy_policy, target.privacy_policy),
      terms_and_conditions = COALESCE(source.terms_and_conditions, target.terms_and_conditions),
      additional_settings = COALESCE(source.additional_settings, target.additional_settings),
      updated_at = GREATEST(target.updated_at, COALESCE(source.updated_at, target.updated_at))
    FROM (
      SELECT * FROM public.app_settings
      WHERE id = v_keep_id
    ) AS source
    WHERE target.id = 1;
    
    -- Delete all rows except id=1
    DELETE FROM public.app_settings WHERE id != 1;
    
    RAISE NOTICE 'Removed % duplicate rows from app_settings, kept id=1', v_row_count - 1;
  END IF;
END $$;

-- Ensure exactly one row exists (id=1)
INSERT INTO public.app_settings (id, app_name, app_version)
VALUES (1, 'ChainCola', '1.0.0')
ON CONFLICT (id) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON public.app_settings(updated_at DESC);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;
CREATE POLICY "Anyone can view app settings"
  ON public.app_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert app settings" ON public.app_settings;
CREATE POLICY "Admins can insert app settings"
  ON public.app_settings
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update app settings" ON public.app_settings;
CREATE POLICY "Admins can update app settings"
  ON public.app_settings
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage app settings" ON public.app_settings;
CREATE POLICY "Service role can manage app settings"
  ON public.app_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create/update trigger function
CREATE OR REPLACE FUNCTION public.update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_app_settings_updated_at();

-- Fix get_app_settings function to return JSONB instead of TABLE
-- This prevents "Cannot coerce the result to a single JSON object" error
-- Drop existing function first (it returns TABLE, so we need to drop it before changing return type)
DO $$
BEGIN
  -- Drop function if it exists with TABLE return type
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_app_settings'
  ) THEN
    DROP FUNCTION public.get_app_settings() CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_app_settings()
RETURNS JSONB AS $$
DECLARE
  v_settings RECORD;
BEGIN
  SELECT * INTO v_settings
  FROM public.app_settings
  WHERE id = 1
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Return default settings if no row exists
    RETURN jsonb_build_object(
      'id', 1,
      'app_name', 'ChainCola',
      'app_version', '1.0.0',
      'maintenance_mode', false,
      'registration_enabled', true,
      'kyc_required', false,
      'min_withdrawal_amount', 0,
      'max_withdrawal_amount', 1000000,
      'withdrawal_fee', 0,
      'transaction_fee', 0,
      'transaction_fee_percentage', 0,
      'support_email', NULL,
      'support_phone', NULL,
      'support_address', NULL,
      'privacy_policy', NULL,
      'terms_and_conditions', NULL,
      'additional_settings', '{}'::jsonb,
      'updated_at', NOW()
    );
  END IF;
  
  RETURN jsonb_build_object(
    'id', v_settings.id,
    'app_name', v_settings.app_name,
    'app_version', v_settings.app_version,
    'maintenance_mode', v_settings.maintenance_mode,
    'registration_enabled', v_settings.registration_enabled,
    'kyc_required', v_settings.kyc_required,
    'min_withdrawal_amount', v_settings.min_withdrawal_amount,
    'max_withdrawal_amount', v_settings.max_withdrawal_amount,
    'withdrawal_fee', v_settings.withdrawal_fee,
    'transaction_fee', v_settings.transaction_fee,
    'transaction_fee_percentage', v_settings.transaction_fee_percentage,
    'support_email', v_settings.support_email,
    'support_phone', v_settings.support_phone,
    'support_address', v_settings.support_address,
    'privacy_policy', v_settings.privacy_policy,
    'terms_and_conditions', v_settings.terms_and_conditions,
    'additional_settings', COALESCE(v_settings.additional_settings, '{}'::jsonb),
    'updated_at', v_settings.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_app_settings() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.get_app_settings IS 'Get all app settings as JSONB (fixed to return single JSON object, not table)';
