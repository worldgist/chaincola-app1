/**
 * Script to sync SOL balance between auth user ID and user_profiles ID
 * This fixes the issue where balance exists under auth user ID but app uses user_profiles ID
 * Usage: node sync-sol-balance-ids.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncSolBalance(userEmail) {
  console.log(`\n🔄 Syncing SOL balance for user: ${userEmail}\n`);

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

  const authUserId = authUser.id;
  console.log(`✅ Found auth user ID: ${authUserId}\n`);

  // Get user_profiles ID
  const { data: userProfiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email')
    .eq('email', userEmail)
    .limit(1);

  if (profileError || !userProfiles || userProfiles.length === 0) {
    console.error('❌ User profile not found:', profileError);
    return;
  }

  const profileUserId = userProfiles[0].id;
  console.log(`✅ Found user profile ID: ${profileUserId}\n`);

  if (authUserId === profileUserId) {
    console.log('✅ User IDs match - no sync needed\n');
    return;
  }

  console.log(`⚠️ User IDs don't match - syncing balance...\n`);

  // Get balance from auth user ID (source of truth)
  const { data: authBalance, error: authBalanceError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', authUserId)
    .eq('currency', 'SOL')
    .single();

  if (authBalanceError && authBalanceError.code !== 'PGRST116') {
    console.error('❌ Error fetching auth user balance:', authBalanceError);
    return;
  }

  if (!authBalance) {
    console.log('⚠️ No SOL balance found for auth user ID');
    return;
  }

  const balance = parseFloat(authBalance.balance || '0');
  const locked = parseFloat(authBalance.locked || '0');

  console.log(`📊 Auth user balance: ${balance.toFixed(9)} SOL (locked: ${locked.toFixed(9)} SOL)\n`);

  // Sync to user_profiles ID
  console.log(`💾 Syncing balance to user profile ID...\n`);
  
  const { error: syncError } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: profileUserId,
      currency: 'SOL',
      balance: balance.toFixed(9),
      locked: locked.toFixed(9),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });

  if (syncError) {
    console.error('❌ Error syncing balance:', syncError);
    return;
  }

  console.log('✅ Balance synced successfully\n');

  // Verify
  const { data: profileBalance, error: verifyError } = await supabase
    .from('wallet_balances')
    .select('balance, locked')
    .eq('user_id', profileUserId)
    .eq('currency', 'SOL')
    .single();

  if (!verifyError && profileBalance) {
    const syncedBalance = parseFloat(profileBalance.balance || '0');
    const syncedLocked = parseFloat(profileBalance.locked || '0');
    
    console.log('✅ Verification:');
    console.log(`   Auth User ID Balance: ${balance.toFixed(9)} SOL (locked: ${locked.toFixed(9)} SOL)`);
    console.log(`   Profile User ID Balance: ${syncedBalance.toFixed(9)} SOL (locked: ${syncedLocked.toFixed(9)} SOL)\n`);
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Please provide user email as argument');
  console.log('Usage: node sync-sol-balance-ids.js <user_email>');
  process.exit(1);
}

syncSolBalance(userEmail).catch(console.error);



