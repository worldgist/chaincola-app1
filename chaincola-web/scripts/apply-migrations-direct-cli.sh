#!/bin/bash

# Script to apply inventory reconciliation migrations using psql
# Uses direct database connection with password

set -e

PROJECT_REF="slleojsdpctxhlsoyenr"
DB_PASSWORD="Salifu114477@"
# Use direct database connection instead of pooler for migrations
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

# Export password for psql
export PGPASSWORD="${DB_PASSWORD}"

# Construct connection string (URL-encode password if needed)
# Note: @ in password needs to be URL-encoded as %40
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD//@/%40}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

MIGRATIONS_DIR="supabase/migrations"

echo "🚀 Applying Inventory Reconciliation Migrations"
echo "============================================================"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed or not in PATH"
    echo "Please install PostgreSQL client tools:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    exit 1
fi

# Apply first migration
echo "📋 Applying migration: 20260202000001_add_inventory_reconciliation_features.sql"
echo ""

if psql "$DB_URL" -f "${MIGRATIONS_DIR}/20260202000001_add_inventory_reconciliation_features.sql" -v ON_ERROR_STOP=1; then
    echo ""
    echo "✅ Migration 1 applied successfully"
else
    echo ""
    echo "❌ Failed to apply migration 1"
    exit 1
fi

echo ""
echo "============================================================"
echo ""

# Apply second migration
echo "📋 Applying migration: 20260202000002_create_automated_reconciliation_cron.sql"
echo ""

if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/20260202000002_create_automated_reconciliation_cron.sql" -v ON_ERROR_STOP=1; then
    echo ""
    echo "✅ Migration 2 applied successfully"
else
    echo ""
    echo "❌ Failed to apply migration 2"
    exit 1
fi

echo ""
echo "============================================================"
echo "✅ All migrations applied successfully!"
echo ""
