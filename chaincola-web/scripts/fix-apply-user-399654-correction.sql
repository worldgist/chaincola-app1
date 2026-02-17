-- Apply Correction for ₦399,654.00 Over-Credit Issue
-- ⚠️  REVIEW THE CALCULATIONS CAREFULLY BEFORE RUNNING THIS SCRIPT
-- This script will correct the user's balance by subtracting the over-credited amount
--
-- IMPORTANT: Run fix-user-399654-ngn-credit.sql first to see the analysis
-- Then review the output before running this script

DO $$
DECLARE
  v_transaction_id UUID;
  v_user_id UUID;
  v_sol_amount DECIMAL(20, 8);
  v_credited_ngn DECIMAL(20, 2);
  v_rate DECIMAL(20, 2);
  v_expected_ngn DECIMAL(20, 2);
  v_over_credit DECIMAL(20, 2);
  v_current_balance_user_wallets DECIMAL(20, 2);
  v_correct_balance DECIMAL(20, 2);
  v_user_email TEXT;
BEGIN
  -- Find transaction with NGN credit around ₦399,654
  SELECT 
    t.id,
    t.user_id,
    t.crypto_amount::DECIMAL(20, 8),
    t.fiat_amount::DECIMAL(20, 2),
    COALESCE((t.metadata->>'rate')::DECIMAL(20, 2), 0)
  INTO 
    v_transaction_id,
    v_user_id,
    v_sol_amount,
    v_credited_ngn,
    v_rate
  FROM transactions t
  WHERE t.crypto_currency = 'SOL'
    AND t.transaction_type = 'SELL'
    AND t.status = 'COMPLETED'
    AND t.fiat_currency = 'NGN'
    AND ABS(t.fiat_amount - 399654.00) < 10  -- Find transactions close to 399,654
  ORDER BY t.created_at DESC
  LIMIT 1;
  
  IF v_transaction_id IS NULL THEN
    -- Try broader search
    SELECT 
      t.id,
      t.user_id,
      t.crypto_amount::DECIMAL(20, 8),
      t.fiat_amount::DECIMAL(20, 2),
      COALESCE((t.metadata->>'rate')::DECIMAL(20, 2), 0)
    INTO 
      v_transaction_id,
      v_user_id,
      v_sol_amount,
      v_credited_ngn,
      v_rate
    FROM transactions t
    WHERE t.crypto_currency = 'SOL'
      AND t.transaction_type = 'SELL'
      AND t.status = 'COMPLETED'
      AND t.fiat_currency = 'NGN'
      AND t.fiat_amount BETWEEN 399000 AND 400000
    ORDER BY t.created_at DESC
    LIMIT 1;
    
    IF v_transaction_id IS NULL THEN
      RAISE EXCEPTION 'No transaction found with NGN credit around ₦399,654. Please check the transaction amount.';
    END IF;
  END IF;
  
  -- Get user email for logging
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  -- Calculate expected amount
  IF v_rate > 0 THEN
    -- Calculate expected amount with 1% fee
    v_expected_ngn := (v_sol_amount * v_rate * 0.99)::DECIMAL(20, 2);
  ELSE
    -- If rate is not available, use ₦2,500 as expected (as reported by user)
    v_expected_ngn := 2500.00;
  END IF;
  
  v_over_credit := v_credited_ngn - v_expected_ngn;
  
  -- Get current balance
  SELECT COALESCE(ngn_balance, 0) INTO v_current_balance_user_wallets
  FROM user_wallets
  WHERE user_id = v_user_id;
  
  -- Calculate correct balance
  v_correct_balance := v_current_balance_user_wallets - v_over_credit;
  
  -- Display information
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CORRECTION DETAILS';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Transaction ID: %', v_transaction_id;
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE 'User Email: %', COALESCE(v_user_email, 'N/A');
  RAISE NOTICE '';
  RAISE NOTICE 'Transaction Details:';
  RAISE NOTICE '  SOL Amount: %', v_sol_amount;
  RAISE NOTICE '  Rate: ₦% per SOL', v_rate;
  RAISE NOTICE '  Expected NGN: ₦%', v_expected_ngn;
  RAISE NOTICE '  Credited NGN: ₦%', v_credited_ngn;
  RAISE NOTICE '  Over-Credit: ₦%', v_over_credit;
  RAISE NOTICE '';
  RAISE NOTICE 'Balance Correction:';
  RAISE NOTICE '  Current Balance: ₦%', v_current_balance_user_wallets;
  RAISE NOTICE '  Correct Balance: ₦%', v_correct_balance;
  RAISE NOTICE '  Adjustment: -₦%', v_over_credit;
  RAISE NOTICE '========================================';
  
  -- Safety check: Don't allow negative balance correction
  IF v_over_credit <= 0 THEN
    RAISE EXCEPTION 'No over-credit detected. Expected: ₦%, Credited: ₦%. No correction needed.', 
      v_expected_ngn, v_credited_ngn;
  END IF;
  
  -- Safety check: Warn if correction is very large
  IF v_over_credit > 100000 THEN
    RAISE WARNING 'Large correction amount detected: ₦%. Please verify this is correct before proceeding.', v_over_credit;
  END IF;
  
  -- Safety check: Don't allow negative balance
  IF v_correct_balance < 0 THEN
    RAISE EXCEPTION 'Correction would result in negative balance: ₦%. Cannot proceed.', v_correct_balance;
  END IF;
  
  -- Apply correction
  BEGIN
    -- Update user_wallets (primary source)
    UPDATE user_wallets
    SET ngn_balance = v_correct_balance,
        updated_at = NOW()
    WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User wallet not found for user_id: %', v_user_id;
    END IF;
    
    -- Update wallet_balances
    INSERT INTO wallet_balances (user_id, currency, balance, updated_at)
    VALUES (v_user_id, 'NGN', v_correct_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_correct_balance, updated_at = NOW();
    
    -- Update wallets
    INSERT INTO wallets (user_id, ngn_balance, updated_at)
    VALUES (v_user_id, v_correct_balance, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = v_correct_balance, updated_at = NOW();
    
    -- Update transaction metadata to record the correction
    UPDATE transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'balance_corrected', true,
      'correction_date', NOW()::TEXT,
      'original_credited_ngn', v_credited_ngn,
      'corrected_ngn', v_expected_ngn,
      'over_credit_amount', v_over_credit,
      'correction_reason', 'Fixed incorrect NGN credit from instant_sell bug'
    )
    WHERE id = v_transaction_id;
    
    -- Create audit log entry (if table exists)
    BEGIN
      INSERT INTO balance_corrections (
        user_id,
        transaction_id,
        correction_type,
        amount_before,
        amount_after,
        correction_amount,
        reason,
        created_at
      ) VALUES (
        v_user_id,
        v_transaction_id,
        'OVER_CREDIT',
        v_current_balance_user_wallets,
        v_correct_balance,
        -v_over_credit,
        format('Corrected over-credit from instant_sell transaction %s. SOL: %, Rate: ₦%, Expected: ₦%, Credited: ₦%, Over-credit: ₦%', 
               v_transaction_id, v_sol_amount, v_rate, v_expected_ngn, v_credited_ngn, v_over_credit),
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Note: Could not create audit log entry (table may not exist): %', SQLERRM;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ SUCCESS: Balance corrected successfully';
    RAISE NOTICE '   User balance updated from ₦% to ₦%', v_current_balance_user_wallets, v_correct_balance;
    RAISE NOTICE '';
    RAISE NOTICE 'Verification:';
    RAISE NOTICE '  Run: SELECT ngn_balance FROM user_wallets WHERE user_id = ''%'';', v_user_id;
    RAISE NOTICE '  Expected: ₦%', v_correct_balance;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error applying correction: %', SQLERRM;
  END;
END $$;

-- Verification query (run after correction)
-- This will show the corrected balances across all tables
SELECT 
  'user_wallets' AS source,
  ngn_balance AS balance,
  updated_at
FROM user_wallets
WHERE user_id IN (
  SELECT user_id FROM transactions 
  WHERE crypto_currency = 'SOL'
    AND transaction_type = 'SELL'
    AND status = 'COMPLETED'
    AND fiat_currency = 'NGN'
    AND ABS(fiat_amount - 399654.00) < 10
  ORDER BY created_at DESC
  LIMIT 1
)
UNION ALL
SELECT 
  'wallet_balances' AS source,
  balance,
  updated_at
FROM wallet_balances
WHERE user_id IN (
  SELECT user_id FROM transactions 
  WHERE crypto_currency = 'SOL'
    AND transaction_type = 'SELL'
    AND status = 'COMPLETED'
    AND fiat_currency = 'NGN'
    AND ABS(fiat_amount - 399654.00) < 10
  ORDER BY created_at DESC
  LIMIT 1
) AND currency = 'NGN'
UNION ALL
SELECT 
  'wallets' AS source,
  ngn_balance,
  updated_at
FROM wallets
WHERE user_id IN (
  SELECT user_id FROM transactions 
  WHERE crypto_currency = 'SOL'
    AND transaction_type = 'SELL'
    AND status = 'COMPLETED'
    AND fiat_currency = 'NGN'
    AND ABS(fiat_amount - 399654.00) < 10
  ORDER BY created_at DESC
  LIMIT 1
);
