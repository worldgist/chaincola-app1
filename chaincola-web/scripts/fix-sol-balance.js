/**
 * Script to fix/restore SOL balance for a user
 * Usage: node fix-sol-balance.js <user_email> <sol_amount>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSolBalanceWithUserId(userId, solAmount) {
  console.log(`\n🔧 Fixing SOL balance for user ID: ${userId}\n`);
  console.log(`   Amount to restore: ${solAmount} SOL\n`);

  // Check current balance
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

  const currentBalanceAmount = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
  const newBalance = currentBalanceAmount + parseFloat(solAmount);

  console.log(`📊 Current balance: ${currentBalanceAmount.toFixed(9)} SOL`);
  console.log(`📊 New balance will be: ${newBalance.toFixed(9)} SOL\n`);

  // Use credit_crypto_wallet RPC function to properly credit the balance
  console.log('💳 Crediting SOL balance...\n');
  
  const { data: creditResult, error: creditError } = await supabase.rpc('credit_crypto_wallet', {
    p_user_id: userId,
    p_amount: parseFloat(solAmount),
    p_currency: 'SOL',
  });

  if (creditError) {
    console.error('❌ Error crediting balance:', creditError);
    
    // Fallback: Try direct upsert
    console.log('\n🔄 Trying fallback method (direct upsert)...\n');
    
    const { error: upsertError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'SOL',
        balance: newBalance.toFixed(9),
        locked: 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (upsertError) {
      console.error('❌ Fallback also failed:', upsertError);
      return;
    }
    
    console.log('✅ Balance restored using fallback method\n');
  } else {
    console.log('✅ Balance credited successfully\n');
  }

  // Verify the balance was updated
  const { data: verifyBalance, error: verifyError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (!verifyError && verifyBalance) {
    const finalBalance = parseFloat(verifyBalance.balance || '0');
    const locked = parseFloat(verifyBalance.locked || '0');
    const available = finalBalance - locked;
    
    console.log('✅ Verification:');
    console.log(`   Total Balance: ${finalBalance.toFixed(9)} SOL`);
    console.log(`   Locked: ${locked.toFixed(9)} SOL`);
    console.log(`   Available: ${available.toFixed(9)} SOL\n`);
  }
}

async function fixSolBalance(userEmail, solAmount) {
  console.log(`\n🔧 Fixing SOL balance for user: ${userEmail}\n`);
  console.log(`   Amount to restore: ${solAmount} SOL\n`);

  // Get user ID
  const { data: userProfiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email')
    .eq('email', userEmail)
    .limit(1);

  if (profileError || !userProfiles || userProfiles.length === 0) {
    console.error('❌ User not found:', profileError?.message || 'No user found');
    return;
  }

  const userId = userProfiles[0].id;
  console.log(`✅ Found user: ${userProfiles[0].email} (ID: ${userId})\n`);

  // Try to find the auth user by email first
  let actualUserId = userId;
  
  try {
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (!listError && authUsers && authUsers.users) {
      const matchingAuthUser = authUsers.users.find(u => u.email === userEmail);
      if (matchingAuthUser) {
        actualUserId = matchingAuthUser.id;
        console.log(`✅ Found auth user ID: ${actualUserId}\n`);
      } else {
        console.log(`⚠️ Auth user not found by email, using profile ID: ${userId}\n`);
      }
    }
  } catch (error) {
    console.log(`⚠️ Could not list auth users, using profile ID: ${userId}\n`);
  }
  
  return await fixSolBalanceWithUserId(actualUserId, solAmount);
}

async function fixSolBalanceDirect(userId, solAmount) {
  // Direct function without user lookup
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

  const currentBalanceAmount = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
  const newBalance = currentBalanceAmount + parseFloat(solAmount);

  console.log(`📊 Current balance: ${currentBalanceAmount.toFixed(9)} SOL`);
  console.log(`📊 New balance will be: ${newBalance.toFixed(9)} SOL\n`);

  // Use credit_crypto_wallet RPC function to properly credit the balance
  console.log('💳 Crediting SOL balance...\n');
  
  const { data: creditResult, error: creditError } = await supabase.rpc('credit_crypto_wallet', {
    p_user_id: userId,
    p_amount: parseFloat(solAmount),
    p_currency: 'SOL',
  });

  if (creditError) {
    console.error('❌ Error crediting balance:', creditError);
    
    // Fallback: Try direct upsert
    console.log('\n🔄 Trying fallback method (direct upsert)...\n');
    
    const { error: upsertError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'SOL',
        balance: newBalance.toFixed(9),
        locked: 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (upsertError) {
      console.error('❌ Fallback also failed:', upsertError);
      return;
    }
    
    console.log('✅ Balance restored using fallback method\n');
  } else {
    console.log('✅ Balance credited successfully\n');
  }

  // Verify the balance was updated
  const { data: verifyBalance, error: verifyError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (!verifyError && verifyBalance) {
    const finalBalance = parseFloat(verifyBalance.balance || '0');
    const locked = parseFloat(verifyBalance.locked || '0');
    const available = finalBalance - locked;
    
    console.log('✅ Verification:');
    console.log(`   Total Balance: ${finalBalance.toFixed(9)} SOL`);
    console.log(`   Locked: ${locked.toFixed(9)} SOL`);
    console.log(`   Available: ${available.toFixed(9)} SOL\n`);
  }
}

// Get arguments
const userEmail = process.argv[2];
const solAmount = process.argv[3];

if (!userEmail || !solAmount) {
  console.error('❌ Please provide user email and SOL amount');
  console.log('Usage: node fix-sol-balance.js <user_email> <sol_amount>');
  console.log('Example: node fix-sol-balance.js jetway463@gmail.com 0.012330450');
  process.exit(1);
}

fixSolBalance(userEmail, solAmount).catch(console.error);

