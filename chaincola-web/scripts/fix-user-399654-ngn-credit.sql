-- Fix for User Who Got ₦399,654.00 NGN Credit Instead of ~₦2,500
-- This script finds and fixes the specific transaction where user sold SOL worth ₦2,500
-- but was credited ₦399,654.00

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
    RAISE NOTICE '⚠️  No transaction found with NGN credit around ₦399,654';
    RAISE NOTICE '   Searching for transactions with amount between ₦399,000 and ₦400,000...';
    
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
      RAISE NOTICE '⚠️  Still no transaction found. Showing recent SOL sell transactions:';
      
      -- Show recent transactions
      FOR rec IN 
        SELECT 
          id,
          user_id,
          crypto_amount,
          fiat_amount,
          COALESCE((metadata->>'rate')::DECIMAL, 0) AS rate,
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
  END IF;
  
  -- Get user email for logging
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TRANSACTION FOUND';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Transaction ID: %', v_transaction_id;
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE 'User Email: %', COALESCE(v_user_email, 'N/A');
  RAISE NOTICE 'SOL Amount Sold: %', v_sol_amount;
  RAISE NOTICE 'Rate Used: ₦% per SOL', v_rate;
  RAISE NOTICE 'NGN Credited: ₦%', v_credited_ngn;
  RAISE NOTICE '';
  
  -- Calculate expected amount
  -- User said they sold SOL worth ₦2,500
  -- If rate is available, calculate: (sol_amount * rate) * (1 - fee)
  -- Fee is typically 1% (0.01) for instant sells
  IF v_rate > 0 THEN
    -- Calculate expected amount with 1% fee
    v_expected_ngn := (v_sol_amount * v_rate * 0.99)::DECIMAL(20, 2);
    v_over_credit := v_credited_ngn - v_expected_ngn;
    
    RAISE NOTICE '📊 Calculation:';
    RAISE NOTICE '   SOL Amount: %', v_sol_amount;
    RAISE NOTICE '   Rate: ₦% per SOL', v_rate;
    RAISE NOTICE '   Total before fee: % × ₦% = ₦%', 
      v_sol_amount, v_rate, (v_sol_amount * v_rate)::DECIMAL(20, 2);
    RAISE NOTICE '   Fee (1%%): ₦%', ((v_sol_amount * v_rate * 0.01))::DECIMAL(20, 2);
    RAISE NOTICE '   Expected after fee: ₦%', v_expected_ngn;
    RAISE NOTICE '   Actually credited: ₦%', v_credited_ngn;
    RAISE NOTICE '   Over-credit: ₦%', v_over_credit;
  ELSE
    -- If rate is not available, assume user sold SOL worth ₦2,500
    -- So expected amount should be around ₦2,500 (after fees)
    v_expected_ngn := 2500.00;
    v_over_credit := v_credited_ngn - v_expected_ngn;
    
    RAISE NOTICE '⚠️  Rate not found in metadata.';
    RAISE NOTICE '   Assuming expected amount: ₦2,500 (as reported by user)';
    RAISE NOTICE '   Over-credit: ₦%', v_over_credit;
  END IF;
  
  -- Get current balances from all tables
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
  RAISE NOTICE '   Current balance (user_wallets): ₦%', v_current_balance_user_wallets;
  RAISE NOTICE '   Over-credit amount: ₦%', v_over_credit;
  RAISE NOTICE '   Correct balance: ₦%', v_correct_balance;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  TO APPLY THE FIX:';
  RAISE NOTICE '   1. Review the calculations above';
  RAISE NOTICE '   2. Run the script: fix-apply-user-399654-correction.sql';
  RAISE NOTICE '   3. Or manually update using the values shown above';
  RAISE NOTICE '========================================';
  
END $$;

-- Also show the transaction details for verification
SELECT 
  id AS transaction_id,
  user_id,
  crypto_amount AS sol_amount,
  fiat_amount AS ngn_credited,
  COALESCE((metadata->>'rate')::DECIMAL, 0) AS rate_per_sol,
  (crypto_amount * COALESCE((metadata->>'rate')::DECIMAL, 0) * 0.99)::DECIMAL(20, 2) AS expected_ngn,
  (fiat_amount - (crypto_amount * COALESCE((metadata->>'rate')::DECIMAL, 0) * 0.99))::DECIMAL(20, 2) AS difference,
  created_at
FROM transactions
WHERE crypto_currency = 'SOL'
  AND transaction_type = 'SELL'
  AND status = 'COMPLETED'
  AND fiat_currency = 'NGN'
  AND ABS(fiat_amount - 399654.00) < 10
ORDER BY created_at DESC
LIMIT 5;
