-- Add Treasury On-Chain Balance Tracking and Reconciliation
-- This migration adds tables and functions to track on-chain balances vs ledger inventory

-- ============================================================================
-- 1. CREATE on_chain_balances TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.on_chain_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL')),
  network TEXT, -- 'mainnet', 'ethereum', 'solana', 'bitcoin', 'xrp', etc.
  
  -- Balance information
  wallet_address TEXT NOT NULL,
  on_chain_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ledger_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  difference DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  
  -- Reconciliation status
  reconciliation_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (reconciliation_status IN (
    'BALANCED', 'MISMATCH', 'UNKNOWN', 'ERROR'
  )),
  
  -- Metadata
  last_fetched_at TIMESTAMPTZ,
  fetch_error TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one record per asset
  UNIQUE(asset, wallet_address)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_on_chain_balances_asset ON public.on_chain_balances(asset);
CREATE INDEX IF NOT EXISTS idx_on_chain_balances_status ON public.on_chain_balances(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_on_chain_balances_last_fetched ON public.on_chain_balances(last_fetched_at DESC);

-- Enable RLS
ALTER TABLE public.on_chain_balances ENABLE ROW LEVEL SECURITY;

-- Only admins can view on-chain balances
CREATE POLICY "Admins can view on-chain balances"
  ON public.on_chain_balances
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage on-chain balances
CREATE POLICY "Service role can manage on-chain balances"
  ON public.on_chain_balances
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. CREATE treasury_reconciliation_status TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_reconciliation_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Balance comparison
  ledger_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  on_chain_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  difference DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  difference_percentage DECIMAL(10, 4) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN (
    'BALANCED', 'MISMATCH', 'UNKNOWN', 'ERROR', 'NEGATIVE_INVENTORY', 'LOW_BALANCE'
  )),
  
  -- Risk flags
  is_negative_inventory BOOLEAN DEFAULT false,
  is_low_balance BOOLEAN DEFAULT false,
  is_on_chain_lower BOOLEAN DEFAULT false,
  
  -- Thresholds (for alerts)
  negative_threshold DECIMAL(20, 8) DEFAULT 0,
  low_balance_threshold DECIMAL(20, 8) DEFAULT 0,
  
  -- Metadata
  last_reconciled_at TIMESTAMPTZ,
  reconciliation_notes TEXT,
  alert_sent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one record per asset
  UNIQUE(asset)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treasury_reconciliation_asset ON public.treasury_reconciliation_status(asset);
CREATE INDEX IF NOT EXISTS idx_treasury_reconciliation_status ON public.treasury_reconciliation_status(status);
CREATE INDEX IF NOT EXISTS idx_treasury_reconciliation_risk_flags ON public.treasury_reconciliation_status(is_negative_inventory, is_low_balance, is_on_chain_lower);

-- Enable RLS
ALTER TABLE public.treasury_reconciliation_status ENABLE ROW LEVEL SECURITY;

-- Only admins can view reconciliation status
CREATE POLICY "Admins can view reconciliation status"
  ON public.treasury_reconciliation_status
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage reconciliation status
CREATE POLICY "Service role can manage reconciliation status"
  ON public.treasury_reconciliation_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. CREATE treasury_risk_alerts TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_risk_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Alert information
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'NEGATIVE_INVENTORY', 'LOW_BALANCE', 'ON_CHAIN_MISMATCH', 'NGN_FLOAT_LOW', 
    'RECONCILIATION_FAILED', 'LARGE_DISCREPANCY', 'OTHER'
  )),
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  -- Asset and context
  asset TEXT,
  current_value DECIMAL(20, 8),
  threshold_value DECIMAL(20, 8),
  difference DECIMAL(20, 8),
  
  -- Alert details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treasury_risk_alerts_type ON public.treasury_risk_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_treasury_risk_alerts_status ON public.treasury_risk_alerts(status);
