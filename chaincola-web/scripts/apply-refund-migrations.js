const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(migrationFile) {
  try {
    console.log(`\n📋 Applying migration: ${migrationFile}\n`);
    
    const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute SQL using RPC call (if available) or direct query
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We'll need to use the Management API or provide instructions
    
    console.log('⚠️  Direct SQL execution via JS client is not supported.');
    console.log('📋 Please apply the migration using Supabase Dashboard:\n');
    console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
    console.log(`  2. Copy the SQL from: ${migrationPath}`);
    console.log('  3. Paste and click "Run"\n');
    
    return false;
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Admin Refund Feature Migrations\n');
  console.log('='.repeat(60));
  
  const migrations = [
    '20260127000002_add_refund_status_and_type.sql',
    '20260127000003_create_admin_refund_transaction_function.sql'
  ];
  
  for (const migration of migrations) {
    await applyMigration(migration);
  }
  
  console.log('\n✅ Migration instructions provided above.');
  console.log('📝 After applying migrations, the admin refund feature will be ready to use.\n');
}

main().catch(console.error);
