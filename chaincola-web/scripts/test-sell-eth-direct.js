// Test script to sell ETH - Using Supabase JS client
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6ImFub24iLCJpcmEiOjAsInN1YiI6IiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY2MTY1OTkxLCJleHAiOjIwODE3NDE5OTF9.8K9L0M1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E';

async function testSellEth() {
  console.log('🧪 Testing ETH Sell Functionality\n');

  const email = 'Netpayuser@gmail.com';
  const password = 'Salifu147@';

  try {
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Step 1: Sign in user
    console.log(`🔐 Signing in as ${email}...`);
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    
    if (signInError || !signInData.session) {
      console.error('❌ Authentication failed:', signInError?.message || 'Unknown error');
      return;
    }

    console.log('✅ Signed in successfully');
    console.log(`   User ID: ${signInData.user.id}\n`);

    const accessToken = signInData.session.access_token;

    // Step 2: Get ETH balance
    console.log('💰 Checking ETH balance...');
    const balanceResponse = await fetch(`${supabaseUrl}/rest/v1/wallet_balances?user_id=eq.${signInData.user.id}&currency=eq.ETH&select=balance`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
    });

    const balanceData = await balanceResponse.json();
    const ethBalance = balanceData && balanceData[0] ? parseFloat(balanceData[0].balance || '0') : 0;
    
    console.log(`   Current ETH balance: ${ethBalance.toFixed(8)} ETH\n`);

    if (ethBalance <= 0) {
      console.log('⚠️  No ETH balance to sell');
      return;
    }

    // Step 3: Get quote for selling all ETH
    console.log('📊 Step 1: Getting sell quote...');
    const quoteResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
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

    // Step 4: Execute sell
    console.log('🚀 Step 2: Executing sell...');
    console.log('⚠️  This will lock ETH and initiate the sell process\n');
    
    const executeResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
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

    // Step 5: Check status
    console.log('📊 Step 3: Checking sell status...');
    const statusResponse = await fetch(`${supabaseUrl}/functions/v1/sell-eth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
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

