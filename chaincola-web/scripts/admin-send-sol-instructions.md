# How to Send SOL to Main Wallet as Admin

## Main Wallet Address
**Solana Main Wallet**: `CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi`

## Method 1: Using Admin Panel (Recommended)

### Option A: Via User Management
1. Go to **Admin → Users**
2. Find the user who has SOL
3. Click on the user
4. Use the "Send Crypto" or "Transfer" feature
5. Enter destination: `CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi`
6. Enter amount or select "Send All"
7. Confirm transaction

### Option B: Via Treasury Adjustment (After Transfer)
1. Send SOL on blockchain using any Solana wallet
2. Go to **Admin → Treasury**
3. Click **Adjust Liquidity**
4. Select **SOL** as asset
5. Select **Add** operation
6. Enter the amount transferred
7. Add reason: "Transfer to main wallet"
8. Click **Adjust**

## Method 2: Using Edge Function Directly

Call the `send-solana-transaction` Edge Function:

```bash
curl -X POST \
  https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/send-solana-transaction \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination_address": "CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi",
    "amount_sol": 0.5,
    "send_all": false,
    "skip_platform_fee": true
  }'
```

## Method 3: Using Solana Wallet Directly

1. Open your Solana wallet (Phantom, Solflare, etc.)
2. Send SOL to: `CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi`
3. After transfer completes, update inventory in Admin → Treasury

## Important Notes

⚠️ **After sending SOL on blockchain:**
- The SOL will be at the main wallet address
- You may need to update `system_wallets.sol_inventory` manually if it doesn't auto-update
- Use Treasury → Adjust Liquidity to sync the inventory

## Verify Transfer

1. Check on Solana Explorer:
   https://explorer.solana.com/address/CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi

2. Check system inventory:
   ```sql
   SELECT sol_inventory, sol_main_address 
   FROM system_wallets 
   WHERE id = 1;
   ```
