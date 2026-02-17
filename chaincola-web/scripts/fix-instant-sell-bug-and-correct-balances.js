/**
 * Fix Instant Sell Bug and Correct Affected User Balances
 * 
 * This script:
 * 1. Applies the fix to instant_sell_crypto_v2 function
 * 2. Finds all affected transactions
 * 3. Corrects user balances
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyFunctionFix() {
  console.log('\n🔧 Step 1: Applying function fix...\n');
  
  // Read the migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260129000001_fix_instant_sell_ngn_balance_calculation.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  // Extract just the CREATE OR REPLACE FUNCTION part
  const functionMatch = migrationSQL.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;[\s\S]*?COMMENT ON FUNCTION[\s\S]*?;/);
  
  if (!functionMatch) {
    console.error('❌ Could not extract function from migration file');
    return false;
  }
  
  const functionSQL = functionMatch[0];
  
  try {
    // Split by semicolons and execute each statement
    const statements = functionSQL.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      
      const { error } = await supabase.rpc('exec_sql', { sql: trimmed });
      if (error) {
        // Try direct query instead
        const { error: directError } = await supabase.from('_').select('*').limit(0);
        // This will fail but we'll use a different approach
      }
    }
    
    // Use direct SQL execution via REST API
    const { data, error } = await supabase
      .from('_')
      .select('*')
      .limit(0);
    
    // Actually, let's use the REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ sql: functionSQL }),
    });
    
    if (!response.ok) {
      // Try executing via PostgREST - actually, let's use a simpler approach
      console.log('⚠️  Could not apply function via API, will need manual application');
      console.log('   Please run: supabase db push');
      return false;
    }
    
    console.log('✅ Function fix applied successfully');
    return true;
  } catch (error) {
    console.error('❌ Error applying function fix:', error.message);
    console.log('⚠️  Please apply the migration manually: supabase db push');
    return false;
  }
}

async function findAndFixAffectedUsers() {
  console.log('\n🔍 Step 2: Finding affected transactions...\n');
  
  // Find all COMPLETED SELL transactions that are instant sells
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_type', 'SELL')
    .eq('status', 'COMPLETED')
    .not('fiat_amount', 'is', null)
    .eq('fiat_currency', 'NGN')
    .or('metadata->>instant_sell.eq.true,metadata->>type.eq.sell')
    .gte('created_at', '2026-01-26T00:00:00Z')
    .order('created_at', { ascending: false });
  
  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }
  
  if (!transactions || transactions.length === 0) {
    console.log('✅ No instant sell transactions found');
    return;
  }
  
  console.log(`📋 Found ${transactions.length} instant sell transactions to check\n`);
  
  const affectedUsers = new Map();
  
  for (const tx of transactions) {
    const userId = tx.user_id;
    const cryptoCurrency = tx.crypto_currency;
    const cryptoAmount = parseFloat(tx.crypto_amount || '0');
    const creditedNgn = parseFloat(tx.fiat_amount || '0');
    const rate = parseFloat(tx.metadata?.rate || '0');
    
    if (!cryptoAmount || !creditedNgn || !rate) {
      continue;
    }
    
    // Calculate what the user SHOULD have received
    const totalNgnBeforeFee = cryptoAmount * rate;
    const platformFee = totalNgnBeforeFee * 0.01; // 1% platform fee
    const correctNgnAmount = totalNgnBeforeFee - platformFee;
    
    // Check if the credited amount matches what they should have received
    const difference = Math.abs(creditedNgn - correctNgnAmount);
    
    // If difference is significant (more than ₦1), it's likely the bug
    if (difference > 1 && creditedNgn > correctNgnAmount * 1.5) {
      if (!affectedUsers.has(userId)) {
        affectedUsers.set(userId, []);
      }
      affectedUsers.get(userId).push({
        txId: tx.id,
        cryptoCurrency,
        cryptoAmount,
        rate,
        creditedNgn,
        correctNgnAmount,
        overCredit: creditedNgn - correctNgnAmount,
        createdAt: tx.created_at,
      });
    }
  }
  
  console.log(`📊 Found ${affectedUsers.size} affected users\n`);
  
  if (affectedUsers.size === 0) {
    console.log('✅ No affected users found');
    return;
  }
  
  // Fix each affected user
  let fixedCount = 0;
  let errorCount = 0;
  
  for (const [userId, txs] of affectedUsers.entries()) {
    console.log(`\n👤 Fixing user ${userId}:`);
    console.log(`   Affected transactions: ${txs.length}`);
    
    // Calculate total over-credit
    const totalOverCredit = txs.reduce((sum, tx) => sum + tx.overCredit, 0);
    console.log(`   Total over-credit: ₦${totalOverCredit.toFixed(2)}`);
    
    // Get current balances
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    const currentBalance = parseFloat(userWallet?.ngn_balance || '0');
    const correctBalance = currentBalance - totalOverCredit;
    
    console.log(`   Current balance: ₦${currentBalance.toFixed(2)}`);
    console.log(`   Correct balance: ₦${correctBalance.toFixed(2)}`);
    
    if (correctBalance < 0) {
      console.log(`   ⚠️  Warning: Correct balance would be negative (${correctBalance.toFixed(2)}), skipping`);
      errorCount++;
      continue;
    }
    
    // Update balances
    try {
      // Update user_wallets
      const { error: updateUserWalletError } = await supabase
        .from('user_wallets')
        .update({ ngn_balance: correctBalance })
        .eq('user_id', userId);
      
      if (updateUserWalletError) {
        console.error(`   ❌ Error updating user_wallets:`, updateUserWalletError);
        errorCount++;
        continue;
      }
      
      // Update wallet_balances
      const { error: updateWalletBalanceError } = await supabase
        .from('wallet_balances')
        .upsert({
          user_id: userId,
          currency: 'NGN',
          balance: correctBalance,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,currency',
        });
      
      if (updateWalletBalanceError) {
        console.error(`   ❌ Error updating wallet_balances:`, updateWalletBalanceError);
        errorCount++;
        continue;
      }
      
      // Update wallets
      const { error: updateWalletError } = await supabase
        .from('wallets')
        .upsert({
          user_id: userId,
          ngn_balance: correctBalance,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
      
      if (updateWalletError) {
        console.error(`   ❌ Error updating wallets:`, updateWalletError);
        errorCount++;
        continue;
      }
      
      // Update transaction records
      for (const tx of txs) {
        const { error: updateTxError } = await supabase
          .from('transactions')
          .update({
            metadata: {
              ...tx.metadata,
              corrected: true,
              original_fiat_amount: tx.creditedNgn,
              corrected_fiat_amount: tx.correctNgnAmount,
              correction_date: new Date().toISOString(),
            }
          })
          .eq('id', tx.txId);
        
        if (updateTxError) {
          console.warn(`   ⚠️  Could not update transaction ${tx.txId}:`, updateTxError.message);
        }
      }
      
      console.log(`   ✅ Balance corrected`);
      fixedCount++;
    } catch (error) {
      console.error(`   ❌ Error fixing user:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Affected users: ${affectedUsers.size}`);
  console.log(`   Fixed: ${fixedCount}`);
  console.log(`   Errors: ${errorCount}`);
}

async function main() {
  console.log('🚀 Starting fix process...\n');
  
  // Step 1: Apply function fix
  const fixApplied = await applyFunctionFix();
  
  if (!fixApplied) {
    console.log('\n⚠️  Function fix not applied. Please run: supabase db push');
    console.log('   Then run this script again to fix user balances.\n');
  }
  
  // Step 2: Find and fix affected users
  await findAndFixAffectedUsers();
  
  console.log('\n✅ Fix process completed');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
