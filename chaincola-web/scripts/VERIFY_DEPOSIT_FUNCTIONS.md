# Crypto Deposit Detection Functions Verification

This guide explains how to verify that all crypto deposit detection functions are working correctly, including auto-convert to NGN functionality.

## Quick Start

```bash
# Make sure you have SUPABASE_SERVICE_ROLE_KEY set in .env.local
node scripts/verify-crypto-deposit-functions.js
```

## What It Tests

The verification script tests:

1. **Function Execution**
   - All 6 deposit detection functions (ETH, BTC, SOL, XRP, USDT, USDC)
   - Response times and error handling
   - Wallets checked and deposits found

2. **Auto-Convert Functionality**
   - Verifies that RECEIVE transactions have `auto_converted_to_ngn: true` in metadata
   - Checks that NGN amounts were credited
   - Identifies any confirmed transactions that weren't auto-converted

3. **Transaction Recording**
   - Checks recent RECEIVE transactions
   - Verifies CONVERT transactions were created
   - Validates transaction metadata

4. **NGN Credits**
   - Shows total NGN credited from auto-conversions
   - Lists recent CONVERT transactions

5. **Active Wallets**
   - Counts active wallets for each currency
   - Helps identify if wallets are properly configured

## Functions Tested

- `detect-ethereum-deposits` - ETH deposits
- `detect-bitcoin-deposits` - BTC deposits
- `detect-solana-deposits` - SOL deposits
- `detect-xrp-deposits` - XRP deposits
- `detect-usdt-deposits` - USDT (ERC-20) deposits
- `detect-usdc-deposits` - USDC (ERC-20) deposits

## Expected Output

```
🚀 CRYPTO DEPOSIT DETECTION VERIFICATION
============================================================
Supabase URL: https://slleojsdpctxhlsoyenr.supabase.co
Testing 6 deposit detection functions
============================================================

👛 Checking Active Wallets...
   ETH: 5 active wallet(s)
   BTC: 3 active wallet(s)
   ...

📡 Testing Deposit Detection Functions...
============================================================
🔍 Testing detect-ethereum-deposits
   Currency: ETH (ETH)
   ✅ Function executed successfully (1234ms)
   Wallets checked: 5
   Deposits found: 2
   Deposits credited: 2

🔄 Verifying Auto-Convert Functionality...
   ✅ Transaction abc123...
      Amount: 0.1 ETH
      NGN Credited: ₦45000.00
      Converted At: 2026-01-24T10:30:00Z

💰 Verifying NGN Credits from Auto-Convert...
   Total CONVERT transactions: 15
   Total NGN credited: ₦675000.00

📊 VERIFICATION SUMMARY
============================================================
✅ ALL CHECKS PASSED!
   All deposit detection functions are working correctly.
```

## Environment Variables

Required:
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

Optional:
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` - Defaults to production URL

## Troubleshooting

### "SUPABASE_SERVICE_ROLE_KEY environment variable is required"

Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Function returns errors

Check:
1. Function is deployed: `supabase functions list`
2. Cron jobs are running: Check Supabase Dashboard → Database → Cron Jobs
3. Environment variables are set in Supabase: Dashboard → Edge Functions → Settings

### No auto-convert detected

Verify:
1. Transactions have `status: 'CONFIRMED'` and sufficient confirmations
2. Auto-convert function is working: Check Edge Function logs
3. Luno API is accessible for price conversion
4. User has sufficient balance for conversion

### No active wallets found

Check:
1. Wallets exist in `crypto_wallets` table
2. Wallets have `is_active: true`
3. Asset and network match expected values

## Manual Testing

You can also test individual functions manually:

```bash
# Test Ethereum deposits
curl -X POST "https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/detect-ethereum-deposits" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test Bitcoin deposits
curl -X POST "https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/detect-bitcoin-deposits" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Related Scripts

- `scripts/trigger-eth-deposit-detection.js` - Manually trigger ETH detection
- `scripts/verify-deposit-detection.js` - Detailed verification for specific wallet
- `scripts/manually-verify-pending.js` - Verify pending transactions

## Next Steps

After verification:
1. Check Supabase Dashboard → Edge Functions → Logs for detailed execution logs
2. Review `transactions` table for recent RECEIVE and CONVERT transactions
3. Verify `wallet_balances` table shows correct NGN balances
4. Test with a real deposit to confirm end-to-end flow
