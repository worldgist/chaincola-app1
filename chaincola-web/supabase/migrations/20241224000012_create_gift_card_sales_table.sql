-- Create gift_card_sales table
-- This table stores user requests to sell gift cards

CREATE TABLE IF NOT EXISTS public.gift_card_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_category TEXT NOT NULL, -- e.g., 'retail', 'gaming', 'entertainment', 'tech', 'food', 'travel'
  card_subcategory TEXT NOT NULL, -- e.g., 'amazon', 'steam', 'netflix', 'apple', 'google-play'
  amount DECIMAL(20, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
  card_type TEXT NOT NULL CHECK (card_type IN ('ecode', 'physical')), -- ecode or physical
  image_urls JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'completed', 'cancelled')),
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_transaction_id TEXT, -- Reference to transaction when payment is made
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_user_id ON public.gift_card_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_status ON public.gift_card_sales(status);
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_category ON public.gift_card_sales(card_category);
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_subcategory ON public.gift_card_sales(card_subcategory);
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_created_at ON public.gift_card_sales(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_gift_card_sales_user_status ON public.gift_card_sales(user_id, status, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gift_card_sales ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own gift card sales
CREATE POLICY "Users can view own gift card sales"
  ON public.gift_card_sales
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own gift card sales
CREATE POLICY "Users can insert own gift card sales"
  ON public.gift_card_sales
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending gift card sales (to cancel)
CREATE POLICY "Users can update own pending gift card sales"
  ON public.gift_card_sales
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));

-- Admins can view all gift card sales
CREATE POLICY "Admins can view all gift card sales"
  ON public.gift_card_sales
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can update all gift card sales
CREATE POLICY "Admins can update all gift card sales"
  ON public.gift_card_sales
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_gift_card_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_gift_card_sales_updated_at
  BEFORE UPDATE ON public.gift_card_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_gift_card_sales_updated_at();

-- Function to create a gift card sale request
CREATE OR REPLACE FUNCTION public.create_gift_card_sale(
  p_user_id UUID,
  p_card_category TEXT,
  p_card_subcategory TEXT,
  p_amount DECIMAL,
  p_card_type TEXT,
  p_currency TEXT DEFAULT 'NGN',
  p_image_urls JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
BEGIN
  INSERT INTO public.gift_card_sales (
    user_id,
    card_category,
    card_subcategory,
    amount,
    currency,
    card_type,
    image_urls,
    status
  ) VALUES (
    p_user_id,
    p_card_category,
    p_card_subcategory,
    p_amount,
    p_currency,
    p_card_type,
    p_image_urls,
    'pending'
  )
  RETURNING id INTO v_sale_id;
  
  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's gift card sales
CREATE OR REPLACE FUNCTION public.get_user_gift_card_sales(
  p_user_id UUID,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  card_category TEXT,
  card_subcategory TEXT,
  amount DECIMAL,
  currency TEXT,
  card_type TEXT,
  image_urls JSONB,
  status TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  payment_transaction_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gcs.id,
    gcs.card_category,
    gcs.card_subcategory,
    gcs.amount,
    gcs.currency,
    gcs.card_type,
    gcs.image_urls,
    gcs.status,
    gcs.admin_notes,
    gcs.rejection_reason,
    gcs.reviewed_at,
    gcs.payment_transaction_id,
    gcs.created_at,
    gcs.updated_at
  FROM public.gift_card_sales gcs
  WHERE gcs.user_id = p_user_id
    AND (p_status IS NULL OR gcs.status = p_status)
  ORDER BY gcs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admins to update gift card sale status
CREATE OR REPLACE FUNCTION public.update_gift_card_sale_status(
  p_sale_id UUID,
  p_admin_user_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can update gift card sale status';
  END IF;
  
  -- Validate status
  IF p_status NOT IN ('pending', 'under_review', 'approved', 'rejected', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;
  
  -- Update gift card sale
  UPDATE public.gift_card_sales
  SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    rejection_reason = COALESCE(p_rejection_reason, rejection_reason),
    reviewed_at = CASE WHEN p_status IN ('approved', 'rejected', 'completed') THEN NOW() ELSE reviewed_at END,
    reviewed_by = CASE WHEN p_status IN ('approved', 'rejected', 'completed') THEN p_admin_user_id ELSE reviewed_by END,
    updated_at = NOW()
  WHERE id = p_sale_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_gift_card_sale(UUID, TEXT, TEXT, DECIMAL, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_gift_card_sales(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_gift_card_sale_status(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Add comments
COMMENT ON TABLE public.gift_card_sales IS 'Stores user requests to sell gift cards';
COMMENT ON COLUMN public.gift_card_sales.card_category IS 'Main category of the gift card (retail, gaming, entertainment, tech, food, travel)';
COMMENT ON COLUMN public.gift_card_sales.card_subcategory IS 'Specific gift card brand/type (amazon, steam, netflix, apple, google-play, etc.)';
COMMENT ON COLUMN public.gift_card_sales.card_type IS 'Type of gift card: ecode (digital code) or physical (physical card)';
COMMENT ON COLUMN public.gift_card_sales.image_urls IS 'Array of image URLs uploaded by the user';
COMMENT ON COLUMN public.gift_card_sales.status IS 'Status of the sale: pending, under_review, approved, rejected, completed, cancelled';
COMMENT ON FUNCTION public.create_gift_card_sale IS 'Create a new gift card sale request';
COMMENT ON FUNCTION public.get_user_gift_card_sales IS 'Get all gift card sales for a user, optionally filtered by status';
COMMENT ON FUNCTION public.update_gift_card_sale_status IS 'Update the status of a gift card sale (admin only)';

