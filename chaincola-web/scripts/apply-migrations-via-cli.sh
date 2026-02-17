#!/bin/bash

# Apply migrations using Supabase CLI's internal connection
# This script uses supabase db push but only for specific migrations

set -e

PROJECT_REF="slleojsdpctxhlsoyenr"
MIGRATIONS_DIR="supabase/migrations"

echo "🚀 Applying Inventory Reconciliation Migrations"
echo "============================================================"
echo ""

# Create a temporary directory with only the new migrations
TEMP_MIGRATIONS_DIR=$(mktemp -d)
echo "📁 Created temporary migrations directory: ${TEMP_MIGRATIONS_DIR}"

# Copy only the new migrations
cp "${MIGRATIONS_DIR}/20260202000001_add_inventory_reconciliation_features.sql" "${TEMP_MIGRATIONS_DIR}/"
cp "${MIGRATIONS_DIR}/20260202000002_create_automated_reconciliation_cron.sql" "${TEMP_MIGRATIONS_DIR}/"

# Backup original migrations directory
ORIGINAL_MIGRATIONS="${MIGRATIONS_DIR}"
BACKUP_MIGRATIONS_DIR=$(mktemp -d)
echo "📦 Backing up original migrations..."
cp -r "${ORIGINAL_MIGRATIONS}"/* "${BACKUP_MIGRATIONS_DIR}/" 2>/dev/null || true

# Temporarily replace migrations directory
echo "🔄 Temporarily using only new migrations..."
mv "${ORIGINAL_MIGRATIONS}" "${ORIGINAL_MIGRATIONS}.backup"
mkdir -p "${ORIGINAL_MIGRATIONS}"
cp "${TEMP_MIGRATIONS_DIR}"/* "${ORIGINAL_MIGRATIONS}/"

# Apply migrations
echo ""
echo "📋 Applying migrations via Supabase CLI..."
echo ""

if supabase db push --yes 2>&1 | tee /tmp/migration-output.log; then
    echo ""
    echo "✅ Migrations applied successfully!"
    
    # Restore original migrations
    echo "🔄 Restoring original migrations directory..."
    rm -rf "${ORIGINAL_MIGRATIONS}"
    mv "${ORIGINAL_MIGRATIONS}.backup" "${ORIGINAL_MIGRATIONS}"
    
    # Cleanup
    rm -rf "${TEMP_MIGRATIONS_DIR}"
    rm -rf "${BACKUP_MIGRATIONS_DIR}"
    
    echo ""
    echo "✅ All done!"
else
    echo ""
    echo "❌ Migration failed. Check /tmp/migration-output.log for details"
    
    # Restore original migrations
    echo "🔄 Restoring original migrations directory..."
    rm -rf "${ORIGINAL_MIGRATIONS}"
    mv "${ORIGINAL_MIGRATIONS}.backup" "${ORIGINAL_MIGRATIONS}"
    
    # Cleanup
    rm -rf "${TEMP_MIGRATIONS_DIR}"
    rm -rf "${BACKUP_MIGRATIONS_DIR}"
    
    exit 1
fi
