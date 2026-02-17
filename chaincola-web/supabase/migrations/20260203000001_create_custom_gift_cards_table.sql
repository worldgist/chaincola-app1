-- Create custom gift cards table
-- This table allows admins/users to create custom gift cards with custom amounts, designs, and settings

-- 1. Create custom_gift_cards table
CREATE TABLE IF NOT EXISTS public.custom_gift_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- User/admin who created the card
  code TEXT NOT NULL UNIQUE, -- Unique gift card code
  amount DECIMAL(20, 2) NOT NULL CHECK (amount > 0), -- Gift card amount
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD')), -- Supported currencies
  balance DECIMAL(20, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0), -- Remaining balance (can be partially used)
  
  -- Customization fields
  title TEXT, -- Custom title/name for the gift card
  description TEXT, -- Description or message
  design_color TEXT, -- Hex color code for card design (e.g., '#6B46C1')
  design_image_url TEXT, -- Optional custom image URL for the card
  card_type TEXT NOT NULL DEFAULT 'digital' CHECK (card_type IN ('digital', 'physical', 'virtual')), -- Type of card
  
  -- Recipient information
  recipient_email TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  personal_message TEXT, -- Custom message from sender
  
  -- Status and lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled', 'pending')),
  is_reloadable BOOLEAN DEFAULT false, -- Whether the card can be reloaded with more funds
  is_transferable BOOLEAN DEFAULT true, -- Whether the card can be transferred to another user
  
  -- Expiration
  expires_at TIMESTAMPTZ, -- Expiration date
  expires_in_days INTEGER DEFAULT 365, -- Days until expiration (calculated from created_at)
  
  -- Usage tracking
  used_at TIMESTAMPTZ, -- When the card was first used
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User who used/redeemed the card
  last_used_at TIMESTAMPTZ, -- Last time the card was used
  usage_count INTEGER DEFAULT 0, -- Number of times the card has been used
  
  -- Transaction tracking
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL, -- Related transaction if purchased
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional custom metadata
  tags TEXT[], -- Tags for categorization (e.g., ['birthday', 'corporate', 'promotional'])
  
  -- Admin/System fields
  is_promotional BOOLEAN DEFAULT false, -- Whether this is a promotional/free card
  promotional_code TEXT, -- Promotional code used to create this card
  created_for_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- If created for a specific user
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  activated_at TIMESTAMPTZ -- When the card was activated (if status was pending)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_code ON public.custom_gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_created_by ON public.custom_gift_cards(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_status ON public.custom_gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_recipient_email ON public.custom_gift_cards(recipient_email);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_used_by ON public.custom_gift_cards(used_by);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_created_at ON public.custom_gift_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_expires_at ON public.custom_gift_cards(expires_at);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_created_for_user ON public.custom_gift_cards(created_for_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_promotional_code ON public.custom_gift_cards(promotional_code);
CREATE INDEX IF NOT EXISTS idx_custom_gift_cards_status_expires ON public.custom_gift_cards(status, expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.custom_gift_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view gift cards created by them or created for them
DROP POLICY IF EXISTS "Users can view own custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Users can view own custom gift cards"
  ON public.custom_gift_cards
  FOR SELECT
  USING (
    auth.uid() = created_by 
    OR auth.uid() = created_for_user_id
    OR auth.uid() = used_by
  );

-- Users can insert gift cards they create
DROP POLICY IF EXISTS "Users can create custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Users can create custom gift cards"
  ON public.custom_gift_cards
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can update gift cards they created (if active)
DROP POLICY IF EXISTS "Users can update own custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Users can update own custom gift cards"
  ON public.custom_gift_cards
  FOR UPDATE
  USING (auth.uid() = created_by AND status = 'active')
  WITH CHECK (auth.uid() = created_by);

-- Admins can view all custom gift cards
DROP POLICY IF EXISTS "Admins can view all custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Admins can view all custom gift cards"
  ON public.custom_gift_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can manage all custom gift cards
DROP POLICY IF EXISTS "Admins can manage all custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Admins can manage all custom gift cards"
  ON public.custom_gift_cards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can do everything
DROP POLICY IF EXISTS "Service role can manage custom gift cards" ON public.custom_gift_cards;
CREATE POLICY "Service role can manage custom gift cards"
  ON public.custom_gift_cards
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_custom_gift_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_custom_gift_cards_updated_at ON public.custom_gift_cards;
CREATE TRIGGER update_custom_gift_cards_updated_at
  BEFORE UPDATE ON public.custom_gift_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_custom_gift_cards_updated_at();

-- 2. Function to generate unique custom gift card code
CREATE OR REPLACE FUNCTION public.generate_custom_gift_card_code(
  p_prefix TEXT DEFAULT 'CGC'
)
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a random code: Prefix + 10 alphanumeric characters
    v_code := p_prefix || UPPER(
      SUBSTRING(
        MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || RANDOM()::TEXT),
        1,
        10
      )
    );
    
    -- Check if code already exists in both gift_cards and custom_gift_cards tables
    SELECT EXISTS(
      SELECT 1 FROM public.gift_cards WHERE code = v_code
      UNION
      SELECT 1 FROM public.custom_gift_cards WHERE code = v_code
    ) INTO v_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to create a custom gift card
CREATE OR REPLACE FUNCTION public.create_custom_gift_card(
  p_created_by UUID,
  p_amount DECIMAL(20, 2),
  p_currency TEXT DEFAULT 'NGN',
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_design_color TEXT DEFAULT NULL,
  p_design_image_url TEXT DEFAULT NULL,
  p_card_type TEXT DEFAULT 'digital',
  p_recipient_email TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_recipient_phone TEXT DEFAULT NULL,
  p_personal_message TEXT DEFAULT NULL,
  p_expires_in_days INTEGER DEFAULT 365,
  p_is_reloadable BOOLEAN DEFAULT false,
  p_is_transferable BOOLEAN DEFAULT true,
  p_is_promotional BOOLEAN DEFAULT false,
  p_promotional_code TEXT DEFAULT NULL,
  p_created_for_user_id UUID DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  success BOOLEAN,
  gift_card_id UUID,
  code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_gift_card_id UUID;
  v_code TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Validate currency
  IF p_currency NOT IN ('NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD') THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Invalid currency'::TEXT;
    RETURN;
  END IF;

  -- Generate unique code
  v_code := public.generate_custom_gift_card_code('CGC');

  -- Calculate expiration date
  IF p_expires_in_days > 0 THEN
    v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL;
  END IF;

  -- Insert custom gift card
  INSERT INTO public.custom_gift_cards (
    created_by,
    code,
    amount,
    currency,
    balance,
    title,
    description,
    design_color,
    design_image_url,
    card_type,
    recipient_email,
    recipient_name,
    recipient_phone,
    personal_message,
    expires_at,
    expires_in_days,
    is_reloadable,
    is_transferable,
    is_promotional,
    promotional_code,
    created_for_user_id,
    tags,
    metadata,
    status,
    activated_at
  ) VALUES (
    p_created_by,
    v_code,
    p_amount,
    p_currency,
    p_amount, -- Initial balance equals amount
    p_title,
    p_description,
    p_design_color,
    p_design_image_url,
    p_card_type,
    p_recipient_email,
    p_recipient_name,
    p_recipient_phone,
    p_personal_message,
    v_expires_at,
    p_expires_in_days,
    p_is_reloadable,
    p_is_transferable,
    p_is_promotional,
    p_promotional_code,
    p_created_for_user_id,
    p_tags,
    p_metadata,
    'active', -- Start as active
    NOW() -- Activated immediately
  )
  RETURNING id INTO v_gift_card_id;

  -- Return success
  RETURN QUERY SELECT true, v_gift_card_id, v_code, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 
    format('Failed to create custom gift card: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to use/redeem a custom gift card
CREATE OR REPLACE FUNCTION public.use_custom_gift_card(
  p_code TEXT,
  p_user_id UUID,
  p_amount DECIMAL(20, 2) DEFAULT NULL -- NULL means use full balance
)
RETURNS TABLE(
  success BOOLEAN,
  remaining_balance DECIMAL(20, 2),
  amount_used DECIMAL(20, 2),
  error_message TEXT
) AS $$
DECLARE
  v_gift_card RECORD;
  v_amount_to_use DECIMAL(20, 2);
  v_new_balance DECIMAL(20, 2);
BEGIN
  -- Find the gift card
  SELECT * INTO v_gift_card
  FROM public.custom_gift_cards
  WHERE code = UPPER(TRIM(p_code))
    AND status = 'active';

  -- Check if gift card exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 'Gift card not found or not active'::TEXT;
    RETURN;
  END IF;

  -- Check if expired
  IF v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW() THEN
    -- Update status to expired
    UPDATE public.custom_gift_cards
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_gift_card.id;
    
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 'Gift card has expired'::TEXT;
    RETURN;
  END IF;

  -- Check if transferable (if created for another user)
  IF v_gift_card.created_for_user_id IS NOT NULL 
     AND v_gift_card.created_for_user_id != p_user_id
     AND NOT v_gift_card.is_transferable THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 'This gift card is not transferable'::TEXT;
    RETURN;
  END IF;

  -- Determine amount to use
  IF p_amount IS NULL OR p_amount <= 0 THEN
    v_amount_to_use := v_gift_card.balance; -- Use full balance
  ELSE
    v_amount_to_use := LEAST(p_amount, v_gift_card.balance); -- Use requested amount or balance, whichever is less
  END IF;

  -- Check if sufficient balance
  IF v_gift_card.balance < v_amount_to_use THEN
    RETURN QUERY SELECT false, v_gift_card.balance, 0::DECIMAL, 'Insufficient balance on gift card'::TEXT;
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_balance := v_gift_card.balance - v_amount_to_use;

  -- Update gift card
  UPDATE public.custom_gift_cards
  SET
    balance = v_new_balance,
    status = CASE 
      WHEN v_new_balance <= 0 THEN 'used'
      ELSE 'active'
    END,
    used_at = CASE 
      WHEN used_at IS NULL THEN NOW()
      ELSE used_at
    END,
    used_by = CASE 
      WHEN used_by IS NULL THEN p_user_id
      ELSE used_by
    END,
    last_used_at = NOW(),
    usage_count = usage_count + 1,
    updated_at = NOW()
  WHERE id = v_gift_card.id;

  RETURN QUERY SELECT true, v_new_balance, v_amount_to_use, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 
    format('Failed to use gift card: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to reload/add funds to a custom gift card
CREATE OR REPLACE FUNCTION public.reload_custom_gift_card(
  p_code TEXT,
  p_amount DECIMAL(20, 2)
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance DECIMAL(20, 2),
  error_message TEXT
) AS $$
DECLARE
  v_gift_card RECORD;
  v_new_balance DECIMAL(20, 2);
BEGIN
  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Find the gift card
  SELECT * INTO v_gift_card
  FROM public.custom_gift_cards
  WHERE code = UPPER(TRIM(p_code))
    AND status IN ('active', 'used') -- Can reload active or used cards
    AND is_reloadable = true;

  -- Check if gift card exists and is reloadable
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Gift card not found or not reloadable'::TEXT;
    RETURN;
  END IF;

  -- Check if expired
  IF v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW() THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Gift card has expired'::TEXT;
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_balance := v_gift_card.balance + p_amount;

  -- Update gift card
  UPDATE public.custom_gift_cards
  SET
    balance = v_new_balance,
    amount = amount + p_amount, -- Update total amount as well
    status = 'active', -- Reactivate if it was used
    updated_at = NOW()
  WHERE id = v_gift_card.id;

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0::DECIMAL, 
    format('Failed to reload gift card: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to cancel a custom gift card
CREATE OR REPLACE FUNCTION public.cancel_custom_gift_card(
  p_code TEXT,
  p_user_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_gift_card RECORD;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT EXISTS(
    SELECT 1 FROM public.user_profiles
    WHERE id = p_user_id AND role = 'admin'
  ) INTO v_is_admin;

  -- Find the gift card
  SELECT * INTO v_gift_card
  FROM public.custom_gift_cards
  WHERE code = UPPER(TRIM(p_code))
    AND status = 'active';

  -- Check if gift card exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Gift card not found or not active'::TEXT;
    RETURN;
  END IF;

  -- Check permissions (user must be creator or admin)
  IF v_gift_card.created_by != p_user_id AND NOT v_is_admin THEN
    RETURN QUERY SELECT false, 'You do not have permission to cancel this gift card'::TEXT;
    RETURN;
  END IF;

  -- Update gift card status
  UPDATE public.custom_gift_cards
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = v_gift_card.id;

  RETURN QUERY SELECT true, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 
    format('Failed to cancel gift card: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get custom gift cards
CREATE OR REPLACE FUNCTION public.get_custom_gift_cards(
  p_user_id UUID,
  p_status TEXT DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  amount DECIMAL,
  currency TEXT,
  balance DECIMAL,
  title TEXT,
  description TEXT,
  design_color TEXT,
  design_image_url TEXT,
  card_type TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  personal_message TEXT,
  status TEXT,
  is_reloadable BOOLEAN,
  is_transferable BOOLEAN,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  usage_count INTEGER,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cgc.id,
    cgc.code,
    cgc.amount,
    cgc.currency,
    cgc.balance,
    cgc.title,
    cgc.description,
    cgc.design_color,
    cgc.design_image_url,
    cgc.card_type,
    cgc.recipient_email,
    cgc.recipient_name,
    cgc.personal_message,
    cgc.status,
    cgc.is_reloadable,
    cgc.is_transferable,
    cgc.expires_at,
    cgc.used_at,
    cgc.usage_count,
    cgc.tags,
    cgc.created_at,
    cgc.updated_at
  FROM public.custom_gift_cards cgc
  WHERE (
    cgc.created_by = p_user_id 
    OR cgc.created_for_user_id = p_user_id
    OR cgc.used_by = p_user_id
  )
    AND (p_status IS NULL OR cgc.status = p_status)
    AND (
      p_include_expired = true 
      OR cgc.expires_at IS NULL 
      OR cgc.expires_at > NOW()
    )
  ORDER BY cgc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE public.custom_gift_cards IS 'Custom gift cards created by users or admins with customizable designs and settings';
COMMENT ON FUNCTION public.create_custom_gift_card IS 'Create a custom gift card with customizable fields';
COMMENT ON FUNCTION public.use_custom_gift_card IS 'Use/redeem a custom gift card (can be partial or full)';
COMMENT ON FUNCTION public.reload_custom_gift_card IS 'Reload/add funds to a reloadable custom gift card';
COMMENT ON FUNCTION public.cancel_custom_gift_card IS 'Cancel an active custom gift card';
