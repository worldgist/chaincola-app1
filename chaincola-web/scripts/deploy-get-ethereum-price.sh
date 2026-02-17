#!/bin/bash

# Deploy get-ethereum-price Edge Function to Supabase
# 
# This script deploys the get-ethereum-price Edge Function
# 
# Usage:
#   ./scripts/deploy-get-ethereum-price.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)
#   - ALCHEMY_API_KEY environment variable set in Supabase Dashboard

set -e

echo "🚀 Deploying get-ethereum-price Edge Function"
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
echo "📦 Deploying get-ethereum-price function..."
echo ""

if supabase functions deploy get-ethereum-price; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📋 Function URL:"
    echo "   https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/get-ethereum-price"
    echo ""
    echo "⚠️  Important: Make sure to set environment variables in Supabase Dashboard:"
    echo "   1. Go to Supabase Dashboard"
    echo "   2. Navigate to Edge Functions → get-ethereum-price → Settings"
    echo "   3. Add environment variable: ALCHEMY_API_KEY = your-alchemy-api-key"
    echo "      (or ALCHEMY_ETHEREUM_API_KEY if using a specific key)"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    echo ""
    echo "Make sure you're logged in:"
    echo "  supabase login"
    exit 1
fi
