# Guide: Moving Crypto to Main Wallet Addresses

## Current Situation

Your database shows inventory, but on-chain balances are **0**:
- **SOL**: Database shows 6.43452009 SOL, but on-chain is 0.00000000 SOL
- **USDT**: Database shows 1.980000 USDT, but on-chain is 0.000000 USDT  
- **USDC**: Database shows 1.030000 USDC, but on-chain is 0.000000 USDC

This means the crypto inventory in your database is **not backed by actual blockchain assets**. You need to either:
1. **Move existing crypto** from user wallets to main wallets, OR
2. **Adjust the inventory** to match reality (if crypto was already moved/sold)

## Main Wallet Addresses

| Asset | Main Wallet Address |
|-------|-------------------|
| **SOL** | `CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi` |
| **ETH** | `0x51A04925c2EAE355236C3196872A46621F7FfE30` |
| **USDT (Ethereum)** | `0x51A04925c2EAE355236C3196872A46621F7FfE30` |
| **USDC (Ethereum)** | `0x51A04925c2EAE355236C3196872A46621F7FfE30` |
| **BTC** | `bc1qyq3ass2a8eqxznl5qkqzlhl6lg6lxyg4fnnqvs` |
| **XRP** | `rLRQpZbg6k6x9NkVxAhfhsA1XdPofE6YLV` |

## Method 1: Using Admin Panel (Recommended)

### Step 1: Find Crypto Sources
1. Go to **Admin → Treasury**
2. Check which user wallets have crypto balances
3. Identify the source wallets that need to be swept

### Step 2: Send Crypto to Main Wallet

#### For SOL:
1. Go to **Admin → Treasury → Wallet Settings**
2. Find the **Solana** section
3. Click **"📤 Send SOL to Main Wallet"** button
4. Enter source user ID or address
5. Enter amount or select "Send All"
6. Confirm transaction

#### For ETH/USDT/USDC:
1. Use **Admin → Users** to find users with balances
2. Use the **Send Crypto** feature
3. Send to main wallet address: `0x51A04925c2EAE355236C3196872A46621F7FfE30`

### Step 3: Adjust Inventory (After Blockchain Transfer)
1. Go to **Admin → Treasury → Adjust Liquidity**
2. Select the asset (SOL, USDT, USDC)
3. Select **Add** operation
4. Enter the amount you transferred
5. Add reason: "Transfer to main wallet"
6. Click **Adjust**

## Method 2: Using Edge Functions Directly

### For SOL:
```bash
curl -X POST \
  https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/send-solana-transaction \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination_address": "CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi",
    "amount_sol": 6.43452009,
    "send_all": false,
    "skip_platform_fee": true
  }'
```

### For ETH:
```bash
curl -X POST \
  https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/send-ethereum-transaction \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination_address": "0x51A04925c2EAE355236C3196872A46621F7FfE30",
    "amount_eth": 0.1,
    "send_all": false,
    "skip_platform_fee": true
  }'
```

### For USDT/USDC:
Use the respective edge functions:
- `send-usdt-transaction` for USDT
- `send-usdc-transaction` for USDC

## Method 3: Using External Wallets

### For SOL (Phantom/Solflare):
1. Open your Solana wallet
2. Click **Send**
3. Paste destination: `CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi`
4. Enter amount
5. Confirm and send
6. **After confirmation**, update inventory in Admin Panel

### For ETH/USDT/USDC (MetaMask):
1. Open MetaMask
2. Click **Send**
3. Paste destination: `0x51A04925c2EAE355236C3196872A46621F7FfE30`
4. For USDT/USDC, select the token first
5. Enter amount
6. Confirm and send
7. **After confirmation**, update inventory in Admin Panel

## Method 4: Fix Inventory Discrepancy (If Crypto Doesn't Exist)

If the crypto was never received or was already sold, you should **reduce inventory** to match reality:

### Using Admin Panel:
1. Go to **Admin → Treasury → Adjust Liquidity**
2. Select asset (SOL, USDT, USDC)
3. Select **Subtract** operation
4. Enter the discrepancy amount:
   - SOL: 6.43452009
   - USDT: 1.980000
   - USDC: 1.030000
5. Add reason: "Correcting inventory discrepancy - crypto not on-chain"
6. Click **Adjust**

### Using SQL (Direct):
```sql
UPDATE system_wallets
SET 
  sol_inventory = sol_inventory - 6.43452009,
  usdt_inventory = usdt_inventory - 1.980000,
  usdc_inventory = usdc_inventory - 1.030000
WHERE id = 1;
```

## Verification Steps

### 1. Check On-Chain Balance:
```bash
node scripts/check-onchain-balances.js
```

### 2. Check Solana Explorer:
- SOL: https://solscan.io/account/CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi

### 3. Check Ethereum Explorer:
- ETH/USDT/USDC: https://etherscan.io/address/0x51A04925c2EAE355236C3196872A46621F7FfE30

### 4. Check Database Inventory:
```bash
node scripts/check-system-inventory.js
```

## Important Notes

⚠️ **Critical Understanding:**
- The `system_wallets` table is a **ledger** - it tracks what you *think* you have
- On-chain balances are **reality** - what actually exists on blockchain
- These must match for the system to work correctly

⚠️ **After Moving Crypto:**
- Always verify the transaction on blockchain explorer
- Update inventory using "Adjust Liquidity" feature
- Re-run `check-onchain-balances.js` to verify sync

⚠️ **If Crypto Doesn't Exist:**
- The inventory shows crypto that was never received OR
- Crypto was sold/moved but inventory wasn't updated
- You should reduce inventory to match on-chain reality

## Next Steps

1. **First**, determine if crypto actually exists somewhere:
   - Check user wallets for SOL/USDT/USDC balances
   - Check transaction history to see if crypto was moved

2. **If crypto exists in user wallets:**
   - Use Method 1, 2, or 3 to move it to main wallets
   - Then adjust inventory to match

3. **If crypto doesn't exist:**
   - Use Method 4 to correct inventory discrepancy
   - This will sync your ledger with blockchain reality
