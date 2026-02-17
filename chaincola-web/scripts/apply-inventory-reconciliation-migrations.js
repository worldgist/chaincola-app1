const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(migrationFile) {
  try {
    console.log(`\n📋 Applying migration: ${migrationFile}\n`);
    
    const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into individual statements
    // We need to handle function definitions and DO blocks that contain semicolons
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let inDoBlock = false;
    let dollarQuote = null;
    
    const lines = migrationSQL.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentStatement += line + '\n';
      
      // Check for dollar-quoted strings (used in functions)
      const dollarQuoteMatch = line.match(/\$([^$]*)\$/g);
      if (dollarQuoteMatch) {
        for (const match of dollarQuoteMatch) {
          if (dollarQuote === null) {
            dollarQuote = match;
          } else if (match === dollarQuote) {
            dollarQuote = null;
          }
        }
      }
      
      // Check if we're starting a function
      if (line.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i) || line.match(/CREATE\s+FUNCTION/i)) {
        inFunction = true;
      }
      
      // Check if we're in a DO block
      if (line.match(/^\s*DO\s+\$\$/i)) {
        inDoBlock = true;
        dollarQuote = '$$';
      }
      
      // End of function or DO block
      if ((inFunction || inDoBlock) && dollarQuote === null && line.trim().endsWith('$$')) {
        inFunction = false;
        inDoBlock = false;
      }
      
      // If we're not in a function/DO block and hit a semicolon, it's a statement boundary
      if (!inFunction && !inDoBlock && dollarQuote === null && line.trim().endsWith(';')) {
        const statement = currentStatement.trim();
        if (statement && !statement.startsWith('--') && statement.length > 0) {
          statements.push(statement);
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (!statement || statement.trim().startsWith('--') || statement.trim().length === 0) {
        continue;
      }
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // Use RPC to execute SQL if available, otherwise use REST API
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: statement
        });
        
        if (error) {
          // If exec_sql doesn't exist, try direct query
          console.log('⚠️ exec_sql RPC not available, trying alternative...');
          
          // For CREATE statements, we might need to use a different approach
          // Let's try using the REST API directly
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              sql: statement
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error executing statement ${i + 1}:`, errorText);
            throw new Error(`Failed to execute SQL: ${errorText}`);
          }
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        // If RPC doesn't work, we'll need to use psql or Supabase Dashboard
        console.error(`❌ Error executing statement ${i + 1}:`, err.message);
        console.log('\n⚠️  Direct SQL execution via JavaScript is not fully supported.');
        console.log('📋 Please apply the migration using Supabase Dashboard:\n');
        console.log('  1. Go to: https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new');
        console.log(`  2. Copy the SQL from: ${migrationPath}`);
        console.log('  3. Paste and click "Run"\n');
        throw err;
      }
    }
    
    console.log(`\n✅ Migration ${migrationFile} applied successfully!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Inventory Reconciliation Migrations\n');
  
  const migrations = [
    '20260202000001_add_inventory_reconciliation_features.sql',
    '20260202000002_create_automated_reconciliation_cron.sql'
  ];
  
  for (const migration of migrations) {
    const success = await applyMigration(migration);
    if (!success) {
      console.error(`\n❌ Failed to apply ${migration}`);
      console.log('\nPlease apply manually via Supabase Dashboard:\n');
      console.log('https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new\n');
      process.exit(1);
    }
  }
  
  console.log('✅ All migrations applied successfully!\n');
}

main().catch(console.error);
