// Script to regenerate wallets that can't be decrypted
// Run with: node regenerate-failed-wallets.js [--dry-run] [--asset BTC|ETH|SOL|XRP] [--user-id USER_ID]

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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                          process.argv.find(arg => arg.startsWith('--service-key='))?.split('=')[1] || '';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const assetArg = args.find(arg => arg.startsWith('--asset='))?.split('=')[1];
const userIdArg = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];
const limitArg = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];

if (!supabaseUrl) {
  console.error('❌ Missing Supabase URL');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('   Set it in .env.local or pass as --service-key=YOUR_KEY');
  process.exit(1);
}

async function regenerateFailedWallets() {
  console.log('🔄 Regenerating Failed Wallets\n');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (wallets will be regenerated)'}`);
  if (assetArg) console.log(`   Asset filter: ${assetArg}`);
  if (userIdArg) console.log(`   User filter: ${userIdArg}`);
  console.log('');

  try {
    const functionUrl = `${supabaseUrl}/functions/v1/regenerate-failed-wallets`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userIdArg || null,
        asset: assetArg || null,
        network: 'mainnet',
        dry_run: dryRun,
        limit: limitArg ? parseInt(limitArg) : 100,
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
      console.log('📊 Regeneration Summary:');
      console.log(`   Wallets checked: ${result.checked || 0}`);
      console.log(`   Failed wallets found: ${result.failed_wallets_found || 0}`);
      
      if (dryRun) {
        console.log(`   ✅ Dry run complete - no wallets were regenerated\n`);
        
        if (result.failed_wallets && result.failed_wallets.length > 0) {
          console.log('⚠️  Wallets that would be regenerated:\n');
          result.failed_wallets.forEach((w, i) => {
            console.log(`   ${i + 1}. ${w.asset} wallet (${w.wallet_id.substring(0, 8)}...)`);
            console.log(`      User: ${w.user_id.substring(0, 8)}...`);
            console.log(`      Address: ${w.address}`);
            console.log(`      Error: ${w.error}`);
            console.log('');
          });
          
          console.log('💡 To actually regenerate these wallets, run:');
          console.log('   node regenerate-failed-wallets.js\n');
        } else {
          console.log('✅ All wallets can be decrypted - no regeneration needed!\n');
        }
      } else {
        console.log(`   ✅ Successfully regenerated: ${result.regenerated || 0}`);
        console.log(`   ❌ Failed regenerations: ${result.failed_regenerations || 0}\n`);

        if (result.results && result.results.length > 0) {
          console.log('📋 Regeneration Results:\n');
          result.results.forEach((r, i) => {
            if (r.status === 'success') {
              console.log(`   ✅ ${i + 1}. ${r.asset} wallet regenerated`);
              console.log(`      Old: ${r.old_address}`);
              console.log(`      New: ${r.new_address}`);
            } else {
              console.log(`   ❌ ${i + 1}. ${r.asset} wallet failed`);
              console.log(`      Error: ${r.error}`);
            }
            console.log('');
          });
        }

        if (result.regenerated > 0) {
          console.log('🎉 Regeneration complete!');
          console.log('   Run verify-wallet-addresses.js to verify the new wallets.\n');
        }
      }
    } else {
      console.error('❌ Regeneration failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

regenerateFailedWallets();



