-- Transaction / treasury reconciliation audit trail (engine writes logs + errors).

CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  mode TEXT NOT NULL,
  reconciliation_scope TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (reconciliation_scope IN ('REAL_TIME', 'SCHEDULED', 'MANUAL')),
  provider TEXT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  tx_hash TEXT,
  asset TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('MATCHED', 'PENDING', 'FAILED', 'MISMATCH', 'DUPLICATE')),
  summary TEXT,
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_run_id ON public.reconciliation_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_created_at ON public.reconciliation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_status ON public.reconciliation_logs (status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_tx_hash ON public.reconciliation_logs (tx_hash)
  WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_transaction_id ON public.reconciliation_logs (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reconciliation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_log_id UUID NOT NULL REFERENCES public.reconciliation_logs(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_errors_log_id ON public.reconciliation_errors (reconciliation_log_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_errors_type ON public.reconciliation_errors (error_type);

ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view reconciliation logs" ON public.reconciliation_logs;
CREATE POLICY "Admins can view reconciliation logs"
  ON public.reconciliation_logs FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage reconciliation logs" ON public.reconciliation_logs;
CREATE POLICY "Service role can manage reconciliation logs"
  ON public.reconciliation_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view reconciliation errors" ON public.reconciliation_errors;
CREATE POLICY "Admins can view reconciliation errors"
  ON public.reconciliation_errors FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage reconciliation errors" ON public.reconciliation_errors;
CREATE POLICY "Service role can manage reconciliation errors"
  ON public.reconciliation_errors FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.reconciliation_logs IS 'Per-run reconciliation outcomes: internal vs external checks, status (MATCHED/PENDING/FAILED/MISMATCH/DUPLICATE).';
COMMENT ON TABLE public.reconciliation_errors IS 'Structured errors linked to reconciliation_logs for admin investigation.';

-- Global duplicate tx_hash detection (for reconciliation engine).
CREATE OR REPLACE FUNCTION public.transaction_hash_duplicate_counts(p_max_groups integer DEFAULT 500)
RETURNS TABLE (tx_hash text, ct bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(t.transaction_hash)) AS tx_hash, count(*)::bigint AS ct
  FROM public.transactions t
  WHERE t.transaction_hash IS NOT NULL AND length(trim(t.transaction_hash)) > 0
  GROUP BY lower(trim(t.transaction_hash))
  HAVING count(*) > 1
  ORDER BY ct DESC
  LIMIT GREATEST(1, p_max_groups);
$$;

REVOKE ALL ON FUNCTION public.transaction_hash_duplicate_counts(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transaction_hash_duplicate_counts(integer) TO service_role;
