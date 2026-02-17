#!/usr/bin/env node

/**
 * Find Where Crypto Actually Is
 * 
 * This script helps identify where crypto balances exist (user wallets vs system inventory)
 * to help determine if crypto needs to be moved to main wallets.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findCryptoLocations() {
  try {
    console.log('🔍 Finding where crypto balances are located...\n');

    // Get system inventory
    const { data: systemWallet, error: sysError } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (sysError || !systemWallet) {
      console.error('❌ Error fetching system wallet:', sysError);
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SYSTEM INVENTORY (Database Ledger)');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`SOL:  ${parseFloat(systemWallet.sol_inventory || 0).toFixed(8)} SOL`);
    console.log(`USDT: ${parseFloat(systemWallet.usdt_inventory || 0).toFixed(8)} USDT`);
    console.log(`USDC: ${parseFloat(systemWallet.usdc_inventory || 0).toFixed(8)} USDC`);
    console.log(`ETH:  ${parseFloat(systemWallet.eth_inventory || 0).toFixed(8)} ETH`);
    console.log(`BTC:  ${parseFloat(systemWallet.btc_inventory || 0).toFixed(8)} BTC`);
    console.log(`XRP:  ${parseFloat(systemWallet.xrp_inventory || 0).toFixed(8)} XRP\n`);

    // Get user wallet balances (from wallet_balances table)
    console.log('═══════════════════════════════════════════════════════');
    console.log('👥 USER WALLET BALANCES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: walletBalances, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('user_id, currency, balance')
      .in('currency', ['SOL', 'USDT', 'USDC', 'ETH', 'BTC', 'XRP', 'sol', 'usdt', 'usdc', 'eth', 'btc', 'xrp'])
      .gt('balance', 0)
      .order('balance', { ascending: false })
      .limit(50);

    if (balanceError) {
      console.error('❌ Error fetching wallet balances:', balanceError);
    } else if (!walletBalances || walletBalances.length === 0) {
      console.log('ℹ️  No user wallet balances found\n');
    } else {
      // Group by currency
      const byCurrency = {};
      walletBalances.forEach(wb => {
        const currency = wb.currency.toUpperCase();
        if (!byCurrency[currency]) {
          byCurrency[currency] = [];
        }
        byCurrency[currency].push({
          user_id: wb.user_id,
          balance: parseFloat(wb.balance || 0),
        });
      });

      // Get user emails
      const userIds = [...new Set(walletBalances.map(wb => wb.user_id))];
      const { data: userProfiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name')
        .in('user_id', userIds);

      const userMap = {};
      if (userProfiles) {
        userProfiles.forEach(up => {
          userMap[up.user_id] = { email: up.email, name: up.full_name };
        });
      }

      // Display by currency
      Object.keys(byCurrency).sort().forEach(currency => {
        const users = byCurrency[currency];
        const total = users.reduce((sum, u) => sum + u.balance, 0);
        
        console.log(`${currency}: Total ${total.toFixed(8)} ${currency}`);
        console.log(`   Found in ${users.length} user wallet(s):`);
        
        users.slice(0, 10).forEach(user => {
          const userInfo = userMap[user.user_id] || {};
          const email = userInfo.email || user.user_id.substring(0, 8) + '...';
          console.log(`   - ${email}: ${user.balance.toFixed(8)} ${currency}`);
        });
        
        if (users.length > 10) {
          console.log(`   ... and ${users.length - 10} more`);
        }
        console.log('');
      });
    }

    // Get user_wallets table balances (alternative location)
    console.log('═══════════════════════════════════════════════════════');
    console.log('💼 USER_WALLETS TABLE BALANCES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { data: userWallets, error: userWalletError } = await supabase
      .from('user_wallets')
      .select('user_id, sol_balance, eth_balance, btc_balance')
      .or('sol_balance.gt.0,eth_balance.gt.0,btc_balance.gt.0')
      .limit(20);

    if (userWalletError) {
      console.log('ℹ️  Could not fetch user_wallets (table may not exist)\n');
    } else if (!userWallets || userWallets.length === 0) {
      console.log('ℹ️  No balances in user_wallets table\n');
    } else {
      let solTotal = 0, ethTotal = 0, btcTotal = 0;
      
      userWallets.forEach(uw => {
        const sol = parseFloat(uw.sol_balance || 0);
        const eth = parseFloat(uw.eth_balance || 0);
        const btc = parseFloat(uw.btc_balance || 0);
        
        if (sol > 0) solTotal += sol;
        if (eth > 0) ethTotal += eth;
        if (btc > 0) btcTotal += btc;
      });

      if (solTotal > 0) console.log(`SOL: ${solTotal.toFixed(8)} SOL (across ${userWallets.length} users)`);
      if (ethTotal > 0) console.log(`ETH: ${ethTotal.toFixed(8)} ETH (across ${userWallets.length} users)`);
      if (btcTotal > 0) console.log(`BTC: ${btcTotal.toFixed(8)} BTC (across ${userWallets.length} users)`);
      
      if (solTotal === 0 && ethTotal === 0 && btcTotal === 0) {
        console.log('ℹ️  No balances found in user_wallets table\n');
      } else {
        console.log('');
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SUMMARY & RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════\n');

    const sysSol = parseFloat(systemWallet.sol_inventory || 0);
    const sysUsdt = parseFloat(systemWallet.usdt_inventory || 0);
    const sysUsdc = parseFloat(systemWallet.usdc_inventory || 0);

    if (sysSol > 0) {
      console.log(`⚠️  SOL Inventory: ${sysSol.toFixed(8)} SOL`);
      console.log('   → Check if this exists in user wallets above');
      console.log('   → If not found, inventory may need correction\n');
    }

    if (sysUsdt > 0) {
      console.log(`⚠️  USDT Inventory: ${sysUsdt.toFixed(8)} USDT`);
      console.log('   → Check if this exists in user wallets above');
      console.log('   → If not found, inventory may need correction\n');
    }

    if (sysUsdc > 0) {
      console.log(`⚠️  USDC Inventory: ${sysUsdc.toFixed(8)} USDC`);
      console.log('   → Check if this exists in user wallets above');
      console.log('   → If not found, inventory may need correction\n');
    }

    console.log('💡 Next Steps:');
    console.log('   1. If crypto is in user wallets → Move to main wallets');
    console.log('   2. If crypto is not found → Adjust inventory to match reality');
    console.log('   3. See MOVE_CRYPTO_TO_MAIN_WALLET.md for detailed instructions\n');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

findCryptoLocations()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
