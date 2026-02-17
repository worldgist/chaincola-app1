#!/bin/bash

# Script to open migration files for easy copying to Supabase Dashboard

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

echo "🚀 Opening migration files for copying..."
echo ""
echo "📋 Migration 1: instant_sell_crypto_v2 fix"
echo "   File: 20260130000002_ensure_exact_ngn_credit_instant_sell.sql"
echo ""
cat "$MIGRATIONS_DIR/20260130000002_ensure_exact_ngn_credit_instant_sell.sql" | pbcopy
echo "✅ Migration 1 copied to clipboard!"
echo ""
echo "👉 Now:"
echo "   1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new"
echo "   2. Paste (Cmd+V) and click 'Run'"
echo ""
read -p "Press Enter after you've applied migration 1..."

echo ""
echo "📋 Migration 2: instant_sell_crypto (v1) fix"
echo "   File: 20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql"
echo ""
cat "$MIGRATIONS_DIR/20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql" | pbcopy
echo "✅ Migration 2 copied to clipboard!"
echo ""
echo "👉 Now:"
echo "   1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new"
echo "   2. Paste (Cmd+V) and click 'Run'"
echo ""
read -p "Press Enter after you've applied migration 2..."

echo ""
echo "✅ Both migrations should now be applied!"
echo ""
echo "To verify, run this SQL in the Dashboard:"
echo ""
echo "SELECT proname, obj_description(oid, 'pg_proc') as description"
echo "FROM pg_proc"
echo "WHERE proname IN ('instant_sell_crypto_v2', 'instant_sell_crypto');"
