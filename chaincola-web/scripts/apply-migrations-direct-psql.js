const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PASSWORD = 'Salifu114477@';
const PROJECT_REF = 'slleojsdpctxhlsoyenr';
const HOST = 'aws-1-eu-west-1.pooler.supabase.com';
const PORT = 5432;
const DATABASE = 'postgres';
const USERNAME = 'postgres.slleojsdpctxhlsoyenr';

const migrations = [
  '20260130000002_ensure_exact_ngn_credit_instant_sell.sql',
  '20260130000003_ensure_exact_ngn_credit_instant_sell_v1.sql'
];

const migrationsDir = path.join(__dirname, '../supabase/migrations');

console.log('🚀 Applying Instant Sell Exact NGN Credit Fix Migrations\n');
console.log('='.repeat(80) + '\n');

let successCount = 0;
let failCount = 0;

for (const migration of migrations) {
  const migrationPath = path.join(migrationsDir, migration);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migration}`);
    failCount++;
    continue;
  }

  console.log(`📋 Applying migration: ${migration}`);
  console.log('='.repeat(80));

  try {
    // Use PGPASSWORD environment variable and psql
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Write SQL to temp file to avoid shell escaping issues
    const tempFile = path.join(__dirname, `temp_${Date.now()}.sql`);
    fs.writeFileSync(tempFile, sql);
    
    try {
      // Try connection string format with URL-encoded password
      const passwordEncoded = encodeURIComponent(PASSWORD);
      const connectionString = `postgresql://${USERNAME}:${passwordEncoded}@${HOST}:${PORT}/${DATABASE}`;
      
      execSync(`psql "${connectionString}" -f "${tempFile}"`, {
        stdio: 'inherit',
        env: { ...process.env, PGPASSWORD: PASSWORD }
      });
      
      console.log(`✅ Successfully applied: ${migration}\n`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to apply ${migration}:`, error.message);
      failCount++;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing ${migration}:`, error.message);
    failCount++;
  }
  
  console.log('');
}

console.log('='.repeat(80));
if (failCount === 0) {
  console.log('✅ All migrations applied successfully!\n');
  console.log('The instant sell functions have been updated to:');
  console.log('  - Use SELECT FOR UPDATE to prevent race conditions');
  console.log('  - Credit EXACTLY (amount * rate * (1 - fee)) in NGN');
  console.log('  - Update all wallet tables consistently\n');
  process.exit(0);
} else {
  console.log(`❌ Some migrations failed (${failCount} failed, ${successCount} succeeded)\n`);
  console.log('Please apply failed migrations manually via Supabase Dashboard:');
  console.log('  https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new\n');
  process.exit(1);
}
