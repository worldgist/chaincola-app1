# Admin Refund Transaction Feature

## Overview
This feature allows admins to refund users when their transactions fail. The refund function automatically:
- Determines what was debited (crypto or fiat)
- Credits it back to the user's balance
- Updates all wallet tables (user_wallets, wallet_balances, wallets)
- Creates a refund transaction record
- Updates the original transaction status to REFUNDED
- Logs the admin action

## Files Created/Modified

### 1. Database Function
**File:** `supabase/migrations/20260127000002_create_admin_refund_transaction_function.sql`

**Function:** `admin_refund_transaction(p_transaction_id, p_admin_user_id, p_refund_reason)`

**Features:**
- ✅ Admin-only access (checks `is_user_admin`)
- ✅ Validates transaction exists and isn't already refunded
- ✅ Automatically determines refund amount and currency based on transaction type:
  - **BUY/SELL:** Refunds crypto amount (or fiat if crypto not available)
  - **SEND:** Refunds crypto amount + fees
  - **DEPOSIT:** Refunds fiat amount
  - **WITHDRAWAL:** Refunds what was debited
- ✅ Updates all wallet tables:
  - `user_wallets` (for crypto)
  - `wallet_balances` (for all currencies)
  - `wallets` (for NGN/USD)
- ✅ Creates refund transaction record
- ✅ Updates original transaction to REFUNDED status
- ✅ Logs admin action in `admin_action_logs`

### 2. Admin API
**File:** `lib/admin-api.ts`

**Function:** `transactionsApi.refundTransaction(transactionId, reason)`

**Usage:**
```typescript
const response = await transactionsApi.refundTransaction(
  'transaction-id-here',
  'Reason for refund (optional)'
);

if (response.success) {
  console.log('Refunded:', response.data.refunded_amount, response.data.refunded_currency);
  console.log('New balance:', response.data.new_balance);
}
```

### 3. Admin UI
**File:** `app/admin/transactions/page.tsx`

**Features:**
- ✅ Shows "Refund" button for failed transactions
- ✅ Confirmation dialog before refunding
- ✅ Optional refund reason input
- ✅ Loading state during refund
- ✅ Success/error alerts
- ✅ Auto-refresh after successful refund
- ✅ Shows "Refunded" badge for refunded transactions

## How to Use

### Step 1: Apply Migration
Apply the database migration:
```sql
-- Run in Supabase Dashboard SQL Editor:
-- File: supabase/migrations/20260127000002_create_admin_refund_transaction_function.sql
```

### Step 2: Use in Admin Panel
1. Go to Admin → Transactions
2. Filter by "Failed" transactions
3. Click "Refund" button on any failed transaction
4. Confirm and optionally enter a reason
5. User's balance will be credited automatically

## Refund Logic by Transaction Type

| Transaction Type | What Gets Refunded |
|-----------------|-------------------|
| **BUY** | Crypto amount that was debited |
| **SELL** | Crypto amount that was debited |
| **SEND** | Crypto amount + gas/fees |
| **DEPOSIT** | Fiat amount (if deposit failed) |
| **WITHDRAWAL** | Fiat/crypto that was debited |
| **Other** | Crypto first, then fiat |

## Security

- ✅ Admin-only access (checked in database function)
- ✅ Transaction validation (exists, not already refunded)
- ✅ Atomic operations (all-or-nothing)
- ✅ Admin action logging (audit trail)

## Testing

To test the refund feature:

1. **Create a test failed transaction:**
   ```sql
   INSERT INTO transactions (
     user_id, transaction_type, crypto_currency, crypto_amount, 
     status, fiat_currency, fiat_amount
   ) VALUES (
     'user-id-here', 'SEND', 'SOL', 1.0,
     'FAILED', 'NGN', 0
   );
   ```

2. **Refund via Admin Panel:**
   - Go to Admin → Transactions
   - Find the failed transaction
   - Click "Refund"
   - Verify balance is credited

3. **Verify refund:**
   ```sql
   -- Check refund transaction was created
   SELECT * FROM transactions 
   WHERE transaction_type = 'REFUND' 
   AND metadata->>'original_transaction_id' = 'transaction-id';
   
   -- Check original transaction status
   SELECT status FROM transactions WHERE id = 'transaction-id';
   -- Should be 'REFUNDED'
   ```

## Notes

- Refunds are **irreversible** - use with caution
- The function automatically determines what to refund based on transaction type
- All wallet tables are updated to ensure balance visibility
- Refund transactions are created for audit trail
- Admin actions are logged in `admin_action_logs`
