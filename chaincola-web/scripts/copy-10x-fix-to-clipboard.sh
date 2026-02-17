#!/bin/bash
# Copy the 10x bug fix migration SQL to clipboard for manual application

MIGRATION_FILE="supabase/migrations/20260130000009_fix_10x_bug_buy_sell_crypto.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Copy file contents to clipboard (macOS)
if command -v pbcopy &> /dev/null; then
    cat "$MIGRATION_FILE" | pbcopy
    echo "✅ SQL copied to clipboard!"
    echo "📋 Now paste it into Supabase Dashboard SQL Editor"
elif command -v xclip &> /dev/null; then
    cat "$MIGRATION_FILE" | xclip -selection clipboard
    echo "✅ SQL copied to clipboard!"
    echo "📋 Now paste it into Supabase Dashboard SQL Editor"
else
    echo "⚠️  Clipboard tool not found. Please copy the file manually:"
    echo "   File: $MIGRATION_FILE"
fi
