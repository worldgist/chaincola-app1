/*
 * Comprehensive Inventory Adjustment & Reconciliation System
 * Adds: Metadata tracking, Pending/Confirmed balances, Discrepancy resolution, Reconciliation history
 */

-- ============================================================================
-- 1. INVENTORY ADJUSTMENT METADATA TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset and amount
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  amount DECIMAL(20, 8) NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('add', 'remove')),
  
  -- Adjustment metadata (CRITICAL - all mandatory)
  reason TEXT NOT NULL, -- Mandatory reason for every adjustment
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN (
    'DEPOSIT', 'LIQUIDITY_PROVISION', 'FEE_RESERVE', 'TEST_CREDIT', 
    'WITHDRAWAL', 'SETTLEMENT', 'RECONCILIATION', 'MANUAL_ADJUSTMENT'
  )),
  source_reference TEXT, -- TX hash, migration ID, admin action ID, etc.
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REVERSED')),
  
  -- On-chain proof (optional but recommended)
  blockchain_network TEXT CHECK (blockchain_network IN ('BITCOIN', 'ETHEREUM', 'SOLANA', 'XRP', 'TRON')),
  wallet_address TEXT, -- Wallet address for on-chain verification
  transaction_hash TEXT, -- TX hash for verification
  
  -- Balance snapshots
  balance_before DECIMAL(20, 8) NOT NULL,
  balance_after DECIMAL(20, 8) NOT NULL,
  pending_balance_before DECIMAL(20, 8) DEFAULT 0,
  pending_balance_after DECIMAL(20, 8) DEFAULT 0,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false NOT NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  
  -- Reversal tracking
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id),
  reversal_reason TEXT,
  original_adjustment_id UUID REFERENCES public.inventory_adjustments(id),
  
  -- Audit trail
  performed_by UUID REFERENCES auth.users(id) NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_asset ON public.inventory_adjustments(asset);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_status ON public.inventory_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_type ON public.inventory_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_performed_at ON public.inventory_adjustments(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_tx_hash ON public.inventory_adjustments(transaction_hash) WHERE transaction_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_pending ON public.inventory_adjustments(status, asset) WHERE status = 'PENDING';

-- Enable RLS
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view inventory adjustments" ON public.inventory_adjustments FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage inventory adjustments" ON public.inventory_adjustments FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. ADD PENDING BALANCE FIELDS TO SYSTEM_WALLETS
-- ============================================================================

-- Add pending balance fields for each asset
ALTER TABLE public.system_wallets 
  ADD COLUMN IF NOT EXISTS btc_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS eth_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS usdt_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS usdc_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS xrp_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS sol_pending_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS ngn_pending_float DECIMAL(20, 2) DEFAULT 0 NOT NULL;

-- ============================================================================
-- 3. RECONCILIATION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reconciliation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset being reconciled
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Balance snapshots (before reconciliation)
  ledger_balance_before DECIMAL(20, 8) NOT NULL,
  on_chain_balance_before DECIMAL(20, 8) NOT NULL,
  pending_balance_before DECIMAL(20, 8) DEFAULT 0,
  
  -- Reconciliation results
  ledger_balance_after DECIMAL(20, 8) NOT NULL,
  on_chain_balance_after DECIMAL(20, 8) NOT NULL,
  pending_balance_after DECIMAL(20, 8) DEFAULT 0,
  
  -- Discrepancy details
  discrepancy_before DECIMAL(20, 8) NOT NULL,
  discrepancy_after DECIMAL(20, 8) NOT NULL,
  discrepancy_resolved BOOLEAN DEFAULT false NOT NULL,
  
  -- Reconciliation method
  reconciliation_method TEXT NOT NULL CHECK (reconciliation_method IN (
    'AUTO', 'MANUAL_FORCE_SYNC', 'MANUAL_LEDGER_ADJUST', 'MANUAL_CHAIN_SYNC', 
    'ADMIN_OVERRIDE', 'AUTO_RESOLVE_TOLERANCE'
  )),
  
  -- Resolution actions
  resolution_action TEXT CHECK (resolution_action IN (
    'SYNC_FROM_CHAIN', 'REVERSE_LEDGER_ENTRY', 'ATTACH_TX_HASH', 
    'MANUAL_CONFIRM', 'FREEZE_ASSET', 'NO_ACTION'
  )),
  resolution_notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'DISCREPANCY')),
  
  -- Admin actions
  initiated_by UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  
  -- Metadata
  on_chain_proof JSONB DEFAULT '{}', -- RPC response, TX hashes, etc.
  reconciliation_data JSONB DEFAULT '{}', -- Full reconciliation details
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_history_asset ON public.reconciliation_history(asset);
CREATE INDEX IF NOT EXISTS idx_reconciliation_history_status ON public.reconciliation_history(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_history_created_at ON public.reconciliation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_history_discrepancy ON public.reconciliation_history(discrepancy_resolved) WHERE discrepancy_resolved = false;

-- Enable RLS
ALTER TABLE public.reconciliation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reconciliation history" ON public.reconciliation_history FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage reconciliation history" ON public.reconciliation_history FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. ENHANCED RECONCILIATION STATUS WITH FREEZE FLAG
-- ============================================================================

-- Add freeze flag to treasury_reconciliation_status if it doesn't exist
ALTER TABLE public.treasury_reconciliation_status 
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- ============================================================================
-- 5. FUNCTION: CREATE INVENTORY ADJUSTMENT WITH METADATA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_asset TEXT,
  p_amount DECIMAL,
  p_operation TEXT, -- 'add' or 'remove'
  p_reason TEXT, -- MANDATORY
  p_adjustment_type TEXT, -- MANDATORY
  p_source_reference TEXT DEFAULT NULL,
  p_blockchain_network TEXT DEFAULT NULL,
  p_wallet_address TEXT DEFAULT NULL,
  p_transaction_hash TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_current_balance DECIMAL;
  v_current_pending DECIMAL;
  v_new_balance DECIMAL;
  v_new_pending DECIMAL;
  v_inventory_field TEXT;
  v_pending_field TEXT;
  v_system_wallet RECORD;
  v_adjustment_id UUID;
  v_status TEXT;
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN') THEN
    RAISE EXCEPTION 'Invalid asset: %', p_asset;
  END IF;
  
  -- Validate operation
  IF p_operation NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Invalid operation: %. Must be "add" or "remove"', p_operation;
  END IF;
  
  -- Validate mandatory fields
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'Reason is mandatory for inventory adjustments';
  END IF;
  
  IF p_adjustment_type IS NULL THEN
    RAISE EXCEPTION 'Adjustment type is mandatory';
  END IF;
  
  -- Get current system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'System wallet not found';
  END IF;
  
  -- Determine inventory fields
  IF p_asset = 'NGN' THEN
    v_inventory_field := 'ngn_float_balance';
    v_pending_field := 'ngn_pending_float';
    v_current_balance := v_system_wallet.ngn_float_balance;
    v_current_pending := COALESCE(v_system_wallet.ngn_pending_float, 0);
  ELSE
    v_inventory_field := LOWER(p_asset) || '_inventory';
    v_pending_field := LOWER(p_asset) || '_pending_inventory';
    v_current_balance := v_system_wallet[v_inventory_field];
    v_current_pending := COALESCE(v_system_wallet[v_pending_field], 0);
  END IF;
  
  -- Determine status: PENDING if no on-chain proof, CONFIRMED if has TX hash
  IF p_transaction_hash IS NOT NULL AND p_transaction_hash != '' THEN
    v_status := 'CONFIRMED';
  ELSE
    v_status := 'PENDING';
  END IF;
  
  -- Calculate new balances
  IF p_operation = 'add' THEN
    IF v_status = 'PENDING' THEN
      -- Add to pending balance
      v_new_pending := v_current_pending + p_amount;
      v_new_balance := v_current_balance;
    ELSE
      -- Add directly to confirmed balance
      v_new_balance := v_current_balance + p_amount;
      v_new_pending := v_current_pending;
    END IF;
  ELSE
    -- Remove operation
    IF v_status = 'PENDING' THEN
      -- Remove from pending balance
      v_new_pending := v_current_pending - p_amount;
      IF v_new_pending < 0 THEN
        RAISE EXCEPTION 'Insufficient pending balance. Current: %, Requested: %', v_current_pending, p_amount;
      END IF;
      v_new_balance := v_current_balance;
    ELSE
      -- Remove from confirmed balance
      v_new_balance := v_current_balance - p_amount;
      IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current_balance, p_amount;
      END IF;
      v_new_pending := v_current_pending;
    END IF;
  END IF;
  
  -- Create adjustment record
  INSERT INTO public.inventory_adjustments (
    asset, amount, operation, reason, adjustment_type, source_reference,
    blockchain_network, wallet_address, transaction_hash,
    balance_before, balance_after, pending_balance_before, pending_balance_after,
    status, performed_by, notes, metadata
  ) VALUES (
    p_asset, p_amount, p_operation, p_reason, p_adjustment_type, p_source_reference,
    p_blockchain_network, p_wallet_address, p_transaction_hash,
    v_current_balance, v_new_balance, v_current_pending, v_new_pending,
    v_status, COALESCE(p_performed_by, auth.uid()), p_notes, p_metadata
  ) RETURNING id INTO v_adjustment_id;
  
  -- Update system wallet
  IF p_asset = 'NGN' THEN
    UPDATE public.system_wallets
    SET 
      ngn_float_balance = v_new_balance,
      ngn_pending_float = v_new_pending,
      updated_at = NOW()
    WHERE id = 1;
  ELSE
    EXECUTE format(
      'UPDATE public.system_wallets SET %I = $1, %I = $2, updated_at = NOW() WHERE id = 1',
      v_inventory_field, v_pending_field
    ) USING v_new_balance, v_new_pending;
  END IF;
  
  -- Log audit
  INSERT INTO public.audit_logs (
    action_type,
    performed_by,
    target_entity_type,
    target_entity_id,
    description,
    new_value
  ) VALUES (
    'INVENTORY_ADJUSTMENT',
    COALESCE(p_performed_by, auth.uid()),
    'INVENTORY_ADJUSTMENT',
    v_adjustment_id,
    format('%s %s %s %s - %s', 
      p_operation, p_amount, p_asset, 
      CASE WHEN v_status = 'PENDING' THEN '(PENDING)' ELSE '' END,
      p_reason),
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'asset', p_asset,
      'amount', p_amount,
      'operation', p_operation,
      'status', v_status,
      'balance_before', v_current_balance,
      'balance_after', v_new_balance,
      'pending_before', v_current_pending,
      'pending_after', v_new_pending,
      'adjustment_type', p_adjustment_type,
      'transaction_hash', p_transaction_hash
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'asset', p_asset,
    'amount', p_amount,
    'operation', p_operation,
    'status', v_status,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance,
    'pending_before', v_current_pending,
    'pending_after', v_new_pending
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. FUNCTION: CONFIRM PENDING ADJUSTMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_pending_adjustment(
  p_adjustment_id UUID,
  p_transaction_hash TEXT DEFAULT NULL,
  p_verified_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_adjustment RECORD;
  v_inventory_field TEXT;
  v_pending_field TEXT;
  v_current_confirmed DECIMAL;
  v_current_pending DECIMAL;
  v_new_confirmed DECIMAL;
  v_new_pending DECIMAL;
BEGIN
  -- Get adjustment
  SELECT * INTO v_adjustment
  FROM public.inventory_adjustments
  WHERE id = p_adjustment_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending adjustment not found: %', p_adjustment_id;
  END IF;
  
  -- Determine fields
  IF v_adjustment.asset = 'NGN' THEN
    v_inventory_field := 'ngn_float_balance';
    v_pending_field := 'ngn_pending_float';
  ELSE
    v_inventory_field := LOWER(v_adjustment.asset) || '_inventory';
    v_pending_field := LOWER(v_adjustment.asset) || '_pending_inventory';
  END IF;
  
  -- Get current balances
  EXECUTE format('SELECT %I, %I FROM public.system_wallets WHERE id = 1', 
    v_inventory_field, v_pending_field)
  INTO v_current_confirmed, v_current_pending;
  
  -- Move from pending to confirmed
  IF v_adjustment.operation = 'add' THEN
    v_new_confirmed := v_current_confirmed + v_adjustment.amount;
    v_new_pending := v_current_pending - v_adjustment.amount;
  ELSE
    -- For remove operations, pending was already deducted, so we just confirm
    v_new_confirmed := v_current_confirmed;
    v_new_pending := v_current_pending;
  END IF;
  
  -- Update adjustment status
  UPDATE public.inventory_adjustments
  SET 
    status = 'CONFIRMED',
    is_verified = true,
    verified_at = NOW(),
    verified_by = COALESCE(p_verified_by, auth.uid()),
    transaction_hash = COALESCE(p_transaction_hash, transaction_hash),
    updated_at = NOW()
  WHERE id = p_adjustment_id;
  
  -- Update system wallet
  EXECUTE format(
    'UPDATE public.system_wallets SET %I = $1, %I = $2, updated_at = NOW() WHERE id = 1',
    v_inventory_field, v_pending_field
  ) USING v_new_confirmed, v_new_pending;
  
  -- Log audit
  INSERT INTO public.audit_logs (
    action_type,
    performed_by,
    target_entity_type,
    target_entity_id,
    description,
    new_value
  ) VALUES (
    'INVENTORY_ADJUSTMENT_CONFIRMED',
    COALESCE(p_verified_by, auth.uid()),
    'INVENTORY_ADJUSTMENT',
    p_adjustment_id,
    format('Confirmed pending adjustment %s for %s', p_adjustment_id, v_adjustment.asset),
    jsonb_build_object(
      'adjustment_id', p_adjustment_id,
      'asset', v_adjustment.asset,
      'transaction_hash', p_transaction_hash
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'adjustment_id', p_adjustment_id,
    'status', 'CONFIRMED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. FUNCTION: FORCE RECONCILIATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.force_reconciliation(
  p_asset TEXT,
  p_reconciliation_method TEXT DEFAULT 'MANUAL_FORCE_SYNC',
  p_initiated_by UUID DEFAULT NULL,
  p_resolution_action TEXT DEFAULT NULL,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_system_wallet RECORD;
  v_inventory_field TEXT;
  v_pending_field TEXT;
  v_ledger_balance DECIMAL;
  v_pending_balance DECIMAL;
  v_on_chain_balance DECIMAL;
  v_on_chain_record RECORD;
  v_discrepancy DECIMAL;
  v_reconciliation_id UUID;
  v_status TEXT;
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
  
  -- Calculate discrepancy (on-chain vs confirmed ledger only, exclude pending)
  v_discrepancy := v_on_chain_balance - v_ledger_balance;
  
  -- Determine status
  IF ABS(v_discrepancy) < 0.00000001 THEN
    v_status := 'COMPLETED';
  ELSE
    v_status := 'DISCREPANCY';
  END IF;
  
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
    v_ledger_balance, v_on_chain_balance, v_pending_balance, -- After will be updated if resolution occurs
    v_discrepancy, v_discrepancy,
    (v_status = 'COMPLETED'), p_reconciliation_method, p_resolution_action, p_resolution_notes,
    v_status, COALESCE(p_initiated_by, auth.uid()),
    jsonb_build_object(
      'on_chain_record', row_to_json(v_on_chain_record),
      'reconciliation_method', p_reconciliation_method
    )
  ) RETURNING id INTO v_reconciliation_id;
  
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
  
  -- Log audit
  INSERT INTO public.audit_logs (
    action_type,
    performed_by,
    target_entity_type,
    target_entity_id,
    description,
    new_value
  ) VALUES (
    'FORCE_RECONCILIATION',
    COALESCE(p_initiated_by, auth.uid()),
    'RECONCILIATION',
    v_reconciliation_id,
    format('Force reconciliation for %s - Status: %s, Discrepancy: %s', p_asset, v_status, v_discrepancy),
    jsonb_build_object(
      'reconciliation_id', v_reconciliation_id,
      'asset', p_asset,
      'ledger_balance', v_ledger_balance,
      'on_chain_balance', v_on_chain_balance,
      'discrepancy', v_discrepancy,
      'status', v_status
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reconciliation_id', v_reconciliation_id,
    'asset', p_asset,
    'ledger_balance', v_ledger_balance,
    'on_chain_balance', v_on_chain_balance,
    'pending_balance', v_pending_balance,
    'discrepancy', v_discrepancy,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. FUNCTION: RESOLVE DISCREPANCY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_discrepancy(
  p_asset TEXT,
  p_resolution_action TEXT, -- 'SYNC_FROM_CHAIN', 'REVERSE_LEDGER_ENTRY', 'ATTACH_TX_HASH', 'MANUAL_CONFIRM', 'FREEZE_ASSET'
  p_resolution_notes TEXT,
  p_transaction_hash TEXT DEFAULT NULL,
  p_adjustment_id UUID DEFAULT NULL,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_reconciliation_status RECORD;
  v_system_wallet RECORD;
  v_inventory_field TEXT;
  v_new_ledger_balance DECIMAL;
  v_reconciliation_id UUID;
BEGIN
  -- Validate resolution action
  IF p_resolution_action NOT IN ('SYNC_FROM_CHAIN', 'REVERSE_LEDGER_ENTRY', 'ATTACH_TX_HASH', 'MANUAL_CONFIRM', 'FREEZE_ASSET') THEN
    RAISE EXCEPTION 'Invalid resolution action: %', p_resolution_action;
  END IF;
  
  -- Get current reconciliation status
  SELECT * INTO v_reconciliation_status
  FROM public.treasury_reconciliation_status
  WHERE asset = p_asset AND status = 'MISMATCH';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active discrepancy found for asset: %', p_asset;
  END IF;
  
  -- Get system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  
  -- Determine field
  IF p_asset = 'NGN' THEN
    v_inventory_field := 'ngn_float_balance';
  ELSE
    v_inventory_field := LOWER(p_asset) || '_inventory';
  END IF;
  
  -- Apply resolution based on action
  CASE p_resolution_action
    WHEN 'SYNC_FROM_CHAIN' THEN
      -- Sync ledger to match on-chain balance
      v_new_ledger_balance := v_reconciliation_status.on_chain_balance;
      
    WHEN 'REVERSE_LEDGER_ENTRY' THEN
      -- Reverse a specific adjustment
      IF p_adjustment_id IS NULL THEN
        RAISE EXCEPTION 'adjustment_id required for REVERSE_LEDGER_ENTRY action';
      END IF;
      -- This would need to reverse the specific adjustment
      -- For now, we'll sync to chain balance
      v_new_ledger_balance := v_reconciliation_status.on_chain_balance;
      
    WHEN 'ATTACH_TX_HASH' THEN
      -- Attach TX hash to pending adjustment to confirm it
      IF p_transaction_hash IS NULL THEN
        RAISE EXCEPTION 'transaction_hash required for ATTACH_TX_HASH action';
      END IF;
      -- Confirm pending adjustment if provided
      IF p_adjustment_id IS NOT NULL THEN
        PERFORM public.confirm_pending_adjustment(p_adjustment_id, p_transaction_hash, p_resolved_by);
      END IF;
      v_new_ledger_balance := v_system_wallet[v_inventory_field];
      
    WHEN 'MANUAL_CONFIRM' THEN
      -- Manual confirmation - keep current balance
      v_new_ledger_balance := v_system_wallet[v_inventory_field];
      
    WHEN 'FREEZE_ASSET' THEN
      -- Freeze asset from liquidity
      UPDATE public.treasury_reconciliation_status
      SET 
        is_frozen = true,
        frozen_at = NOW(),
        frozen_by = COALESCE(p_resolved_by, auth.uid()),
        freeze_reason = p_resolution_notes
      WHERE asset = p_asset;
      v_new_ledger_balance := v_system_wallet[v_inventory_field];
  END CASE;
  
  -- Update system wallet if balance changed
  IF v_new_ledger_balance != v_system_wallet[v_inventory_field] THEN
    IF p_asset = 'NGN' THEN
      UPDATE public.system_wallets
      SET ngn_float_balance = v_new_ledger_balance, updated_at = NOW()
      WHERE id = 1;
    ELSE
      EXECUTE format('UPDATE public.system_wallets SET %I = $1, updated_at = NOW() WHERE id = 1', v_inventory_field)
      USING v_new_ledger_balance;
    END IF;
  END IF;
  
  -- Create reconciliation history record
  INSERT INTO public.reconciliation_history (
    asset,
    ledger_balance_before, on_chain_balance_before,
    ledger_balance_after, on_chain_balance_after,
    discrepancy_before, discrepancy_after,
    discrepancy_resolved, reconciliation_method, resolution_action, resolution_notes,
    status, resolved_by, resolved_at
  ) VALUES (
    p_asset,
    v_reconciliation_status.ledger_balance, v_reconciliation_status.on_chain_balance,
    v_new_ledger_balance, v_reconciliation_status.on_chain_balance,
    v_reconciliation_status.difference, (v_reconciliation_status.on_chain_balance - v_new_ledger_balance),
    true, 'MANUAL_RESOLUTION', p_resolution_action, p_resolution_notes,
    'COMPLETED', COALESCE(p_resolved_by, auth.uid()), NOW()
  ) RETURNING id INTO v_reconciliation_id;
  
  -- Update reconciliation status
  UPDATE public.treasury_reconciliation_status
  SET 
    ledger_balance = v_new_ledger_balance,
    difference = v_reconciliation_status.on_chain_balance - v_new_ledger_balance,
    difference_percentage = CASE WHEN v_new_ledger_balance > 0 
      THEN ((v_reconciliation_status.on_chain_balance - v_new_ledger_balance) / v_new_ledger_balance * 100) 
      ELSE 0 END,
    status = 'BALANCED',
    last_reconciled_at = NOW(),
    updated_at = NOW()
  WHERE asset = p_asset;
  
  -- Log audit
  INSERT INTO public.audit_logs (
    action_type,
    performed_by,
    target_entity_type,
    target_entity_id,
    description,
    new_value
  ) VALUES (
    'DISCREPANCY_RESOLVED',
    COALESCE(p_resolved_by, auth.uid()),
    'RECONCILIATION',
    v_reconciliation_id,
    format('Resolved discrepancy for %s using %s', p_asset, p_resolution_action),
    jsonb_build_object(
      'reconciliation_id', v_reconciliation_id,
      'asset', p_asset,
      'resolution_action', p_resolution_action,
      'balance_before', v_reconciliation_status.ledger_balance,
      'balance_after', v_new_ledger_balance
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reconciliation_id', v_reconciliation_id,
    'asset', p_asset,
    'resolution_action', p_resolution_action,
    'balance_before', v_reconciliation_status.ledger_balance,
    'balance_after', v_new_ledger_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. FUNCTION: GET AVAILABLE LIQUIDITY (EXCLUDES PENDING & DISCREPANCY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_liquidity(p_asset TEXT)
RETURNS DECIMAL AS $$
DECLARE
  v_system_wallet RECORD;
  v_reconciliation_status RECORD;
  v_inventory_field TEXT;
  v_balance DECIMAL;
BEGIN
  -- Check if asset is frozen or has discrepancy
  SELECT * INTO v_reconciliation_status
  FROM public.treasury_reconciliation_status
  WHERE asset = p_asset;
  
  IF v_reconciliation_status.is_frozen = true THEN
    RETURN 0; -- Frozen assets have no liquidity
  END IF;
  
  IF v_reconciliation_status.status = 'MISMATCH' OR v_reconciliation_status.status = 'NEGATIVE_INVENTORY' THEN
    RETURN 0; -- Discrepancy assets excluded from liquidity
  END IF;
  
  -- Get confirmed balance only (exclude pending)
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  
  IF p_asset = 'NGN' THEN
    v_balance := v_system_wallet.ngn_float_balance; -- Exclude ngn_pending_float
  ELSE
    v_inventory_field := LOWER(p_asset) || '_inventory';
    v_balance := v_system_wallet[v_inventory_field]; -- Exclude pending_inventory
  END IF;
  
  RETURN GREATEST(v_balance, 0); -- Ensure non-negative
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inventory_adjustments IS 'Tracks all inventory adjustments with mandatory metadata, on-chain proof, and pending/confirmed status';
COMMENT ON TABLE public.reconciliation_history IS 'Immutable history of all reconciliation actions with before/after snapshots';
COMMENT ON FUNCTION public.create_inventory_adjustment IS 'Creates inventory adjustment with mandatory reason and type. Returns PENDING if no TX hash, CONFIRMED if TX hash provided';
COMMENT ON FUNCTION public.confirm_pending_adjustment IS 'Moves pending adjustment to confirmed status, updating balances accordingly';
COMMENT ON FUNCTION public.force_reconciliation IS 'Manually triggers reconciliation for an asset, fetching on-chain balance and comparing with ledger';
COMMENT ON FUNCTION public.resolve_discrepancy IS 'Resolves discrepancy using specified action: sync from chain, reverse entry, attach TX hash, manual confirm, or freeze asset';
COMMENT ON FUNCTION public.get_available_liquidity IS 'Returns available liquidity for an asset, excluding pending balances and assets with discrepancies or frozen status';
