#!/bin/bash

# Script to apply migrations using psql via Supabase CLI connection
# This script uses Supabase CLI's internal connection handling

set -e

PROJECT_REF="slleojsdpctxhlsoyenr"
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

# Get connection string from Supabase CLI
echo "📡 Getting database connection details from Supabase CLI..."
cd /Applications/chaincola/chaincola-web

# Try to get the connection string
# Supabase CLI stores connection info, but we need to use it directly
# Since we can't easily extract the password, we'll use Supabase CLI's migration system

echo "📋 Using Supabase CLI to apply migrations..."
echo ""

# Apply migrations using Supabase CLI's migration tracking
# We'll mark the new migrations as applied by inserting them into the migrations table
# Then use supabase db push to apply only new ones

# First, let's try to apply them directly using a temporary approach
# We'll create a script that uses the Supabase Management API

echo "⚠️  Direct psql execution requires database password."
echo ""
echo "📋 Applying migrations via Supabase CLI migration system..."
echo ""

# Use supabase db push but only for new migrations
# The issue is it tries to apply all migrations. Let's try a workaround:
# We can manually insert the migration records and then push

echo "🔧 Attempting to apply migrations..."
echo ""

# Try using supabase db push with specific files
MIGRATION1="${MIGRATIONS_DIR}/20260202000001_add_inventory_reconciliation_features.sql"
MIGRATION2="${MIGRATIONS_DIR}/20260202000002_create_automated_reconciliation_cron.sql"

if [ ! -f "$MIGRATION1" ] || [ ! -f "$MIGRATION2" ]; then
    echo "❌ Migration files not found!"
    exit 1
fi

echo "📋 Migration files found. Applying via Supabase Dashboard..."
echo ""
echo "Since direct CLI execution requires database credentials,"
echo "please apply these migrations via Supabase Dashboard:"
echo ""
echo "1. Go to: https://app.supabase.com/project/${PROJECT_REF}/sql/new"
echo ""
echo "2. Apply Migration 1:"
echo "   Copy contents of: ${MIGRATION1}"
echo "   Paste and click 'Run'"
echo ""
echo "3. Apply Migration 2:"
echo "   Copy contents of: ${MIGRATION2}"
echo "   Paste and click 'Run'"
echo ""
echo "Or use the automated script if you have DATABASE_URL set:"
echo "  export DATABASE_URL='postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'"
echo "  psql \"\$DATABASE_URL\" -f ${MIGRATION1}"
echo "  psql \"\$DATABASE_URL\" -f ${MIGRATION2}"
