# Fix for User Who Got ₦399,654.00 Instead of ~₦2,500

## Problem
User sold Solana worth ₦2,500 but was credited ₦399,654.00 in their NGN wallet instead of the correct amount.

## Root Cause
The `instant_sell_crypto_v2` database function had a bug where it was checking multiple wallet tables (`user_wallets`, `wallet_balances`, `wallets`) for NGN balance and using the maximum value, then adding the new amount. This caused users to be over-credited if one of the tables had an incorrect higher balance.

### Example
- User sold SOL worth ₦2,500
- Function found an incorrect balance (e.g., ₦397,154) in one of the wallet tables
- Added ₦2,500 to that incorrect balance
- Result: ₦399,654.00 credited instead of ₦2,500

## Fix Applied
Migration `20260130000001_fix_instant_sell_ngn_balance_calculation_v2.sql` fixes this by:
1. Using `user_wallets.ngn_balance` as PRIMARY source of truth
2. NEVER checking other tables for NGN balance
3. Only checking other tables for crypto balances (not NGN)

## Steps to Fix the Affected User

### Step 1: Verify the Database Fix is Applied
Check if the migration has been applied:

```sql
-- Check function comment
SELECT d.description
FROM pg_proc p
JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = 'instant_sell_crypto_v2';
```

The description should mention "PRIMARY SOURCE OF TRUTH" or "CRITICAL FIX v2".

### Step 2: Find the Affected Transaction
Run the investigation script to find the transaction:

```bash
# In Supabase SQL Editor or psql
\i scripts/fix-user-399654-ngn-credit.sql
```

Or run it directly:
```sql
-- Copy and paste the contents of fix-user-399654-ngn-credit.sql
```

This will:
- Find the transaction with ₦399,654 credit
- Show transaction details
- Calculate the expected amount (~₦2,500)
- Calculate the over-credit amount (~₦397,154)
- Show current balances
- Show what the correct balance should be

### Step 3: Review the Analysis
Carefully review the output from Step 2:
- Verify the transaction ID
- Verify the user ID
- Verify the SOL amount sold
- Verify the expected NGN amount
- Verify the over-credit amount
- Verify the correct balance calculation

### Step 4: Apply the Correction
Once you've verified the analysis is correct, apply the correction:

```bash
# In Supabase SQL Editor or psql
\i scripts/fix-apply-user-399654-correction.sql
```

Or run it directly:
```sql
-- Copy and paste the contents of fix-apply-user-399654-correction.sql
```

This will:
- Find the transaction
- Calculate the correction amount
- Update `user_wallets.ngn_balance` (primary source)
- Update `wallet_balances.balance` (for app compatibility)
- Update `wallets.ngn_balance` (for app compatibility)
- Update transaction metadata to record the correction
- Create an audit log entry (if `balance_corrections` table exists)

### Step 5: Verify the Correction
After applying the fix, verify the balances:

```sql
-- Replace USER_ID with the actual user_id from Step 2
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

All three balances should match and be equal to the correct balance shown in Step 2.

## Safety Checks
The correction script includes several safety checks:
1. ✅ Verifies transaction exists
2. ✅ Calculates expected amount correctly
3. ✅ Warns if correction amount is very large (>₦100,000)
4. ✅ Prevents negative balance corrections
5. ✅ Prevents creating negative balances

## What Gets Updated
1. **user_wallets.ngn_balance** - Primary source of truth
2. **wallet_balances.balance** - For app compatibility
3. **wallets.ngn_balance** - For app compatibility
4. **transactions.metadata** - Records the correction details
5. **balance_corrections** - Audit log (if table exists)

## Expected Result
- User's NGN balance should be corrected from ₦399,654.00 to approximately ₦2,500 (or their previous balance + ₦2,500)
- Transaction metadata will record that a correction was applied
- All wallet tables will be synchronized

## Prevention
The database function fix (`20260130000001_fix_instant_sell_ngn_balance_calculation_v2.sql`) prevents this issue from happening again by:
- Always using `user_wallets.ngn_balance` as the primary source
- Never checking other tables for NGN balance
- Only checking other tables for crypto balances

## Notes
- The correction script is idempotent - running it multiple times won't cause issues (it will find the same transaction and calculate the same correction)
- The correction only affects the specific user who got the incorrect credit
- Other users are not affected
- The fix ensures future transactions use the correct balance calculation
