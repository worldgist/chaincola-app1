-- Drop admin wallet-management / treasury scaffold (tables + helpers).
-- Does NOT drop public.system_wallets (core inventory for instant buy/sell).

-- Canonical address mirror + sync trigger function
DROP TABLE IF EXISTS public.system_treasury_main_addresses CASCADE;
DROP FUNCTION IF EXISTS public.sync_system_wallets_from_system_treasury_main_addresses();

-- Mobile withdrawal helper → treasury_movements
DROP FUNCTION IF EXISTS public.log_treasury_movement_for_withdrawal(uuid);

DROP TABLE IF EXISTS public.treasury_movements CASCADE;
DROP TABLE IF EXISTS public.treasury_allocation_rules CASCADE;
DROP TABLE IF EXISTS public.treasury_bank_accounts CASCADE;

DROP TABLE IF EXISTS public.ngn_liquidity_vaults CASCADE;
DROP TABLE IF EXISTS public.inventory_locations CASCADE;

DROP TABLE IF EXISTS public.wallet_registry CASCADE;
DROP TABLE IF EXISTS public.wallet_types CASCADE;
