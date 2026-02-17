-- Add Inventory Audit Safeguards
-- This migration ensures all inventory changes are logged and prevents unlogged updates

-- ============================================================================
-- 1. ENSURE audit_logs TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Action details
  action_type TEXT NOT NULL CHECK (action_type IN (
    'TREASURY_ADJUSTMENT', 'SETTLEMENT_PROCESSED', 'LIMIT_CREATED', 'LIMIT_UPDATED', 'LIMIT_DELETED',
    'RECONCILIATION_RUN', 'USER_BALANCE_ADJUSTED', 'TRANSACTION_MANUAL_CREDIT', 'TRANSACTION_MANUAL_DEBIT',
    'SYSTEM_WALLET_UPDATED', 'PRICE_UPDATED', 'SETTINGS_CHANGED', 'USER_STATUS_CHANGED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'DEPOSIT_MANUAL_CREDIT', 'OTHER',
    'INVENTORY_AUTO_LOG' -- For automatic logging from triggers
  )),
  
  -- User and target
  performed_by UUID REFERENCES auth.users(id), -- NULL for system/trigger actions
  target_user_id UUID REFERENCES auth.users(id),
  target_entity_type TEXT,
  target_entity_id UUID,
  
  -- Action details
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changes JSONB DEFAULT '{}',
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_entity ON public.audit_logs(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_inventory_changes ON public.audit_logs(action_type, created_at DESC) 
  WHERE action_type IN ('TREASURY_ADJUSTMENT', 'SYSTEM_WALLET_UPDATED', 'INVENTORY_AUTO_LOG');

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_logs;

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    public.is_user_admin(auth.uid()) 
    OR performed_by = auth.uid()
  );

-- Service role can insert (for triggers and functions)
CREATE POLICY "Service role can create audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS

-- ============================================================================
-- 2. CREATE FUNCTION TO LOG INVENTORY CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_inventory_change()
RETURNS TRIGGER AS $$
DECLARE
  v_changes JSONB := '{}';
  v_old_value JSONB;
  v_new_value JSONB;
  v_asset TEXT;
  v_change_detected BOOLEAN := false;
