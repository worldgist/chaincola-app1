// Test script to verify XRP wallet generation works
// Run with: node test-xrp-generation.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testXRPGeneration() {
  console.log('🧪 Testing XRP wallet generation...\n');

  try {
    // Get a test user session (you'll need to sign in first)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('❌ Not authenticated. Please sign in first.');
      console.log('   You can test via the app or website after signing in.');
      return;
    }

    console.log(`✅ Authenticated as user: ${session.user.id.substring(0, 8)}...\n`);

    // Test the generate-xrp-wallet function
    const functionUrl = `${supabaseUrl}/functions/v1/generate-xrp-wallet`;
    
    console.log('📡 Calling generate-xrp-wallet function...');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: 'mainnet',
        force_new: false,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Function call failed:');
      console.error('   Status:', response.status);
      console.error('   Error:', result);
      return;
    }

    if (result.success) {
      console.log('✅ XRP wallet generated successfully!');
      console.log('   Address:', result.address);
      console.log('   Destination Tag:', result.destination_tag);
      console.log('   Asset:', result.asset);
      console.log('   Network:', result.network);
    } else {
      console.error('❌ Function returned error:', result.error);
    }
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testXRPGeneration();




