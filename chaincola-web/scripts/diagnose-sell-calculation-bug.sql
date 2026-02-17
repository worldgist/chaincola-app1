-- Diagnostic query to find the bug in sell calculation
-- User sold 0.00145713 SOL but was credited ₦14,249.30 instead of ~₦282.74

-- Expected calculation:
-- Crypto amount: 0.00145713 SOL
-- Expected rate: ~₦193,000 per SOL (fallback) or market price
-- Expected NGN before fee: 0.00145713 × 193,000 = ₦281.23
-- Expected fee (1%): ₦2.81
-- Expected NGN credited: ₦278.42

-- Actual credited: ₦14,249.30
-- Reverse calculation:
-- If credited ₦14,249.30 for 0.00145713 SOL:
--   Rate would need to be: 14,249.30 / 0.00145713 = ₦9,777,000 per SOL (impossible!)
-- OR amount used was wrong:
--   If rate is ₦193,000: amount = 14,249.30 / 193,000 = 0.0738 SOL (user's total balance?)

-- Check recent SOL sell transactions
SELECT 
  id,
  user_id,
  transaction_type,
  crypto_currency,
  crypto_amount,
  fiat_amount,
  fiat_currency,
  fee_amount,
  fee_percentage,
  status,
  created_at,
  metadata->>'rate' as rate_used,
  metadata->>'fee_percentage' as fee_percentage_metadata,
  -- Calculate what rate would produce this fiat_amount
  CASE 
    WHEN crypto_amount > 0 THEN ROUND(fiat_amount / crypto_amount, 2)
    ELSE NULL
  END as implied_rate_per_sol,
  -- Placeholder: implied SOL at a given rate (set rate in query if needed)
  NULL::numeric as implied_sol_amount_placeholder
FROM transactions
WHERE transaction_type = 'SELL'
  AND crypto_currency = 'SOL'
  AND fiat_amount > 10000  -- Look for unusually high amounts
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- Check if there are any transactions with crypto_amount around 0.00145713
SELECT 
  id,
  user_id,
  crypto_amount,
  fiat_amount,
  created_at,
  metadata
FROM transactions
WHERE transaction_type = 'SELL'
  AND crypto_currency = 'SOL'
  AND ABS(crypto_amount - 0.00145713) < 0.0001
ORDER BY created_at DESC
LIMIT 10;

-- Check current function definition
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname IN ('instant_sell_crypto_v2', 'instant_sell_crypto')
ORDER BY proname;
