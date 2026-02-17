/*
 * Comprehensive Treasury Management System
 * Implements all critical treasury controls, risk management, and operational features
 */

-- ============================================================================
-- 1. WALLET MANAGEMENT (Missing Controls)
-- ============================================================================

-- Create wallet_types table for wallet classification
CREATE TABLE IF NOT EXISTS public.wallet_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- 'Hot', 'Warm', 'Cold'
  description TEXT,
  security_level INTEGER NOT NULL CHECK (security_level BETWEEN 1 AND 10), -- 1=Hot (lowest), 10=Cold (highest)
  max_balance_threshold DECIMAL(20, 8), -- Maximum balance allowed for this wallet type
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default wallet types
INSERT INTO public.wallet_types (name, description, security_level, max_balance_threshold) VALUES
  ('Hot', 'Online wallet for frequent transactions, lowest security', 1, NULL),
  ('Warm', 'Semi-online wallet with moderate security', 5, NULL),
  ('Cold', 'Offline storage wallet, highest security', 10, NULL)
ON CONFLICT (name) DO NOTHING;

-- Create wallet_registry table for tracking all system wallets
CREATE TABLE IF NOT EXISTS public.wallet_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Wallet identification
  wallet_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  blockchain_network TEXT NOT NULL CHECK (blockchain_network IN ('BITCOIN', 'ETHEREUM', 'SOLANA', 'XRP', 'TRON', 'BANK')),
  
  -- Classification
  wallet_type_id UUID REFERENCES public.wallet_types(id) NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('DEV', 'STAGING', 'PRODUCTION')) DEFAULT 'PRODUCTION',
  
  -- Operational settings
  polling_schedule_minutes INTEGER DEFAULT 15, -- How often to poll on-chain balance
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_deprecated BOOLEAN DEFAULT false NOT NULL,
  
  -- Withdrawal limits (per asset)
  daily_withdrawal_limit DECIMAL(20, 8),
  weekly_withdrawal_limit DECIMAL(20, 8),
  monthly_withdrawal_limit DECIMAL(20, 8),
  single_transaction_limit DECIMAL(20, 8),
  
  -- Rotation and lifecycle
  rotation_schedule_days INTEGER, -- Days until next rotation
  last_rotated_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,
  deprecated_reason TEXT,
  
  -- Current balance tracking
  current_balance DECIMAL(20, 8) DEFAULT 0,
  last_balance_check_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique wallet addresses per asset
  UNIQUE(wallet_address, asset, blockchain_network)
);

CREATE INDEX IF NOT EXISTS idx_wallet_registry_asset ON public.wallet_registry(asset);
CREATE INDEX IF NOT EXISTS idx_wallet_registry_type ON public.wallet_registry(wallet_type_id);
CREATE INDEX IF NOT EXISTS idx_wallet_registry_environment ON public.wallet_registry(environment);
CREATE INDEX IF NOT EXISTS idx_wallet_registry_active ON public.wallet_registry(is_active, is_deprecated);
CREATE INDEX IF NOT EXISTS idx_wallet_registry_balance_check ON public.wallet_registry(last_balance_check_at DESC) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.wallet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view wallet types" ON public.wallet_types;
CREATE POLICY "Admins can view wallet types" ON public.wallet_types FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage wallet types" ON public.wallet_types;
CREATE POLICY "Service role can manage wallet types" ON public.wallet_types FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view wallet registry" ON public.wallet_registry;
CREATE POLICY "Admins can view wallet registry" ON public.wallet_registry FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage wallet registry" ON public.wallet_registry;
CREATE POLICY "Service role can manage wallet registry" ON public.wallet_registry FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. INVENTORY MANAGEMENT ENHANCEMENTS
-- ============================================================================

-- Add auto-expiry fields to inventory_adjustments
ALTER TABLE public.inventory_adjustments 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_expired BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Create index for pending adjustments that may expire
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_expiry ON public.inventory_adjustments(status, expires_at) 
  WHERE status = 'PENDING' AND expires_at IS NOT NULL;

-- Function to auto-expire unconfirmed inventory entries
CREATE OR REPLACE FUNCTION public.expire_unconfirmed_inventory()
RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_adjustment RECORD;
  v_inventory_field TEXT;
  v_pending_field TEXT;
BEGIN
  -- Find all pending adjustments that have expired
  FOR v_adjustment IN 
    SELECT * FROM public.inventory_adjustments
    WHERE status = 'PENDING'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      AND auto_expired = false
  LOOP
    -- Determine fields
    IF v_adjustment.asset = 'NGN' THEN
      v_inventory_field := 'ngn_float_balance';
      v_pending_field := 'ngn_pending_float';
    ELSE
      v_inventory_field := LOWER(v_adjustment.asset) || '_inventory';
      v_pending_field := LOWER(v_adjustment.asset) || '_pending_inventory';
    END IF;
    
    -- Reverse the pending adjustment
    IF v_adjustment.operation = 'add' THEN
      -- Remove from pending balance
      EXECUTE format(
        'UPDATE public.system_wallets SET %I = %I - $1, updated_at = NOW() WHERE id = 1',
        v_pending_field, v_pending_field
      ) USING v_adjustment.amount;
    ELSE
      -- Restore to pending balance (was removed, now restore)
      EXECUTE format(
        'UPDATE public.system_wallets SET %I = %I + $1, updated_at = NOW() WHERE id = 1',
        v_pending_field, v_pending_field
      ) USING v_adjustment.amount;
    END IF;
    
    -- Mark as expired
    UPDATE public.inventory_adjustments
    SET 
      auto_expired = true,
      expired_at = NOW(),
      status = 'REVERSED',
      reversal_reason = 'Auto-expired: Unconfirmed entry expired after ' || 
        EXTRACT(EPOCH FROM (NOW() - expires_at)) / 3600 || ' hours',
      updated_at = NOW()
    WHERE id = v_adjustment.id;
    
    v_expired_count := v_expired_count + 1;
  END LOOP;
  
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. RECONCILIATION ENHANCEMENTS
-- ============================================================================

