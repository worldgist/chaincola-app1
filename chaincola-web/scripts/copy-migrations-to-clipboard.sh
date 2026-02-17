#!/bin/bash

# Script to copy migration SQL to clipboard for easy pasting into Supabase Dashboard

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}📋 Copy Migration SQL to Clipboard${NC}"
echo ""

# Check if pbcopy is available (macOS)
if ! command -v pbcopy &> /dev/null; then
    echo -e "${YELLOW}⚠️  pbcopy not available. Please copy manually.${NC}"
    MANUAL_COPY=true
else
    MANUAL_COPY=false
fi

# Migrations to apply
MIGRATIONS=(
    "20260130000002_ensure_exact_ngn_credit_instant_sell.sql"
    "20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql"
)

DASHBOARD_URL="https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new"

for i in "${!MIGRATIONS[@]}"; do
    migration="${MIGRATIONS[$i]}"
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${YELLOW}⚠️  Migration file not found: $migration${NC}"
        continue
    fi
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Migration $((i+1))/${#MIGRATIONS[@]}: $migration${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ "$MANUAL_COPY" = false ]; then
        # Copy to clipboard
        cat "$MIGRATION_FILE" | pbcopy
        echo -e "${GREEN}✅ SQL copied to clipboard!${NC}"
    else
        echo -e "${YELLOW}📄 SQL content:${NC}"
        cat "$MIGRATION_FILE"
        echo ""
    fi
    
    echo ""
    echo -e "${BLUE}📌 Next steps:${NC}"
    echo "  1. Open: $DASHBOARD_URL"
    echo "  2. Paste the SQL (${GREEN}already in clipboard${NC} if on macOS)"
    echo "  3. Click 'Run' or press Cmd+Enter"
    echo ""
    
    if [ $i -lt $((${#MIGRATIONS[@]} - 1)) ]; then
        echo -e "${YELLOW}Press Enter to continue to next migration...${NC}"
        read -r
        echo ""
    fi
done

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All migrations ready to apply!${NC}"
echo ""
echo "After applying both migrations, verify they worked:"
echo ""
echo "  SELECT proname, obj_description(oid, 'pg_proc') as description"
echo "  FROM pg_proc"
echo "  WHERE proname IN ('instant_sell_crypto_v2', 'instant_sell_crypto');"
echo ""
