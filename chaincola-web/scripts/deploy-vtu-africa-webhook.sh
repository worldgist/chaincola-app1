#!/bin/bash

# Deploy vtu-africa-webhook Edge Function to Supabase
# 
# This script deploys the vtu-africa-webhook Edge Function
# 
# Usage:
#   ./scripts/deploy-vtu-africa-webhook.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)

set -e

echo "🚀 Deploying vtu-africa-webhook Edge Function"
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
echo "📦 Deploying vtu-africa-webhook function..."
echo ""

if supabase functions deploy vtu-africa-webhook; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📋 Webhook URL:"
    echo "   https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/vtu-africa-webhook"
    echo ""
    echo "⚠️  Configure this URL in VTU Africa Dashboard:"
    echo "   1. Log in to VTU Africa Portal"
    echo "   2. Go to Settings → Webhooks"
    echo "   3. Add webhook URL: https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/vtu-africa-webhook"
    echo "   4. Select events: Transaction Status Updates"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi
