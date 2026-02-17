#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read migration files
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const migration1 = fs.readFileSync(
  path.join(migrationsDir, '20260127000002_add_refund_status_and_type.sql'),
  'utf8'
);

const migration2 = fs.readFileSync(
  path.join(migrationsDir, '20260127000003_create_admin_refund_transaction_function.sql'),
  'utf8'
);

console.log('='.repeat(80));
console.log('📋 ADMIN REFUND FEATURE MIGRATIONS');
console.log('='.repeat(80));
console.log('\n⚠️  These migrations need to be applied manually via Supabase Dashboard.\n');
console.log('📝 Instructions:');
console.log('   1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
console.log('   2. Copy and paste the SQL below');
console.log('   3. Click "Run"\n');
console.log('='.repeat(80));
console.log('\n🔹 MIGRATION 1: Add REFUNDED Status and REFUND Transaction Type\n');
console.log(migration1);
console.log('\n' + '='.repeat(80));
console.log('\n🔹 MIGRATION 2: Create Admin Refund Transaction Function\n');
console.log(migration2);
console.log('\n' + '='.repeat(80));
console.log('\n✅ After applying both migrations, the admin refund feature will be ready!\n');
