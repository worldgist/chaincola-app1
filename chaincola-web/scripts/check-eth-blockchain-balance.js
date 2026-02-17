#!/usr/bin/env node

/**
 * Ethereum Blockchain Balance Checker
 * 
 * This script checks the on-chain Ethereum balances for all active wallets
 * and compares them with database balances to identify discrepancies.
 * 
 * Usage:
 *   node scripts/check-eth-blockchain-balance.js
 *   node scripts/check-eth-blockchain-balance.js --address 0x...
 *   node scripts/check-eth-blockchain-balance.js --user-id <uuid>
 */

// Try to load from .env.local if dotenv is available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

// Parse command line arguments
const args = process.argv.slice(2);
const addressArg = args.find(arg => arg.startsWith('--address='))?.split('=')[1];
const userIdArg = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Convert wei (hex string) to ETH (decimal number)
 */
function weiToEth(weiHex) {
  if (!weiHex || weiHex === '0x0' || weiHex === '0x') {
    return 0;
  }
  
  const balanceWeiBigInt = BigInt(weiHex);
  const weiPerEth = BigInt('1000000000000000000'); // 1e18
  const wholeEth = balanceWeiBigInt / weiPerEth;
  const remainderWei = balanceWeiBigInt % weiPerEth;
  const decimalPart = Number(remainderWei) / Number(weiPerEth);
  return Number(wholeEth) + decimalPart;
}

/**
 * Check on-chain balance for an Ethereum address
 */
async function checkOnChainBalance(address) {
  try {
    const response = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Alchemy API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const balanceWeiHex = data.result || '0x0';
    const balanceEth = weiToEth(balanceWeiHex);
    
    return {
      balanceEth,
      balanceWeiHex,
      balanceWei: BigInt(balanceWeiHex).toString(),
    };
  } catch (error) {
    console.error(`   ❌ Error checking on-chain balance: ${error.message}`);
    return null;
  }
}

/**
 * Get database balance for a user
 */
async function getDatabaseBalance(userId, currency = 'ETH') {
  try {
    const { data, error } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', currency)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? parseFloat(data.balance || '0') : 0;
  } catch (error) {
    console.error(`   ❌ Error fetching database balance: ${error.message}`);
    return null;
  }
}

/**
 * Main function to check balances
 */
async function checkBalances() {
  console.log('🔍 Checking Ethereum Blockchain Balances...');
  console.log('');

  try {
    // Build query based on arguments
    let query = supabase
      .from('crypto_wallets')
      .select('id, user_id, address, asset, network, is_active')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (addressArg) {
      query = query.ilike('address', `%${addressArg}%`);
      console.log(`📍 Filtering by address: ${addressArg}`);
    }

    if (userIdArg) {
      query = query.eq('user_id', userIdArg);
      console.log(`👤 Filtering by user ID: ${userIdArg}`);
    }

    const { data: wallets, error: walletsError } = await query;

    if (walletsError) {
      throw new Error(`Failed to fetch wallets: ${walletsError.message}`);
    }

    if (!wallets || wallets.length === 0) {
      console.log('⚠️  No active ETH wallets found');
      return;
    }

    console.log(`📊 Found ${wallets.length} active ETH wallet(s)`);
    console.log('');

    const results = [];
    let totalOnChain = 0;
    let totalDatabase = 0;
    let discrepancies = 0;

    // Check each wallet
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const address = wallet.address;
      
      console.log(`[${i + 1}/${wallets.length}] Checking ${address.substring(0, 10)}...${address.substring(address.length - 8)}`);

      // Get user info
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('user_id', wallet.user_id)
        .maybeSingle();

      // Check on-chain balance
      const onChainData = await checkOnChainBalance(address);
      if (!onChainData) {
        results.push({
          address,
          userId: wallet.user_id,
          userEmail: userProfile?.email || 'N/A',
          error: 'Failed to fetch on-chain balance',
        });
        continue;
      }

      // Get database balance
      const dbBalance = await getDatabaseBalance(wallet.user_id, 'ETH');
      if (dbBalance === null) {
        results.push({
          address,
          userId: wallet.user_id,
          userEmail: userProfile?.email || 'N/A',
          onChainBalance: onChainData.balanceEth,
          databaseBalance: null,
          error: 'Failed to fetch database balance',
        });
        continue;
      }

      const difference = onChainData.balanceEth - dbBalance;
      const hasDiscrepancy = Math.abs(difference) > 0.000001;

      if (hasDiscrepancy) {
        discrepancies++;
      }

      totalOnChain += onChainData.balanceEth;
      totalDatabase += dbBalance;

      results.push({
        address,
        userId: wallet.user_id,
        userEmail: userProfile?.email || 'N/A',
        userName: userProfile?.full_name || 'N/A',
        onChainBalance: onChainData.balanceEth,
        databaseBalance: dbBalance,
        difference,
        hasDiscrepancy,
      });

      // Show result
      if (hasDiscrepancy) {
        console.log(`   ⚠️  DISCREPANCY DETECTED!`);
        console.log(`      On-chain: ${onChainData.balanceEth.toFixed(8)} ETH`);
        console.log(`      Database: ${dbBalance.toFixed(8)} ETH`);
        console.log(`      Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(8)} ETH`);
      } else {
        console.log(`   ✅ Balance matches: ${onChainData.balanceEth.toFixed(8)} ETH`);
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total Wallets Checked: ${wallets.length}`);
    console.log(`Total On-chain Balance: ${totalOnChain.toFixed(8)} ETH`);
    console.log(`Total Database Balance: ${totalDatabase.toFixed(8)} ETH`);
    console.log(`Total Difference: ${(totalOnChain - totalDatabase).toFixed(8)} ETH`);
    console.log(`Discrepancies Found: ${discrepancies}`);
    console.log('');

    // Show discrepancies
    if (discrepancies > 0) {
      console.log('⚠️  WALLETS WITH DISCREPANCIES:');
      console.log('');
      results
        .filter(r => r.hasDiscrepancy)
        .forEach((r, index) => {
          console.log(`${index + 1}. ${r.address}`);
          console.log(`   User: ${r.userName} (${r.userEmail})`);
          console.log(`   On-chain: ${r.onChainBalance.toFixed(8)} ETH`);
          console.log(`   Database: ${r.databaseBalance.toFixed(8)} ETH`);
          console.log(`   Difference: ${r.difference > 0 ? '+' : ''}${r.difference.toFixed(8)} ETH`);
          console.log('');
        });
    } else {
      console.log('✅ All balances match! No discrepancies found.');
    }

    return results;
  } catch (error) {
    console.error('❌ Error checking balances:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the check
checkBalances();

