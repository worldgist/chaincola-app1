// Regenerate All User Wallets Script
// Regenerates BTC, ETH, SOL, and XRP wallets for all users

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'];
const FUNCTION_MAP = {
  'BTC': 'generate-bitcoin-wallet',
  'ETH': 'generate-eth-wallet',
  'SOL': 'generate-solana-wallet',
  'XRP': 'generate-ripple-wallet',
};

// This script now calls the regenerate-all-wallets admin function
// which handles regeneration for all users at once


async function main() {
  console.log('🔄 Starting wallet regeneration for all users...');
  console.log(`   Assets: ${ASSETS.join(', ')}`);
  console.log('');

  try {
    const functionUrl = `${SUPABASE_URL}/functions/v1/regenerate-all-wallets`;
    
    console.log('📞 Calling regenerate-all-wallets admin function...');
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('');
      console.log('✅ Regeneration completed successfully!');
      console.log(`   Regenerated: ${result.regenerated} wallets`);
      console.log(`   Errors: ${result.errors}`);
      console.log('');
      
      if (result.results && result.results.length > 0) {
        console.log('📊 Results:');
        result.results.forEach((r, idx) => {
          if (r.success) {
            console.log(`   ${idx + 1}. ✅ ${r.asset} for user ${r.user_id.substring(0, 8)}... → ${r.address.substring(0, 15)}...`);
          } else {
            console.log(`   ${idx + 1}. ❌ ${r.asset} for user ${r.user_id.substring(0, 8)}... → ${r.error}`);
          }
        });
      }
    } else {
      console.error('❌ Regeneration failed:', result.error || result.message || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
