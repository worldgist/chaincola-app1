/**
 * Apply migration via Supabase REST API
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function applyMigration() {
  try {
    console.log('\n📋 Applying migration via Supabase REST API...\n');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260127000001_fix_instant_sell_update_all_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Use Supabase REST API to execute SQL
    // Note: Supabase doesn't expose a direct SQL execution endpoint via REST API
    // We need to use the Management API or SQL Editor
    
    // Try using the REST API with rpc call
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        sql: migrationSQL
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️ REST API method not available\n');
      console.log('📋 Please apply the migration manually:\n');
      console.log('Option 1: Supabase Dashboard (Recommended)');
      console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
      console.log(`  2. Copy the SQL from: ${migrationPath}`);
      console.log('  3. Paste and click "Run"\n');
      
      console.log('Option 2: Use psql (if you have database access)');
      console.log(`  psql <connection_string> -f ${migrationPath}\n`);
      
      return;
    }
    
    const result = await response.json();
    console.log('✅ Migration applied successfully!\n');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply the migration manually:\n');
    console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
    console.log('  2. Copy the SQL from the migration file');
    console.log('  3. Paste and click "Run"\n');
  }
}

applyMigration();
