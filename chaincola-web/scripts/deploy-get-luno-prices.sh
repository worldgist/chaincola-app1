#!/bin/bash

# Deploy get-luno-prices Edge Function to Supabase
# 
# This script deploys the get-luno-prices Edge Function
# 
# Usage:
#   ./scripts/deploy-get-luno-prices.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)
#   - Project linked (supabase link --project-ref slleojsdpctxhlsoyenr)

set -e

echo "🚀 Deploying get-luno-prices Edge Function"
echo "============================================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo ""
    echo "Please install it:"
    echo "  npm install -g supabase"
    exit 1
fi

# Navigate to the project root
cd "$(dirname "$0")/.."

# Deploy the function
echo "📦 Deploying get-luno-prices function..."
echo ""

if supabase functions deploy get-luno-prices; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📋 Function URL:"
    echo "   https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/get-luno-prices"
    echo ""
    echo "📝 This function now supports:"
    echo "   - BTC, ETH, SOL, USDT, USDC, XRP"
    echo "   - All prices fetched from Luno API"
    echo "   - Admin price engine rates take priority"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    echo ""
    echo "Make sure you're logged in and linked:"
    echo "  supabase login"
    echo "  supabase link --project-ref slleojsdpctxhlsoyenr"
    exit 1
fi
