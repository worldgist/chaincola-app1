#!/usr/bin/env node

/**
 * Apply Inventory Reconciliation Migrations via Supabase Management API
 * Uses Supabase CLI connection and service role key
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MIGRATIONS = [
  '20260202000001_add_inventory_reconciliation_features.sql',
  '20260202000002_create_automated_reconciliation_cron.sql'
];

async function applyMigration(migrationFile) {
  try {
    console.log(`\n📋 Applying migration: ${migrationFile}\n`);
    
    const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      return false;
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into individual statements (handling functions and DO blocks)
    const statements = splitSQLStatements(migrationSQL);
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      
      if (!statement || statement.length === 0) {
        continue;
      }
      
      // Skip comments
      if (statement.startsWith('--') || statement.startsWith('/*')) {
        continue;
      }
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // Use Supabase REST API to execute SQL
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            sql: statement
          })
        });
        
        if (!response.ok) {
          // Try alternative: Use pg_query or direct execution
          console.log(`⚠️ REST API method not available, trying alternative...`);
          
          // Use Supabase JS client's RPC if exec_sql exists
          const { data, error } = await supabase.rpc('exec_sql', {
            sql: statement
          });
          
          if (error) {
            // Last resort: Use Management API
            console.log(`⚠️ RPC method not available, using Management API...`);
            
            // Execute via Management API (requires different endpoint)
            const mgmtResponse = await fetch(`${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}/rest/v1/`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                query: statement
              })
            });
            
            if (!mgmtResponse.ok) {
              throw new Error(`Failed to execute SQL: ${await mgmtResponse.text()}`);
            }
          }
        } else {
          const result = await response.json();
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (error) {
        // If exec_sql doesn't exist, we need to use psql or Supabase Dashboard
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        console.log(`\n⚠️  Direct SQL execution via JavaScript is not fully supported.`);
        console.log(`📋 Please apply the migration using Supabase Dashboard:\n`);
        console.log(`  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new`);
        console.log(`  2. Copy the SQL from: ${migrationPath}`);
        console.log(`  3. Paste and click "Run"\n`);
        return false;
      }
    }
    
    console.log(`\n✅ Migration ${migrationFile} applied successfully!\n`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    return false;
  }
}

function splitSQLStatements(sql) {
  // Split by semicolon, but handle function definitions and DO blocks
  const statements = [];
  let current = '';
  let inFunction = false;
  let inDoBlock = false;
  let depth = 0;
  
  const lines = sql.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for function start
    if (trimmed.match(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i)) {
      inFunction = true;
      depth = 0;
    }
    
    // Check for DO block start
    if (trimmed.match(/DO\s+\$\$/i)) {
      inDoBlock = true;
      depth = 0;
    }
    
    // Count braces for function/DO block depth
    if (inFunction || inDoBlock) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      
      // Check for function/DO block end
      if (trimmed.match(/\$\$\s*LANGUAGE/i) || (inDoBlock && trimmed.match(/\$\$;/))) {
        if (depth <= 0) {
          inFunction = false;
          inDoBlock = false;
        }
      }
    }
    
    current += line + '\n';
    
    // If not in function/DO block and we hit a semicolon, it's a statement boundary
    if (!inFunction && !inDoBlock && trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  
  // Add remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  return statements.filter(s => s.length > 0);
}

async function main() {
  console.log('🚀 Applying Inventory Reconciliation Migrations\n');
  console.log('='.repeat(60));
  
  let successCount = 0;
  
  for (const migration of MIGRATIONS) {
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      console.error(`\n❌ Failed to apply ${migration}`);
      console.log('\nPlease apply manually via Supabase Dashboard:');
      console.log('https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new\n');
      process.exit(1);
    }
  }
  
  console.log('='.repeat(60));
  console.log(`\n✅ Successfully applied ${successCount}/${MIGRATIONS.length} migrations!\n`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
