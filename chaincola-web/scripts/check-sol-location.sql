-- Check where the 0.01579829 SOL is located
-- This shows both the ledger location and physical wallet address

-- 1. System Inventory (Ledger Location)
-- The SOL is tracked here in the database
SELECT 
  'System Inventory (Ledger)' as location_type,
  sol_inventory as sol_amount,
  'This is where sold SOL is tracked in the database' as description,
  updated_at as last_updated
FROM public.system_wallets
WHERE id = 1;

-- 2. Main Solana Wallet Address (Physical Location)
-- The actual SOL is stored at this address on the Solana blockchain
SELECT 
  'Main Solana Wallet (Physical)' as location_type,
  sol_main_address as wallet_address,
  'This is the actual Solana address where the SOL is stored' as description,
  NULL as sol_amount
FROM public.system_wallets
WHERE id = 1;

-- 3. Find the specific transaction
SELECT 
  'Transaction Record' as location_type,
  id as transaction_id,
  user_id,
  crypto_amount,
  fiat_amount,
  status,
  external_reference,
  created_at,
  completed_at
FROM public.transactions
WHERE crypto_currency = 'SOL'
  AND ABS(crypto_amount - 0.01579829) < 0.00000001
  AND transaction_type = 'SELL'
ORDER BY created_at DESC
LIMIT 1;

-- Summary Query - All in one
SELECT 
  sw.sol_inventory as system_sol_inventory,
  sw.sol_main_address as physical_wallet_address,
  sw.ngn_float_balance as system_ngn_balance,
  sw.updated_at as inventory_last_updated,
  COUNT(t.id) as matching_transactions
FROM public.system_wallets sw
LEFT JOIN public.transactions t ON 
  t.crypto_currency = 'SOL' 
  AND ABS(t.crypto_amount - 0.01579829) < 0.00000001
  AND t.transaction_type = 'SELL'
WHERE sw.id = 1
GROUP BY sw.sol_inventory, sw.sol_main_address, sw.ngn_float_balance, sw.updated_at;
