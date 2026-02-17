/**
 * Script to unlock SOL balance for a user
 * Usage: node unlock-sol-balance.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function unlockSolBalance(userEmail) {
  console.log(`\n🔓 Unlocking SOL balance for user: ${userEmail}\n`);

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

  // Get current balance
  const { data: currentBalance, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (balanceError && balanceError.code !== 'PGRST116') {
    console.error('❌ Error fetching balance:', balanceError);
    return;
  }

  if (!currentBalance) {
    console.log('⚠️ No SOL balance record found');
    return;
  }

  const balance = parseFloat(currentBalance.balance || '0');
  const locked = parseFloat(currentBalance.locked || '0');
  const available = balance - locked;

  console.log('📊 Current SOL Balance:');
  console.log(`   Total Balance: ${balance.toFixed(9)} SOL`);
  console.log(`   Locked Amount: ${locked.toFixed(9)} SOL`);
  console.log(`   Available: ${available.toFixed(9)} SOL\n`);

  if (locked === 0) {
    console.log('✅ No locked balance to unlock\n');
    return;
  }

  // Check for pending sell orders
  const { data: pendingSells, error: sellsError } = await supabase
    .from('sells')
    .select('sell_id, sol_amount, locked_sol_amount, status, created_at, quote_expires_at')
    .eq('user_id', userId)
    .in('status', ['PENDING', 'SOL_SENT', 'SOL_CREDITED_ON_LUNO', 'SOLD_ON_LUNO'])
    .order('created_at', { ascending: false });

  if (!sellsError && pendingSells && pendingSells.length > 0) {
    console.log(`⚠️ Found ${pendingSells.length} pending sell order(s):\n`);
    pendingSells.forEach((sell, index) => {
      console.log(`   ${index + 1}. Sell ID: ${sell.sell_id}`);
      console.log(`      Status: ${sell.status}`);
      console.log(`      SOL Amount: ${sell.sol_amount || 'N/A'}`);
      console.log(`      Locked Amount: ${sell.locked_sol_amount || 'N/A'}`);
      console.log(`      Created: ${sell.created_at}`);
      if (sell.quote_expires_at) {
        const expiresAt = new Date(sell.quote_expires_at);
        const now = new Date();
        const isExpired = expiresAt < now;
        console.log(`      Quote Expires: ${sell.quote_expires_at} ${isExpired ? '⚠️ EXPIRED' : ''}`);
      }
      console.log('');
    });
    
    console.log('⚠️ WARNING: Unlocking balance while sell orders are pending may cause issues.');
    console.log('   Consider cancelling/expiring the sell orders first.\n');
  }

  // Unlock the balance
  console.log('🔓 Unlocking SOL balance...\n');
  
  const { error: unlockError } = await supabase
    .from('wallet_balances')
    .update({ 
      locked: '0',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('currency', 'SOL');

  if (unlockError) {
    console.error('❌ Error unlocking balance:', unlockError);
    return;
  }

  console.log('✅ Balance unlocked successfully\n');

  // Verify
  const { data: verifyBalance, error: verifyError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (!verifyError && verifyBalance) {
    const finalBalance = parseFloat(verifyBalance.balance || '0');
    const finalLocked = parseFloat(verifyBalance.locked || '0');
    const finalAvailable = finalBalance - finalLocked;
    
    console.log('✅ Verification:');
    console.log(`   Total Balance: ${finalBalance.toFixed(9)} SOL`);
    console.log(`   Locked: ${finalLocked.toFixed(9)} SOL`);
    console.log(`   Available: ${finalAvailable.toFixed(9)} SOL\n`);
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Please provide user email as argument');
  console.log('Usage: node unlock-sol-balance.js <user_email>');
  process.exit(1);
}

unlockSolBalance(userEmail).catch(console.error);



