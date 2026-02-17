-- Trace Solana Sell Transaction
-- This script helps find where 0.01579829 SOL went after a sell transaction

-- 1. Find the transaction record
SELECT 
  id,
  user_id,
  transaction_type,
  crypto_currency,
  crypto_amount,
  fiat_amount,
  fiat_currency,
  status,
  external_reference,
  metadata,
  created_at,
  completed_at
FROM public.transactions
WHERE crypto_currency = 'SOL'
  AND crypto_amount = 0.01579829
  AND transaction_type = 'SELL'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check system wallet SOL inventory (where sold SOL goes)
SELECT 
  id,
  sol_inventory,
  ngn_float_balance,
  updated_at
FROM public.system_wallets
WHERE id = 1;

-- 3. Check if there's a sell record in the sells table
SELECT 
  id,
  user_id,
  sol_amount,
  sol_tx_hash,
  status,
  locked_sol_amount,
  created_at,
  updated_at
FROM public.sells
WHERE sol_amount = 0.01579829
  OR ABS(sol_amount - 0.01579829) < 0.00000001
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check wallet_balances for the user (if we know the user_id from step 1)
-- Replace USER_ID_HERE with the actual user_id from step 1
/*
SELECT 
  user_id,
  currency,
  balance,
  updated_at
FROM public.wallet_balances
WHERE user_id = 'USER_ID_HERE'
  AND currency IN ('SOL', 'NGN')
ORDER BY updated_at DESC;
*/

-- 5. Check user_wallets for the user
-- Replace USER_ID_HERE with the actual user_id from step 1
/*
SELECT 
  user_id,
  sol_balance,
  ngn_balance,
  updated_at
FROM public.user_wallets
WHERE user_id = 'USER_ID_HERE';
*/

-- 6. Summary: Where did the SOL go?
-- When SOL is sold via instant_sell_crypto_v2:
-- - SOL is debited from user's wallet (user_wallets.sol_balance or wallet_balances)
-- - SOL is added to system_wallets.sol_inventory (this is where it goes!)
-- - NGN is credited to user's wallet
-- - NGN is debited from system_wallets.ngn_float_balance
-- 
-- The SOL remains in the system inventory until it's:
-- - Used for future buy orders
-- - Manually transferred out by admin
-- - Sold on an exchange (if automated)
