-- Create a dedicated table for airtime purchases. Recorded separately from
-- the main transactions table to allow specialized indexes and metadata.
CREATE TABLE IF NOT EXISTS public.airtime_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  network text,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  reference text,
  external_transaction_id text,
  status text NOT NULL DEFAULT 'PENDING',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_airtime_user_id ON public.airtime_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_airtime_phone_number ON public.airtime_transactions (phone_number);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.airtime_transactions;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.airtime_transactions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_at();

-- Additional metrics view (optional) can be added later.
