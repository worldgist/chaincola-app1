# Sell Calculation Bug Analysis

## Issue
User sold **0.00145713 SOL** but was credited **₦14,249.30** instead of the expected **~₦282.74**.

## Expected Calculation
```
Crypto amount: 0.00145713 SOL
Rate: ~₦193,000 per SOL (fallback) or market price
Total NGN before fee: 0.00145713 × ₦193,000 = ₦281.23
Platform fee (1%): ₦2.81
NGN credited: ₦278.42
```

## Actual Result
- **NGN credited: ₦14,249.30**
- This is **~51x** the expected amount!

## Reverse Calculation Analysis

### If the rate was wrong:
- Rate needed: ₦14,249.30 / 0.00145713 = **₦9,777,000 per SOL** (impossible!)

### If the amount used was wrong:
- If rate is ₦193,000: amount = ₦14,249.30 / ₦193,000 = **0.0738 SOL**
- This suggests the user's **total SOL balance** (~0.0738 SOL) was used instead of the amount sold (0.00145713 SOL)

## Root Cause Hypothesis

The bug is likely one of these:

1. **Wrong amount passed**: The edge function might be passing the user's total balance instead of the amount sold
2. **Wrong variable used**: The database function might be using `v_current_user_asset_balance` instead of `v_crypto_amount_sold` in the calculation
3. **Old function version**: An older version of the function might still be deployed that has the bug
4. **Migration not applied**: The fix migration might not have been applied to the database

## Code Analysis

The current code (migration `20260130000009_fix_10x_bug_buy_sell_crypto.sql`) looks correct:

```sql
-- Line 312: Store exact amount sold
v_crypto_amount_sold := p_amount;

-- Line 372: Calculate using exact amount
v_total_ngn_before_fee := ROUND(v_crypto_amount_sold * p_rate, 2);
```

However, if `p_amount` itself is wrong (e.g., contains the user's total balance), the calculation will be wrong.

## Diagnostic Steps

1. **Check the transaction record**:
   ```sql
   SELECT 
     crypto_amount,
     fiat_amount,
     metadata->>'rate' as rate_used,
     metadata->>'crypto_amount_sold' as crypto_amount_sold_metadata
   FROM transactions
   WHERE fiat_amount = 14249.30
     AND crypto_currency = 'SOL';
   ```

2. **Check which function version is deployed**:
   ```sql
   SELECT proname, pg_get_functiondef(oid) 
   FROM pg_proc 
   WHERE proname = 'instant_sell_crypto_v2';
   ```

3. **Check edge function logs** for the actual `amount` parameter passed

4. **Check if migration was applied**:
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations 
   WHERE name LIKE '%fix_10x_bug%' 
   ORDER BY executed_at DESC;
   ```

## Fix Applied

Migration `20260130000012_add_sell_validation_logging.sql` adds:
- **Validation checks** to catch calculation bugs
- **Detailed logging** using `RAISE NOTICE` to track:
  - Input parameters (`p_amount`, `p_rate`)
  - Stored `v_crypto_amount_sold`
  - All balance values
  - Calculation steps
  - Final result
- **Warning** if calculated amount seems too high (>10% margin)
- **Metadata** in transaction record with all calculation details

## Next Steps

1. **Apply the new migration** to add validation and logging
2. **Check recent transactions** using the diagnostic SQL script
3. **Review edge function** to ensure it's passing the correct `amount` parameter
4. **Monitor logs** for any warnings or errors
5. **Fix affected user** by correcting their balance if needed

## Prevention

The new migration will:
- Log all calculations for debugging
- Warn if calculations seem incorrect
- Store detailed metadata in transaction records
- Make it easier to identify and fix bugs in the future
