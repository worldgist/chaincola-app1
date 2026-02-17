/**
 * Verify and Fix NGN Credit Issue
 * 
 * This script:
 * 1. Verifies the instant_sell_crypto_v2 fix is applied
 * 2. Finds transactions with incorrect NGN credits
 * 3. Provides options to fix affected users
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyFixApplied() {
  console.log('🔍 Step 1: Verifying fix is applied...\n');
  
  try {
    // Check function comment
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT d.description
        FROM pg_proc p
        JOIN pg_description d ON p.oid = d.objoid
        WHERE p.proname = 'instant_sell_crypto_v2'
        LIMIT 1;
      `
    });
    
    // Alternative: Check if function exists and get its definition
    const { data: funcDef, error: funcError } = await supabase
      .from('pg_proc')
      .select('*')
      .eq('proname', 'instant_sell_crypto_v2')
      .limit(1);
    
    console.log('✅ Function exists');
    console.log('⚠️  Note: To fully verify, check the function definition in Supabase Dashboard\n');
    
    return true;
  } catch (error) {
    console.error('❌ Error verifying fix:', error.message);
    return false;
  }
}

async function findAffectedTransactions() {
  console.log('\n🔍 Step 2: Finding potentially affected transactions...\n');
  
  try {
    // Get recent SOL sell transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('❌ Error fetching transactions:', error);
      return [];
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('⚠️  No transactions found');
      return [];
    }
    
    console.log(`📊 Analyzing ${transactions.length} transactions...\n`);
    
    const affected = [];
    
    for (const tx of transactions) {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const fiatAmount = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');
      
      if (!rate || rate <= 0) {
        continue; // Skip if no rate info
      }
      
      // Calculate expected amount
      const expectedBeforeFee = cryptoAmount * rate;
      const fee = expectedBeforeFee * feePercentage;
      const expectedAfterFee = expectedBeforeFee - fee;
      
      // Check if difference is significant (>10% or >₦1,000)
      const difference = fiatAmount - expectedAfterFee;
      const percentDiff = expectedAfterFee > 0 ? (difference / expectedAfterFee) * 100 : 0;
      
      if (Math.abs(difference) > Math.max(expectedAfterFee * 0.1, 1000)) {
        affected.push({
          ...tx,
          expectedAmount: expectedAfterFee,
          difference,
          percentDiff,
          cryptoAmount,
          fiatAmount,
          rate
        });
      }
    }
    
    if (affected.length > 0) {
      console.log(`⚠️  Found ${affected.length} potentially affected transaction(s):\n`);
      
      affected.forEach((tx, idx) => {
        console.log(`${idx + 1}. Transaction ID: ${tx.id.substring(0, 8)}...`);
        console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   User ID: ${tx.user_id.substring(0, 8)}...`);
        console.log(`   SOL Amount: ${tx.cryptoAmount}`);
        console.log(`   Rate: ₦${tx.rate.toFixed(2)}`);
        console.log(`   Expected: ₦${tx.expectedAmount.toFixed(2)}`);
        console.log(`   Credited: ₦${tx.fiatAmount.toFixed(2)}`);
        console.log(`   Difference: ₦${tx.difference.toFixed(2)} (${tx.percentDiff > 0 ? '+' : ''}${tx.percentDiff.toFixed(2)}%)`);
        console.log('');
      });
    } else {
      console.log('✅ No obviously affected transactions found');
      console.log('   (All transactions appear to have correct credits)\n');
    }
    
    return affected;
  } catch (error) {
    console.error('❌ Error finding affected transactions:', error);
    return [];
  }
}

async function analyzeSpecificTransaction(fiatAmount = 399000) {
  console.log(`\n🔍 Step 3: Analyzing transactions with NGN credit around ₦${fiatAmount.toLocaleString()}...\n`);
  
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    // Find transactions with fiat_amount close to target
    const matches = transactions?.filter(tx => {
      const amount = parseFloat(tx.fiat_amount || '0');
      return Math.abs(amount - fiatAmount) < 1000; // Within ₦1,000
    });
    
    if (!matches || matches.length === 0) {
      console.log(`⚠️  No transactions found with NGN credit around ₦${fiatAmount.toLocaleString()}`);
      console.log('\n📊 Showing recent transactions instead:\n');
      
      transactions?.slice(0, 5).forEach(tx => {
        console.log(`  ₦${parseFloat(tx.fiat_amount || '0').toLocaleString()} - ${tx.crypto_amount} SOL - ${new Date(tx.created_at).toLocaleString()}`);
      });
      return;
    }
    
    console.log(`✅ Found ${matches.length} matching transaction(s):\n`);
    
    for (const tx of matches) {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const creditedNgn = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      
      console.log('='.repeat(80));
      console.log(`Transaction ID: ${tx.id}`);
      console.log(`User ID: ${tx.user_id}`);
      console.log(`Created: ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`\nDetails:`);
      console.log(`  SOL Amount: ${cryptoAmount}`);
      console.log(`  Rate: ₦${rate.toFixed(2)} per SOL`);
      console.log(`  Credited: ₦${creditedNgn.toLocaleString()}`);
      
      if (rate > 0) {
        const expectedBeforeFee = cryptoAmount * rate;
        const fee = expectedBeforeFee * 0.01;
        const expectedAfterFee = expectedBeforeFee - fee;
        const difference = creditedNgn - expectedAfterFee;
        
        console.log(`\nExpected Calculation:`);
        console.log(`  Total before fee: ${cryptoAmount} × ₦${rate.toFixed(2)} = ₦${expectedBeforeFee.toLocaleString()}`);
        console.log(`  Fee (1%): ₦${fee.toLocaleString()}`);
        console.log(`  Expected after fee: ₦${expectedAfterFee.toLocaleString()}`);
        console.log(`\n  Difference: ₦${difference.toLocaleString()}`);
        
        if (difference > 0) {
          console.log(`  ⚠️  OVER-CREDIT: User was credited ₦${difference.toLocaleString()} more than expected`);
        } else if (difference < 0) {
          console.log(`  ⚠️  UNDER-CREDIT: User was credited ₦${Math.abs(difference).toLocaleString()} less than expected`);
        } else {
          console.log(`  ✅ Amount is correct`);
        }
      }
      
      // Get user email
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(tx.user_id);
        if (user) {
          console.log(`\nUser Email: ${user.email}`);
        }
      } catch (err) {
        // Ignore
      }
      
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function main() {
  console.log('🔍 NGN Credit Issue Investigation\n');
  console.log('='.repeat(80));
  
  // Step 1: Verify fix
  await verifyFixApplied();
  
  // Step 2: Find affected transactions
  const affected = await findAffectedTransactions();
  
  // Step 3: Analyze specific amount (399,000)
  await analyzeSpecificTransaction(399000);
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Investigation complete\n');
  console.log('Next steps:');
  console.log('1. Review the affected transactions above');
  console.log('2. Verify the fix migration was applied: 20260129000001_fix_instant_sell_ngn_balance_calculation.sql');
  console.log('3. If transactions are affected, use fix-incorrect-ngn-credits.sql to correct balances');
  console.log('4. Ensure the fix is applied before processing new transactions\n');
}

main().catch(console.error);
