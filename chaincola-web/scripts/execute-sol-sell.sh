#!/bin/bash

# Execute SOL sell on Luno and credit user NGN
# This script finds the sell order for a transaction and executes it

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://slleojsdpctxhlsoyenr.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ Please set SUPABASE_SERVICE_ROLE_KEY environment variable"
  exit 1
fi

# Transaction details
TX_HASH="5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB"
SOL_AMOUNT="0.015318545"
ADDRESS="FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe"

echo "🔍 Finding sell order for transaction..."
echo "Transaction Hash: $TX_HASH"
echo "SOL Amount: $SOL_AMOUNT"
echo "Address: $ADDRESS"
echo ""

# First, find the sell order by checking transactions table
echo "📋 Checking for sell order associated with this transaction..."

# Query to find sell order - we'll use the Supabase REST API
SELL_ORDER_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/find_sell_order_by_tx" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"tx_hash\": \"${TX_HASH}\"}")

# Alternative: Query sells table directly
# Get all SOL_SENT or SOLD_ON_LUNO orders and check their sol_tx_hash
echo "🔍 Querying sells table for matching orders..."

# Since we can't easily query from bash, let's try to call execute-luno-sell
# for orders that might match. But first, let's check if verify-sol-sell can handle it

echo ""
echo "🔄 Triggering verify-sol-sell to process pending SOL sells..."
echo "This will check for SOL_SENT orders and execute them on Luno..."
echo ""

curl -X POST \
  "${SUPABASE_URL}/functions/v1/verify-sol-sell" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'

echo ""
echo "✅ Done! Check the response above for execution status."
echo ""
echo "💡 If no sell order was found, the transaction may need to be:"
echo "   1. Credited first (via detect-solana-deposits)"
echo "   2. Then a sell order created (via sell-sol function)"
echo "   3. Then executed on Luno (via execute-luno-sell)"







