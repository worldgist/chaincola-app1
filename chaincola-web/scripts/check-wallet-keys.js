// Check if wallets are active and have encrypted keys
// Run with: node check-wallet-keys.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkWalletStatus() {
  console.log('🔍 Checking wallet status...\n');

  try {
    // Get all wallets with their status
    const { data: wallets, error } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, asset, network, address, is_active, private_key_encrypted, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Error fetching wallets:', error);
      return;
    }

    if (!wallets || wallets.length === 0) {
      console.log('ℹ️  No wallets found in database');
      return;
    }

    console.log(`📊 Found ${wallets.length} wallets:\n`);

    // Group by asset
    const byAsset = {};
    wallets.forEach(wallet => {
      if (!byAsset[wallet.asset]) {
        byAsset[wallet.asset] = [];
      }
      byAsset[wallet.asset].push(wallet);
    });

    // Summary by asset
    console.log('📈 Summary by Asset:');
    console.log('─'.repeat(80));
    Object.keys(byAsset).sort().forEach(asset => {
      const assetWallets = byAsset[asset];
      const active = assetWallets.filter(w => w.is_active).length;
      const withKeys = assetWallets.filter(w => w.private_key_encrypted && w.private_key_encrypted.trim() !== '').length;
      
      console.log(`${asset}:`);
      console.log(`  Total: ${assetWallets.length}`);
      console.log(`  Active: ${active} ${active === assetWallets.length ? '✅' : '⚠️'}`);
      console.log(`  With Encrypted Keys: ${withKeys} ${withKeys === assetWallets.length ? '✅' : '⚠️'}`);
      console.log('');
    });

    // Detailed list
    console.log('\n📋 Detailed Wallet List:');
    console.log('─'.repeat(80));
    wallets.forEach((wallet, index) => {
      const hasKey = wallet.private_key_encrypted && wallet.private_key_encrypted.trim() !== '';
      const status = wallet.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
      const keyStatus = hasKey ? '🔐 Has Key' : '⚠️  No Key';
      
      console.log(`${index + 1}. ${wallet.asset} (${wallet.network})`);
      console.log(`   Address: ${wallet.address.substring(0, 20)}...`);
      console.log(`   Status: ${status}`);
      console.log(`   Key: ${keyStatus}`);
      console.log(`   Created: ${new Date(wallet.created_at).toLocaleString()}`);
      console.log('');
    });

    // Check for issues
    console.log('\n🔍 Issues Check:');
    console.log('─'.repeat(80));
    const inactive = wallets.filter(w => !w.is_active);
    const noKeys = wallets.filter(w => !w.private_key_encrypted || w.private_key_encrypted.trim() === '');
    
    if (inactive.length > 0) {
      console.log(`⚠️  Found ${inactive.length} inactive wallet(s):`);
      inactive.forEach(w => {
        console.log(`   - ${w.asset} (${w.network}): ${w.address.substring(0, 20)}...`);
      });
    } else {
      console.log('✅ All wallets are active');
    }

    if (noKeys.length > 0) {
      console.log(`\n⚠️  Found ${noKeys.length} wallet(s) without encrypted keys:`);
      noKeys.forEach(w => {
        console.log(`   - ${w.asset} (${w.network}): ${w.address.substring(0, 20)}...`);
      });
    } else {
      console.log('✅ All wallets have encrypted keys');
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

checkWalletStatus();




