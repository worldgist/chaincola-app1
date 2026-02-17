-- Debug script to check buy crypto balance issue
-- Run this AFTER attempting to buy crypto to see what happened

-- Replace with actual user_id from chaincolawallet@gmail.com
-- SELECT id FROM auth.users WHERE email = 'chaincolawallet@gmail.com';

-- Check balances in all tables for a specific user
SELECT 
  'user_wallets' as source,
  user_id,
  ngn_balance,
  sol_balance,
  updated_at
FROM public.user_wallets
WHERE user_id = 'REPLACE_WITH_USER_ID'
UNION ALL
SELECT 
  'wallet_balances (NGN)' as source,
  user_id,
  balance as ngn_balance,
  0 as sol_balance,
  updated_at
FROM public.wallet_balances
WHERE user_id = 'REPLACE_WITH_USER_ID' AND currency = 'NGN'
UNION ALL
SELECT 
  'wallets' as source,
  user_id,
  ngn_balance,
  0 as sol_balance,
  updated_at
FROM public.wallets
WHERE user_id = 'REPLACE_WITH_USER_ID'
ORDER BY updated_at DESC;

-- Check recent buy transactions
SELECT 
  id,
  user_id,
  transaction_type,
  crypto_currency,
  crypto_amount,
  fiat_amount,
  fiat_currency,
  fee_amount,
  status,
  completed_at,
  metadata->>'fix_version' as fix_version
FROM public.transactions
WHERE user_id = 'REPLACE_WITH_USER_ID'
  AND transaction_type = 'BUY'
ORDER BY completed_at DESC
LIMIT 5;

-- Check if credit_wallet function exists and what it does
SELECT 
  proname,
  prosrc
FROM pg_proc
WHERE proname = 'credit_wallet';

-- Check triggers on wallets table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'wallets';
