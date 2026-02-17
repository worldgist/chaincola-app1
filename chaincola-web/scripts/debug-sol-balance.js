/**
 * Debug script to check SOL balance and see what's happening
 * Usage: node debug-sol-balance.js <user_email> <amount_to_sell>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugSolBalance(userEmail, amountToSell) {
  console.log(`\n🔍 Debugging SOL balance for: ${userEmail}\n`);
  console.log(`   Amount to sell: ${amountToSell || 'Not specified'}\n`);

  // Get auth user ID
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(u => u.email === userEmail);
  
  if (!authUser) {
    console.error('❌ User not found');
    return;
  }

  const userId = authUser.id;
  console.log(`✅ Auth user ID: ${userId}\n`);

  // Get SOL balance
  const { data: balanceData, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance, locked, currency, updated_at')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (balanceError) {
    console.error('❌ Error fetching balance:', balanceError);
    return;
  }

  if (!balanceData) {
    console.log('⚠️ No SOL balance record found');
    return;
  }

  const balance = parseFloat(balanceData.balance || '0');
  const locked = parseFloat(balanceData.locked || '0');
  const available = balance - locked;

  console.log('📊 Balance Details:');
  console.log(`   Total Balance: ${balance} SOL (raw: ${balanceData.balance})`);
  console.log(`   Locked: ${locked} SOL (raw: ${balanceData.locked})`);
  console.log(`   Available: ${available} SOL`);
  console.log(`   Updated: ${balanceData.updated_at}\n`);

  // Constants from sell-sol function
  const ESTIMATED_FEE_SOL = 0.0001;
  const PRECISION_BUFFER = 0.000001;
  
  console.log('💰 Fee Calculation:');
  console.log(`   Estimated Network Fee: ${ESTIMATED_FEE_SOL} SOL`);
  console.log(`   Precision Buffer: ${PRECISION_BUFFER} SOL\n`);

  if (amountToSell) {
    const solAmount = parseFloat(amountToSell);
    const totalRequired = solAmount + ESTIMATED_FEE_SOL;
    const effectiveRequired = totalRequired + PRECISION_BUFFER;
    const maxSellable = Math.max(0, available - ESTIMATED_FEE_SOL - PRECISION_BUFFER);
    
    console.log('🧮 Sell Calculation:');
    console.log(`   Amount to Sell: ${solAmount} SOL`);
    console.log(`   Network Fee: ${ESTIMATED_FEE_SOL} SOL`);
    console.log(`   Total Required: ${totalRequired} SOL`);
    console.log(`   Effective Required (with buffer): ${effectiveRequired} SOL`);
    console.log(`   Available: ${available} SOL`);
    console.log(`   Maximum Sellable: ${maxSellable} SOL\n`);

    if (available < effectiveRequired) {
      const shortage = totalRequired - available;
      console.log('❌ INSUFFICIENT BALANCE:');
      console.log(`   Shortage: ${shortage} SOL`);
      console.log(`   Available: ${available} SOL`);
      console.log(`   Required: ${totalRequired} SOL`);
      console.log(`   Try selling: ${maxSellable.toFixed(9)} SOL or less\n`);
    } else {
      console.log('✅ Balance is sufficient!\n');
    }
  } else {
    const maxSellable = Math.max(0, available - ESTIMATED_FEE_SOL - PRECISION_BUFFER);
    console.log(`💵 Maximum Sellable: ${maxSellable.toFixed(9)} SOL\n`);
  }

  // Check for pending sell orders
  const { data: pendingSells } = await supabase
    .from('sells')
    .select('sell_id, sol_amount, locked_sol_amount, status, created_at')
    .eq('user_id', userId)
    .in('status', ['PENDING', 'SOL_SENT', 'SOL_CREDITED_ON_LUNO', 'SOLD_ON_LUNO'])
    .order('created_at', { ascending: false });

  if (pendingSells && pendingSells.length > 0) {
    console.log(`⚠️ Found ${pendingSells.length} pending sell order(s):\n`);
    pendingSells.forEach((sell, index) => {
      console.log(`   ${index + 1}. Sell ID: ${sell.sell_id}`);
      console.log(`      Status: ${sell.status}`);
      console.log(`      SOL Amount: ${sell.sol_amount}`);
      console.log(`      Locked Amount: ${sell.locked_sol_amount}`);
      console.log(`      Created: ${sell.created_at}`);
      console.log('');
    });
  }
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
const amountToSell = process.argv[3];

debugSolBalance(userEmail, amountToSell).catch(console.error);



