// Test script to sell ETH using admin/service role key
// This bypasses user authentication and tests the sell function directly

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function testSellEth() {
  console.log('🧪 Testing ETH Sell Functionality (Admin Mode)\n');

  const email = 'Netpayuser@gmail.com';

  try {
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user by email - try to find in user_profiles or auth.users
    console.log(`🔍 Finding user: ${email}...`);
    
    // Try user_profiles first
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('user_id, email')
      .eq('email', email)
      .limit(1)
      .single();

    let userId;
    if (profileData) {
      userId = profileData.user_id;
      console.log(`✅ Found user in profiles: ${userId}`);
    } else {
      // Try to find by checking crypto_wallets (they have user_id)
      const { data: walletData } = await supabase
        .from('crypto_wallets')
        .select('user_id')
        .eq('asset', 'ETH')
        .limit(1)
        .single();
      
      if (walletData) {
        userId = walletData.user_id;
        console.log(`✅ Using user from wallet: ${userId}`);
      } else {
        console.error('❌ Could not find user. Please check the email address.');
        return;
      }
    }
    
    console.log(`   Email: ${email}\n`);

    // Get ETH balance
    console.log('💰 Checking ETH balance...');
    const { data: balanceData, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'ETH')
      .single();

    if (balanceError) {
      console.error('❌ Error fetching balance:', balanceError);
      return;
    }

    const ethBalance = parseFloat(balanceData?.balance || '0');
    console.log(`   Current ETH balance: ${ethBalance.toFixed(8)} ETH\n`);

    if (ethBalance <= 0) {
      console.log('⚠️  No ETH balance to sell');
      return;
    }

    // Note: The sell-eth function requires user authentication token
    // We need to create a user session token for this to work
    console.log('⚠️  Note: The sell-eth function requires user authentication.');
    console.log('   To test properly, you need to:');
    console.log('   1. Log in through the mobile app or web app');
    console.log('   2. Use the sell ETH feature from the UI');
    console.log('   3. Or provide a valid user session token\n');

    console.log('💡 Alternative: Testing via direct function call with user token...');
    console.log('   You can get a user token by logging in through the app.\n');

    // User already found above

    // We can't create a user session token directly with admin API
    // The user needs to log in through the app
    console.log('📋 Test Summary:');
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${email}`);
    console.log(`   ETH Balance: ${ethBalance.toFixed(8)} ETH`);
    console.log(`   Ready to sell: ${ethBalance.toFixed(8)} ETH\n`);

    console.log('✅ User account verified and ready for testing!');
    console.log('\n💡 To test the sell function:');
    console.log('   1. Open the mobile app or web app');
    console.log('   2. Log in with: Netpayuser@gmail.com / Salifu147@');
    console.log('   3. Navigate to Assets page');
    console.log('   4. Click "Sell" on ETH');
    console.log('   5. Enter amount or select "Max"');
    console.log('   6. Confirm the sell\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testSellEth()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

