-- Control Center Tables
-- Creates tables for Settlement, Limits, Reconciliations, and Audit Logs

-- ============================================================================
-- 1. SETTLEMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Settlement details
  settlement_type TEXT NOT NULL CHECK (settlement_type IN ('DAILY', 'WEEKLY', 'MANUAL', 'AUTO')),
  settlement_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  
  -- Amounts
  total_amount DECIMAL(20, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  fees_collected DECIMAL(20, 8) DEFAULT 0,
  net_amount DECIMAL(20, 8) NOT NULL,
  
  -- Settlement period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Related data
  transaction_count INTEGER DEFAULT 0,
  user_count INTEGER DEFAULT 0,
  
  -- Processing details
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  settlement_reference TEXT UNIQUE, -- External settlement reference
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_settlement_date ON public.settlements(settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_settlement_type ON public.settlements(settlement_type);
CREATE INDEX IF NOT EXISTS idx_settlements_period ON public.settlements(period_start, period_end);

-- ============================================================================
-- 2. LIMITS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Limit type
  limit_type TEXT NOT NULL CHECK (limit_type IN (
    'DAILY_DEPOSIT', 'DAILY_WITHDRAWAL', 'DAILY_SEND', 'DAILY_BUY', 'DAILY_SELL',
    'SINGLE_DEPOSIT', 'SINGLE_WITHDRAWAL', 'SINGLE_SEND', 'SINGLE_BUY', 'SINGLE_SELL',
    'MONTHLY_DEPOSIT', 'MONTHLY_WITHDRAWAL',
    'MINIMUM_DEPOSIT', 'MINIMUM_WITHDRAWAL', 'MINIMUM_SEND',
    'MAXIMUM_DEPOSIT', 'MAXIMUM_WITHDRAWAL', 'MAXIMUM_SEND'
  )),
  
  -- Currency and amount
  currency TEXT NOT NULL, -- NGN, BTC, ETH, etc. or 'ALL' for all currencies
  amount DECIMAL(20, 8) NOT NULL,
  
  -- User scope
  user_type TEXT DEFAULT 'ALL' CHECK (user_type IN ('ALL', 'VERIFIED', 'UNVERIFIED', 'VIP')),
  user_id UUID REFERENCES auth.users(id), -- NULL for global limits, specific user_id for user-specific limits
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ, -- NULL for permanent limits
  
  -- Metadata
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Expression UNIQUE (table UNIQUE cannot use COALESCE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_limits_unique_type_currency_scope
  ON public.system_limits (limit_type, currency, (COALESCE(user_id::text, 'GLOBAL')));

CREATE INDEX IF NOT EXISTS idx_system_limits_limit_type ON public.system_limits(limit_type);
CREATE INDEX IF NOT EXISTS idx_system_limits_currency ON public.system_limits(currency);
CREATE INDEX IF NOT EXISTS idx_system_limits_user_id ON public.system_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_system_limits_is_active ON public.system_limits(is_active);
CREATE INDEX IF NOT EXISTS idx_system_limits_effective ON public.system_limits(effective_from, effective_until);

-- ============================================================================
-- 3. RECONCILIATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Reconciliation type
  reconciliation_type TEXT NOT NULL CHECK (reconciliation_type IN (
    'BALANCE', 'TRANSACTION', 'CRYPTO_INVENTORY', 'NGN_FLOAT', 'FULL_SYSTEM'
  )),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DISCREPANCY_FOUND')),
  
  -- Period
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  
  -- Results
  expected_amount DECIMAL(20, 8),
  actual_amount DECIMAL(20, 8),
  discrepancy_amount DECIMAL(20, 8) DEFAULT 0,
  currency TEXT,
  
  -- Counts
  transactions_checked INTEGER DEFAULT 0,
  discrepancies_found INTEGER DEFAULT 0,
  
  -- Details
  details JSONB DEFAULT '{}', -- Detailed reconciliation results
  discrepancies JSONB DEFAULT '[]', -- Array of found discrepancies
  
  -- Processing
  initiated_by UUID REFERENCES auth.users(id),
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_type ON public.reconciliations(reconciliation_type);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON public.reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON public.reconciliations(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_period ON public.reconciliations(period_start, period_end);

-- ============================================================================
-- 4. AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Action details
  action_type TEXT NOT NULL CHECK (action_type IN (
    'TREASURY_ADJUSTMENT', 'SETTLEMENT_PROCESSED', 'LIMIT_CREATED', 'LIMIT_UPDATED', 'LIMIT_DELETED',
    'RECONCILIATION_RUN', 'USER_BALANCE_ADJUSTED', 'TRANSACTION_MANUAL_CREDIT', 'TRANSACTION_MANUAL_DEBIT',
    'SYSTEM_WALLET_UPDATED', 'PRICE_UPDATED', 'SETTINGS_CHANGED', 'USER_STATUS_CHANGED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'DEPOSIT_MANUAL_CREDIT', 'OTHER'
  )),
  
  -- User and target
  performed_by UUID REFERENCES auth.users(id) NOT NULL,
  target_user_id UUID REFERENCES auth.users(id), -- User affected by the action
  target_entity_type TEXT, -- 'USER', 'TRANSACTION', 'SETTLEMENT', 'LIMIT', etc.
  target_entity_id UUID, -- ID of the affected entity
  
  -- Action details
  description TEXT NOT NULL,
  old_value JSONB, -- Previous state/value
  new_value JSONB, -- New state/value
  changes JSONB DEFAULT '{}', -- Detailed changes
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_entity ON public.audit_logs(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action_date ON public.audit_logs(performed_by, action_type, created_at DESC);

-- ============================================================================
-- 5. ENABLE RLS
-- ============================================================================
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

-- Settlements: Admins only
CREATE POLICY "Admins can manage settlements"
  ON public.settlements
  FOR ALL
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Limits: Admins can manage, users can view their own limits
CREATE POLICY "Admins can manage limits"
  ON public.system_limits
  FOR ALL
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY "Users can view applicable limits"
  ON public.system_limits
  FOR SELECT
  USING (
    is_active = true 
    AND (effective_until IS NULL OR effective_until > NOW())
    AND (
      user_id IS NULL -- Global limits
      OR user_id = auth.uid() -- User-specific limits
    )
  );

-- Reconciliations: Admins only
CREATE POLICY "Admins can manage reconciliations"
  ON public.reconciliations
  FOR ALL
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Audit Logs: Admins can view all, users can view their own actions
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (performed_by = auth.uid());

CREATE POLICY "System can create audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settlements_updated_at
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_limits_updated_at
  BEFORE UPDATE ON public.system_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliations_updated_at
  BEFORE UPDATE ON public.reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================
COMMENT ON TABLE public.settlements IS 'Tracks settlement processing for daily/weekly/manual settlements';
COMMENT ON TABLE public.system_limits IS 'Defines transaction limits for users (daily, single, monthly, etc.)';
COMMENT ON TABLE public.reconciliations IS 'Records of balance and transaction reconciliations';
COMMENT ON TABLE public.audit_logs IS 'Comprehensive audit trail of all admin actions and system changes';
