#!/bin/bash
# Copy instant buy fix migration SQL to clipboard for manual application

MIGRATION_FILE="supabase/migrations/20260130000004_ensure_exact_ngn_debit_instant_buy.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

cat "$MIGRATION_FILE" | pbcopy
echo "✅ Migration SQL copied to clipboard!"
echo ""
echo "📋 Next steps:"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Paste the SQL (Cmd+V)"
echo "3. Click 'Run' to apply the migration"
echo ""
echo "⚠️  This fixes a CRITICAL bug where users were incorrectly credited NGN"
echo "   instead of being debited when buying crypto."
