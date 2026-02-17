// Test script to sell ETH for a user
// This requires a valid user session token

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function testSellEth() {
  console.log('🧪 Testing ETH Sell Functionality\n');

  const email = 'Netpayuser@gmail.com';
  const password = 'Salifu147@';

  try {
    // Create Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sign in user using admin API
    console.log(`🔐 Signing in as ${email}...`);
    
    // Use admin API to sign in
    const { data: authData, error: authError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    // Try direct sign in with password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    
    if (signInError || !signInData.session) {
      console.error('❌ Authentication failed:', signInError?.message);
      console.log('\n💡 Trying alternative authentication method...');
      
      // Get user by email and create a session manually
      const { data: userData } = await supabase.auth.admin.getUserByEmail(email);
      if (userData?.user) {
        console.log(`✅ Found user: ${userData.user.id}`);
        // We'll need to use the service role key to call the function
        // But we need a user token, so let's try a different approach
        return;
      }
      return;
    }

    const authData = signInData;

    if (authError || !authData.session) {
      console.error('❌ Authentication failed:', authError?.message);
      return;
    }

    console.log('✅ Signed in successfully');
    console.log(`   User ID: ${authData.user.id}\n`);

    const accessToken = authData.session.access_token;

    // Get ETH balance
    console.log('💰 Checking ETH balance...');
    const { data: balanceData, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', authData.user.id)
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

    // Step 1: Get quote for selling all ETH
    console.log('📊 Step 1: Getting sell quote...');
    const quoteResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'quote',
        eth_amount: ethBalance.toString(),
      }),
    });

    const quoteResult = await quoteResponse.json();
    
    if (!quoteResult.success) {
      console.error('❌ Quote failed:', quoteResult.error);
      return;
    }

    console.log('✅ Quote received:');
    console.log(`   ETH Amount: ${quoteResult.data.eth_amount} ETH`);
    console.log(`   Exchange Rate: ₦${quoteResult.data.exchange_rate}`);
    console.log(`   Platform Fee: ₦${quoteResult.data.platform_fee}`);
    console.log(`   Network Fee: ${quoteResult.data.network_fee} ETH`);
    console.log(`   Final NGN Payout: ₦${quoteResult.data.final_ngn_payout}`);
    console.log(`   Quote Expires At: ${quoteResult.data.quote_expires_at}`);
    console.log(`   Sell ID: ${quoteResult.data.sell_id}\n`);

    // Ask for confirmation
    console.log('⚠️  Ready to execute sell. This will:');
    console.log(`   1. Lock ${quoteResult.data.eth_amount} ETH`);
    console.log(`   2. Transfer ETH to Luno`);
    console.log(`   3. Execute market sell`);
    console.log(`   4. Credit ₦${quoteResult.data.final_ngn_payout} to your NGN wallet\n`);

    // Step 2: Execute sell
    console.log('🚀 Step 2: Executing sell...');
    const executeResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'execute',
        sell_id: quoteResult.data.sell_id,
      }),
    });

    const executeResult = await executeResponse.json();
    
    if (!executeResult.success) {
      console.error('❌ Execute failed:', executeResult.error);
      return;
    }

    console.log('✅ Sell executed:');
    console.log(`   Status: ${executeResult.data.status}`);
    console.log(`   ETH Locked: ${executeResult.data.locked_eth_amount} ETH`);
    if (executeResult.data.eth_tx_hash) {
      console.log(`   ETH TX Hash: ${executeResult.data.eth_tx_hash}`);
    }
    console.log(`   Message: ${executeResult.data.message}\n`);

    // Step 3: Check status
    console.log('📊 Step 3: Checking sell status...');
    const statusResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'status',
        sell_id: quoteResult.data.sell_id,
      }),
    });

    const statusResult = await statusResponse.json();
    
    if (statusResult.success) {
      console.log('✅ Current status:');
      console.log(`   Status: ${statusResult.data.status}`);
      console.log(`   ETH Amount: ${statusResult.data.eth_amount} ETH`);
      console.log(`   Quoted NGN: ₦${statusResult.data.quoted_ngn}`);
      if (statusResult.data.ngn_received) {
        console.log(`   NGN Received: ₦${statusResult.data.ngn_received}`);
      }
      if (statusResult.data.profit) {
        console.log(`   Profit: ₦${statusResult.data.profit}`);
      }
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error('❌ Error:', error);
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

