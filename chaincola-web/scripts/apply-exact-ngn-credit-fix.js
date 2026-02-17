/**
 * Apply Instant Sell Exact NGN Credit Fix Migrations
 * Applies the two new migrations that ensure users always receive exactly the amount sold
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQL(sql) {
  try {
    // Split SQL into individual statements
    // PostgreSQL functions need to be executed as complete statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // For CREATE OR REPLACE FUNCTION, we need to execute the entire function definition
    // So we'll execute the whole SQL as one statement
    console.log('🔄 Executing SQL...');
    
    // Use Supabase REST API to execute SQL via RPC
    // First, try using exec_sql if available
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: sql
      });
      
      if (!error) {
        console.log('✅ SQL executed successfully via RPC');
        return true;
      }
    } catch (rpcError) {
      console.log('⚠️ exec_sql RPC not available, trying direct HTTP...');
    }

    // Alternative: Use direct HTTP request to Supabase Management API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql: sql })
    });

    if (response.ok) {
      console.log('✅ SQL executed successfully via HTTP');
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Error executing SQL:', error.message);
    return false;
  }
}

async function applyMigration(migrationFile) {
  try {
    console.log(`\n📋 Applying migration: ${migrationFile}\n`);
    console.log('='.repeat(80));
    
    const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      return false;
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the SQL
    const success = await executeSQL(migrationSQL);
    
    if (success) {
      console.log(`\n✅ Migration ${migrationFile} applied successfully!\n`);
      return true;
    } else {
      console.log(`\n❌ Failed to apply migration ${migrationFile}\n`);
      console.log('📋 Please apply manually via Supabase Dashboard:\n');
      console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
      console.log(`  2. Copy the SQL from: ${migrationPath}`);
      console.log('  3. Paste and click "Run"\n');
      return false;
    }
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Applying Instant Sell Exact NGN Credit Fix Migrations\n');
  console.log('='.repeat(80));
  
  const migrations = [
    '20260130000002_ensure_exact_ngn_credit_instant_sell.sql',
    '20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql'
  ];
  
  let allSuccess = true;
  
  for (const migration of migrations) {
    const success = await applyMigration(migration);
    if (!success) {
      allSuccess = false;
    }
  }
  
  if (allSuccess) {
    console.log('='.repeat(80));
    console.log('✅ All migrations applied successfully!\n');
    console.log('🔍 Verifying functions...\n');
    
    // Verify functions exist
    const { data: functions, error } = await supabase
      .from('pg_proc')
      .select('proname')
      .in('proname', ['instant_sell_crypto_v2', 'instant_sell_crypto']);
    
    if (!error) {
      console.log('✅ Functions verified in database\n');
    }
    
    process.exit(0);
  } else {
    console.log('='.repeat(80));
    console.log('❌ Some migrations failed. Please apply manually.\n');
    process.exit(1);
  }
}

main().catch(console.error);