BEGIN
  -- Build old and new values JSONB
  v_old_value := jsonb_build_object(
    'btc_inventory', OLD.btc_inventory,
    'eth_inventory', OLD.eth_inventory,
    'usdt_inventory', OLD.usdt_inventory,
    'usdc_inventory', OLD.usdc_inventory,
    'xrp_inventory', OLD.xrp_inventory,
    'sol_inventory', OLD.sol_inventory,
    'ngn_float_balance', OLD.ngn_float_balance
  );
  
  v_new_value := jsonb_build_object(
    'btc_inventory', NEW.btc_inventory,
    'eth_inventory', NEW.eth_inventory,
    'usdt_inventory', NEW.usdt_inventory,
    'usdc_inventory', NEW.usdc_inventory,
    'xrp_inventory', NEW.xrp_inventory,
    'sol_inventory', NEW.sol_inventory,
    'ngn_float_balance', NEW.ngn_float_balance
  );
  
  -- Check each inventory field for changes
  IF OLD.btc_inventory IS DISTINCT FROM NEW.btc_inventory THEN
    v_changes := v_changes || jsonb_build_object('btc_inventory', jsonb_build_object(
      'old', OLD.btc_inventory,
      'new', NEW.btc_inventory,
      'delta', NEW.btc_inventory - OLD.btc_inventory
    ));
    v_change_detected := true;
    v_asset := 'BTC';
  END IF;
  
  IF OLD.eth_inventory IS DISTINCT FROM NEW.eth_inventory THEN
    v_changes := v_changes || jsonb_build_object('eth_inventory', jsonb_build_object(
      'old', OLD.eth_inventory,
      'new', NEW.eth_inventory,
      'delta', NEW.eth_inventory - OLD.eth_inventory
    ));
    v_change_detected := true;
    v_asset := COALESCE(v_asset, 'ETH');
  END IF;
  
  IF OLD.usdt_inventory IS DISTINCT FROM NEW.usdt_inventory THEN
    v_changes := v_changes || jsonb_build_object('usdt_inventory', jsonb_build_object(
      'old', OLD.usdt_inventory,
      'new', NEW.usdt_inventory,
      'delta', NEW.usdt_inventory - OLD.usdt_inventory
    ));
    v_change_detected := true;
    v_asset := COALESCE(v_asset, 'USDT');
  END IF;
  
  IF OLD.usdc_inventory IS DISTINCT FROM NEW.usdc_inventory THEN
    v_changes := v_changes || jsonb_build_object('usdc_inventory', jsonb_build_object(
      'old', OLD.usdc_inventory,
      'new', NEW.usdc_inventory,
      'delta', NEW.usdc_inventory - OLD.usdc_inventory
    ));
    v_change_detected := true;
    v_asset := COALESCE(v_asset, 'USDC');
  END IF;
  
  IF OLD.xrp_inventory IS DISTINCT FROM NEW.xrp_inventory THEN
    v_changes := v_changes || jsonb_build_object('xrp_inventory', jsonb_build_object(
      'old', OLD.xrp_inventory,
      'new', NEW.xrp_inventory,
      'delta', NEW.xrp_inventory - OLD.xrp_inventory
    ));
    v_change_detected := true;
    v_asset := COALESCE(v_asset, 'XRP');
  END IF;
  
  IF OLD.sol_inventory IS DISTINCT FROM NEW.sol_inventory THEN
    v_changes := v_changes || jsonb_build_object('sol_inventory', jsonb_build_object(
      'old', OLD.sol_inventory,
      'new', NEW.sol_inventory,
      'delta', NEW.sol_inventory - OLD.sol_inventory
    ));
    v_change_detected := true;
    v_asset := COALESCE(v_asset, 'SOL');
  END IF;
  
  IF OLD.ngn_float_balance IS DISTINCT FROM NEW.ngn_float_balance THEN
    v_changes := v_changes || jsonb_build_object('ngn_float_balance', jsonb_build_object(
      'old', OLD.ngn_float_balance,
      'new', NEW.ngn_float_balance,
      'delta', NEW.ngn_float_balance - OLD.ngn_float_balance
    ));
    v_change_detected := true;
  END IF;
  
  -- Only log if there are actual changes
  IF v_change_detected THEN
    INSERT INTO public.audit_logs (
      action_type,
      performed_by,
      target_entity_type,
      target_entity_id,
      description,
      old_value,
      new_value,
      changes,
      metadata
    ) VALUES (
      'INVENTORY_AUTO_LOG',
      NULL, -- System/trigger action
      'SYSTEM_WALLET',
      NEW.id::TEXT::UUID, -- Convert INTEGER id to UUID
      format('Automatic inventory change detected: %s', v_asset),
      v_old_value,
      v_new_value,
      v_changes,
      jsonb_build_object(
        'source', 'trigger',
        'table', 'system_wallets',
        'primary_asset_changed', v_asset
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. CREATE TRIGGER TO AUTO-LOG INVENTORY CHANGES
-- ============================================================================

DROP TRIGGER IF EXISTS log_system_wallets_inventory_changes ON public.system_wallets;

CREATE TRIGGER log_system_wallets_inventory_changes
  AFTER UPDATE ON public.system_wallets
  FOR EACH ROW
  WHEN (
    OLD.btc_inventory IS DISTINCT FROM NEW.btc_inventory OR
    OLD.eth_inventory IS DISTINCT FROM NEW.eth_inventory OR
    OLD.usdt_inventory IS DISTINCT FROM NEW.usdt_inventory OR
    OLD.usdc_inventory IS DISTINCT FROM NEW.usdc_inventory OR
    OLD.xrp_inventory IS DISTINCT FROM NEW.xrp_inventory OR
    OLD.sol_inventory IS DISTINCT FROM NEW.sol_inventory OR
    OLD.ngn_float_balance IS DISTINCT FROM NEW.ngn_float_balance
  )
  EXECUTE FUNCTION public.log_inventory_change();

-- ============================================================================
-- 4. CREATE SAFE INVENTORY UPDATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.safe_update_inventory(
  p_asset TEXT,
  p_amount DECIMAL,
  p_operation TEXT, -- 'add' or 'remove'
  p_reason TEXT DEFAULT 'Manual adjustment',
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_inventory DECIMAL;
  v_new_inventory DECIMAL;
  v_inventory_field TEXT;
  v_system_wallet RECORD;
  v_audit_log_id UUID;
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN') THEN
    RAISE EXCEPTION 'Invalid asset: %', p_asset;
  END IF;
  
  -- Validate operation
  IF p_operation NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Invalid operation: %. Must be "add" or "remove"', p_operation;
  END IF;
  
  -- Get current system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'System wallet not found';
  END IF;
  
  -- Determine inventory field
  IF p_asset = 'NGN' THEN
    v_inventory_field := 'ngn_float_balance';
    v_current_inventory := v_system_wallet.ngn_float_balance;
  ELSE
    v_inventory_field := LOWER(p_asset) || '_inventory';
    v_current_inventory := v_system_wallet[v_inventory_field];
  END IF;
  
  -- Calculate new inventory
  IF p_operation = 'add' THEN
    v_new_inventory := v_current_inventory + p_amount;
  ELSE
    v_new_inventory := v_current_inventory - p_amount;
    
    -- Prevent negative inventory
    IF v_new_inventory < 0 THEN
      RAISE EXCEPTION 'Insufficient inventory. Current: %, Requested: %, Would result in: %', 
        v_current_inventory, p_amount, v_new_inventory;
    END IF;
  END IF;
  
  -- Update system wallet
  IF p_asset = 'NGN' THEN
    UPDATE public.system_wallets
    SET ngn_float_balance = v_new_inventory, updated_at = NOW()
    WHERE id = 1;
  ELSE
    EXECUTE format('UPDATE public.system_wallets SET %I = $1, updated_at = NOW() WHERE id = 1', v_inventory_field)
    USING v_new_inventory;
  END IF;
  
  -- Log the adjustment (trigger will also log, but this provides context)
  INSERT INTO public.audit_logs (
    action_type,
    performed_by,
    target_entity_type,
    description,
    old_value,
    new_value,
    changes,
    metadata
  ) VALUES (
    'TREASURY_ADJUSTMENT',
    p_performed_by,
    'SYSTEM_WALLET',
    format('%s %s %s %s - %s', 
      CASE WHEN p_operation = 'add' THEN 'Added' ELSE 'Removed' END,
      p_amount,
      p_asset,
      CASE WHEN p_operation = 'add' THEN 'to' ELSE 'from' END,
      p_reason
    ),
    jsonb_build_object(v_inventory_field, v_current_inventory),
    jsonb_build_object(v_inventory_field, v_new_inventory),
    jsonb_build_object(v_inventory_field, jsonb_build_object(
      'old', v_current_inventory,
      'new', v_new_inventory,
      'delta', CASE WHEN p_operation = 'add' THEN p_amount ELSE -p_amount END
    )),
    jsonb_build_object(
      'asset', p_asset,
      'amount', p_amount,
      'operation', p_operation,
      'reason', p_reason,
      'source', 'safe_update_inventory_function'
    )
  ) RETURNING id INTO v_audit_log_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'asset', p_asset,
    'old_inventory', v_current_inventory,
    'new_inventory', v_new_inventory,
    'amount', p_amount,
    'operation', p_operation,
    'audit_log_id', v_audit_log_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.safe_update_inventory(TEXT, DECIMAL, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- 5. CREATE INVENTORY RECONCILIATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_inventory(
  p_asset TEXT DEFAULT NULL -- NULL = check all assets
)
RETURNS TABLE (
  asset TEXT,
  expected_inventory DECIMAL,
  actual_inventory DECIMAL,
  discrepancy DECIMAL,
  status TEXT
) AS $$
DECLARE
  v_assets TEXT[] := ARRAY['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
  v_asset TEXT;
  v_expected DECIMAL;
  v_actual DECIMAL;
  v_total_sold DECIMAL;
  v_total_bought DECIMAL;
BEGIN
  -- If specific asset provided, check only that
  IF p_asset IS NOT NULL THEN
    v_assets := ARRAY[p_asset];
  END IF;
  
  FOREACH v_asset IN ARRAY v_assets
  LOOP
    -- Calculate expected inventory from transactions
    SELECT 
      COALESCE(SUM(CASE WHEN transaction_type = 'SELL' THEN crypto_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type = 'BUY' THEN crypto_amount ELSE 0 END), 0)
    INTO v_expected
    FROM public.transactions
    WHERE crypto_currency = v_asset
      AND status = 'COMPLETED'
      AND transaction_type IN ('BUY', 'SELL');
    
    -- Get actual inventory
    SELECT 
      CASE v_asset
        WHEN 'BTC' THEN btc_inventory
        WHEN 'ETH' THEN eth_inventory
        WHEN 'USDT' THEN usdt_inventory
        WHEN 'USDC' THEN usdc_inventory
        WHEN 'XRP' THEN xrp_inventory
        WHEN 'SOL' THEN sol_inventory
      END
    INTO v_actual
    FROM public.system_wallets
    WHERE id = 1;
    
    -- Return result
    asset := v_asset;
    expected_inventory := v_expected;
    actual_inventory := COALESCE(v_actual, 0);
    discrepancy := COALESCE(v_actual, 0) - v_expected;
    status := CASE 
      WHEN ABS(COALESCE(v_actual, 0) - v_expected) < 0.00000001 THEN 'OK'
      ELSE 'DISCREPANCY'
    END;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.reconcile_inventory(TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION public.log_inventory_change() IS 'Trigger function to automatically log all system_wallets inventory changes';
COMMENT ON FUNCTION public.safe_update_inventory(TEXT, DECIMAL, TEXT, TEXT, UUID) IS 'Safe function to update inventory with mandatory audit logging and validation';
COMMENT ON FUNCTION public.reconcile_inventory(TEXT) IS 'Reconcile expected vs actual inventory based on transactions';
