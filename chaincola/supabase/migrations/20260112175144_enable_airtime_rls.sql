-- Enable Row Level Security for airtime_transactions and add owner policies.
-- This migration enables RLS and creates policies allowing users to:
--  - SELECT their own rows
--  - INSERT rows with their own user_id
--  - UPDATE their own rows
--  - DELETE their own rows
-- It also allows the service role to bypass RLS (service_role keys bypass RLS by design),
-- and allows authenticated functions/edge code that run as an authenticated user to operate when user_id = auth.uid().

-- Enable RLS
ALTER TABLE IF EXISTS public.airtime_transactions
	ENABLE ROW LEVEL SECURITY;

-- Ensure replica identity (optional but helpful for logical replication)
ALTER TABLE IF EXISTS public.airtime_transactions
	REPLICA IDENTITY FULL;

-- Create owner policies (drop existing first since CREATE POLICY IF NOT EXISTS is not supported)
DROP POLICY IF EXISTS "select_own" ON public.airtime_transactions;
CREATE POLICY "select_own" ON public.airtime_transactions
	FOR SELECT
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own" ON public.airtime_transactions;
CREATE POLICY "insert_own" ON public.airtime_transactions
	FOR INSERT
	WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own" ON public.airtime_transactions;
CREATE POLICY "update_own" ON public.airtime_transactions
	FOR UPDATE
	USING (user_id = auth.uid())
	WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own" ON public.airtime_transactions;
CREATE POLICY "delete_own" ON public.airtime_transactions
	FOR DELETE
	USING (user_id = auth.uid());

-- Note: service_role keys bypass RLS automatically. If you need Edge Functions
-- (running with anon key) to perform server-like actions, consider creating
-- additional policies that permit a specific role or a claim check.
