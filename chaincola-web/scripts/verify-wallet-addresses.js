// Test script to verify wallet addresses match their encrypted private keys
// Run with: node verify-wallet-addresses.js

// Load environment variables from .env.local if available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                        process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('❌ Missing Supabase URL');
  console.log('   Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  process.exit(1);
}

// Prefer service role key for admin operations, fallback to anon key
const supabase = createClient(
  supabaseUrl, 
  supabaseServiceKey || supabaseAnonKey
);

async function verifyWalletAddresses() {
  console.log('🔍 Verifying wallet addresses match encrypted private keys...\n');

  try {
    let authToken = '';
    
    // Try service role key first (for admin operations)
    if (supabaseServiceKey) {
      console.log('✅ Using service role key for admin access\n');
      authToken = supabaseServiceKey;
    } else {
      // Try to get user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('❌ Not authenticated. Please sign in first.');
        console.log('\n   Options:');
        console.log('   1. Set SUPABASE_SERVICE_ROLE_KEY in .env.local for admin access');
        console.log('   2. Sign in via browser and keep session active');
        console.log('   3. Use curl script with access token\n');
        console.log('   To get access token:');
        console.log('   - Sign in to app/website as admin');
        console.log('   - Open DevTools > Application > Local Storage');
        console.log('   - Find auth token\n');
        return;
      }

      authToken = session.access_token;
      console.log(`✅ Authenticated as user: ${session.user.id.substring(0, 8)}...\n`);
    }

    // Test the verify-wallet-addresses function
    const functionUrl = `${supabaseUrl}/functions/v1/verify-wallet-addresses`;
    
    console.log('📡 Calling verify-wallet-addresses function...');
    console.log('   This will decrypt private keys and verify addresses match\n');

    // You can specify filters:
    // - user_id: specific user
    // - asset: BTC, ETH, XRP, etc.
    // - network: mainnet or testnet
    // - limit: number of wallets to check (default: 10)
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': supabaseServiceKey || supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // user_id: session.user.id, // Optional: verify only your wallets
        // asset: 'BTC', // Optional: verify only BTC wallets
        // network: 'mainnet', // Optional: verify only mainnet wallets
        limit: 20, // Check up to 20 wallets
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
      console.log('📊 Verification Summary:');
      console.log(`   Total wallets checked: ${result.summary.total}`);
      console.log(`   ✅ Verified (match): ${result.summary.verified}`);
      console.log(`   ❌ Mismatches: ${result.summary.mismatches}`);
      console.log(`   ⚠️  Errors: ${result.summary.errors}`);
      console.log(`   ⏭️  Skipped: ${result.summary.skipped}\n`);

      if (result.summary.mismatches > 0 || result.summary.errors > 0) {
        console.log('⚠️  Issues found:\n');
        result.results.forEach((r, i) => {
          if (r.status === 'mismatch' || r.status === 'error') {
            console.log(`   ${i + 1}. ${r.asset} wallet (${r.wallet_id.substring(0, 8)}...)`);
            console.log(`      Status: ${r.status}`);
            if (r.error) {
              console.log(`      Error: ${r.error}`);
            }
            if (r.stored_address && r.derived_address) {
              console.log(`      Stored: ${r.stored_address}`);
              console.log(`      Derived: ${r.derived_address}`);
            }
            console.log('');
          }
        });
      }

      if (result.summary.verified > 0) {
        console.log('✅ Verified wallets:\n');
        result.results
          .filter(r => r.status === 'verified')
          .slice(0, 5) // Show first 5 verified wallets
          .forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.asset} wallet: ${r.stored_address.substring(0, 10)}...`);
          });
        if (result.summary.verified > 5) {
          console.log(`   ... and ${result.summary.verified - 5} more`);
        }
        console.log('');
      }

      if (result.summary.verified === result.summary.total && result.summary.total > 0) {
        console.log('🎉 All wallets verified successfully!');
      }
    } else {
      console.error('❌ Verification failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

verifyWalletAddresses();

