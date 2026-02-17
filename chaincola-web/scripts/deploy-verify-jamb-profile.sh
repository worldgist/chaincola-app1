#!/bin/bash

# Deploy verify-jamb-profile Edge Function to Supabase
# 
# This script deploys the verify-jamb-profile Edge Function
# 
# Usage:
#   ./scripts/deploy-verify-jamb-profile.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)
#   - VTU_AFRICA_API_KEY environment variable set in Supabase Dashboard

set -e

echo "🚀 Deploying verify-jamb-profile Edge Function"
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
echo "📦 Deploying verify-jamb-profile function..."
echo ""

if supabase functions deploy verify-jamb-profile; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "⚠️  Important: Make sure to set the VTU_AFRICA_API_KEY environment variable:"
    echo "   1. Go to Supabase Dashboard"
    echo "   2. Navigate to Edge Functions → verify-jamb-profile → Settings"
    echo "   3. Add environment variable: VTU_AFRICA_API_KEY = your-api-key"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi
