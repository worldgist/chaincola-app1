# NGN Credit Issue - Fix Scripts Guide

## Problem
User sold Solana and received ₦399,000.00 NGN credit incorrectly due to a bug in `instant_sell_crypto_v2` function.

## Quick Fix (Recommended)

### Option 1: Use Node.js Script (Easiest)
```bash
cd chaincola-web
node scripts/comprehensive-fix-ngn-credit.js
```

This script will:
1. Find the transaction automatically
2. Calculate the correct amount
3. Show you the correction plan
4. Ask for confirmation before applying

### Option 2: Use SQL Scripts (More Control)

#### Step 1: Investigate
Run in Supabase SQL Editor:
```sql
-- This shows the analysis without making changes
\i scripts/fix-399k-ngn-credit-issue.sql
```

#### Step 2: Apply Fix (After Review)
Run in Supabase SQL Editor:
```sql
-- This applies the correction
\i scripts/fix-apply-399k-correction.sql
```

## Files Created

1. **comprehensive-fix-ngn-credit.js** - All-in-one Node.js script (recommended)
2. **fix-399k-ngn-credit-issue.sql** - SQL investigation script
3. **fix-apply-399k-correction.sql** - SQL correction script
4. **verify-and-fix-ngn-credit-issue.js** - General investigation script
5. **fix-incorrect-ngn-credits.sql** - General SQL functions for finding issues

## What the Fix Does

1. Finds the transaction with ₦399,000 credit
2. Calculates the expected amount based on:
   - SOL amount sold
   - Rate at time of sale
   - 1% platform fee
3. Calculates the over-credit amount
4. Subtracts the over-credit from user's current balance
5. Updates all three wallet tables:
   - `user_wallets`
   - `wallet_balances`
   - `wallets`

## Safety Features

- ✅ Shows detailed analysis before applying
- ✅ Requires explicit confirmation
- ✅ Updates all wallet tables to keep them in sync
- ✅ Can be verified after running

## Verification

After applying the fix, verify the balance:
```sql
SELECT 
  'user_wallets' AS source,
  ngn_balance AS balance
FROM user_wallets
WHERE user_id = 'USER_ID_HERE'
UNION ALL
SELECT 
  'wallet_balances' AS source,
  balance
FROM wallet_balances
WHERE user_id = 'USER_ID_HERE' AND currency = 'NGN'
UNION ALL
SELECT 
  'wallets' AS source,
  ngn_balance
FROM wallets
WHERE user_id = 'USER_ID_HERE';
```

All three should show the same corrected balance.

## Prevention

Ensure migration `20260129000001_fix_instant_sell_ngn_balance_calculation.sql` is applied to prevent future issues.