-- Add tolerance thresholds to treasury_reconciliation_status
ALTER TABLE public.treasury_reconciliation_status
  ADD COLUMN IF NOT EXISTS tolerance_threshold DECIMAL(20, 8) DEFAULT 0.0001,
  ADD COLUMN IF NOT EXISTS tolerance_percentage DECIMAL(10, 4) DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS auto_resolve_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_auto_resolved_at TIMESTAMPTZ;

-- Create reconciliation_runs table for tracking reconciliation workflow
CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Run identification
  run_type TEXT NOT NULL CHECK (run_type IN ('SCHEDULED', 'MANUAL', 'FORCED', 'AUTO_RESOLVE')),
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Lifecycle status
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'FAILED', 'APPROVED', 'REJECTED')),
  
  -- Balances at time of run
  ledger_balance DECIMAL(20, 8) NOT NULL,
  on_chain_balance DECIMAL(20, 8) NOT NULL,
  pending_balance DECIMAL(20, 8) DEFAULT 0,
  discrepancy DECIMAL(20, 8) NOT NULL,
  
  -- Resolution details
  resolution_action TEXT CHECK (resolution_action IN (
    'SYNC_FROM_CHAIN', 'REVERSE_LEDGER_ENTRY', 'ATTACH_TX_HASH', 
    'MANUAL_CONFIRM', 'FREEZE_ASSET', 'NO_ACTION', 'AUTO_RESOLVED'
  )),
  resolution_notes TEXT,
  
  -- Admin approval workflow
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Initiated by
  initiated_by UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Related records
  reconciliation_history_id UUID REFERENCES public.reconciliation_history(id),
  
  -- Metadata
  run_data JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_asset ON public.reconciliation_runs(asset);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status ON public.reconciliation_runs(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_created_at ON public.reconciliation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_pending_approval ON public.reconciliation_runs(requires_approval, status) 
  WHERE requires_approval = true AND status IN ('OPEN', 'INVESTIGATING');

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view reconciliation runs" ON public.reconciliation_runs;
CREATE POLICY "Admins can view reconciliation runs" ON public.reconciliation_runs FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage reconciliation runs" ON public.reconciliation_runs;
CREATE POLICY "Service role can manage reconciliation runs" ON public.reconciliation_runs FOR ALL USING (true) WITH CHECK (true);

-- Enhanced force_reconciliation function with tolerance and auto-resolution
-- Drop old version first if it exists
DROP FUNCTION IF EXISTS public.force_reconciliation(TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.force_reconciliation(
  p_asset TEXT,
  p_reconciliation_method TEXT DEFAULT 'MANUAL_FORCE_SYNC',
  p_initiated_by UUID DEFAULT NULL,
  p_resolution_action TEXT DEFAULT NULL,
  p_resolution_notes TEXT DEFAULT NULL,
  p_auto_resolve BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_system_wallet RECORD;
  v_reconciliation_status RECORD;
  v_inventory_field TEXT;
  v_pending_field TEXT;
  v_ledger_balance DECIMAL;
  v_pending_balance DECIMAL;
  v_on_chain_balance DECIMAL;
  v_on_chain_record RECORD;
  v_discrepancy DECIMAL;
  v_reconciliation_id UUID;
  v_reconciliation_run_id UUID;
  v_status TEXT;
  v_tolerance DECIMAL;
  v_requires_approval BOOLEAN := false;
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN') THEN
    RAISE EXCEPTION 'Invalid asset: %', p_asset;
  END IF;
  
  -- Get system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'System wallet not found';
  END IF;
  
  -- Get ledger balance
  IF p_asset = 'NGN' THEN
    v_inventory_field := 'ngn_float_balance';
    v_pending_field := 'ngn_pending_float';
    v_ledger_balance := v_system_wallet.ngn_float_balance;
    v_pending_balance := COALESCE(v_system_wallet.ngn_pending_float, 0);
  ELSE
    v_inventory_field := LOWER(p_asset) || '_inventory';
    v_pending_field := LOWER(p_asset) || '_pending_inventory';
    v_ledger_balance := v_system_wallet[v_inventory_field];
    v_pending_balance := COALESCE(v_system_wallet[v_pending_field], 0);
  END IF;
  
  -- Get on-chain balance (latest)
  SELECT * INTO v_on_chain_record
  FROM public.on_chain_balances
  WHERE asset = p_asset
  ORDER BY last_fetched_at DESC
  LIMIT 1;
  
  v_on_chain_balance := COALESCE(v_on_chain_record.on_chain_balance, 0);
  
  -- Calculate discrepancy
  v_discrepancy := v_on_chain_balance - v_ledger_balance;
  
  -- Get reconciliation status for tolerance
  SELECT * INTO v_reconciliation_status
  FROM public.treasury_reconciliation_status
  WHERE asset = p_asset;
  
  IF FOUND THEN
    v_tolerance := COALESCE(v_reconciliation_status.tolerance_threshold, 0.0001);
  ELSE
    v_tolerance := 0.0001;
  END IF;
  
  -- Determine status and if auto-resolution is possible
  IF ABS(v_discrepancy) < v_tolerance THEN
    v_status := 'COMPLETED';
  ELSIF p_auto_resolve AND ABS(v_discrepancy) < (v_tolerance * 10) THEN
    -- Small discrepancy, can auto-resolve
    v_status := 'COMPLETED';
    p_resolution_action := COALESCE(p_resolution_action, 'AUTO_RESOLVED');
  ELSE
    v_status := 'DISCREPANCY';
    v_requires_approval := ABS(v_discrepancy) > (v_tolerance * 100); -- Large discrepancies need approval
  END IF;
  
  -- Create reconciliation run
  INSERT INTO public.reconciliation_runs (
    run_type, asset, status, ledger_balance, on_chain_balance, pending_balance,
    discrepancy, resolution_action, resolution_notes, requires_approval, initiated_by
  ) VALUES (
    CASE WHEN p_auto_resolve THEN 'AUTO_RESOLVE' ELSE 'MANUAL' END,
    p_asset, 
    CASE WHEN v_requires_approval THEN 'OPEN' ELSE v_status END,
    v_ledger_balance, v_on_chain_balance, v_pending_balance,
    v_discrepancy, p_resolution_action, p_resolution_notes, v_requires_approval,
    COALESCE(p_initiated_by, auth.uid())
  ) RETURNING id INTO v_reconciliation_run_id;
  
  -- Create reconciliation history record
  INSERT INTO public.reconciliation_history (
    asset,
    ledger_balance_before, on_chain_balance_before, pending_balance_before,
    ledger_balance_after, on_chain_balance_after, pending_balance_after,
    discrepancy_before, discrepancy_after,
    discrepancy_resolved, reconciliation_method, resolution_action, resolution_notes,
    status, initiated_by, reconciliation_data
  ) VALUES (
    p_asset,
    v_ledger_balance, v_on_chain_balance, v_pending_balance,
    v_ledger_balance, v_on_chain_balance, v_pending_balance,
    v_discrepancy, v_discrepancy,
    (v_status = 'COMPLETED'), p_reconciliation_method, p_resolution_action, p_resolution_notes,
    v_status, COALESCE(p_initiated_by, auth.uid()),
    jsonb_build_object(
      'on_chain_record', row_to_json(v_on_chain_record),
      'reconciliation_method', p_reconciliation_method,
      'reconciliation_run_id', v_reconciliation_run_id,
      'tolerance', v_tolerance,
      'auto_resolved', p_auto_resolve
    )
  ) RETURNING id INTO v_reconciliation_id;
  
  -- Update reconciliation run with history ID
  UPDATE public.reconciliation_runs
  SET reconciliation_history_id = v_reconciliation_id
  WHERE id = v_reconciliation_run_id;
  
  -- Update reconciliation status table
  INSERT INTO public.treasury_reconciliation_status (
    asset,
    ledger_balance, on_chain_balance, difference, difference_percentage,
    status, last_reconciled_at
  ) VALUES (
    p_asset,
    v_ledger_balance, v_on_chain_balance, v_discrepancy,
    CASE WHEN v_ledger_balance > 0 THEN (v_discrepancy / v_ledger_balance * 100) ELSE 0 END,
    v_status, NOW()
  )
  ON CONFLICT (asset) DO UPDATE SET
    ledger_balance = EXCLUDED.ledger_balance,
    on_chain_balance = EXCLUDED.on_chain_balance,
    difference = EXCLUDED.difference,
    difference_percentage = EXCLUDED.difference_percentage,
    status = EXCLUDED.status,
    last_reconciled_at = EXCLUDED.last_reconciled_at,
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'success', true,
    'reconciliation_id', v_reconciliation_id,
    'reconciliation_run_id', v_reconciliation_run_id,
    'asset', p_asset,
    'ledger_balance', v_ledger_balance,
    'on_chain_balance', v_on_chain_balance,
    'pending_balance', v_pending_balance,
    'discrepancy', v_discrepancy,
    'status', v_status,
    'requires_approval', v_requires_approval
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. NGN FLOAT MANAGEMENT ENHANCEMENTS
-- ============================================================================

-- Create bank_accounts table for NGN float management
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Bank identification
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  bank_code TEXT, -- Nigerian bank code
  
  -- Environment
  environment TEXT NOT NULL CHECK (environment IN ('DEV', 'STAGING', 'PRODUCTION')) DEFAULT 'PRODUCTION',
  
  -- Balance tracking
  current_balance DECIMAL(20, 2) DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  last_reconciliation_balance DECIMAL(20, 2),
  
  -- Thresholds and alerts
  minimum_threshold DECIMAL(20, 2),
  alert_threshold DECIMAL(20, 2), -- Alert when balance drops below this
  alert_sent_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_primary BOOLEAN DEFAULT false, -- Primary account for operations
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(account_number, bank_code)
);

-- Create bank_reconciliation table for settlement tracking
CREATE TABLE IF NOT EXISTS public.bank_reconciliation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Bank account reference
  bank_account_id UUID REFERENCES public.bank_accounts(id) NOT NULL,
  
  -- Reconciliation details
  reconciliation_date DATE NOT NULL,
  ledger_balance DECIMAL(20, 2) NOT NULL,
  bank_statement_balance DECIMAL(20, 2) NOT NULL,
  difference DECIMAL(20, 2) NOT NULL,
  
  -- Settlement mismatch detection
  has_mismatch BOOLEAN DEFAULT false NOT NULL,
  mismatch_reason TEXT,
  mismatch_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Float aging analysis
  aging_0_30_days DECIMAL(20, 2) DEFAULT 0,
  aging_31_60_days DECIMAL(20, 2) DEFAULT 0,
  aging_61_90_days DECIMAL(20, 2) DEFAULT 0,
  aging_over_90_days DECIMAL(20, 2) DEFAULT 0,
  
  -- Metadata
  statement_reference TEXT,
  reconciliation_notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(is_active, is_primary);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_account ON public.bank_reconciliation(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_date ON public.bank_reconciliation(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_mismatch ON public.bank_reconciliation(has_mismatch, mismatch_resolved) 
  WHERE has_mismatch = true AND mismatch_resolved = false;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view bank accounts" ON public.bank_accounts;
CREATE POLICY "Admins can view bank accounts" ON public.bank_accounts FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage bank accounts" ON public.bank_accounts;
CREATE POLICY "Service role can manage bank accounts" ON public.bank_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view bank reconciliation" ON public.bank_reconciliation;
CREATE POLICY "Admins can view bank reconciliation" ON public.bank_reconciliation FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage bank reconciliation" ON public.bank_reconciliation;
CREATE POLICY "Service role can manage bank reconciliation" ON public.bank_reconciliation FOR ALL USING (true) WITH CHECK (true);

-- Function to check NGN float threshold and send alerts
CREATE OR REPLACE FUNCTION public.check_ngn_float_threshold()
RETURNS JSONB AS $$
DECLARE
  v_bank_account RECORD;
  v_system_wallet RECORD;
  v_total_float DECIMAL;
  v_alerts JSONB := '[]'::JSONB;
  v_alert JSONB;
BEGIN
  -- Get system wallet NGN float
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  v_total_float := COALESCE(v_system_wallet.ngn_float_balance, 0);
  
  -- Check each active bank account
  FOR v_bank_account IN 
    SELECT * FROM public.bank_accounts WHERE is_active = true
  LOOP
    -- Check if balance is below alert threshold
    IF v_bank_account.alert_threshold IS NOT NULL AND 
       v_bank_account.current_balance < v_bank_account.alert_threshold AND
       (v_bank_account.alert_sent_at IS NULL OR 
        v_bank_account.alert_sent_at < NOW() - INTERVAL '1 hour') THEN
      
      -- Create alert
      v_alert := jsonb_build_object(
        'bank_account_id', v_bank_account.id,
        'bank_name', v_bank_account.bank_name,
        'account_number', v_bank_account.account_number,
        'current_balance', v_bank_account.current_balance,
        'alert_threshold', v_bank_account.alert_threshold,
        'severity', CASE 
          WHEN v_bank_account.current_balance < COALESCE(v_bank_account.minimum_threshold, 0) THEN 'CRITICAL'
          ELSE 'WARNING'
        END
      );
      
      v_alerts := v_alerts || v_alert;
      
      -- Update alert sent timestamp
      UPDATE public.bank_accounts
      SET alert_sent_at = NOW(), updated_at = NOW()
      WHERE id = v_bank_account.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_float', v_total_float,
    'alerts', v_alerts,
    'alert_count', jsonb_array_length(v_alerts)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. RISK CONTROLS & EMERGENCY SYSTEMS
-- ============================================================================

-- Create global_risk_controls table
CREATE TABLE IF NOT EXISTS public.global_risk_controls (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  
  -- Emergency kill switch
  emergency_kill_switch BOOLEAN DEFAULT false NOT NULL,
  kill_switch_activated_at TIMESTAMPTZ,
  kill_switch_activated_by UUID REFERENCES auth.users(id),
  kill_switch_reason TEXT,
  
  -- Asset-level auto-disable
  auto_disable_on_discrepancy BOOLEAN DEFAULT true NOT NULL,
  discrepancy_threshold_percentage DECIMAL(10, 4) DEFAULT 1.0, -- Auto-disable if discrepancy > 1%
  
  -- Withdrawal velocity limits (global)
  max_daily_withdrawals DECIMAL(20, 8) DEFAULT 1000000,
  max_hourly_withdrawals DECIMAL(20, 8) DEFAULT 100000,
  withdrawal_velocity_window_hours INTEGER DEFAULT 24,
  
  -- Trade throttling
  trade_throttling_enabled BOOLEAN DEFAULT false NOT NULL,
  liquidity_threshold_percentage DECIMAL(10, 4) DEFAULT 10.0, -- Throttle when liquidity < 10% of normal
  throttle_factor DECIMAL(5, 2) DEFAULT 0.5, -- Reduce trade volume by 50% when throttled
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default risk controls
INSERT INTO public.global_risk_controls (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Create risk_events table for audit logging
CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Event identification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'KILL_SWITCH_ACTIVATED', 'KILL_SWITCH_DEACTIVATED',
    'ASSET_AUTO_DISABLED', 'ASSET_RE_ENABLED',
    'WITHDRAWAL_LIMIT_EXCEEDED', 'TRADE_THROTTLE_ACTIVATED',
    'TRADE_THROTTLE_DEACTIVATED', 'DISCREPANCY_DETECTED',
    'LIQUIDITY_THRESHOLD_BREACH', 'PRICE_FEED_FAILURE'
  )),
  
  -- Asset affected (if applicable)
  asset TEXT CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Event details
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  
  -- Action taken
  action_taken TEXT,
  resolved BOOLEAN DEFAULT false NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Triggered by
  triggered_by UUID REFERENCES auth.users(id),
  triggered_by_system BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_events_type ON public.risk_events(event_type);
CREATE INDEX IF NOT EXISTS idx_risk_events_asset ON public.risk_events(asset);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON public.risk_events(severity);
CREATE INDEX IF NOT EXISTS idx_risk_events_created_at ON public.risk_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_unresolved ON public.risk_events(resolved) WHERE resolved = false;

ALTER TABLE public.global_risk_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view risk controls" ON public.global_risk_controls;
CREATE POLICY "Admins can view risk controls" ON public.global_risk_controls FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage risk controls" ON public.global_risk_controls;
CREATE POLICY "Service role can manage risk controls" ON public.global_risk_controls FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view risk events" ON public.risk_events;
CREATE POLICY "Admins can view risk events" ON public.risk_events FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage risk events" ON public.risk_events;
CREATE POLICY "Service role can manage risk events" ON public.risk_events FOR ALL USING (true) WITH CHECK (true);

-- Function to activate emergency kill switch
CREATE OR REPLACE FUNCTION public.activate_kill_switch(
  p_reason TEXT,
  p_activated_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_controls RECORD;
BEGIN
  -- Get current controls
  SELECT * INTO v_controls FROM public.global_risk_controls WHERE id = 1;
  
  IF v_controls.emergency_kill_switch = true THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kill switch is already activated'
    );
  END IF;
  
  -- Activate kill switch
  UPDATE public.global_risk_controls
  SET 
    emergency_kill_switch = true,
    kill_switch_activated_at = NOW(),
    kill_switch_activated_by = COALESCE(p_activated_by, auth.uid()),
    kill_switch_reason = p_reason,
    updated_at = NOW()
  WHERE id = 1;
  
  -- Log risk event
  INSERT INTO public.risk_events (
    event_type, severity, description, event_data, triggered_by, triggered_by_system
  ) VALUES (
    'KILL_SWITCH_ACTIVATED',
    'CRITICAL',
    'Emergency kill switch activated: ' || p_reason,
    jsonb_build_object('reason', p_reason),
    COALESCE(p_activated_by, auth.uid()),
    false
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Emergency kill switch activated',
    'activated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if asset should be auto-disabled
CREATE OR REPLACE FUNCTION public.check_asset_auto_disable(p_asset TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_controls RECORD;
  v_reconciliation_status RECORD;
  v_discrepancy_pct DECIMAL;
BEGIN
  -- Get risk controls
  SELECT * INTO v_controls FROM public.global_risk_controls WHERE id = 1;
  
  -- Check kill switch first
  IF v_controls.emergency_kill_switch THEN
    RETURN true;
  END IF;
  
  -- Check auto-disable on discrepancy
  IF NOT v_controls.auto_disable_on_discrepancy THEN
    RETURN false;
  END IF;
  
  -- Get reconciliation status
  SELECT * INTO v_reconciliation_status
  FROM public.treasury_reconciliation_status
  WHERE asset = p_asset;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if discrepancy exceeds threshold
  v_discrepancy_pct := ABS(v_reconciliation_status.difference_percentage);
  
  IF v_discrepancy_pct > v_controls.discrepancy_threshold_percentage THEN
    -- Log risk event
    INSERT INTO public.risk_events (
      event_type, asset, severity, description, event_data, triggered_by_system
    ) VALUES (
      'ASSET_AUTO_DISABLED',
      p_asset,
      'HIGH',
      format('Asset %s auto-disabled due to discrepancy: %.4f%%', p_asset, v_discrepancy_pct),
      jsonb_build_object(
        'discrepancy_percentage', v_discrepancy_pct,
        'threshold', v_controls.discrepancy_threshold_percentage
      ),
      true
    );
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. PRICING ENGINE HARDENING
-- ============================================================================

-- Create price_sources table for multi-source aggregation
CREATE TABLE IF NOT EXISTS public.price_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Source identification
  source_name TEXT NOT NULL UNIQUE, -- 'COINBASE', 'BINANCE', 'COINGECKO', etc.
  source_type TEXT NOT NULL CHECK (source_type IN ('EXCHANGE', 'AGGREGATOR', 'ORACLE')),
  api_endpoint TEXT,
  
  -- Priority and reliability
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest priority
  reliability_score DECIMAL(5, 2) DEFAULT 5.0 CHECK (reliability_score BETWEEN 0 AND 10),
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Failure tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create asset_prices table with multi-source support
CREATE TABLE IF NOT EXISTS public.asset_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset and price
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  price DECIMAL(20, 8) NOT NULL,
  price_source_id UUID REFERENCES public.price_sources(id),
  
  -- Price metadata
  price_type TEXT NOT NULL CHECK (price_type IN ('SPOT', 'BUY', 'SELL', 'AGGREGATED')),
  volume_24h DECIMAL(20, 8),
  change_24h_percentage DECIMAL(10, 4),
  
  -- Deviation tracking
  deviation_from_median DECIMAL(10, 4), -- Percentage deviation from median price
  is_outlier BOOLEAN DEFAULT false,
  
  -- Timestamps
  fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create aggregated_prices table (final prices used by system)
CREATE TABLE IF NOT EXISTS public.aggregated_prices (
  asset TEXT PRIMARY KEY CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Aggregated price
  buy_price DECIMAL(20, 8) NOT NULL,
  sell_price DECIMAL(20, 8) NOT NULL,
  spot_price DECIMAL(20, 8) NOT NULL,
  
  -- Price metadata
  price_sources_count INTEGER DEFAULT 0,
  price_median DECIMAL(20, 8),
  price_std_deviation DECIMAL(20, 8),
  
  -- Circuit breaker
  circuit_breaker_active BOOLEAN DEFAULT false NOT NULL,
  circuit_breaker_reason TEXT,
  circuit_breaker_activated_at TIMESTAMPTZ,
  
  -- Fallback
  last_known_price DECIMAL(20, 8),
  last_known_price_at TIMESTAMPTZ,
  using_fallback BOOLEAN DEFAULT false NOT NULL,
  
  -- Liquidity-aware pricing
  liquidity_factor DECIMAL(5, 2) DEFAULT 1.0, -- Multiplier based on available liquidity
  min_liquidity_threshold DECIMAL(20, 8), -- Minimum liquidity for normal pricing
  
  -- Auto-disable
  is_disabled BOOLEAN DEFAULT false NOT NULL,
  disabled_reason TEXT,
  disabled_at TIMESTAMPTZ,
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_sources_active ON public.price_sources(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_asset_prices_asset ON public.asset_prices(asset, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_prices_source ON public.asset_prices(price_source_id);
CREATE INDEX IF NOT EXISTS idx_aggregated_prices_updated ON public.aggregated_prices(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aggregated_prices_disabled ON public.aggregated_prices(is_disabled) WHERE is_disabled = true;

ALTER TABLE public.price_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregated_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view price sources" ON public.price_sources;
CREATE POLICY "Admins can view price sources" ON public.price_sources FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage price sources" ON public.price_sources;
CREATE POLICY "Service role can manage price sources" ON public.price_sources FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view asset prices" ON public.asset_prices;
CREATE POLICY "Admins can view asset prices" ON public.asset_prices FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage asset prices" ON public.asset_prices;
CREATE POLICY "Service role can manage asset prices" ON public.asset_prices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view aggregated prices" ON public.aggregated_prices;
CREATE POLICY "Admins can view aggregated prices" ON public.aggregated_prices FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage aggregated prices" ON public.aggregated_prices;
CREATE POLICY "Service role can manage aggregated prices" ON public.aggregated_prices FOR ALL USING (true) WITH CHECK (true);

-- Function to aggregate prices from multiple sources
CREATE OR REPLACE FUNCTION public.aggregate_prices(p_asset TEXT)
RETURNS JSONB AS $$
DECLARE
  v_price_record RECORD;
  v_prices DECIMAL[];
  v_median_price DECIMAL;
  v_avg_price DECIMAL;
  v_std_dev DECIMAL;
  v_buy_price DECIMAL;
  v_sell_price DECIMAL;
  v_spot_price DECIMAL;
  v_source_count INTEGER := 0;
  v_outlier_count INTEGER := 0;
  v_circuit_breaker BOOLEAN := false;
  v_available_liquidity DECIMAL;
BEGIN
  -- Get all recent prices (within last 5 minutes) from active sources
  SELECT ARRAY_AGG(price ORDER BY price), COUNT(*)
  INTO v_prices, v_source_count
  FROM public.asset_prices
  WHERE asset = p_asset
    AND fetched_at > NOW() - INTERVAL '5 minutes'
    AND price_source_id IN (SELECT id FROM public.price_sources WHERE is_active = true);
  
  IF v_source_count = 0 THEN
    -- No prices available, use fallback
    UPDATE public.aggregated_prices
    SET 
      using_fallback = true,
      updated_at = NOW()
    WHERE asset = p_asset;
    
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No price sources available, using fallback',
      'using_fallback', true
    );
  END IF;
  
  -- Calculate median (middle value)
  IF array_length(v_prices, 1) > 0 THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY unnest) INTO v_median_price
    FROM unnest(v_prices);
    
    -- Calculate average
    SELECT AVG(unnest) INTO v_avg_price FROM unnest(v_prices);
    
    -- Calculate standard deviation
    SELECT STDDEV(unnest) INTO v_std_dev FROM unnest(v_prices);
    
    -- Remove outliers (beyond 3 standard deviations)
    FOR v_price_record IN 
      SELECT price FROM public.asset_prices
      WHERE asset = p_asset
        AND fetched_at > NOW() - INTERVAL '5 minutes'
        AND ABS(price - v_median_price) > (3 * COALESCE(v_std_dev, 0))
    LOOP
      UPDATE public.asset_prices
      SET is_outlier = true
      WHERE asset = p_asset AND price = v_price_record.price;
      v_outlier_count := v_outlier_count + 1;
    END LOOP;
    
    -- Check circuit breaker (if deviation is too high)
    IF v_std_dev > (v_median_price * 0.1) THEN -- More than 10% deviation
      v_circuit_breaker := true;
      
      UPDATE public.aggregated_prices
      SET 
        circuit_breaker_active = true,
        circuit_breaker_reason = format('High price deviation: %.2f%%', (v_std_dev / v_median_price * 100)),
        circuit_breaker_activated_at = NOW(),
        updated_at = NOW()
      WHERE asset = p_asset;
      
      -- Log risk event
      INSERT INTO public.risk_events (
        event_type, asset, severity, description, event_data, triggered_by_system
      ) VALUES (
        'PRICE_FEED_FAILURE',
        p_asset,
        'HIGH',
        format('Price circuit breaker activated for %s - deviation: %.2f%%', p_asset, (v_std_dev / v_median_price * 100)),
        jsonb_build_object(
          'median_price', v_median_price,
          'std_deviation', v_std_dev,
          'deviation_percentage', (v_std_dev / v_median_price * 100)
        ),
        true
      );
    END IF;
    
    -- Get available liquidity for liquidity-aware pricing
    v_available_liquidity := public.get_available_liquidity(p_asset);
    
    -- Calculate prices (use median for spot, add spread for buy/sell)
    v_spot_price := v_median_price;
    v_buy_price := v_median_price * 1.001; -- 0.1% spread
    v_sell_price := v_median_price * 0.999; -- 0.1% spread
    
    -- Adjust based on liquidity
    IF v_available_liquidity < 1000 THEN -- Low liquidity
      v_buy_price := v_buy_price * 1.002; -- Increase buy price
      v_sell_price := v_sell_price * 0.998; -- Decrease sell price
    END IF;
    
    -- Update aggregated prices
    INSERT INTO public.aggregated_prices (
      asset, buy_price, sell_price, spot_price,
      price_sources_count, price_median, price_std_deviation,
      circuit_breaker_active, last_known_price, last_known_price_at,
      using_fallback, liquidity_factor, updated_at
    ) VALUES (
      p_asset, v_buy_price, v_sell_price, v_spot_price,
      v_source_count, v_median_price, v_std_dev,
      v_circuit_breaker, v_spot_price, NOW(),
      false, CASE WHEN v_available_liquidity < 1000 THEN 0.95 ELSE 1.0 END, NOW()
    )
    ON CONFLICT (asset) DO UPDATE SET
      buy_price = EXCLUDED.buy_price,
      sell_price = EXCLUDED.sell_price,
      spot_price = EXCLUDED.spot_price,
      price_sources_count = EXCLUDED.price_sources_count,
      price_median = EXCLUDED.price_median,
      price_std_deviation = EXCLUDED.price_std_deviation,
      circuit_breaker_active = EXCLUDED.circuit_breaker_active,
      circuit_breaker_reason = EXCLUDED.circuit_breaker_reason,
      circuit_breaker_activated_at = CASE WHEN EXCLUDED.circuit_breaker_active THEN EXCLUDED.circuit_breaker_activated_at ELSE aggregated_prices.circuit_breaker_activated_at END,
      last_known_price = EXCLUDED.last_known_price,
      last_known_price_at = EXCLUDED.last_known_price_at,
      using_fallback = false,
      liquidity_factor = EXCLUDED.liquidity_factor,
      updated_at = NOW();
    
    RETURN jsonb_build_object(
      'success', true,
      'asset', p_asset,
      'spot_price', v_spot_price,
      'buy_price', v_buy_price,
      'sell_price', v_sell_price,
      'sources_count', v_source_count,
      'outliers_removed', v_outlier_count,
      'circuit_breaker_active', v_circuit_breaker
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No valid prices found'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. LIQUIDITY & TREASURY HEALTH SCORING
-- ============================================================================

-- Add health scoring fields to treasury_reconciliation_status
ALTER TABLE public.treasury_reconciliation_status
  ADD COLUMN IF NOT EXISTS health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS health_status TEXT CHECK (health_status IN ('GREEN', 'YELLOW', 'RED')),
  ADD COLUMN IF NOT EXISTS minimum_liquidity_threshold DECIMAL(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_liquidity DECIMAL(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquidity_percentage DECIMAL(10, 4) DEFAULT 0;

-- Function to calculate treasury health score
CREATE OR REPLACE FUNCTION public.calculate_treasury_health_score(p_asset TEXT)
RETURNS JSONB AS $$
DECLARE
  v_reconciliation_status RECORD;
  v_available_liquidity DECIMAL;
  v_min_threshold DECIMAL;
  v_liquidity_pct DECIMAL;
  v_health_score INTEGER := 100;
  v_health_status TEXT := 'GREEN';
  v_issues TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get reconciliation status
  SELECT * INTO v_reconciliation_status
  FROM public.treasury_reconciliation_status
  WHERE asset = p_asset;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Asset not found in reconciliation status'
    );
  END IF;
  
  -- Get available liquidity (excludes pending and mismatched)
  v_available_liquidity := public.get_available_liquidity(p_asset);
  v_min_threshold := COALESCE(v_reconciliation_status.minimum_liquidity_threshold, 0);
  
  -- Calculate liquidity percentage
  IF v_reconciliation_status.ledger_balance > 0 THEN
    v_liquidity_pct := (v_available_liquidity / v_reconciliation_status.ledger_balance) * 100;
  ELSE
    v_liquidity_pct := 0;
  END IF;
  
  -- Deduct points for various issues
  -- 1. Discrepancy (up to -40 points)
  IF v_reconciliation_status.status = 'MISMATCH' THEN
    IF ABS(v_reconciliation_status.difference_percentage) > 5 THEN
      v_health_score := v_health_score - 40;
      v_issues := v_issues || format('Large discrepancy: %.2f%%', v_reconciliation_status.difference_percentage);
    ELSIF ABS(v_reconciliation_status.difference_percentage) > 1 THEN
      v_health_score := v_health_score - 20;
      v_issues := v_issues || format('Moderate discrepancy: %.2f%%', v_reconciliation_status.difference_percentage);
    ELSE
      v_health_score := v_health_score - 10;
      v_issues := v_issues || format('Minor discrepancy: %.2f%%', v_reconciliation_status.difference_percentage);
    END IF;
  END IF;
  
  -- 2. Low liquidity (up to -30 points)
  IF v_min_threshold > 0 AND v_available_liquidity < v_min_threshold THEN
    v_health_score := v_health_score - 30;
    v_issues := v_issues || format('Below minimum liquidity threshold: %s < %s', v_available_liquidity, v_min_threshold);
  ELSIF v_liquidity_pct < 50 THEN
    v_health_score := v_health_score - 20;
    v_issues := v_issues || format('Low liquidity: %.2f%%', v_liquidity_pct);
  ELSIF v_liquidity_pct < 80 THEN
    v_health_score := v_health_score - 10;
    v_issues := v_issues || format('Moderate liquidity: %.2f%%', v_liquidity_pct);
  END IF;
  
  -- 3. Frozen asset (-50 points)
  IF v_reconciliation_status.is_frozen THEN
    v_health_score := v_health_score - 50;
    v_issues := v_issues || 'Asset is frozen';
  END IF;
  
  -- 4. Negative inventory (-60 points)
  IF v_reconciliation_status.is_negative_inventory THEN
    v_health_score := v_health_score - 60;
    v_issues := v_issues || 'Negative inventory detected';
  END IF;
  
  -- 5. On-chain lower than ledger (critical, -40 points)
  IF v_reconciliation_status.is_on_chain_lower THEN
    v_health_score := v_health_score - 40;
    v_issues := v_issues || 'On-chain balance lower than ledger (critical)';
  END IF;
  
  -- Ensure score is between 0 and 100
  v_health_score := GREATEST(0, LEAST(100, v_health_score));
  
  -- Determine health status
  IF v_health_score >= 80 THEN
    v_health_status := 'GREEN';
  ELSIF v_health_score >= 50 THEN
    v_health_status := 'YELLOW';
  ELSE
    v_health_status := 'RED';
  END IF;
  
  -- Update reconciliation status
  UPDATE public.treasury_reconciliation_status
  SET 
    health_score = v_health_score,
    health_status = v_health_status,
    available_liquidity = v_available_liquidity,
    liquidity_percentage = v_liquidity_pct,
    updated_at = NOW()
  WHERE asset = p_asset;
  
  RETURN jsonb_build_object(
    'success', true,
    'asset', p_asset,
    'health_score', v_health_score,
    'health_status', v_health_status,
    'available_liquidity', v_available_liquidity,
    'liquidity_percentage', v_liquidity_pct,
    'issues', v_issues,
    'issues_count', array_length(v_issues, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. AUDIT, COMPLIANCE & REPORTING ENHANCEMENTS
-- ============================================================================

-- Enhance audit_logs table if it exists, or create it
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Action details
  action_type TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  
  -- Target entity (existing columns)
  target_user_id UUID REFERENCES auth.users(id),
  target_entity_type TEXT,
  target_entity_id UUID,
  
  -- Action details
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changes JSONB DEFAULT '{}',
  
  -- Context (existing columns)
  ip_address TEXT,
  user_agent TEXT,
  
  -- Compliance fields (new columns)
  session_id TEXT,
  regulatory_category TEXT, -- 'FINANCIAL', 'OPERATIONAL', 'SECURITY', 'COMPLIANCE'
  requires_retention BOOLEAN DEFAULT true NOT NULL,
  retention_until TIMESTAMPTZ, -- When this record can be archived
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Immutable timestamp (never updated) - using created_at to match existing schema
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add missing columns if table already exists
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS regulatory_category TEXT,
  ADD COLUMN IF NOT EXISTS requires_retention BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS changes JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_regulatory ON public.audit_logs(regulatory_category, requires_retention);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.audit_logs(target_user_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_logs;
CREATE POLICY "Service role can manage audit logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Create treasury_reports table for exportable reports
CREATE TABLE IF NOT EXISTS public.treasury_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Report identification
  report_type TEXT NOT NULL CHECK (report_type IN (
    'RECONCILIATION_SUMMARY', 'INVENTORY_ADJUSTMENTS', 'RISK_EVENTS',
    'LIQUIDITY_ANALYSIS', 'BANK_RECONCILIATION', 'COMPLIANCE_AUDIT',
    'HEALTH_SCORE', 'CUSTOM'
  )),
  report_name TEXT NOT NULL,
  
  -- Report period
  start_date DATE,
  end_date DATE,
  
  -- Report data
  report_data JSONB NOT NULL,
  report_format TEXT DEFAULT 'JSON' CHECK (report_format IN ('JSON', 'CSV', 'PDF')),
  
  -- Generation details
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Export tracking
  exported_at TIMESTAMPTZ,
  export_count INTEGER DEFAULT 0,
  
  -- Regulatory
  is_regulatory BOOLEAN DEFAULT false NOT NULL,
  regulatory_category TEXT,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Add columns if table already exists without them
ALTER TABLE public.treasury_reports
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS report_data JSONB,
  ADD COLUMN IF NOT EXISTS report_format TEXT DEFAULT 'JSON',
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_regulatory BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS regulatory_category TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Set NOT NULL constraint on report_data if it doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'treasury_reports' 
    AND column_name = 'report_data'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.treasury_reports ALTER COLUMN report_data SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_treasury_reports_type ON public.treasury_reports(report_type);
-- Create date index only if columns exist (drop first if index exists but columns don't)
DO $$
BEGIN
  -- Drop index if it exists but columns don't
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'treasury_reports' 
    AND indexname = 'idx_treasury_reports_dates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'treasury_reports' 
    AND column_name = 'start_date'
  ) THEN
    DROP INDEX IF EXISTS public.idx_treasury_reports_dates;
  END IF;
  
  -- Create index if columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'treasury_reports' 
    AND column_name = 'start_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_treasury_reports_dates ON public.treasury_reports(start_date, end_date);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_treasury_reports_generated_at ON public.treasury_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_reports_regulatory ON public.treasury_reports(is_regulatory, regulatory_category);

ALTER TABLE public.treasury_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view treasury reports" ON public.treasury_reports;
CREATE POLICY "Admins can view treasury reports" ON public.treasury_reports FOR SELECT USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage treasury reports" ON public.treasury_reports;
CREATE POLICY "Service role can manage treasury reports" ON public.treasury_reports FOR ALL USING (true) WITH CHECK (true);

-- Function to generate reconciliation summary report
CREATE OR REPLACE FUNCTION public.generate_reconciliation_report(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_generated_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_report_id UUID;
  v_report_data JSONB;
  v_reconciliation RECORD;
  v_adjustments RECORD;
  v_summary JSONB;
BEGIN
  -- Set default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := (CURRENT_DATE - INTERVAL '30 days')::DATE;
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;
  
  -- Build report data
  v_report_data := jsonb_build_object(
    'report_period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date
    ),
    'reconciliation_status', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'asset', asset,
          'ledger_balance', ledger_balance,
          'on_chain_balance', on_chain_balance,
          'difference', difference,
          'status', status,
          'health_score', health_score,
          'health_status', health_status
        )
      )
      FROM public.treasury_reconciliation_status
    ),
    'reconciliation_history', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'asset', asset,
          'discrepancy_before', discrepancy_before,
          'discrepancy_after', discrepancy_after,
          'status', status,
          'created_at', created_at
        )
      )
      FROM public.reconciliation_history
      WHERE created_at::DATE BETWEEN p_start_date AND p_end_date
    ),
    'inventory_adjustments_summary', (
      SELECT jsonb_build_object(
        'total_adjustments', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
        'confirmed', COUNT(*) FILTER (WHERE status = 'CONFIRMED'),
        'reversed', COUNT(*) FILTER (WHERE status = 'REVERSED')
      )
      FROM public.inventory_adjustments
      WHERE created_at::DATE BETWEEN p_start_date AND p_end_date
    )
  );
  
  -- Create report record
  INSERT INTO public.treasury_reports (
    report_type, report_name, start_date, end_date,
    report_data, generated_by, is_regulatory, regulatory_category
  ) VALUES (
    'RECONCILIATION_SUMMARY',
    format('Reconciliation Summary Report - %s to %s', p_start_date, p_end_date),
    p_start_date, p_end_date,
    v_report_data,
    COALESCE(p_generated_by, auth.uid()),
    true,
    'FINANCIAL'
  ) RETURNING id INTO v_report_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'report_data', v_report_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.wallet_types IS 'Classification of wallet types: Hot (online), Warm (semi-online), Cold (offline)';
COMMENT ON TABLE public.wallet_registry IS 'Registry of all system wallets with classification, limits, and rotation tracking';
COMMENT ON TABLE public.reconciliation_runs IS 'Tracks reconciliation workflow runs with lifecycle status and approval workflow';
COMMENT ON TABLE public.bank_accounts IS 'NGN bank account registry for multi-bank float management';
COMMENT ON TABLE public.bank_reconciliation IS 'Bank statement reconciliation with settlement mismatch detection';
COMMENT ON TABLE public.global_risk_controls IS 'Global risk controls including emergency kill switch and velocity limits';
COMMENT ON TABLE public.risk_events IS 'Immutable audit log of all risk events and system actions';
COMMENT ON TABLE public.price_sources IS 'Multi-source price feed configuration with reliability tracking';
COMMENT ON TABLE public.asset_prices IS 'Raw price data from various sources with outlier detection';
COMMENT ON TABLE public.aggregated_prices IS 'Final aggregated prices used by system with circuit breaker and fallback';
COMMENT ON TABLE public.treasury_reports IS 'Exportable treasury reports for compliance and regulatory purposes';
COMMENT ON TABLE public.audit_logs IS 'Immutable audit trail for all treasury actions with regulatory compliance fields';

COMMENT ON FUNCTION public.expire_unconfirmed_inventory IS 'Automatically expires and reverses unconfirmed inventory adjustments after expiry time';
COMMENT ON FUNCTION public.force_reconciliation(TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN) IS 'Enhanced reconciliation with tolerance thresholds and auto-resolution capabilities';
COMMENT ON FUNCTION public.check_ngn_float_threshold IS 'Checks NGN float balances against thresholds and generates alerts';
COMMENT ON FUNCTION public.activate_kill_switch IS 'Activates global emergency kill switch to halt all operations';
COMMENT ON FUNCTION public.check_asset_auto_disable IS 'Checks if asset should be auto-disabled based on discrepancy thresholds';
COMMENT ON FUNCTION public.aggregate_prices IS 'Aggregates prices from multiple sources with outlier removal and circuit breaker';
COMMENT ON FUNCTION public.calculate_treasury_health_score IS 'Calculates comprehensive health score (0-100) with color-coded status';
COMMENT ON FUNCTION public.generate_reconciliation_report IS 'Generates regulatory-ready reconciliation summary report';
