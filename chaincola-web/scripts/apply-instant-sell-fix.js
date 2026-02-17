/**
 * Apply Instant Sell Fix and Correct Balances
 * This script applies the function fix and corrects affected user balances
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
  console.log('\n🔧 Applying function fix...\n');
  
  // Read the migration SQL
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260129000001_fix_instant_sell_ngn_balance_calculation.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  // Use the REST API to execute SQL
  // Note: This requires a custom RPC function or we'll use the admin API
  try {
    // Execute via REST API using a direct query
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_query: migrationSQL }),
    });
    
    if (response.ok) {
      console.log('✅ Function fix applied via RPC');
      return true;
    } else {
      // Try alternative: use pg.execute if available
      console.log('⚠️  RPC method not available, trying alternative...');
      
      // Split SQL into statements and execute via Supabase client
      // Actually, we need to use the admin API or psql
      console.log('⚠️  Please apply the migration manually using:');
      console.log('   1. Connect to your Supabase database');
      console.log('   2. Run the SQL from: supabase/migrations/20260129000001_fix_instant_sell_ngn_balance_calculation.sql');
      console.log('   OR use: supabase db push (if migrations are synced)');
      return false;
    }
  } catch (error) {
    console.log('⚠️  Could not apply function fix automatically');
    console.log('   Please apply manually using supabase db push');
    return false;
  }
}

async function findAndFixAffectedUsers() {
  console.log('\n🔍 Finding and fixing affected users...\n');
  
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
  
  console.log(`📋 Found ${transactions.length} transactions to check\n`);
  
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
    
    // Calculate correct amount
    const totalNgnBeforeFee = cryptoAmount * rate;
    const platformFee = totalNgnBeforeFee * 0.01;
    const correctNgnAmount = totalNgnBeforeFee - platformFee;
    const difference = Math.abs(creditedNgn - correctNgnAmount);
    
    // If significantly over-credited (more than 50% over), it's the bug
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
      });
    }
  }
  
  console.log(`📊 Found ${affectedUsers.size} affected users\n`);
  
  if (affectedUsers.size === 0) {
    console.log('✅ No affected users found - balances are correct!');
    return;
  }
  
  // Fix each user
  let fixedCount = 0;
  let errorCount = 0;
  
  for (const [userId, txs] of affectedUsers.entries()) {
    const totalOverCredit = txs.reduce((sum, tx) => sum + tx.overCredit, 0);
    
    console.log(`\n👤 User ${userId.substring(0, 8)}...`);
    console.log(`   Transactions: ${txs.length}`);
    console.log(`   Over-credited: ₦${totalOverCredit.toFixed(2)}`);
    
    // Get current balance
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    const currentBalance = parseFloat(userWallet?.ngn_balance || '0');
    const correctBalance = Math.max(0, currentBalance - totalOverCredit);
    
    console.log(`   Current: ₦${currentBalance.toFixed(2)} → Correct: ₦${correctBalance.toFixed(2)}`);
    
    if (correctBalance < 0) {
      console.log(`   ⚠️  Would result in negative balance, skipping`);
      errorCount++;
      continue;
    }
    
    try {
      // Update all three tables
      await supabase.from('user_wallets').update({ ngn_balance: correctBalance }).eq('user_id', userId);
      await supabase.from('wallet_balances').upsert({
        user_id: userId,
        currency: 'NGN',
        balance: correctBalance,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,currency' });
      await supabase.from('wallets').upsert({
        user_id: userId,
        ngn_balance: correctBalance,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      
      // Mark transactions as corrected
      for (const tx of txs) {
        await supabase.from('transactions').update({
          metadata: {
            ...tx.metadata,
            corrected: true,
            original_fiat_amount: tx.creditedNgn,
            corrected_fiat_amount: tx.correctNgnAmount,
            correction_date: new Date().toISOString(),
          }
        }).eq('id', tx.txId);
      }
      
      console.log(`   ✅ Fixed`);
      fixedCount++;
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Fixed: ${fixedCount} users`);
  console.log(`   Errors: ${errorCount} users`);
}

async function main() {
  console.log('🚀 Starting fix process...\n');
  
  // Try to apply function fix (may need manual application)
  await applyFunctionFix();
  
  // Fix affected users
  await findAndFixAffectedUsers();
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
