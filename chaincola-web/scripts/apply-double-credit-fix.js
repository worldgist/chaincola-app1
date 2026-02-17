/**
 * Apply Fix Double Credit Buy Crypto Migration
 * Uses Supabase service role key to execute SQL directly
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  try {
    console.log('🔧 Applying Migration: Fix Double Credit Buy Crypto\n');
    console.log('='.repeat(60));
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260130000011_fix_double_credit_buy_crypto.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      return;
    }
    
    console.log('📋 Reading migration file...');
    let migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log(`   File: ${migrationPath}`);
    console.log(`   Size: ${migrationSQL.length} characters\n`);
    
    // Clean up SQL: Remove any shell commands or non-SQL content
    // Remove lines that look like shell commands (start with common shell patterns)
    migrationSQL = migrationSQL
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Filter out shell commands and command prompts
        return !trimmed.match(/^(netpay|cd |node |npm |yarn |% |\$ |# |&&|exec|\.\/)/) &&
               !trimmed.match(/^@.*%/) && // Command prompts like "user@host %"
               !trimmed.match(/^\^/); // Continuation characters
      })
      .join('\n')
      .trim();
    
    // Remove any trailing non-SQL content
    const sqlEndMarker = migrationSQL.lastIndexOf(';');
    if (sqlEndMarker > 0) {
      // Keep everything up to the last semicolon, plus any trailing comments
      const lastSemicolon = migrationSQL.lastIndexOf(';');
      const afterSemicolon = migrationSQL.substring(lastSemicolon + 1).trim();
      // If there's content after the last semicolon that's not a comment, remove it
      if (afterSemicolon && !afterSemicolon.startsWith('--')) {
        migrationSQL = migrationSQL.substring(0, lastSemicolon + 1);
      }
    }
    
    console.log('🔄 Executing migration SQL...\n');
    
    // Execute SQL using Supabase REST API
    // Note: We'll use the REST API with the service role key
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        sql: migrationSQL
      })
    });
    
    if (!response.ok) {
      // If exec_sql doesn't exist, try using pg_query or direct execution
      console.log('⚠️  exec_sql RPC not available, trying alternative method...\n');
      
      // Alternative: Use the Supabase Management API or execute via psql
      console.log('📋 Migration SQL prepared. Applying via Supabase Dashboard...\n');
      console.log('='.repeat(60));
      console.log('Please apply manually:\n');
      console.log('1. Go to: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/sql/new');
      console.log('2. Copy the SQL below and paste it');
      console.log('3. Click "Run"\n');
      console.log('='.repeat(60));
      console.log('\nSQL to apply:\n');
      console.log(migrationSQL);
      console.log('\n' + '='.repeat(60));
      return;
    }
    
    const result = await response.json();
    console.log('✅ Migration applied successfully!');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Fallback: Show instructions
    console.log('\n📋 Please apply manually via Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/sql/new');
    console.log('2. Copy the SQL from: supabase/migrations/20260130000011_fix_double_credit_buy_crypto.sql');
    console.log('3. Paste and click "Run"\n');
  }
}

applyMigration().catch(console.error);
