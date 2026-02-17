-- Quick Check for NGN Credit Issue
-- Run this in Supabase SQL Editor to quickly identify the problem

-- 1. Check if fix is applied (look for "PRIMARY SOURCE" in function comment)
SELECT 
  CASE 
    WHEN d.description LIKE '%PRIMARY SOURCE%' THEN '✅ Fix appears to be applied'
    ELSE '⚠️  Fix may not be applied - check migration'
  END AS fix_status,
  d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = 'instant_sell_crypto_v2';

-- 2. Find transactions with NGN credit around ₦399,000
SELECT 
  id,
  user_id,
  crypto_amount AS sol_amount,
  fiat_amount AS ngn_credited,
  (metadata->>'rate')::DECIMAL AS rate_per_sol,
  created_at,
  -- Calculate expected amount
  (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)::DECIMAL(20, 2) AS expected_ngn,
  -- Calculate difference
  (fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99))::DECIMAL(20, 2) AS difference
FROM transactions
WHERE crypto_currency = 'SOL'
  AND transaction_type = 'SELL'
  AND status = 'COMPLETED'
  AND fiat_currency = 'NGN'
  AND fiat_amount BETWEEN 398000 AND 400000
ORDER BY created_at DESC
LIMIT 10;

-- 3. Show recent SOL sell transactions for comparison
SELECT 
  id,
  user_id,
  crypto_amount AS sol_amount,
  fiat_amount AS ngn_credited,
  (metadata->>'rate')::DECIMAL AS rate_per_sol,
  created_at,
  (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)::DECIMAL(20, 2) AS expected_ngn,
  (fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99))::DECIMAL(20, 2) AS difference
FROM transactions
WHERE crypto_currency = 'SOL'
  AND transaction_type = 'SELL'
  AND status = 'COMPLETED'
  AND fiat_currency = 'NGN'
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check for transactions with large differences (>10% or >₦1,000)
SELECT 
  id,
  user_id,
  crypto_amount AS sol_amount,
  fiat_amount AS ngn_credited,
  (metadata->>'rate')::DECIMAL AS rate_per_sol,
  (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)::DECIMAL(20, 2) AS expected_ngn,
  (fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99))::DECIMAL(20, 2) AS difference,
  ABS((fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)) / 
      NULLIF((crypto_amount * (metadata->>'rate')::DECIMAL * 0.99), 0) * 100) AS percent_diff,
  created_at
FROM transactions
WHERE crypto_currency = 'SOL'
  AND transaction_type = 'SELL'
  AND status = 'COMPLETED'
  AND fiat_currency = 'NGN'
  AND (metadata->>'rate')::DECIMAL > 0
  AND ABS(fiat_amount - (crypto_amount * (metadata->>'rate')::DECIMAL * 0.99)) > 
      GREATEST((crypto_amount * (metadata->>'rate')::DECIMAL * 0.99) * 0.1, 1000)
ORDER BY created_at DESC;
