/**
 * Apply the NGN balance calculation fix migration directly
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('\n📋 Applying migration: Fix instant_sell_crypto_v2 NGN balance calculation v2\n');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260130000001_fix_instant_sell_ngn_balance_calculation_v2.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🔄 Executing migration SQL...\n');
    
    // Use Supabase REST API to execute SQL via pg_query or exec_sql
    // First try exec_sql RPC if it exists
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: migrationSQL
      });
      
      if (error) {
        // If exec_sql doesn't exist, try direct HTTP request to REST API
        throw new Error('exec_sql RPC not available');
      }
      
      console.log('✅ Migration applied successfully via RPC!\n');
      return true;
    } catch (rpcError) {
      console.log('⚠️ RPC method not available, trying direct HTTP request...\n');
    }
    
    // Try direct HTTP request to Supabase REST API
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/pg_query`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: migrationSQL
        })
      });
      
      if (response.ok) {
        console.log('✅ Migration applied successfully via HTTP!\n');
        return true;
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (httpError) {
      console.log('⚠️ Direct HTTP method not available.\n');
      console.log('📋 Please apply the migration manually using Supabase Dashboard:\n');
      console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
      console.log(`  2. Copy the SQL from: ${migrationPath}`);
      console.log('  3. Paste and click "Run"\n');
      console.log('Or use psql if you have database access:\n');
      console.log(`  psql <connection_string> -f ${migrationPath}\n`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    return false;
  }
}

applyMigration()
  .then((success) => {
    if (success) {
      console.log('✅ Migration application completed successfully!');
    } else {
      console.log('⚠️ Migration needs to be applied manually.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
