#!/usr/bin/env node

/**
 * Check On-Chain Balances for System Wallets
 * 
 * This script checks the actual blockchain balances for all system main wallet addresses
 * and compares them with the database inventory balances.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const alchemyEthUrl = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
const solanaRpcUrl = process.env.SOLANA_RPC_URL || process.env.ALCHEMY_SOLANA_URL || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
 * Check Ethereum balance (ETH or ERC-20 tokens)
 */
async function checkEthBalance(address, tokenContract = null) {
  try {
    if (tokenContract) {
      // ERC-20 token balance check
      // Remove '0x' prefix, convert to lowercase, and pad to 64 characters
      const addressWithoutPrefix = address.toLowerCase().replace('0x', '');
      const paddedAddress = addressWithoutPrefix.padStart(64, '0');
      const data = `0x70a08231${paddedAddress}`; // balanceOf(address)
      
      const response = await fetch(alchemyEthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: tokenContract, data }, 'latest'],
          id: 1,
        }),
      });

      if (!response.ok) {
        return { balance: 0, error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      if (result.error) {
        return { balance: 0, error: result.error.message };
      }

      const balanceHex = result.result || '0x0';
      if (balanceHex === '0x' || balanceHex === '0x0') {
        return { balance: 0, error: null };
      }
      
      const balanceWei = BigInt(balanceHex);
      const balance = Number(balanceWei) / 1e6; // USDT/USDC have 6 decimals
      return { balance, error: null };
    } else {
      // Native ETH balance
      const response = await fetch(alchemyEthUrl, {
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
        return { balance: 0, error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      if (result.error) {
        return { balance: 0, error: result.error.message };
      }

      const balanceEth = weiToEth(result.result || '0x0');
      return { balance: balanceEth, error: null };
    }
  } catch (error) {
    return { balance: 0, error: error.message };
  }
}

/**
 * Check Solana balance
 */
async function checkSolBalance(address) {
  try {
    const response = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    });

    if (!response.ok) {
      return { balance: 0, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    if (result.error) {
      return { balance: 0, error: result.error.message };
    }

    const balanceLamports = result.result?.value || 0;
    const balanceSOL = balanceLamports / 1e9;
    return { balance: balanceSOL, error: null };
  } catch (error) {
    return { balance: 0, error: error.message };
  }
}

/**
 * Check Bitcoin balance (placeholder - would need Bitcoin RPC)
 */
async function checkBtcBalance(address) {
  // Bitcoin balance check would require Bitcoin RPC node
  // For now, return placeholder
  return { balance: 0, error: 'Bitcoin balance check not implemented (requires Bitcoin RPC)' };
}

/**
 * Check XRP balance (placeholder - would need XRP RPC)
 */
async function checkXrpBalance(address) {
  // XRP balance check would require XRP RPC
  // For now, return placeholder
  return { balance: 0, error: 'XRP balance check not implemented (requires XRP RPC)' };
}

/**
 * Main function to check all on-chain balances
 */
async function checkOnChainBalances() {
  try {
    console.log('📊 Fetching system wallet addresses and checking on-chain balances...\n');

    // Get system wallet with addresses
    const { data: systemWallet, error } = await supabase
      .from('system_wallets')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('❌ Error fetching system wallet:', error);
      return;
    }

    if (!systemWallet) {
      console.error('❌ System wallet not found');
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔗 ON-CHAIN BALANCE CHECK');
    console.log('═══════════════════════════════════════════════════════\n');

    const results = [];

    // Check BTC
    if (systemWallet.btc_main_address) {
      console.log(`🔍 Checking BTC: ${systemWallet.btc_main_address}`);
      const btcResult = await checkBtcBalance(systemWallet.btc_main_address);
      const dbBtc = parseFloat(systemWallet.btc_inventory || 0);
      results.push({
        asset: 'BTC',
        address: systemWallet.btc_main_address,
        onChain: btcResult.balance,
        database: dbBtc,
        difference: btcResult.balance - dbBtc,
        error: btcResult.error,
      });
      if (btcResult.error) {
        console.log(`   ⚠️  ${btcResult.error}\n`);
      } else {
        console.log(`   On-chain: ${btcResult.balance.toFixed(8)} BTC`);
        console.log(`   Database:  ${dbBtc.toFixed(8)} BTC`);
        console.log(`   Difference: ${(btcResult.balance - dbBtc).toFixed(8)} BTC\n`);
      }
    }

    // Check ETH
    if (systemWallet.eth_main_address) {
      console.log(`🔍 Checking ETH: ${systemWallet.eth_main_address}`);
      const ethResult = await checkEthBalance(systemWallet.eth_main_address);
      const dbEth = parseFloat(systemWallet.eth_inventory || 0);
      results.push({
        asset: 'ETH',
        address: systemWallet.eth_main_address,
        onChain: ethResult.balance,
        database: dbEth,
        difference: ethResult.balance - dbEth,
        error: ethResult.error,
      });
      if (ethResult.error) {
        console.log(`   ⚠️  ${ethResult.error}\n`);
      } else {
        console.log(`   On-chain: ${ethResult.balance.toFixed(8)} ETH`);
        console.log(`   Database:  ${dbEth.toFixed(8)} ETH`);
        console.log(`   Difference: ${(ethResult.balance - dbEth).toFixed(8)} ETH\n`);
      }
    }

    // Check SOL
    if (systemWallet.sol_main_address) {
      console.log(`🔍 Checking SOL: ${systemWallet.sol_main_address}`);
      const solResult = await checkSolBalance(systemWallet.sol_main_address);
      const dbSol = parseFloat(systemWallet.sol_inventory || 0);
      results.push({
        asset: 'SOL',
        address: systemWallet.sol_main_address,
        onChain: solResult.balance,
        database: dbSol,
        difference: solResult.balance - dbSol,
        error: solResult.error,
      });
      if (solResult.error) {
        console.log(`   ⚠️  ${solResult.error}\n`);
      } else {
        console.log(`   On-chain: ${solResult.balance.toFixed(8)} SOL`);
        console.log(`   Database:  ${dbSol.toFixed(8)} SOL`);
        console.log(`   Difference: ${(solResult.balance - dbSol).toFixed(8)} SOL\n`);
      }
    }

    // Check USDT (Ethereum)
    if (systemWallet.usdt_eth_main_address) {
      console.log(`🔍 Checking USDT (Ethereum): ${systemWallet.usdt_eth_main_address}`);
      const usdtContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT contract address
      const usdtResult = await checkEthBalance(systemWallet.usdt_eth_main_address, usdtContract);
      const dbUsdt = parseFloat(systemWallet.usdt_inventory || 0);
      results.push({
        asset: 'USDT (ETH)',
        address: systemWallet.usdt_eth_main_address,
        onChain: usdtResult.balance,
        database: dbUsdt,
        difference: usdtResult.balance - dbUsdt,
        error: usdtResult.error,
      });
      if (usdtResult.error) {
        console.log(`   ⚠️  ${usdtResult.error}\n`);
      } else {
        console.log(`   On-chain: ${usdtResult.balance.toFixed(6)} USDT`);
        console.log(`   Database:  ${dbUsdt.toFixed(6)} USDT`);
        console.log(`   Difference: ${(usdtResult.balance - dbUsdt).toFixed(6)} USDT\n`);
      }
    }

    // Check USDC (Ethereum)
    if (systemWallet.usdc_eth_main_address) {
      console.log(`🔍 Checking USDC (Ethereum): ${systemWallet.usdc_eth_main_address}`);
      const usdcContract = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC contract address
      const usdcResult = await checkEthBalance(systemWallet.usdc_eth_main_address, usdcContract);
      const dbUsdc = parseFloat(systemWallet.usdc_inventory || 0);
      results.push({
        asset: 'USDC (ETH)',
        address: systemWallet.usdc_eth_main_address,
        onChain: usdcResult.balance,
        database: dbUsdc,
        difference: usdcResult.balance - dbUsdc,
        error: usdcResult.error,
      });
      if (usdcResult.error) {
        console.log(`   ⚠️  ${usdcResult.error}\n`);
      } else {
        console.log(`   On-chain: ${usdcResult.balance.toFixed(6)} USDC`);
        console.log(`   Database:  ${dbUsdc.toFixed(6)} USDC`);
        console.log(`   Difference: ${(usdcResult.balance - dbUsdc).toFixed(6)} USDC\n`);
      }
    }

    // Check XRP
    if (systemWallet.xrp_main_address) {
      console.log(`🔍 Checking XRP: ${systemWallet.xrp_main_address}`);
      const xrpResult = await checkXrpBalance(systemWallet.xrp_main_address);
      const dbXrp = parseFloat(systemWallet.xrp_inventory || 0);
      results.push({
        asset: 'XRP',
        address: systemWallet.xrp_main_address,
        onChain: xrpResult.balance,
        database: dbXrp,
        difference: xrpResult.balance - dbXrp,
        error: xrpResult.error,
      });
      if (xrpResult.error) {
        console.log(`   ⚠️  ${xrpResult.error}\n`);
      } else {
        console.log(`   On-chain: ${xrpResult.balance.toFixed(8)} XRP`);
        console.log(`   Database:  ${dbXrp.toFixed(8)} XRP`);
        console.log(`   Difference: ${(xrpResult.balance - dbXrp).toFixed(8)} XRP\n`);
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.asset}: ${result.error}`);
      } else {
        const match = Math.abs(result.difference) < 0.0001;
        const icon = match ? '✅' : '⚠️';
        console.log(`${icon} ${result.asset}:`);
        console.log(`   On-chain: ${result.onChain.toFixed(8)}`);
        console.log(`   Database: ${result.database.toFixed(8)}`);
        console.log(`   Difference: ${result.difference.toFixed(8)}`);
        if (!match) {
          console.log(`   ⚠️  Balance mismatch detected!`);
        }
        console.log('');
      }
    });

    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

checkOnChainBalances()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
