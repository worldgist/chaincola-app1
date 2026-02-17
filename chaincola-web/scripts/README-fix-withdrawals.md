# Fix Missing Withdrawal Transactions Script

This script retroactively creates transaction records for all withdrawals that don't have corresponding transaction records in the `transactions` table.

## Prerequisites

1. Make sure you have the required environment variables set in `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

3. Install `tsx` globally (if not already installed):
   ```bash
   npm install -g tsx
   ```
   
   Or use npx (no installation needed):
   ```bash
   npx tsx scripts/fix-missing-withdrawal-transactions.ts
   ```

## Usage

### Fix all missing withdrawal transactions:

```bash
cd chaincola-web
npx tsx scripts/fix-missing-withdrawal-transactions.ts
```

### Fix missing transactions for a specific user:

```bash
npx tsx scripts/fix-missing-withdrawal-transactions.ts --user-id <user-id>
```

## What the script does:

1. Fetches all withdrawals from the database
2. Checks which withdrawals don't have corresponding transaction records
3. Creates transaction records for missing withdrawals with:
   - Correct transaction type (WITHDRAWAL)
   - Amount and fee information
   - Bank details in metadata
   - Proper status mapping (completed → COMPLETED, failed → FAILED, etc.)
   - External transaction IDs and references
4. Provides a summary of what was fixed

## Output

The script will show:
- Progress for each withdrawal checked
- Summary statistics:
  - Total withdrawals checked
  - Transactions created
  - Already had transactions
  - Errors encountered
- Detailed error messages if any failures occur

## Example Output

```
🔍 Starting to fix missing withdrawal transactions...

📊 Found 25 withdrawal(s) to check

[1/25] Checking withdrawal abc-123...
   ✅ Created transaction: xyz-789
[2/25] Checking withdrawal def-456...
   ✅ Transaction already exists: uvw-012
...

============================================================
📊 SUMMARY
============================================================
Total withdrawals checked: 25
✅ Transactions created: 18
ℹ️  Already had transactions: 7
❌ Errors: 0

✅ Script completed!
```

## Notes

- The script uses the service role key to bypass RLS policies
- Transactions are marked with `created_retroactively: true` in metadata
- The script includes a small delay between operations to avoid overwhelming the database
- Safe to run multiple times - it will skip withdrawals that already have transactions









