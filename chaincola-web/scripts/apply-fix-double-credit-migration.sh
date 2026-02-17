#!/bin/bash

# Script to copy migration SQL to clipboard for manual application
# This migration fixes the double credit bug in buy crypto function

MIGRATION_FILE="/Applications/chaincola/chaincola-web/supabase/migrations/20260130000011_fix_double_credit_buy_crypto.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "📋 Copying migration SQL to clipboard..."
cat "$MIGRATION_FILE" | pbcopy

echo "✅ Migration SQL copied to clipboard!"
echo ""
echo "📝 Next steps:"
echo "1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/sql/new"
echo "2. Paste the SQL (Cmd+V)"
echo "3. Click 'Run' to apply the migration"
echo ""
echo "This migration will:"
echo "  - Drop and recreate instant_buy_crypto function"
echo "  - Fix double credit bug by using explicit UPDATE instead of INSERT ON CONFLICT"
echo "  - Add verification to prevent any credit during buy"
