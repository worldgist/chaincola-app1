/**
 * Script to check SOL balance using auth user ID
 * Usage: node check-sol-balance-auth.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSolBalance(userEmail) {
  console.log(`\n🔍 Checking SOL balance for user: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError || !authUsers || !authUsers.users) {
    console.error('❌ Error listing users:', listError);
    return;
  }

  const authUser = authUsers.users.find(u => u.email === userEmail);
  if (!authUser) {
    console.error('❌ User not found in auth.users');
    return;
  }

  const userId = authUser.id;
  console.log(`✅ Found auth user: ${userEmail} (ID: ${userId})\n`);

  // Get SOL balance (this is what the sell function uses)
  const { data: balanceData, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance, locked, currency, updated_at')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (balanceError && balanceError.code !== 'PGRST116') {
    console.error('❌ Error fetching SOL balance:', balanceError);
    return;
  }

  if (!balanceData) {
    console.log('⚠️ No SOL balance record found');
    return;
  }

  const balance = parseFloat(balanceData.balance || '0');
  const locked = parseFloat(balanceData.locked || '0');
  const available = balance - locked;

  console.log('📊 SOL Balance Details:');
  console.log(`   Total Balance: ${balance.toFixed(9)} SOL`);
  console.log(`   Locked Amount: ${locked.toFixed(9)} SOL`);
  console.log(`   Available: ${available.toFixed(9)} SOL`);
  console.log(`   Last Updated: ${balanceData.updated_at || 'N/A'}\n`);

  // Check estimated fee (from sell-sol function)
  const ESTIMATED_FEE_SOL = 0.0001; // This should match the sell function
  console.log(`💰 Estimated Network Fee: ${ESTIMATED_FEE_SOL.toFixed(9)} SOL\n`);
  
  const maxSellable = Math.max(0, available - ESTIMATED_FEE_SOL);
  console.log(`💵 Maximum Sellable Amount: ${maxSellable.toFixed(9)} SOL\n`);

  if (locked > 0) {
    console.log('⚠️ WARNING: SOL balance is locked! Checking for pending sell orders...\n');

    // Check for pending sell orders
    const { data: pendingSells, error: sellsError } = await supabase
      .from('sells')
      .select('sell_id, sol_amount, locked_sol_amount, status, created_at, updated_at, quote_expires_at')
      .eq('user_id', userId)
      .in('status', ['PENDING', 'SOL_SENT', 'SOL_CREDITED_ON_LUNO', 'SOLD_ON_LUNO'])
      .order('created_at', { ascending: false });

    if (sellsError) {
      console.error('❌ Error fetching sell orders:', sellsError);
    } else if (pendingSells && pendingSells.length > 0) {
      console.log(`📋 Found ${pendingSells.length} pending sell order(s):\n`);
      pendingSells.forEach((sell, index) => {
        console.log(`   ${index + 1}. Sell ID: ${sell.sell_id}`);
        console.log(`      Status: ${sell.status}`);
        console.log(`      SOL Amount: ${sell.sol_amount || 'N/A'}`);
        console.log(`      Locked Amount: ${sell.locked_sol_amount || 'N/A'}`);
        console.log(`      Created: ${sell.created_at}`);
        console.log(`      Updated: ${sell.updated_at}`);
        if (sell.quote_expires_at) {
          const expiresAt = new Date(sell.quote_expires_at);
          const now = new Date();
          const isExpired = expiresAt < now;
          console.log(`      Quote Expires: ${sell.quote_expires_at} ${isExpired ? '⚠️ EXPIRED' : ''}`);
        }
        console.log('');
      });
    }
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Please provide user email as argument');
  console.log('Usage: node check-sol-balance-auth.js <user_email>');
  process.exit(1);
}

checkSolBalance(userEmail).catch(console.error);



