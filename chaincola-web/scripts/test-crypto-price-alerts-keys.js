#!/usr/bin/env node

/**
 * Test script to check if Alchemy API key is properly configured
 * This calls the function and shows what environment variables are available
 */

// Try to load from .env.local
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/check-crypto-price-alerts`;

async function testKeys() {
  console.log('🔍 Testing crypto price alerts function...');
  console.log(`   Function URL: ${FUNCTION_URL}\n`);

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Body:');
    console.log(JSON.stringify(result, null, 2));

    if (result.debug) {
      console.log('\n🔑 Environment Variable Check:');
      console.log('   ALCHEMY_API_KEY present:', result.debug.hasAlchemyKey);
      console.log('   ALCHEMY_SOLANA_API_KEY present:', result.debug.hasSolanaKey);
      console.log('   Available ALCHEMY env vars:', result.debug.envKeys);
    }

    if (result.success === false && result.error === 'ALCHEMY_API_KEY not configured') {
      console.log('\n❌ Alchemy API key is not set in the Edge Function environment');
      console.log('\n📝 To fix this:');
      console.log('   1. Go to: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/functions');
      console.log('   2. Click on: check-crypto-price-alerts');
      console.log('   3. Go to: Settings tab');
      console.log('   4. Under "Environment Variables", add:');
      console.log('      Name: ALCHEMY_API_KEY');
      console.log('      Value: your-alchemy-api-key');
      console.log('   5. Click Save');
    } else if (result.results) {
      console.log('\n📈 Price Fetch Results:');
      result.results.forEach((r) => {
        if (r.success) {
          console.log(`   ✅ ${r.symbol}: $${r.priceUSD} USD (${r.source})`);
        } else {
          console.log(`   ❌ ${r.symbol}: ${r.error}`);
        }
      });
    }
  } catch (error) {
    console.error('❌ Error calling function:', error.message);
    process.exit(1);
  }
}

testKeys();
