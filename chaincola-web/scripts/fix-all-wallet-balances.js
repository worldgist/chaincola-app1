/**
 * Script to fix all wallet_balances that reference user_profiles.id instead of auth.users.id
 * Usage: node fix-all-wallet-balances.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAllWalletBalances() {
  console.log(`\n🔧 Fixing all wallet_balances with incorrect user_id references\n`);

  // Get all wallet_balances that don't have a matching auth.users record
  const { data: allBalances, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('user_id, currency, balance, locked');

  if (balanceError) {
    console.error('❌ Error fetching wallet balances:', balanceError);
    return;
  }

  console.log(`📊 Found ${allBalances.length} wallet balance records\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const balance of allBalances) {
    // Check if user_id exists in auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(balance.user_id);
    
    if (!authUser || !authUser.user) {
      // User doesn't exist in auth.users, try to find correct user_id from user_profiles
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id, user_id, email')
        .eq('id', balance.user_id)
        .single();

      if (userProfile && userProfile.user_id) {
        const correctUserId = userProfile.user_id;
        console.log(`🔧 Fixing balance for ${balance.currency}: ${balance.user_id} -> ${correctUserId}`);

        // Check if balance already exists for correct user_id
        const { data: existingBalance } = await supabase
          .from('wallet_balances')
          .select('balance, locked')
          .eq('user_id', correctUserId)
          .eq('currency', balance.currency)
          .single();

        if (existingBalance) {
          // Merge balances
          const newBalance = parseFloat(existingBalance.balance || '0') + parseFloat(balance.balance || '0');
          const newLocked = parseFloat(existingBalance.locked || '0') + parseFloat(balance.locked || '0');

          const { error: updateError } = await supabase
            .from('wallet_balances')
            .update({
              balance: newBalance.toFixed(9),
              locked: newLocked.toFixed(9),
            })
            .eq('user_id', correctUserId)
            .eq('currency', balance.currency);

          if (updateError) {
            console.error(`❌ Error updating balance:`, updateError);
            errorCount++;
          } else {
            // Delete the old balance record
            await supabase
              .from('wallet_balances')
              .delete()
              .eq('user_id', balance.user_id)
              .eq('currency', balance.currency);

            console.log(`✅ Merged balance: ${newBalance.toFixed(9)} ${balance.currency}`);
            fixedCount++;
          }
        } else {
          // Update to use correct user_id
          const { error: updateError } = await supabase
            .from('wallet_balances')
            .update({ user_id: correctUserId })
            .eq('user_id', balance.user_id)
            .eq('currency', balance.currency);

          if (updateError) {
            console.error(`❌ Error updating balance:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ Fixed balance reference`);
            fixedCount++;
          }
        }
      } else {
        console.log(`⚠️ Skipping balance for ${balance.currency}: No matching user_profile found`);
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`\n✅ Summary:`);
  console.log(`   Fixed: ${fixedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

fixAllWalletBalances().catch(console.error);



