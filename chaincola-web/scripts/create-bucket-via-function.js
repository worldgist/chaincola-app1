/**
 * Script to create verification-documents bucket via Edge Function
 * Usage: node scripts/create-bucket-via-function.js
 */

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function createBucket() {
  try {
    console.log('📞 Calling create-storage-bucket Edge Function...');
    console.log(`   URL: ${SUPABASE_URL}/functions/v1/create-storage-bucket`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-storage-bucket`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Success!', result.message || 'Bucket created or already exists');
      if (result.bucket) {
        console.log('📦 Bucket details:', JSON.stringify(result.bucket, null, 2));
      }
    } else {
      console.error('❌ Error:', result.error || result.message || 'Unknown error');
      console.error('   Status:', response.status);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to call Edge Function:', error.message);
    process.exit(1);
  }
}

createBucket();









