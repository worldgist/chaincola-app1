-- Flutterwave transfer events (withdrawal payouts)
-- Records initiation and webhook/callback updates for auditing and debugging.

CREATE TABLE IF NOT EXISTS public.flutterwave_transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID REFERENCES public.withdrawals(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transfer_id TEXT,
  reference TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'transfer_init',
    'transfer_status',
    'callback_received',
    'transfer_completed',
    'transfer_failed',
    'refund_issued'
  )),
  status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fw_transfer_events_withdrawal_id
  ON public.flutterwave_transfer_events(withdrawal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fw_transfer_events_transfer_id
  ON public.flutterwave_transfer_events(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fw_transfer_events_reference
  ON public.flutterwave_transfer_events(reference)
  WHERE reference IS NOT NULL;

ALTER TABLE public.flutterwave_transfer_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own transfer events (if user_id is populated)
CREATE POLICY "Users can view own flutterwave transfer events"
  ON public.flutterwave_transfer_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all flutterwave transfer events"
  ON public.flutterwave_transfer_events
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can insert
CREATE POLICY "Service role can insert flutterwave transfer events"
  ON public.flutterwave_transfer_events
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE public.flutterwave_transfer_events IS 'Audit log for Flutterwave withdrawal transfer initiation, status checks, callbacks, and refunds.';

