-- Fix existing Ethereum transactions with zero amounts and update balances
-- This function will:
-- 1. Find all ETH RECEIVE transactions with zero or missing amounts
-- 2. Extract correct amounts from metadata (transfer_value_wei, transfer_value_eth)
-- 3. Update transaction records with correct amounts
-- 4. Re-credit balances for transactions that should have been credited

CREATE OR REPLACE FUNCTION public.fix_ethereum_transactions_and_balances()
RETURNS TABLE (
  transaction_id UUID,
  old_amount DECIMAL(20, 8),
  new_amount DECIMAL(20, 8),
  balance_credited BOOLEAN,
  status TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  v_amount_wei TEXT;
  v_amount_eth DECIMAL(20, 8);
  v_whole_eth BIGINT;
  v_remainder_wei BIGINT;
  v_decimal_part DECIMAL(20, 8);
  v_wei_per_eth BIGINT := 1000000000000000000; -- 1e18
  v_current_balance DECIMAL(20, 8);
  v_new_balance DECIMAL(20, 8);
  v_credit_success BOOLEAN := false;
  v_result_status TEXT;
BEGIN
  -- Loop through all ETH RECEIVE transactions with zero or missing amounts
  FOR tx_record IN 
    SELECT 
      t.id,
      t.user_id,
      t.crypto_amount,
      t.transaction_hash,
      t.to_address,
      t.status,
      t.confirmations,
      t.metadata,
      COALESCE((t.metadata->>'transfer_value_wei')::TEXT, '0') as transfer_value_wei,
      COALESCE((t.metadata->>'transfer_value_eth')::TEXT, NULL) as transfer_value_eth
    FROM public.transactions t
    WHERE t.crypto_currency = 'ETH'
      AND t.transaction_type = 'RECEIVE'
      AND (
        t.crypto_amount IS NULL 
        OR t.crypto_amount = 0 
        OR (t.metadata->>'transfer_value_wei') IS NOT NULL
      )
    ORDER BY t.created_at ASC
  LOOP
    v_amount_eth := 0;
    v_result_status := 'SKIPPED';
    v_credit_success := false;
    
    -- Try to get amount from metadata first
    IF tx_record.transfer_value_eth IS NOT NULL AND tx_record.transfer_value_eth != '' THEN
      -- Use the ETH value directly from metadata
      BEGIN
        v_amount_eth := (tx_record.transfer_value_eth)::DECIMAL(20, 8);
        v_result_status := 'FIXED_FROM_METADATA_ETH';
      EXCEPTION WHEN OTHERS THEN
        v_result_status := 'ERROR_PARSING_METADATA_ETH';
      END;
    ELSIF tx_record.transfer_value_wei IS NOT NULL AND tx_record.transfer_value_wei != '' AND tx_record.transfer_value_wei != '0' THEN
      -- Parse from wei using BigInt arithmetic
      BEGIN
        -- Convert wei string to BigInt and calculate ETH
        v_amount_wei := tx_record.transfer_value_wei;
        
        -- Handle hex strings
        IF v_amount_wei LIKE '0x%' OR v_amount_wei LIKE '0X%' THEN
          v_whole_eth := (('x' || ltrim(v_amount_wei, '0xX'))::bit(256))::bigint / v_wei_per_eth;
          v_remainder_wei := (('x' || ltrim(v_amount_wei, '0xX'))::bit(256))::bigint % v_wei_per_eth;
        ELSE
          -- Handle decimal string
          v_whole_eth := (v_amount_wei::NUMERIC)::BIGINT / v_wei_per_eth;
          v_remainder_wei := (v_amount_wei::NUMERIC)::BIGINT % v_wei_per_eth;
        END IF;
        
        v_decimal_part := (v_remainder_wei::DECIMAL / v_wei_per_eth::DECIMAL);
        v_amount_eth := v_whole_eth::DECIMAL + v_decimal_part;
        v_result_status := 'FIXED_FROM_METADATA_WEI';
      EXCEPTION WHEN OTHERS THEN
        v_result_status := 'ERROR_PARSING_METADATA_WEI: ' || SQLERRM;
      END;
    END IF;
    
    -- Only proceed if we found a valid amount
    IF v_amount_eth > 0 THEN
      -- Update transaction with correct amount
      UPDATE public.transactions
      SET 
        crypto_amount = v_amount_eth,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'amount_fixed_at', NOW()::TEXT,
          'previous_amount', COALESCE(tx_record.crypto_amount, 0)::TEXT,
          'fix_status', v_result_status
        ),
        updated_at = NOW()
      WHERE id = tx_record.id;
      
      -- Check if transaction should be credited (CONFIRMED status with 12+ confirmations)
      IF tx_record.status = 'CONFIRMED' AND tx_record.confirmations >= 12 THEN
        -- Check if already credited
        IF tx_record.metadata->>'credited' IS DISTINCT FROM 'true' THEN
          -- Get current balance
          SELECT balance INTO v_current_balance
          FROM public.wallet_balances
          WHERE user_id = tx_record.user_id AND currency = 'ETH';
          
          -- Calculate new balance
          IF v_current_balance IS NULL THEN
            v_new_balance := v_amount_eth;
          ELSE
            v_new_balance := v_current_balance + v_amount_eth;
          END IF;
          
          -- Credit the balance
          BEGIN
            INSERT INTO public.wallet_balances (user_id, currency, balance)
            VALUES (tx_record.user_id, 'ETH', v_new_balance)
            ON CONFLICT (user_id, currency)
            DO UPDATE SET
              balance = v_new_balance,
              updated_at = NOW();
            
            -- Mark transaction as credited
            UPDATE public.transactions
            SET 
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'credited', true,
                'credited_at', NOW()::TEXT,
                'credited_via', 'fix_function'
              )
            WHERE id = tx_record.id;
            
            v_credit_success := true;
            v_result_status := v_result_status || ' | BALANCE_CREDITED';
          EXCEPTION WHEN OTHERS THEN
            v_result_status := v_result_status || ' | CREDIT_ERROR: ' || SQLERRM;
          END;
        ELSE
          v_result_status := v_result_status || ' | ALREADY_CREDITED';
        END IF;
      END IF;
    END IF;
    
    -- Return result
    RETURN QUERY SELECT 
      tx_record.id,
      COALESCE(tx_record.crypto_amount, 0),
      v_amount_eth,
      v_credit_success,
      v_result_status;
  END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.fix_ethereum_transactions_and_balances() TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.fix_ethereum_transactions_and_balances IS 'Fixes existing Ethereum transactions with zero amounts and credits balances for confirmed transactions that were missed';

-- Run the function to fix existing data
SELECT * FROM public.fix_ethereum_transactions_and_balances();











