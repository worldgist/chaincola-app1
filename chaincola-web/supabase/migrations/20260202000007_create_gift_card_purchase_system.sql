-- Create gift cards purchase system
-- This migration creates tables and functions for purchasing gift cards

-- 1. Create gift_cards table for purchased gift cards
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE, -- Unique gift card code
  amount DECIMAL(20, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
  card_category TEXT NOT NULL, -- e.g., 'retail', 'gaming', 'entertainment', 'tech', 'food', 'travel'
  card_subcategory TEXT NOT NULL, -- e.g., 'amazon', 'steam', 'netflix', 'apple', 'google-play', 'itunes', 'ebay'
  card_type TEXT NOT NULL DEFAULT 'ecode' CHECK (card_type IN ('ecode', 'physical')), -- ecode or physical
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gift_cards_user_id ON public.gift_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON public.gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON public.gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_category ON public.gift_cards(card_category);
CREATE INDEX IF NOT EXISTS idx_gift_cards_subcategory ON public.gift_cards(card_subcategory);
CREATE INDEX IF NOT EXISTS idx_gift_cards_created_at ON public.gift_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_cards_user_status ON public.gift_cards(user_id, status, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own gift cards
DROP POLICY IF EXISTS "Users can view own gift cards" ON public.gift_cards;
CREATE POLICY "Users can view own gift cards"
  ON public.gift_cards
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own gift cards (via function)
DROP POLICY IF EXISTS "Users can insert own gift cards" ON public.gift_cards;
CREATE POLICY "Users can insert own gift cards"
  ON public.gift_cards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own active gift cards (to cancel)
DROP POLICY IF EXISTS "Users can update own active gift cards" ON public.gift_cards;
CREATE POLICY "Users can update own active gift cards"
  ON public.gift_cards
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'active')
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all gift cards
DROP POLICY IF EXISTS "Admins can view all gift cards" ON public.gift_cards;
CREATE POLICY "Admins can view all gift cards"
  ON public.gift_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can do everything (for functions)
DROP POLICY IF EXISTS "Service role can manage gift cards" ON public.gift_cards;
CREATE POLICY "Service role can manage gift cards"
  ON public.gift_cards
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_gift_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gift_cards_updated_at ON public.gift_cards;
CREATE TRIGGER update_gift_cards_updated_at
  BEFORE UPDATE ON public.gift_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_gift_cards_updated_at();

-- 2. Function to generate unique gift card code
CREATE OR REPLACE FUNCTION public.generate_gift_card_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a random code: GC + 8 alphanumeric characters
    v_code := 'GC' || UPPER(
      SUBSTRING(
        MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT),
        1,
        8
      )
    );
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.gift_cards WHERE code = v_code) INTO v_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to purchase a gift card
-- Required params first; optional (with DEFAULT) must come after in PostgreSQL
CREATE OR REPLACE FUNCTION public.purchase_gift_card(
  p_user_id UUID,
  p_amount DECIMAL(20, 2),
  p_card_category TEXT,
  p_card_subcategory TEXT,
  p_currency TEXT DEFAULT 'NGN',
  p_card_type TEXT DEFAULT 'ecode',
  p_recipient_email TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_expires_in_days INTEGER DEFAULT 365
)
RETURNS TABLE(
  success BOOLEAN,
  gift_card_id UUID,
  code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_current_ngn_balance DECIMAL(20, 2);
  v_new_ngn_balance DECIMAL(20, 2);
  v_gift_card_id UUID;
  v_code TEXT;
  v_transaction_id UUID;
  v_reference TEXT;
BEGIN
  -- Validate currency
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 
      format('Unsupported currency: %s', p_currency)::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 
      'Invalid amount. Amount must be greater than 0.'::TEXT;
    RETURN;
  END IF;

  -- Get current NGN balance
  SELECT COALESCE(ngn_balance, 0) INTO v_current_ngn_balance
  FROM public.user_wallets
  WHERE user_id = p_user_id;

  -- Check if wallet exists, create if not
  IF v_current_ngn_balance IS NULL THEN
    INSERT INTO public.user_wallets (user_id, ngn_balance, updated_at)
    VALUES (p_user_id, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT COALESCE(ngn_balance, 0) INTO v_current_ngn_balance
    FROM public.user_wallets
    WHERE user_id = p_user_id;
  END IF;

  -- Check sufficient balance
  IF v_current_ngn_balance < p_amount THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Insufficient balance. Current: ₦%s, Required: ₦%s', 
        v_current_ngn_balance, p_amount)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_ngn_balance := v_current_ngn_balance - p_amount;

  -- Generate unique code
  v_code := public.generate_gift_card_code();

  -- Generate transaction reference
  v_reference := 'GC-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 12));

  -- Perform atomic transaction
  BEGIN
    -- 1. Debit NGN from user wallet
    UPDATE public.user_wallets
    SET
      ngn_balance = v_new_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user wallet';
    END IF;

    -- 2. Update wallet_balances table
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) 
    DO UPDATE SET balance = v_new_ngn_balance, updated_at = NOW();

    -- 3. Update wallets table
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (
      p_user_id, 
      v_new_ngn_balance, 
      COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0),
      NOW()
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET ngn_balance = v_new_ngn_balance, updated_at = NOW();

    -- 4. Create transaction record
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      amount,
      currency,
      status,
      description,
      external_reference,
      metadata
    ) VALUES (
      p_user_id,
      'GIFT_CARD_PURCHASE',
      p_amount,
      p_currency,
      'COMPLETED',
      format('Gift card purchase: %s %s', p_card_subcategory, p_card_category),
      v_reference,
      jsonb_build_object(
        'card_category', p_card_category,
        'card_subcategory', p_card_subcategory,
        'card_type', p_card_type,
        'gift_card_code', v_code
      )
    )
    RETURNING id INTO v_transaction_id;

    -- 5. Create gift card
    INSERT INTO public.gift_cards (
      user_id,
      code,
      amount,
      currency,
      card_category,
      card_subcategory,
      card_type,
      status,
      recipient_email,
      recipient_name,
      message,
      expires_at,
      transaction_id
    ) VALUES (
      p_user_id,
      v_code,
      p_amount,
      p_currency,
      p_card_category,
      p_card_subcategory,
      p_card_type,
      'active',
      p_recipient_email,
      p_recipient_name,
      p_message,
      CASE 
        WHEN p_expires_in_days > 0 THEN NOW() + (p_expires_in_days || ' days')::INTERVAL
        ELSE NULL
      END,
      v_transaction_id
    )
    RETURNING id INTO v_gift_card_id;

    -- Return success
    RETURN QUERY SELECT true, v_gift_card_id, v_code, NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 
      format('Failed to purchase gift card: %s', SQLERRM)::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to get user's gift cards
