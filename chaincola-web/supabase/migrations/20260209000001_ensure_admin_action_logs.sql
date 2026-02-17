-- Ensure admin_action_logs table exists for transaction audit trail
-- Used by admin_refund_transaction, updateTransactionStatus, and other admin actions

CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_user_id ON public.admin_action_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target_user_id ON public.admin_action_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type ON public.admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON public.admin_action_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_details_transaction 
  ON public.admin_action_logs USING gin ((action_details->'transaction_id'));

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can view and insert
DROP POLICY IF EXISTS "Admins can view action logs" ON public.admin_action_logs;
CREATE POLICY "Admins can view action logs"
  ON public.admin_action_logs
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert action logs" ON public.admin_action_logs;
CREATE POLICY "Admins can insert action logs"
  ON public.admin_action_logs
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

COMMENT ON TABLE public.admin_action_logs IS 'Audit log for admin actions on transactions and users';
