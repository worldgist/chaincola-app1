// Store SOL Private Keys Script
// This script calls the store-crypto-keys Edge Function to store SOL private keys

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error('');
  console.error('To get your service role key:');
  console.error('1. Go to https://app.supabase.com/project/slleojsdpctxhlsoyenr');
  console.error('2. Navigate to Settings → API');
  console.error('3. Copy the "service_role" key (⚠️ Keep this secret!)');
  console.error('4. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your_key_here');
  process.exit(1);
}

async function storeSOLKeys() {
  try {
    console.log('🔐 Storing SOL private keys...');
    console.log(`   URL: ${SUPABASE_URL}/functions/v1/store-crypto-keys`);
    console.log('');
    
    // Use service role with x-user-id header (for user: 04452e35-1d06-42b4-a664-f926f80fbce8)
    const USER_ID = '04452e35-1d06-42b4-a664-f926f80fbce8';
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/store-crypto-keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'x-user-id': USER_ID, // Service role mode
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'SOL',
        regenerate_if_no_keys: true, // Regenerate if wallet exists but has no keys
      }),
    });

    const result = await response.json();
    
    if (response.ok && result.success !== false) {
      console.log('✅ Success!');
      console.log('');
      
      if (result.results && result.results.length > 0) {
        const solResult = result.results.find((r) => r.asset === 'SOL');
        if (solResult) {
          console.log('📊 SOL Wallet Result:');
          console.log(`   Asset: ${solResult.asset}`);
          console.log(`   Address: ${solResult.address || 'N/A'}`);
          console.log(`   Success: ${solResult.success ? '✅ YES' : '❌ NO'}`);
          if (solResult.success) {
            console.log(`   Message: ${solResult.message || 'Keys stored successfully'}`);
          } else {
            console.log(`   Error: ${solResult.error || 'Unknown error'}`);
          }
        } else {
          console.log('📊 Results:', JSON.stringify(result.results, null, 2));
        }
      } else {
        console.log('📊 Response:', JSON.stringify(result, null, 2));
      }
    } else {
      console.error('❌ Error:', result.error || result.message || 'Unknown error');
      console.error('   Status:', response.status);
      console.error('   Full response:', JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to call Edge Function:', error.message);
    process.exit(1);
  }
}

storeSOLKeys();

