-- Settlement queue, batches, and event logs (treasury payout / crypto send pipeline).

CREATE TABLE IF NOT EXISTS public.settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'BATCH'
    CHECK (mode IN ('INSTANT', 'BATCH', 'SCHEDULED')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  total_amount DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlement_batches_reference_key UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON public.settlement_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_scheduled_for ON public.settlement_batches (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.settlement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.settlement_batches(id) ON DELETE SET NULL,
  legacy_settlement_id UUID REFERENCES public.settlements(id) ON DELETE SET NULL,
  source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settlement_kind TEXT NOT NULL
    CHECK (settlement_kind IN (
      'CRYPTO_WITHDRAW', 'CRYPTO_BUY', 'CRYPTO_SELL', 'FIAT_PAYOUT', 'OTHER'
    )),
  mode TEXT NOT NULL DEFAULT 'INSTANT'
    CHECK (mode IN ('INSTANT', 'BATCH', 'SCHEDULED')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'reversed')),
  asset TEXT,
  crypto_amount DECIMAL(20, 8),
  fiat_amount DECIMAL(20, 8),
  fiat_currency TEXT NOT NULL DEFAULT 'NGN',
  destination_address TEXT,
  payment_method TEXT,
  payment_provider TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  notes TEXT,
  dedupe_key TEXT,
  verification JSONB NOT NULL DEFAULT '{}',
  execution JSONB NOT NULL DEFAULT '{}',
  reconciliation JSONB NOT NULL DEFAULT '{}',
  approved_for_execution BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_queue_dedupe
  ON public.settlement_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_queue_source_tx_kind
  ON public.settlement_queue (source_transaction_id, settlement_kind)
  WHERE source_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_queue_status
  ON public.settlement_queue (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_settlement_queue_batch
  ON public.settlement_queue (batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_queue_user
  ON public.settlement_queue (user_id);

CREATE TABLE IF NOT EXISTS public.settlement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id UUID NOT NULL REFERENCES public.settlement_queue(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.settlement_batches(id) ON DELETE SET NULL,
  legacy_settlement_id UUID REFERENCES public.settlements(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_logs_queue
  ON public.settlement_logs (queue_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_logs_batch
  ON public.settlement_logs (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_logs_event
  ON public.settlement_logs (event, created_at DESC);

ALTER TABLE public.settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view settlement batches" ON public.settlement_batches;
CREATE POLICY "Admins can view settlement batches"
  ON public.settlement_batches FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage settlement batches" ON public.settlement_batches;
CREATE POLICY "Service role can manage settlement batches"
  ON public.settlement_batches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view settlement queue" ON public.settlement_queue;
CREATE POLICY "Admins can view settlement queue"
  ON public.settlement_queue FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage settlement queue" ON public.settlement_queue;
CREATE POLICY "Service role can manage settlement queue"
  ON public.settlement_queue FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view settlement logs" ON public.settlement_logs;
CREATE POLICY "Admins can view settlement logs"
  ON public.settlement_logs FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage settlement logs" ON public.settlement_logs;
CREATE POLICY "Service role can manage settlement logs"
  ON public.settlement_logs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.settlement_batches IS 'Batch or scheduled settlement groupings (merchant/fiat batches).';
COMMENT ON TABLE public.settlement_queue IS 'Per-user settlement work items: verification, execution, reconciliation metadata.';
COMMENT ON TABLE public.settlement_logs IS 'Append-only settlement events for audit (queued, verified, sent, confirmed, reversed).';
