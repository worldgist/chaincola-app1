/**
 * Apply the migration to fix instant_sell_crypto_v2 function
 * This updates the function to sync balances across all wallet tables
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
    console.log('\n📋 Applying migration: Fix instant_sell_crypto_v2 to update all wallet tables\n');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260127000001_fix_instant_sell_update_all_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Migration file loaded\n');
    
    // Execute the migration SQL
    console.log('🔄 Executing migration...\n');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });
    
    // If exec_sql doesn't exist, try direct query
    if (error && error.message.includes('exec_sql')) {
      console.log('⚠️ exec_sql function not found, trying direct execution...\n');
      
      // Split SQL into individual statements and execute them
      // Note: This is a workaround - ideally use Supabase CLI or Dashboard
      console.log('❌ Direct SQL execution via RPC is not available.');
      console.log('\n📋 Please apply this migration using one of these methods:\n');
      console.log('Option 1: Supabase Dashboard');
      console.log('  1. Go to https://app.supabase.com');
      console.log('  2. Select your project');
      console.log('  3. Go to SQL Editor');
      console.log(`  4. Copy and paste the contents of: ${migrationPath}`);
      console.log('  5. Click "Run"\n');
      
      console.log('Option 2: Supabase CLI');
      console.log('  1. Install: npm install -g supabase');
      console.log('  2. Link: supabase link --project-ref slleojsdpctxhlsoyenr');
      console.log('  3. Push: supabase db push\n');
      
      console.log('Option 3: Using psql (if you have database access)');
      console.log(`  psql -h <host> -U <user> -d <database> -f ${migrationPath}\n`);
      
      return;
    }
    
    if (error) {
      console.error('❌ Migration error:', error);
      return;
    }
    
    console.log('✅ Migration applied successfully!\n');
    console.log('📊 The instant_sell_crypto_v2 function now updates:');
    console.log('   - user_wallets table');
    console.log('   - wallet_balances table');
    console.log('   - wallets table');
    console.log('\n✅ Future instant sells will credit NGN to all tables correctly.\n');
    
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.error(error);
  }
}

// Alternative: Execute SQL directly using raw query
async function applyMigrationDirect() {
  try {
    console.log('\n📋 Applying migration directly via SQL...\n');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260127000001_fix_instant_sell_update_all_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Use the REST API to execute SQL
    // Note: Supabase doesn't expose direct SQL execution via JS client for security
    // We'll need to use the Management API or provide instructions
    
    console.log('⚠️ Direct SQL execution via JavaScript client is not supported for security reasons.\n');
    console.log('📋 Please apply the migration using Supabase Dashboard:\n');
    console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
    console.log(`  2. Copy the SQL from: ${migrationPath}`);
    console.log('  3. Paste and click "Run"\n');
    
    console.log('Or use Supabase CLI:\n');
    console.log('  cd chaincola-web');
    console.log('  supabase db push\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Show migration SQL for manual execution
async function showMigrationSQL() {
  try {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260127000001_fix_instant_sell_update_all_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('\n📋 Migration SQL:\n');
    console.log('='.repeat(70));
    console.log(migrationSQL);
    console.log('='.repeat(70));
    console.log('\n📝 Copy the SQL above and run it in Supabase Dashboard SQL Editor\n');
    
  } catch (error) {
    console.error('❌ Error reading migration file:', error.message);
  }
}

// Run
const command = process.argv[2] || 'show';

if (command === 'show') {
  showMigrationSQL();
} else if (command === 'apply') {
  applyMigration();
} else {
  console.log('Usage: node apply-instant-sell-fix-migration.js [show|apply]');
  console.log('  show  - Display the migration SQL (default)');
  console.log('  apply - Attempt to apply migration (may require manual steps)');
  showMigrationSQL();
}
