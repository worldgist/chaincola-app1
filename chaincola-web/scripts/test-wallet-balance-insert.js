/**
 * Test script to verify wallet_balances trigger works correctly
 * Usage: node test-wallet-balance-insert.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testWalletBalanceInsert(userEmail) {
  console.log(`\n🧪 Testing wallet_balances insert for: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(u => u.email === userEmail);
  
  if (!authUser) {
    console.error('❌ User not found');
    return;
  }

  const authUserId = authUser.id;
  console.log(`✅ Auth user ID: ${authUserId}\n`);

  // Get user_profiles ID (wrong ID)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, user_id')
    .eq('email', userEmail)
    .single();

  if (!userProfile) {
    console.error('❌ User profile not found');
    return;
  }

  console.log(`📊 User Profile ID: ${userProfile.id}`);
  console.log(`📊 User Profile user_id: ${userProfile.user_id}\n`);

  // Test 1: Try inserting with correct auth user ID (should work)
  console.log('Test 1: Inserting with correct auth user ID...');
  const { error: test1Error } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: authUserId,
      currency: 'TEST',
      balance: '0.00000001',
      locked: '0',
    }, {
      onConflict: 'user_id,currency',
    });

  if (test1Error) {
    console.error('❌ Test 1 failed:', test1Error);
  } else {
    console.log('✅ Test 1 passed: Insert with auth user ID works\n');
    
    // Clean up
    await supabase
      .from('wallet_balances')
      .delete()
      .eq('user_id', authUserId)
      .eq('currency', 'TEST');
  }

  // Test 2: Try inserting with user_profiles.id (should be auto-corrected by trigger)
  if (userProfile.id !== userProfile.user_id) {
    console.log('Test 2: Inserting with user_profiles.id (should be auto-corrected)...');
    const { error: test2Error } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userProfile.id, // Wrong ID
        currency: 'TEST2',
        balance: '0.00000002',
        locked: '0',
      }, {
        onConflict: 'user_id,currency',
      });

    if (test2Error) {
      console.error('❌ Test 2 failed:', test2Error);
    } else {
      // Check if it was corrected
      const { data: insertedBalance } = await supabase
        .from('wallet_balances')
        .select('user_id')
        .eq('currency', 'TEST2')
        .single();

      if (insertedBalance && insertedBalance.user_id === userProfile.user_id) {
        console.log('✅ Test 2 passed: Trigger auto-corrected user_id\n');
      } else {
        console.log('⚠️ Test 2: Insert succeeded but user_id may not have been corrected');
        console.log(`   Expected: ${userProfile.user_id}, Got: ${insertedBalance?.user_id}\n`);
      }

      // Clean up
      await supabase
        .from('wallet_balances')
        .delete()
        .eq('currency', 'TEST2');
    }
  } else {
    console.log('⚠️ Test 2 skipped: user_profiles.id matches user_id\n');
  }
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
testWalletBalanceInsert(userEmail).catch(console.error);



