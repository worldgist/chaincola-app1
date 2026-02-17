#!/bin/bash

# Deploy send-email Edge Function to Supabase
# 
# This script deploys the send-email Edge Function with PDF attachment support
# 
# Usage:
#   ./scripts/deploy-send-email.sh
# 
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in to Supabase CLI (supabase login)
#   - Project linked (supabase link --project-ref slleojsdpctxhlsoyenr)

set -e

echo "🚀 Deploying send-email Edge Function"
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
echo "📦 Deploying send-email function..."
echo ""

if supabase functions deploy send-email; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📋 Function URL:"
    echo "   https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/send-email"
    echo ""
    echo "📝 This function now supports:"
    echo "   - Sending emails with HTML content"
    echo "   - PDF attachments (base64 encoded)"
    echo "   - Resend and SendGrid email providers"
    echo ""
    echo "⚠️  Important: Make sure environment variables are set in Supabase Dashboard:"
    echo "   1. Go to Supabase Dashboard"
    echo "   2. Navigate to Edge Functions → send-email → Settings"
    echo "   3. Set environment variables:"
    echo "      - RESEND_API_KEY (or SENDGRID_API_KEY)"
    echo "      - FROM_EMAIL (default: noreply@chaincola.com)"
    echo "      - FROM_NAME (default: ChainCola)"
    echo "      - EMAIL_SERVICE (resend, sendgrid, or supabase)"
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
