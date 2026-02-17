#!/bin/bash

# Manual Ethereum Deposit Detection Trigger
# 
# This script manually triggers the detect-ethereum-deposits Edge Function
# to check for missed Ethereum deposits and credit user wallets.
# 
# Usage:
#   ./scripts/trigger-eth-deposit-detection.sh
# 
# Or with environment variables:
#   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/trigger-eth-deposit-detection.sh

set -e

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-https://slleojsdpctxhlsoyenr.supabase.co}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required"
  echo ""
  echo "Please set it in your .env.local file or export it:"
  echo "  export SUPABASE_SERVICE_ROLE_KEY=\"your-service-role-key\""
  echo ""
  echo "Or run with:"
  echo "  SUPABASE_SERVICE_ROLE_KEY=\"your-key\" ./scripts/trigger-eth-deposit-detection.sh"
  exit 1
fi

FUNCTION_URL="${SUPABASE_URL}/functions/v1/detect-ethereum-deposits"

echo "🔍 Triggering Ethereum deposit detection..."
echo "   Function URL: $FUNCTION_URL"
echo ""

# Make the request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}')

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (all but last line)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Error: HTTP $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

# Parse and display results
echo "✅ Detection completed"
echo ""

# Use jq if available, otherwise just show raw JSON
if command -v jq &> /dev/null; then
  echo "📊 Results:"
  echo "$BODY" | jq -r '
    if .success then
      "   Wallets checked: " + (.data.checked // 0 | tostring) + "\n" +
      "   Deposits found: " + (.data.depositsFound // 0 | tostring) + "\n" +
      "   Deposits credited: " + (.data.depositsCredited // 0 | tostring) + "\n" +
      "   Errors: " + ((.data.errors // []) | length | tostring)
    else
      "❌ Detection failed: " + (.error // "Unknown error")
    end
  '
  
  # Show balance discrepancies if any
  BALANCE_ISSUES=$(echo "$BODY" | jq -r '.data.balanceReconciliation // [] | length')
  if [ "$BALANCE_ISSUES" -gt 0 ]; then
    echo ""
    echo "⚠️  Balance Discrepancies Found:"
    echo "$BODY" | jq -r '.data.balanceReconciliation[] | 
      "   Address: \(.address[0:10])...\n" +
      "      On-chain: \(.onChainBalance | tostring) ETH\n" +
      "      Database: \(.databaseBalance | tostring) ETH\n" +
      "      Difference: \(.discrepancy | tostring) ETH"'
  fi
  
  # Show errors if any
  ERROR_COUNT=$(echo "$BODY" | jq -r '.data.errors // [] | length')
  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo ""
    echo "❌ Errors encountered:"
    echo "$BODY" | jq -r '.data.errors[] | "   - \(.)"'
  fi
else
  echo "📊 Results (raw JSON):"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
fi

echo ""
echo "✅ Detection process completed"