CREATE INDEX IF NOT EXISTS idx_treasury_risk_alerts_severity ON public.treasury_risk_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_treasury_risk_alerts_created_at ON public.treasury_risk_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_risk_alerts_active ON public.treasury_risk_alerts(status, created_at DESC) 
  WHERE status = 'ACTIVE';

-- Enable RLS
ALTER TABLE public.treasury_risk_alerts ENABLE ROW LEVEL SECURITY;

-- Only admins can view risk alerts
CREATE POLICY "Admins can view risk alerts"
  ON public.treasury_risk_alerts
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Only admins can update risk alerts
CREATE POLICY "Admins can update risk alerts"
  ON public.treasury_risk_alerts
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()));

-- Service role can create risk alerts
CREATE POLICY "Service role can create risk alerts"
  ON public.treasury_risk_alerts
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 4. CREATE FUNCTION TO UPDATE ON-CHAIN BALANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_on_chain_balance(
  p_asset TEXT,
  p_wallet_address TEXT,
  p_on_chain_balance DECIMAL,
  p_ledger_inventory DECIMAL DEFAULT NULL,
  p_fetch_error TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ledger DECIMAL;
  v_difference DECIMAL;
  v_status TEXT;
  v_system_wallet RECORD;
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RAISE EXCEPTION 'Invalid asset: %', p_asset;
  END IF;
  
  -- Get ledger inventory from system_wallets if not provided
  IF p_ledger_inventory IS NULL THEN
    SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'System wallet not found';
    END IF;
    
    CASE p_asset
      WHEN 'BTC' THEN v_ledger := v_system_wallet.btc_inventory;
      WHEN 'ETH' THEN v_ledger := v_system_wallet.eth_inventory;
      WHEN 'USDT' THEN v_ledger := v_system_wallet.usdt_inventory;
      WHEN 'USDC' THEN v_ledger := v_system_wallet.usdc_inventory;
      WHEN 'XRP' THEN v_ledger := v_system_wallet.xrp_inventory;
      WHEN 'SOL' THEN v_ledger := v_system_wallet.sol_inventory;
    END CASE;
  ELSE
    v_ledger := p_ledger_inventory;
  END IF;
  
  -- Calculate difference
  v_difference := p_on_chain_balance - v_ledger;
  
  -- Determine status
  IF p_fetch_error IS NOT NULL THEN
    v_status := 'ERROR';
  ELSIF ABS(v_difference) < 0.00000001 THEN -- Very small threshold for floating point comparison
    v_status := 'BALANCED';
  ELSE
    v_status := 'MISMATCH';
  END IF;
  
  -- Insert or update on-chain balance
  INSERT INTO public.on_chain_balances (
    asset,
    wallet_address,
    on_chain_balance,
    ledger_inventory,
    difference,
    reconciliation_status,
    last_fetched_at,
    fetch_error,
    updated_at
  ) VALUES (
    p_asset,
    p_wallet_address,
    p_on_chain_balance,
    v_ledger,
    v_difference,
    v_status,
    NOW(),
    p_fetch_error,
    NOW()
  )
  ON CONFLICT (asset, wallet_address) 
  DO UPDATE SET
    on_chain_balance = p_on_chain_balance,
    ledger_inventory = v_ledger,
    difference = v_difference,
    reconciliation_status = v_status,
    last_fetched_at = NOW(),
    fetch_error = p_fetch_error,
    updated_at = NOW();
  
  -- Update reconciliation status
  PERFORM public.update_reconciliation_status(p_asset, v_ledger, p_on_chain_balance);
  
  RETURN jsonb_build_object(
    'success', true,
    'asset', p_asset,
    'on_chain_balance', p_on_chain_balance,
    'ledger_inventory', v_ledger,
    'difference', v_difference,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE FUNCTION TO UPDATE RECONCILIATION STATUS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_reconciliation_status(
  p_asset TEXT,
  p_ledger_balance DECIMAL DEFAULT NULL,
  p_on_chain_balance DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ledger DECIMAL;
  v_on_chain DECIMAL;
  v_difference DECIMAL;
  v_difference_pct DECIMAL;
  v_status TEXT;
  v_is_negative BOOLEAN := false;
  v_is_low BOOLEAN := false;
  v_is_on_chain_lower BOOLEAN := false;
  v_system_wallet RECORD;
  v_on_chain_record RECORD;
BEGIN
  -- Get ledger balance from system_wallets if not provided
  IF p_ledger_balance IS NULL THEN
    SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'System wallet not found';
    END IF;
    
    CASE p_asset
      WHEN 'BTC' THEN v_ledger := v_system_wallet.btc_inventory;
      WHEN 'ETH' THEN v_ledger := v_system_wallet.eth_inventory;
      WHEN 'USDT' THEN v_ledger := v_system_wallet.usdt_inventory;
      WHEN 'USDC' THEN v_ledger := v_system_wallet.usdc_inventory;
      WHEN 'XRP' THEN v_ledger := v_system_wallet.xrp_inventory;
      WHEN 'SOL' THEN v_ledger := v_system_wallet.sol_inventory;
      WHEN 'NGN' THEN v_ledger := v_system_wallet.ngn_float_balance;
    END CASE;
  ELSE
    v_ledger := p_ledger_balance;
  END IF;
  
  -- Get on-chain balance if not provided (for crypto assets)
  IF p_asset != 'NGN' AND p_on_chain_balance IS NULL THEN
    SELECT * INTO v_on_chain_record FROM public.on_chain_balances 
    WHERE asset = p_asset 
    ORDER BY last_fetched_at DESC 
    LIMIT 1;
    
    IF FOUND THEN
      v_on_chain := v_on_chain_record.on_chain_balance;
    ELSE
      v_on_chain := 0;
    END IF;
  ELSIF p_asset = 'NGN' THEN
    v_on_chain := NULL; -- NGN doesn't have on-chain balance
  ELSE
    v_on_chain := p_on_chain_balance;
  END IF;
  
  -- Calculate difference
  IF p_asset = 'NGN' THEN
    v_difference := 0;
    v_difference_pct := 0;
  ELSE
    v_difference := COALESCE(v_on_chain, 0) - v_ledger;
    IF v_ledger > 0 THEN
      v_difference_pct := (v_difference / v_ledger) * 100;
    ELSE
      v_difference_pct := CASE WHEN v_difference > 0 THEN 100 ELSE 0 END;
    END IF;
  END IF;
  
  -- Determine status and risk flags
  IF p_asset = 'NGN' THEN
    -- For NGN, check if below safe limit (default 1,000,000 NGN)
    IF v_ledger < 1000000 THEN
      v_status := 'LOW_BALANCE';
      v_is_low := true;
    ELSE
      v_status := 'BALANCED';
    END IF;
  ELSE
    -- Check for negative inventory
    IF v_ledger < 0 THEN
      v_status := 'NEGATIVE_INVENTORY';
      v_is_negative := true;
    -- Check if on-chain is lower than ledger (critical)
    ELSIF v_on_chain < v_ledger THEN
      v_status := 'MISMATCH';
      v_is_on_chain_lower := true;
    -- Check for mismatch
    ELSIF ABS(v_difference) > 0.00000001 THEN
      v_status := 'MISMATCH';
    ELSE
      v_status := 'BALANCED';
    END IF;
    
    -- Check for low balance (less than 0.01 of asset)
    IF v_ledger < 0.01 THEN
      v_is_low := true;
    END IF;
  END IF;
  
  -- Insert or update reconciliation status
  INSERT INTO public.treasury_reconciliation_status (
    asset,
    ledger_balance,
    on_chain_balance,
    difference,
    difference_percentage,
    status,
    is_negative_inventory,
    is_low_balance,
    is_on_chain_lower,
    last_reconciled_at,
    updated_at
  ) VALUES (
    p_asset,
    v_ledger,
    COALESCE(v_on_chain, 0),
    v_difference,
    v_difference_pct,
    v_status,
    v_is_negative,
    v_is_low,
    v_is_on_chain_lower,
    NOW(),
    NOW()
  )
  ON CONFLICT (asset) 
  DO UPDATE SET
    ledger_balance = v_ledger,
    on_chain_balance = COALESCE(v_on_chain, 0),
    difference = v_difference,
    difference_percentage = v_difference_pct,
    status = v_status,
    is_negative_inventory = v_is_negative,
    is_low_balance = v_is_low,
    is_on_chain_lower = v_is_on_chain_lower,
    last_reconciled_at = NOW(),
    updated_at = NOW();
  
  -- Check and create risk alerts
  PERFORM public.check_and_create_risk_alerts(p_asset, v_status, v_is_negative, v_is_low, v_is_on_chain_lower, v_ledger, v_on_chain);
  
  RETURN jsonb_build_object(
    'success', true,
    'asset', p_asset,
    'status', v_status,
    'ledger_balance', v_ledger,
    'on_chain_balance', COALESCE(v_on_chain, 0),
    'difference', v_difference
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. CREATE FUNCTION TO CHECK AND CREATE RISK ALERTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_create_risk_alerts(
  p_asset TEXT,
  p_status TEXT,
  p_is_negative BOOLEAN,
  p_is_low BOOLEAN,
  p_is_on_chain_lower BOOLEAN,
  p_ledger_balance DECIMAL,
  p_on_chain_balance DECIMAL DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_alert_type TEXT;
  v_severity TEXT;
  v_title TEXT;
  v_description TEXT;
  v_existing_alert_id UUID;
BEGIN
  -- Check for negative inventory
  IF p_is_negative THEN
    v_alert_type := 'NEGATIVE_INVENTORY';
    v_severity := 'CRITICAL';
    v_title := format('%s Inventory is Negative', p_asset);
    v_description := format('Ledger inventory for %s is negative: %s. This is a critical issue that requires immediate attention.', 
      p_asset, p_ledger_balance);
    
    -- Check if alert already exists
    SELECT id INTO v_existing_alert_id FROM public.treasury_risk_alerts
    WHERE alert_type = v_alert_type 
      AND asset = p_asset 
      AND status = 'ACTIVE'
    LIMIT 1;
    
    IF v_existing_alert_id IS NULL THEN
      INSERT INTO public.treasury_risk_alerts (
        alert_type, severity, asset, current_value, title, description, details, status
      ) VALUES (
        v_alert_type, v_severity, p_asset, p_ledger_balance, v_title, v_description,
        jsonb_build_object('ledger_balance', p_ledger_balance, 'on_chain_balance', p_on_chain_balance),
        'ACTIVE'
      );
    END IF;
  END IF;
  
  -- Check for on-chain balance lower than ledger
  IF p_is_on_chain_lower AND p_asset != 'NGN' THEN
    v_alert_type := 'ON_CHAIN_MISMATCH';
    v_severity := 'CRITICAL';
    v_title := format('%s On-Chain Balance Lower Than Ledger', p_asset);
    v_description := format('On-chain balance (%s) is lower than ledger inventory (%s). Difference: %s. This indicates potential loss or unrecorded withdrawals.', 
      COALESCE(p_on_chain_balance, 0), p_ledger_balance, p_ledger_balance - COALESCE(p_on_chain_balance, 0));
    
    SELECT id INTO v_existing_alert_id FROM public.treasury_risk_alerts
    WHERE alert_type = v_alert_type 
      AND asset = p_asset 
      AND status = 'ACTIVE'
    LIMIT 1;
    
    IF v_existing_alert_id IS NULL THEN
      INSERT INTO public.treasury_risk_alerts (
        alert_type, severity, asset, current_value, threshold_value, difference, title, description, details, status
      ) VALUES (
        v_alert_type, v_severity, p_asset, COALESCE(p_on_chain_balance, 0), p_ledger_balance,
        p_ledger_balance - COALESCE(p_on_chain_balance, 0), v_title, v_description,
        jsonb_build_object('ledger_balance', p_ledger_balance, 'on_chain_balance', p_on_chain_balance),
        'ACTIVE'
      );
    END IF;
  END IF;
  
  -- Check for low NGN float
  IF p_asset = 'NGN' AND p_is_low THEN
    v_alert_type := 'NGN_FLOAT_LOW';
    v_severity := 'HIGH';
    v_title := 'NGN Float Balance is Low';
    v_description := format('NGN float balance (%s) is below safe limit. This may affect ability to process instant sells.', p_ledger_balance);
    
    SELECT id INTO v_existing_alert_id FROM public.treasury_risk_alerts
    WHERE alert_type = v_alert_type 
      AND asset = p_asset 
      AND status = 'ACTIVE'
    LIMIT 1;
    
    IF v_existing_alert_id IS NULL THEN
      INSERT INTO public.treasury_risk_alerts (
        alert_type, severity, asset, current_value, threshold_value, title, description, details, status
      ) VALUES (
        v_alert_type, v_severity, p_asset, p_ledger_balance, 1000000, v_title, v_description,
        jsonb_build_object('ledger_balance', p_ledger_balance),
        'ACTIVE'
      );
    END IF;
  END IF;
  
  -- Check for low crypto balance
  IF p_is_low AND p_asset != 'NGN' THEN
    v_alert_type := 'LOW_BALANCE';
    v_severity := 'MEDIUM';
    v_title := format('%s Inventory is Low', p_asset);
    v_description := format('Ledger inventory for %s is low: %s. Consider replenishing inventory.', p_asset, p_ledger_balance);
    
    SELECT id INTO v_existing_alert_id FROM public.treasury_risk_alerts
    WHERE alert_type = v_alert_type 
      AND asset = p_asset 
      AND status = 'ACTIVE'
    LIMIT 1;
    
    IF v_existing_alert_id IS NULL THEN
      INSERT INTO public.treasury_risk_alerts (
        alert_type, severity, asset, current_value, title, description, details, status
      ) VALUES (
        v_alert_type, v_severity, p_asset, p_ledger_balance, v_title, v_description,
        jsonb_build_object('ledger_balance', p_ledger_balance, 'on_chain_balance', p_on_chain_balance),
        'ACTIVE'
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. CREATE TRIGGER TO UPDATE RECONCILIATION STATUS ON SYSTEM_WALLETS UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_reconciliation_on_wallet_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update reconciliation status for all assets when system_wallets changes
  PERFORM public.update_reconciliation_status('BTC');
  PERFORM public.update_reconciliation_status('ETH');
  PERFORM public.update_reconciliation_status('USDT');
  PERFORM public.update_reconciliation_status('USDC');
  PERFORM public.update_reconciliation_status('XRP');
  PERFORM public.update_reconciliation_status('SOL');
  PERFORM public.update_reconciliation_status('NGN');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_reconciliation_on_wallet_change ON public.system_wallets;
CREATE TRIGGER update_reconciliation_on_wallet_change
  AFTER UPDATE ON public.system_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_reconciliation_on_wallet_change();

-- ============================================================================
-- 8. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE public.on_chain_balances IS 'Tracks on-chain balances from blockchain vs ledger inventory for reconciliation';
COMMENT ON TABLE public.treasury_reconciliation_status IS 'Current reconciliation status per asset showing ledger vs on-chain comparison';
COMMENT ON TABLE public.treasury_risk_alerts IS 'Risk alerts for treasury issues like negative inventory, low balances, mismatches';
COMMENT ON FUNCTION public.update_on_chain_balance IS 'Updates on-chain balance record and calculates reconciliation status';
COMMENT ON FUNCTION public.update_reconciliation_status IS 'Updates reconciliation status for an asset and creates risk alerts if needed';
COMMENT ON FUNCTION public.check_and_create_risk_alerts IS 'Checks conditions and creates risk alerts for treasury issues';
