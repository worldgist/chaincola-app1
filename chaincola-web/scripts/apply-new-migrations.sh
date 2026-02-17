#!/bin/bash

# Script to apply only the new inventory reconciliation migrations
# Uses Supabase CLI to get connection string and applies migrations via psql

set -e

PROJECT_REF="slleojsdpctxhlsoyenr"
MIGRATIONS_DIR="supabase/migrations"

echo "🚀 Applying new inventory reconciliation migrations..."
echo ""

# Get database connection string from Supabase CLI
echo "📡 Getting database connection details..."
DB_URL=$(supabase db dump --db-url 2>/dev/null || echo "")

if [ -z "$DB_URL" ]; then
    echo "⚠️  Could not get database URL automatically."
    echo "📋 Please apply migrations manually via Supabase Dashboard:"
    echo "   https://app.supabase.com/project/${PROJECT_REF}/sql/new"
    echo ""
    echo "Or use psql directly:"
    echo "   psql <your-connection-string> -f ${MIGRATIONS_DIR}/20260202000001_add_inventory_reconciliation_features.sql"
    echo "   psql <your-connection-string> -f ${MIGRATIONS_DIR}/20260202000002_create_automated_reconciliation_cron.sql"
    exit 1
fi

# Apply first migration
echo "📋 Applying migration: 20260202000001_add_inventory_reconciliation_features.sql"
if psql "$DB_URL" -f "${MIGRATIONS_DIR}/20260202000001_add_inventory_reconciliation_features.sql"; then
    echo "✅ Migration 1 applied successfully"
else
    echo "❌ Failed to apply migration 1"
    exit 1
fi

echo ""

# Apply second migration
echo "📋 Applying migration: 20260202000002_create_automated_reconciliation_cron.sql"
if psql "$DB_URL" -f "${MIGRATIONS_DIR}/20260202000002_create_automated_reconciliation_cron.sql"; then
    echo "✅ Migration 2 applied successfully"
else
    echo "❌ Failed to apply migration 2"
    exit 1
fi

echo ""
echo "✅ All migrations applied successfully!"
