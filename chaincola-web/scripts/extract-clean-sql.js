/**
 * Extract clean SQL from migration file
 * Removes any shell commands or non-SQL content that might have been accidentally copied
 */

const fs = require('fs');
const path = require('path');

const migrationFile = process.argv[2] || '20260130000012_add_sell_validation_logging.sql';

const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

console.log(`📋 Reading migration file: ${migrationFile}\n`);

let sql = fs.readFileSync(migrationPath, 'utf8');

// Clean up SQL: Remove any shell commands or non-SQL content
const originalLength = sql.length;

sql = sql
  .split('\n')
  .filter(line => {
    const trimmed = line.trim();
    // Filter out shell commands and command prompts
    if (!trimmed) return true; // Keep empty lines
    
    // Remove lines that look like shell commands
    if (trimmed.match(/^(netpay|cd |node |npm |yarn |% |\$ |# |&&|exec|\.\/)/)) {
      return false;
    }
    
    // Remove command prompts like "user@host %"
    if (trimmed.match(/^@.*%/)) {
      return false;
    }
    
    // Remove continuation characters
    if (trimmed.match(/^\^/)) {
      return false;
    }
    
    // Remove lines that are clearly shell output
    if (trimmed.match(/^(\w+@[\w-]+.*%|.*chaincola-web.*%)/)) {
      return false;
    }
    
    return true;
  })
  .join('\n')
  .trim();

// Remove any trailing non-SQL content after the last semicolon
const lastSemicolon = sql.lastIndexOf(';');
if (lastSemicolon > 0) {
  const afterSemicolon = sql.substring(lastSemicolon + 1).trim();
  // If there's content after the last semicolon that's not a comment, remove it
  if (afterSemicolon && !afterSemicolon.startsWith('--') && afterSemicolon.length > 0) {
    sql = sql.substring(0, lastSemicolon + 1);
  }
}

const cleanedLength = sql.length;
const removedChars = originalLength - cleanedLength;

console.log(`✅ Cleaned SQL extracted`);
console.log(`   Original size: ${originalLength} characters`);
console.log(`   Cleaned size: ${cleanedLength} characters`);
if (removedChars > 0) {
  console.log(`   Removed: ${removedChars} characters of non-SQL content\n`);
} else {
  console.log(`   No non-SQL content found\n`);
}

console.log('='.repeat(80));
console.log('CLEAN SQL (copy this to Supabase Dashboard):');
console.log('='.repeat(80));
console.log('\n' + sql + '\n');
console.log('='.repeat(80));
console.log('\n📋 Instructions:');
console.log('1. Copy the SQL above');
console.log('2. Go to: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/sql/new');
console.log('3. Paste the SQL');
console.log('4. Click "Run"\n');
