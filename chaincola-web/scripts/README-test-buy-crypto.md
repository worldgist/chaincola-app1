# Test Buy Crypto Script

This script tests the buy crypto functionality to verify that NGN balance is correctly debited when buying crypto.

## Usage

### Option 1: Using npm script (recommended)

```bash
cd /Applications/chaincola/chaincola-web
npm run test-buy-crypto
```

### Option 2: Direct node execution

```bash
cd /Applications/chaincola/chaincola-web
node scripts/test-buy-crypto.js
```

## Environment Variables

Set these environment variables before running:

```bash
export SUPABASE_URL="https://slleojsdpctxhlsoyenr.supabase.co"
export SUPABASE_ANON_KEY="your_supabase_anon_key"
export TEST_EMAIL="chaincolawallet@gmail.com"
export TEST_PASSWORD="Salifu147@"
```

Or create a `.env` file in the project root:

```env
SUPABASE_URL=https://slleojsdpctxhlsoyenr.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
TEST_EMAIL=chaincolawallet@gmail.com
TEST_PASSWORD=Salifu147@
```

## What the Script Does

1. **Signs in** as the test user
2. **Checks balances** from all tables (user_wallets, wallet_balances, wallets) BEFORE buy
3. **Fetches SOL price** from the pricing engine
4. **Executes buy transaction** for ₦3,000 worth of SOL
5. **Checks balances** AFTER buy
6. **Analyzes results**:
   - Calculates expected balance (before - amount - fee)
   - Compares with actual balance
   - Checks if balance was debited (decreased) or credited (increased)
   - Verifies all tables are in sync
7. **Shows transaction details** from the transactions table

## Expected Output

If everything works correctly, you should see:

```
✅ Balance correctly debited!
✅ All tables are in sync!
```

If there's an issue, you'll see:

```
❌ CRITICAL ERROR: Balance INCREASED instead of DECREASED!
   Before: ₦X,XXX.XX
   After: ₦X,XXX.XX
   This means NGN was CREDITED instead of DEBITED!
```

## Troubleshooting

1. **Authentication failed**: Check email/password
2. **Insufficient balance**: Make sure the test account has at least ₦3,000 + fee
3. **Function not found**: Make sure the migration has been applied
4. **Balance mismatch**: Check if triggers are interfering with balance updates
