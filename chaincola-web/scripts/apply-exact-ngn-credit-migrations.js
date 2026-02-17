/**
 * Apply Instant Sell Exact NGN Credit Fix Migrations
 * Uses Supabase REST API to execute SQL migrations
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    
    console.log('🔄 Executing SQL via Supabase REST API...\n');
    
    // Split SQL into statements (functions contain semicolons, so we need to be careful)
    // For CREATE OR REPLACE FUNCTION, we execute the entire block as one statement
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let dollarQuoteTag = null;
    
    for (let i = 0; i < migrationSQL.length; i++) {
      const char = migrationSQL[i];
      const nextChars = migrationSQL.substring(i, Math.min(i + 20, migrationSQL.length));
      
      // Check for function start
      if (!inFunction && /CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(nextChars)) {
        inFunction = true;
        currentStatement += char;
        continue;
      }
      
      // Check for dollar quoting
      if (inFunction && char === '$') {
        const match = migrationSQL.substring(i).match(/^\$([^$]*)\$/);
        if (match) {
          if (dollarQuoteTag === null) {
            dollarQuoteTag = match[0];
            currentStatement += match[0];
            i += match[0].length - 1;
          } else if (migrationSQL.substring(i).startsWith(dollarQuoteTag)) {
            currentStatement += dollarQuoteTag;
            i += dollarQuoteTag.length - 1;
            dollarQuoteTag = null;
            if (/END\s*;\s*$$/i.test(migrationSQL.substring(i))) {
              // End of function
              const endMatch = migrationSQL.substring(i).match(/END\s*;\s*\$\$/);
              if (endMatch) {
                currentStatement += endMatch[0];
                i += endMatch[0].length - 1;
                statements.push(currentStatement.trim());
                currentStatement = '';
                inFunction = false;
                dollarQuoteTag = null;
              }
            }
          } else {
            currentStatement += char;
          }
          continue;
        }
      }
      
      // Check for function end
      if (inFunction && dollarQuoteTag === null && /^END\s*;?\s*$/i.test(migrationSQL.substring(i).split('\n')[0])) {
        currentStatement += migrationSQL.substring(i).split('\n')[0];
        i += migrationSQL.substring(i).split('\n')[0].length - 1;
        statements.push(currentStatement.trim());
        currentStatement = '';
        inFunction = false;
        continue;
      }
      
      // Regular statement handling
      if (!inFunction && char === ';' && currentStatement.trim()) {
        const trimmed = currentStatement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          statements.push(trimmed);
        }
        currentStatement = '';
      } else {
        currentStatement += char;
      }
    }
    
    // Add remaining statement
    if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
      statements.push(currentStatement.trim());
    }
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.trim().length === 0 || statement.trim().startsWith('--')) {
        continue;
      }
      
      try {
        // Use Supabase REST API to execute SQL
        // Note: Supabase doesn't expose direct SQL execution via REST API
        // We'll use the Management API approach via HTTP request
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            sql: statement
          })
        });
        
        if (!response.ok) {
          // Try alternative: execute via pg_query if available
          const altResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/pg_query`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: statement
            })
          });
          
          if (!altResponse.ok) {
            // If both fail, we need to use Supabase CLI or manual application
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }
        }
      } catch (error) {
        // If REST API methods don't work, we'll provide manual instructions
        console.log('⚠️  Direct SQL execution via REST API not available.');
        console.log('📋 Please apply the migration manually:\n');
        console.log('Option 1: Supabase Dashboard (Recommended)');
        console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
        console.log(`  2. Copy the SQL from: ${migrationPath}`);
        console.log('  3. Paste and click "Run"\n');
        
        console.log('Option 2: Use Supabase CLI');
        console.log(`  cd /Applications/chaincola/chaincola-web`);
        console.log(`  supabase db execute --file supabase/migrations/${migrationFile}\n`);
        
        return false;
      }
    }
    
    console.log('✅ Migration applied successfully!\n');
    return true;
    
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    console.log('\n📋 Please apply manually via Supabase Dashboard:\n');
    console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
    console.log(`  2. Copy the SQL from: ${path.join(__dirname, '../supabase/migrations', migrationFile)}`);
    console.log('  3. Paste and click "Run"\n');
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
  
  const results = [];
  
  for (const migration of migrations) {
    const success = await applyMigration(migration);
    results.push({ migration, success });
  }
  
  console.log('='.repeat(80));
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Some migrations failed. Please apply manually.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All migrations applied successfully!\n');
    process.exit(0);
  }
}

main().catch(console.error);
