-- Fix audit log trigger UUID error
-- The trigger was trying to convert system_wallets.id (INTEGER = 1) to UUID, which fails
-- Fix: Set target_entity_id to NULL for system_wallet changes and store ID in metadata instead

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
  
  -- Detect changes and build changes JSONB
  IF OLD.btc_inventory IS DISTINCT FROM NEW.btc_inventory THEN
    v_changes := v_changes || jsonb_build_object('btc_inventory', jsonb_build_object(
      'old', OLD.btc_inventory,
      'new', NEW.btc_inventory,
      'delta', NEW.btc_inventory - OLD.btc_inventory
    ));
    v_asset := 'BTC';
    v_change_detected := true;
  END IF;
  
  IF OLD.eth_inventory IS DISTINCT FROM NEW.eth_inventory THEN
    v_changes := v_changes || jsonb_build_object('eth_inventory', jsonb_build_object(
      'old', OLD.eth_inventory,
      'new', NEW.eth_inventory,
      'delta', NEW.eth_inventory - OLD.eth_inventory
    ));
    IF v_asset IS NULL THEN v_asset := 'ETH'; END IF;
    v_change_detected := true;
  END IF;
  
  IF OLD.usdt_inventory IS DISTINCT FROM NEW.usdt_inventory THEN
    v_changes := v_changes || jsonb_build_object('usdt_inventory', jsonb_build_object(
      'old', OLD.usdt_inventory,
      'new', NEW.usdt_inventory,
      'delta', NEW.usdt_inventory - OLD.usdt_inventory
    ));
    IF v_asset IS NULL THEN v_asset := 'USDT'; END IF;
    v_change_detected := true;
  END IF;
  
  IF OLD.usdc_inventory IS DISTINCT FROM NEW.usdc_inventory THEN
    v_changes := v_changes || jsonb_build_object('usdc_inventory', jsonb_build_object(
      'old', OLD.usdc_inventory,
      'new', NEW.usdc_inventory,
      'delta', NEW.usdc_inventory - OLD.usdc_inventory
    ));
    IF v_asset IS NULL THEN v_asset := 'USDC'; END IF;
    v_change_detected := true;
  END IF;
  
  IF OLD.xrp_inventory IS DISTINCT FROM NEW.xrp_inventory THEN
    v_changes := v_changes || jsonb_build_object('xrp_inventory', jsonb_build_object(
      'old', OLD.xrp_inventory,
      'new', NEW.xrp_inventory,
      'delta', NEW.xrp_inventory - OLD.xrp_inventory
    ));
    IF v_asset IS NULL THEN v_asset := 'XRP'; END IF;
    v_change_detected := true;
  END IF;
  
  IF OLD.sol_inventory IS DISTINCT FROM NEW.sol_inventory THEN
    v_changes := v_changes || jsonb_build_object('sol_inventory', jsonb_build_object(
      'old', OLD.sol_inventory,
      'new', NEW.sol_inventory,
      'delta', NEW.sol_inventory - OLD.sol_inventory
    ));
    IF v_asset IS NULL THEN v_asset := 'SOL'; END IF;
    v_change_detected := true;
  END IF;
  
  IF OLD.ngn_float_balance IS DISTINCT FROM NEW.ngn_float_balance THEN
    v_changes := v_changes || jsonb_build_object('ngn_float_balance', jsonb_build_object(
      'old', OLD.ngn_float_balance,
      'new', NEW.ngn_float_balance,
      'delta', NEW.ngn_float_balance - OLD.ngn_float_balance
    ));
    IF v_asset IS NULL THEN v_asset := 'NGN'; END IF;
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
      NULL, -- FIX: system_wallets.id is INTEGER, not UUID, so set to NULL
      format('Automatic inventory change detected: %s', v_asset),
      v_old_value,
      v_new_value,
      v_changes,
      jsonb_build_object(
        'source', 'trigger',
        'table', 'system_wallets',
        'system_wallet_id', NEW.id, -- Store INTEGER ID in metadata instead
        'primary_asset_changed', v_asset
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_inventory_change IS 'Fixed: Sets target_entity_id to NULL for system_wallet changes since system_wallets.id is INTEGER, not UUID. Stores the ID in metadata instead.';
