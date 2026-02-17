const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(migrationFile) {
  try {
    console.log(`\n📋 Applying migration: ${migrationFile}\n`);
    console.log('='.repeat(80));
    
    const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into individual statements (handling function definitions)
    // For CREATE OR REPLACE FUNCTION, we need to execute the entire function as one statement
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let dollarQuoteTag = null;
    
    const lines = migrationSQL.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentStatement += line + '\n';
      
      // Check for function start
      if (line.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i)) {
        inFunction = true;
        // Find dollar quote tag
        const dollarMatch = line.match(/\$\$(\w*)\$\$/);
        if (dollarMatch) {
          dollarQuoteTag = dollarMatch[1];
        } else {
          // Look for $$ on next lines
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].includes('$$')) {
              const match = lines[j].match(/\$\$(\w*)\$\$/);
              dollarQuoteTag = match ? match[1] : '';
              break;
            }
          }
        }
      }
      
      // Check for function end
      if (inFunction && dollarQuoteTag !== null) {
        if (line.includes(`$$${dollarQuoteTag}$$`) || line.includes('$$')) {
          // Check if this is the closing tag
          if (line.match(new RegExp(`\\$\\$${dollarQuoteTag}\\$\\$`)) || (dollarQuoteTag === '' && line.includes('$$'))) {
            statements.push(currentStatement.trim());
            currentStatement = '';
            inFunction = false;
            dollarQuoteTag = null;
            continue;
          }
        }
      } else if (!inFunction) {
        // Regular statement - split on semicolon
        if (line.trim().endsWith(';') && !line.trim().startsWith('--')) {
          const trimmed = currentStatement.trim();
          if (trimmed && !trimmed.startsWith('--')) {
            statements.push(trimmed);
          }
          currentStatement = '';
        }
      }
    }
    
    // Add remaining statement if any
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    console.log(`🔄 Executing ${statements.length} SQL statement(s)...\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement.trim() || statement.trim().startsWith('--')) {
        continue;
      }
      
      try {
        // Use RPC to execute SQL if available, otherwise use REST API
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: statement
        });
        
        if (error) {
          // Try alternative: use pg_query if available
          const { data: altData, error: altError } = await supabase.rpc('pg_query', {
            query: statement
          });
          
          if (altError) {
            throw new Error(`RPC failed: ${error.message || altError.message}`);
          }
        }
        
        console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
      } catch (err) {
        // If RPC doesn't work, try direct HTTP request to Management API
        console.log(`⚠️  RPC method not available, trying direct HTTP...`);
        
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: statement })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
      }
    }
    
    console.log(`\n✅ Migration ${migrationFile} applied successfully!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error applying migration ${migrationFile}:`, error.message);
    console.error(error);
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
  
  let successCount = 0;
  let failCount = 0;
  
  for (const migration of migrations) {
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('='.repeat(80));
  if (failCount === 0) {
    console.log(`\n✅ All migrations applied successfully! (${successCount} succeeded)\n`);
    console.log('The instant sell functions have been updated to:');
    console.log('  - Use SELECT FOR UPDATE to prevent race conditions');
    console.log('  - Credit EXACTLY (amount * rate * (1 - fee)) in NGN');
    console.log('  - Update all wallet tables consistently\n');
  } else {
    console.log(`\n❌ Some migrations failed (${failCount} failed, ${successCount} succeeded)\n`);
    console.log('Please apply failed migrations manually via Supabase Dashboard:');
    console.log('  https://app.supabase.com/project/slleojsdpctxhlsoyenr/sql/new\n');
  }
}

main().catch(console.error);
