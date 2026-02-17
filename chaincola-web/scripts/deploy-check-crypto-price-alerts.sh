#!/bin/bash

# Deploy check-crypto-price-alerts Edge Function to Supabase
# 
# This script deploys the check-crypto-price-alerts Edge Function
# 
# Usage:
#   ./scripts/deploy-check-crypto-price-alerts.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)
#   - ALCHEMY_API_KEY environment variable set in Supabase Dashboard

set -e

echo "🚀 Deploying check-crypto-price-alerts Edge Function"
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
echo "📦 Deploying check-crypto-price-alerts function..."
echo ""

if supabase functions deploy check-crypto-price-alerts; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📋 Function URL:"
    echo "   https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/check-crypto-price-alerts"
    echo ""
    echo "⚠️  Important: Make sure to set environment variables in Supabase Dashboard:"
    echo "   1. Go to Supabase Dashboard"
    echo "   2. Navigate to Edge Functions → check-crypto-price-alerts → Settings"
    echo "   3. Add environment variable: ALCHEMY_API_KEY = your-alchemy-api-key"
    echo ""
    echo "📝 The cron job will automatically call this function every 3 minutes"
    echo "   Make sure the migration 20260204000003_create_crypto_price_alerts_cron.sql is applied"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    echo ""
    echo "Make sure you're logged in:"
    echo "  supabase login"
    exit 1
fi
