// Regenerate SOL Wallet Script
// This script calls the generate-wallet Edge Function to regenerate SOL wallet with encrypted private key

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function regenerateSOLWallet() {
  try {
    console.log('🔐 Regenerating SOL wallet with encrypted private key...');
    console.log(`   URL: ${SUPABASE_URL}/functions/v1/generate-wallet`);
    console.log('');
    
    const USER_ID = '04452e35-1d06-42b4-a664-f926f80fbce8';
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-wallet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'x-user-id': USER_ID, // Service role mode
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'SOL',
        network: 'mainnet',
        force_new: true, // Force regenerate to store encrypted private key
      }),
    });

    const result = await response.json();
    
    if (response.ok && result.success !== false) {
      console.log('✅ Success!');
      console.log('');
      console.log('📊 SOL Wallet Result:');
      console.log(`   Address: ${result.address || 'N/A'}`);
      console.log(`   Asset: ${result.asset || 'SOL'}`);
      console.log(`   Network: ${result.network || 'mainnet'}`);
      console.log(`   Success: ${result.success ? '✅ YES' : '❌ NO'}`);
      if (result.message) {
        console.log(`   Message: ${result.message}`);
      }
      console.log('');
      console.log('✅ SOL wallet regenerated with encrypted private key stored!');
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

regenerateSOLWallet();