CREATE OR REPLACE FUNCTION public.get_user_gift_cards(
  p_user_id UUID,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  amount DECIMAL,
  currency TEXT,
  card_category TEXT,
  card_subcategory TEXT,
  card_type TEXT,
  status TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.code,
    gc.amount,
    gc.currency,
    gc.card_category,
    gc.card_subcategory,
    gc.card_type,
    gc.status,
    gc.recipient_email,
    gc.recipient_name,
    gc.message,
    gc.expires_at,
    gc.redeemed_at,
    gc.created_at,
    gc.updated_at
  FROM public.gift_cards gc
  WHERE gc.user_id = p_user_id
    AND (p_status IS NULL OR gc.status = p_status)
    -- Auto-expire gift cards
    AND (gc.expires_at IS NULL OR gc.expires_at > NOW())
  ORDER BY gc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to redeem a gift card
CREATE OR REPLACE FUNCTION public.redeem_gift_card(
  p_user_id UUID,
  p_code TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  amount DECIMAL,
  currency TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_gift_card RECORD;
  v_current_ngn_balance DECIMAL(20, 2);
  v_new_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
BEGIN
  -- Find gift card
  SELECT * INTO v_gift_card
  FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code))
    AND status = 'active';

  -- Check if gift card exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT,
      'Gift card not found or already redeemed'::TEXT;
    RETURN;
  END IF;

  -- Check if expired
  IF v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW() THEN
    -- Update status to expired
    UPDATE public.gift_cards
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_gift_card.id;
    
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT,
      'Gift card has expired'::TEXT;
    RETURN;
  END IF;

  -- Get current balance
  SELECT COALESCE(ngn_balance, 0) INTO v_current_ngn_balance
  FROM public.user_wallets
  WHERE user_id = p_user_id;

  -- Create wallet if doesn't exist
  IF v_current_ngn_balance IS NULL THEN
    INSERT INTO public.user_wallets (user_id, ngn_balance, updated_at)
    VALUES (p_user_id, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;
    
    v_current_ngn_balance := 0;
  END IF;

  -- Calculate new balance
  IF v_gift_card.currency = 'NGN' THEN
    v_new_ngn_balance := v_current_ngn_balance + v_gift_card.amount;
  ELSE
    -- For USD, convert to NGN (simplified - use fixed rate or fetch from rates table)
    v_new_ngn_balance := v_current_ngn_balance + (v_gift_card.amount * 1650); -- Approximate rate
  END IF;

  -- Perform atomic transaction
  BEGIN
    -- 1. Update gift card status
    UPDATE public.gift_cards
    SET
      status = 'redeemed',
      redeemed_at = NOW(),
      redeemed_by = p_user_id,
      updated_at = NOW()
    WHERE id = v_gift_card.id;

    -- 2. Credit user wallet
    UPDATE public.user_wallets
    SET
      ngn_balance = v_new_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 3. Update wallet_balances
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_ngn_balance, NOW())
    ON CONFLICT (user_id, currency)
    DO UPDATE SET balance = v_new_ngn_balance, updated_at = NOW();

    -- 4. Update wallets table
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (
      p_user_id,
      v_new_ngn_balance,
      COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0),
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET ngn_balance = v_new_ngn_balance, updated_at = NOW();

    -- 5. Create transaction record
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      amount,
      currency,
      status,
      description,
      metadata
    ) VALUES (
      p_user_id,
      'GIFT_CARD_REDEEM',
      v_gift_card.amount,
      v_gift_card.currency,
      'COMPLETED',
      format('Gift card redeemed: %s', v_gift_card.code),
      jsonb_build_object(
        'gift_card_id', v_gift_card.id,
        'gift_card_code', v_gift_card.code,
        'card_category', v_gift_card.card_category,
        'card_subcategory', v_gift_card.card_subcategory
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Return success
    RETURN QUERY SELECT true, v_gift_card.amount, v_gift_card.currency, NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT,
      format('Failed to redeem gift card: %s', SQLERRM)::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to validate gift card code
CREATE OR REPLACE FUNCTION public.validate_gift_card_code(
  p_code TEXT
)
RETURNS TABLE(
  is_valid BOOLEAN,
  gift_card_id UUID,
  amount DECIMAL,
  currency TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  error_message TEXT
) AS $$
DECLARE
  v_gift_card RECORD;
BEGIN
  -- Find gift card
  SELECT * INTO v_gift_card
  FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code));

  -- Check if exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
      'Gift card code not found'::TEXT;
    RETURN;
  END IF;

  -- Check if already redeemed
  IF v_gift_card.status = 'redeemed' THEN
    RETURN QUERY SELECT false, v_gift_card.id, v_gift_card.amount, v_gift_card.currency,
      v_gift_card.status, v_gift_card.expires_at, 'Gift card has already been redeemed'::TEXT;
    RETURN;
  END IF;

  -- Check if expired
  IF v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW() THEN
    -- Update status
    UPDATE public.gift_cards
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_gift_card.id;
    
    RETURN QUERY SELECT false, v_gift_card.id, v_gift_card.amount, v_gift_card.currency,
      'expired'::TEXT, v_gift_card.expires_at, 'Gift card has expired'::TEXT;
    RETURN;
  END IF;

  -- Check if cancelled
  IF v_gift_card.status = 'cancelled' THEN
    RETURN QUERY SELECT false, v_gift_card.id, v_gift_card.amount, v_gift_card.currency,
      v_gift_card.status, v_gift_card.expires_at, 'Gift card has been cancelled'::TEXT;
    RETURN;
  END IF;

  -- Valid gift card
  RETURN QUERY SELECT true, v_gift_card.id, v_gift_card.amount, v_gift_card.currency,
    v_gift_card.status, v_gift_card.expires_at, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.purchase_gift_card(UUID, DECIMAL, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_gift_cards(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_gift_card_code(TEXT) TO authenticated;

-- Comments
COMMENT ON TABLE public.gift_cards IS 'Stores purchased gift cards';
COMMENT ON FUNCTION public.purchase_gift_card IS 'Purchase a gift card by debiting NGN from user wallet';
COMMENT ON FUNCTION public.get_user_gift_cards IS 'Get all gift cards for a user, optionally filtered by status';
COMMENT ON FUNCTION public.redeem_gift_card IS 'Redeem a gift card by crediting the amount to user wallet';
COMMENT ON FUNCTION public.validate_gift_card_code IS 'Validate a gift card code and return its details';
