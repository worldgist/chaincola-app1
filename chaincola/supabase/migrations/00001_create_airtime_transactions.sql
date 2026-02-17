-- NOTE: This migration was created during a quick attempt to add a dedicated
-- airtime_transactions table. The team chose to record utility purchases in
-- the existing `transactions` table instead (transaction_type = 'AIRTIME').
--
-- To avoid accidentally trying to push this migration to the remote
-- database (which would fail because local migration history does not match
-- remote), this file has been intentionally left inert. If you later decide
-- to enable a dedicated airtime table, replace this comment with the
-- original CREATE TABLE SQL and ensure your local migrations match the
-- project's migration history before running `supabase db push`.

/*
Original SQL (archived here for reference):

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

-- Indexes and trigger omitted in this archived copy

*/
