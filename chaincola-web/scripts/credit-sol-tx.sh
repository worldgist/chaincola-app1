#!/bin/bash

# Credit SOL deposit manually
# Transaction: 5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB
# Amount: 0.015318545 SOL
# Address: FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://slleojsdpctxhlsoyenr.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ Please set SUPABASE_SERVICE_ROLE_KEY environment variable"
  exit 1
fi

echo "🔄 Crediting SOL deposit..."
echo "Transaction Hash: 5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB"
echo "Amount: 0.015318545 SOL"
echo "Address: FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe"
echo ""

curl -X POST \
  "${SUPABASE_URL}/functions/v1/manual-credit-sol-deposit" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_hash": "5RqgS76AUTKRFsCtviUHzmfn2xeevnhpW9qbEEpoP6RRFEdrMSZtURA2AjTVTcdAEC7pRQCwNTrk4Brj7GiNztQB",
    "to_address": "FA548pHbCqJSXsB8tiuXdm8oJfQAzQsggMWFPrAj6UMe",
    "sol_amount": 0.015318545,
    "timestamp": "2026-01-05T19:17:45+01:00"
  }' | jq '.'

echo ""
echo "✅ Done!"

