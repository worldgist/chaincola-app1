/**
 * Apply the migration directly using Supabase RPC or direct SQL execution
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('\n📋 Applying migration: Fix instant_sell_crypto_v2\n');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260127000001_fix_instant_sell_update_all_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into statements (split by semicolon followed by newline or end of string)
    // But we need to be careful with function definitions that contain semicolons
    // For a function definition, we should execute it as one statement
    
    console.log('🔄 Executing migration SQL...\n');
    
    // Execute the entire SQL as one statement since it's a CREATE OR REPLACE FUNCTION
    // We'll use the REST API directly since Supabase JS client doesn't support raw SQL execution
    
    // Try using pg_query or exec_sql if available
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: migrationSQL
      });
      
      if (error) {
        throw error;
      }
      
      console.log('✅ Migration applied successfully!\n');
      return;
    } catch (rpcError) {
      // exec_sql might not exist, try alternative approach
      console.log('⚠️ exec_sql RPC not available, trying alternative method...\n');
    }
    
    // Alternative: Use Supabase Management API or direct HTTP request
    // Since we can't execute raw SQL via JS client, we'll provide instructions
    console.log('❌ Direct SQL execution via JavaScript client is not supported.\n');
    console.log('📋 Please apply the migration using Supabase Dashboard:\n');
    console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
    console.log(`  2. Copy the SQL from: ${migrationPath}`);
    console.log('  3. Paste and click "Run"\n');
    console.log('Or use psql if you have database access:\n');
    console.log(`  psql <connection_string> -f ${migrationPath}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

applyMigration();
