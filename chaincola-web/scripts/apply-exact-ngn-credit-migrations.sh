#!/bin/bash

# Script to apply instant sell exact NGN credit fix migrations
# This script uses psql to apply the migrations directly

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Applying Instant Sell Exact NGN Credit Fix Migrations${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql is not installed or not in PATH${NC}"
    echo "Please install PostgreSQL client tools or use Supabase Dashboard instead."
    exit 1
fi

# Check for database connection string
# Try to get it from environment or Supabase config
DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL}}"

if [ -z "$DB_URL" ]; then
    # Try to construct from Supabase project ref
    PROJECT_REF="slleojsdpctxhlsoyenr"
    
    echo -e "${YELLOW}⚠️  Database connection string not found in environment${NC}"
    echo ""
    echo "Please provide the database connection string in one of these ways:"
    echo ""
    echo "Option 1: Set environment variable:"
    echo "  export DATABASE_URL='postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'"
    echo ""
    echo "Option 2: Get connection string from Supabase Dashboard:"
    echo "  1. Go to: https://app.supabase.com/project/$PROJECT_REF/settings/database"
    echo "  2. Copy the 'Connection string' under 'Connection pooling'"
    echo "  3. Export it: export DATABASE_URL='[connection-string]'"
    echo ""
    echo "Option 3: Apply migrations manually via Supabase Dashboard:"
    echo "  1. Go to: https://app.supabase.com/project/$PROJECT_REF/sql/new"
    echo "  2. Copy and paste the SQL from each migration file"
    echo ""
    exit 1
fi

# Migrations to apply
MIGRATIONS=(
    "20260130000002_ensure_exact_ngn_credit_instant_sell.sql"
    "20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${RED}❌ Migration file not found: $migration${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi
    
    echo -e "${GREEN}📋 Applying migration: $migration${NC}"
    echo "================================================================================"
    
    # Apply migration using psql
    if psql "$DB_URL" -f "$MIGRATION_FILE" 2>&1; then
        echo -e "${GREEN}✅ Successfully applied: $migration${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}❌ Failed to apply: $migration${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    echo ""
done

echo "================================================================================"
if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ All migrations applied successfully!${NC}"
    echo ""
    echo "The instant sell functions have been updated to:"
    echo "  - Use SELECT FOR UPDATE to prevent race conditions"
    echo "  - Credit EXACTLY (amount * rate * (1 - fee)) in NGN"
    echo "  - Update all wallet tables consistently"
    exit 0
else
    echo -e "${RED}❌ Some migrations failed ($FAIL_COUNT failed, $SUCCESS_COUNT succeeded)${NC}"
    echo ""
    echo "Please apply failed migrations manually via Supabase Dashboard:"
    echo "  https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new"
    exit 1
fi
