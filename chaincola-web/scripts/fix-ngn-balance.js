const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixNGNBalance() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    
    console.log(`🔧 Fixing NGN balance for: ${email}\n`);
    
    // Get auth user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // The correct balance should be: 970 + 1642.24 = 2612.24
    const correctBalance = 2612.24;
    
    console.log(`💰 Correct NGN Balance: ₦${correctBalance.toFixed(2)}\n`);
    
    // Update wallet_balances
    console.log(`📝 Updating wallet_balances...`);
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });
    
    if (updateError) {
      console.error(`❌ Failed to update wallet_balances:`, updateError);
      return;
    }
    
    console.log(`✅ Updated wallet_balances: ₦${correctBalance.toFixed(2)}`);
    
    // Update wallets table
    console.log(`📝 Updating wallets table...`);
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    if (!wallet) {
      // Create wallet
      const { error: createError } = await supabase.from('wallets').insert({
        user_id: userId,
        ngn_balance: correctBalance.toFixed(2),
        usd_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      if (createError) {
        console.error(`⚠️ Failed to create wallet:`, createError);
      } else {
        console.log(`✅ Created wallet with NGN balance: ₦${correctBalance.toFixed(2)}`);
      }
    } else {
      const { error: updateWalletError } = await supabase.from('wallets').update({
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      
      if (updateWalletError) {
        console.error(`⚠️ Failed to update wallet:`, updateWalletError);
      } else {
        console.log(`✅ Updated wallets.ngn_balance: ₦${correctBalance.toFixed(2)}`);
      }
    }
    
    // Verify the fix
    const { data: verifyBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    const { data: verifyWallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    console.log(`\n✅ Verification:`);
    console.log(`   wallet_balances: ₦${verifyBalance?.balance || 0}`);
    console.log(`   wallets.ngn_balance: ₦${verifyWallet?.ngn_balance || 0}`);
    
    console.log(`\n✅ Done! Balance fixed to ₦${correctBalance.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

fixNGNBalance();


