-- Fix for User Who Got ₦399,000 NGN Credit Incorrectly
-- This script finds and fixes the specific transaction

-- Step 1: Find the transaction with ₦399,000 credit
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
  v_current_balance_wallet_balances DECIMAL(20, 2);
  v_current_balance_wallets DECIMAL(20, 2);
  v_correct_balance DECIMAL(20, 2);
BEGIN
  -- Find transaction with NGN credit around ₦399,000
  SELECT 
    id,
    user_id,
    crypto_amount::DECIMAL(20, 8),
    fiat_amount::DECIMAL(20, 2),
    (metadata->>'rate')::DECIMAL(20, 2)
  INTO 
    v_transaction_id,
    v_user_id,
    v_sol_amount,
    v_credited_ngn,
    v_rate
  FROM transactions
  WHERE crypto_currency = 'SOL'
    AND transaction_type = 'SELL'
    AND status = 'COMPLETED'
    AND fiat_currency = 'NGN'
    AND fiat_amount BETWEEN 398000 AND 400000
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_transaction_id IS NULL THEN
    RAISE NOTICE '⚠️  No transaction found with NGN credit around ₦399,000';
    RAISE NOTICE '   Showing recent SOL sell transactions instead:';
    
    -- Show recent transactions
    FOR rec IN 
      SELECT 
        id,
        user_id,
        crypto_amount,
        fiat_amount,
        (metadata->>'rate')::DECIMAL AS rate,
        created_at
      FROM transactions
      WHERE crypto_currency = 'SOL'
        AND transaction_type = 'SELL'
        AND status = 'COMPLETED'
        AND fiat_currency = 'NGN'
      ORDER BY created_at DESC
      LIMIT 10
    LOOP
      RAISE NOTICE '   Transaction: % | SOL: % | NGN: ₦% | Rate: ₦% | Date: %',
        rec.id::TEXT,
        rec.crypto_amount,
        rec.fiat_amount,
        rec.rate,
        rec.created_at;
    END LOOP;
    
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Found transaction:';
  RAISE NOTICE '   Transaction ID: %', v_transaction_id;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   SOL Amount: %', v_sol_amount;
  RAISE NOTICE '   Rate: ₦% per SOL', v_rate;
  RAISE NOTICE '   Credited: ₦%', v_credited_ngn;
  
  -- Calculate expected amount (with 1% fee)
  IF v_rate > 0 THEN
    v_expected_ngn := (v_sol_amount * v_rate * 0.99)::DECIMAL(20, 2);
    v_over_credit := v_credited_ngn - v_expected_ngn;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 Calculation:';
    RAISE NOTICE '   Total before fee: % × ₦% = ₦%', v_sol_amount, v_rate, (v_sol_amount * v_rate)::DECIMAL(20, 2);
    RAISE NOTICE '   Fee (1%%): ₦%', ((v_sol_amount * v_rate * 0.01))::DECIMAL(20, 2);
    RAISE NOTICE '   Expected after fee: ₦%', v_expected_ngn;
    RAISE NOTICE '   Over-credited: ₦%', v_over_credit;
    
    IF v_over_credit > 0 THEN
      -- Get current balances
      SELECT COALESCE(ngn_balance, 0) INTO v_current_balance_user_wallets
      FROM user_wallets WHERE user_id = v_user_id;
      
      SELECT COALESCE(balance, 0) INTO v_current_balance_wallet_balances
      FROM wallet_balances WHERE user_id = v_user_id AND currency = 'NGN';
      
      SELECT COALESCE(ngn_balance, 0) INTO v_current_balance_wallets
      FROM wallets WHERE user_id = v_user_id;
      
      RAISE NOTICE '';
      RAISE NOTICE '💰 Current Balances:';
      RAISE NOTICE '   user_wallets.ngn_balance: ₦%', v_current_balance_user_wallets;
      RAISE NOTICE '   wallet_balances.balance: ₦%', v_current_balance_wallet_balances;
      RAISE NOTICE '   wallets.ngn_balance: ₦%', v_current_balance_wallets;
      
      -- Calculate correct balance
      v_correct_balance := v_current_balance_user_wallets - v_over_credit;
      
      RAISE NOTICE '';
      RAISE NOTICE '🔧 Correction Needed:';
      RAISE NOTICE '   Current balance: ₦%', v_current_balance_user_wallets;
      RAISE NOTICE '   Over-credit amount: ₦%', v_over_credit;
      RAISE NOTICE '   Correct balance: ₦%', v_correct_balance;
      RAISE NOTICE '';
      RAISE NOTICE '⚠️  To apply the fix, uncomment the UPDATE statements below and run again';
      RAISE NOTICE '   Or use the separate fix script: fix-apply-399k-correction.sql';
      
      -- Store values for potential fix (commented out for safety)
      /*
      -- Update user_wallets
      UPDATE user_wallets
      SET ngn_balance = v_correct_balance,
          updated_at = NOW()
      WHERE user_id = v_user_id;
      
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
      
      -- Create audit log entry
      INSERT INTO balance_corrections (
        user_id,
        transaction_id,
        correction_type,
        amount_before,
        amount_after,
        correction_amount,
        reason
      ) VALUES (
        v_user_id,
        v_transaction_id,
        'OVER_CREDIT',
        v_current_balance_user_wallets,
        v_correct_balance,
        -v_over_credit,
        format('Corrected over-credit from instant_sell transaction. Expected: ₦%, Credited: ₦%, Difference: ₦%', 
               v_expected_ngn, v_credited_ngn, v_over_credit)
      );
      
      RAISE NOTICE '✅ Balance corrected successfully';
      */
    ELSE
      RAISE NOTICE '✅ No correction needed - amount appears correct';
    END IF;
  ELSE
    RAISE NOTICE '⚠️  Cannot calculate - rate is missing or zero';
  END IF;
END $$;

-- Step 2: Show all transactions with potential issues
SELECT 
  id AS transaction_id,
  user_id,
  crypto_amount AS sol_amount,
  fiat_amount AS ngn_credited,
  (metadata->>'rate')::DECIMAL AS rate_per_sol,
  (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)::DECIMAL(20, 2) AS expected_ngn,
  (fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99))::DECIMAL(20, 2) AS difference,
  created_at
FROM transactions
WHERE crypto_currency = 'SOL'
  AND transaction_type = 'SELL'
  AND status = 'COMPLETED'
  AND fiat_currency = 'NGN'
  AND (metadata->>'rate')::DECIMAL > 0
  AND ABS(fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)) > 1000
ORDER BY created_at DESC
LIMIT 20;
