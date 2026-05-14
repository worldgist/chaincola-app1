#!/usr/bin/env node

/**
 * Admin Script: Send SOL to Main Wallet
 * 
 * This script allows admins to send SOL from a user wallet to the main treasury wallet.
 * 
 * Usage:
 *   node admin-send-sol-to-main-wallet.js <user_id> <amount> [reason]
 * 
 * Example:
 *   node admin-send-sol-to-main-wallet.js abc123... 0.5 "Transfer to main wallet"
 *   node admin-send-sol-to-main-wallet.js abc123... all "Sweep all SOL"
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendSolToMainWallet(userId, amount, reason) {
  try {
    console.log('🔍 Getting main wallet address...\n');

    // 1. Get main wallet address
    const { data: systemWallet, error: sysError } = await supabase
      .from('system_wallets')
      .select('sol_main_address')
      .eq('id', 1)
      .single();

    if (sysError || !systemWallet?.sol_main_address) {
      console.error('❌ Error: Main Solana wallet address not configured');
      console.error('   Please set it in Admin → Treasury → Wallet Addresses');
      return;
    }

    const mainAddress = systemWallet.sol_main_address;
    console.log(`✅ Main wallet address: ${mainAddress}\n`);

    // 2. Get user's SOL balance
    const { data: userWallet, error: userError } = await supabase
      .from('user_wallets')
      .select('sol_balance')
      .eq('user_id', userId)
      .single();

    if (userError || !userWallet) {
      console.error('❌ Error: User wallet not found');
      return;
    }

    const userBalance = parseFloat(userWallet.sol_balance || 0);
    console.log(`💰 User SOL balance: ${userBalance} SOL\n`);

    if (userBalance <= 0) {
      console.error('❌ Error: User has no SOL balance');
      return;
    }

    // 3. Determine amount to send
    const sendAll = amount === 'all' || amount === 'ALL';
    const amountToSend = sendAll ? userBalance : parseFloat(amount);

    if (!sendAll && (isNaN(amountToSend) || amountToSend <= 0)) {
      console.error('❌ Error: Invalid amount. Use a number or "all"');
      return;
    }

    if (amountToSend > userBalance) {
      console.error(`❌ Error: Insufficient balance. Available: ${userBalance} SOL, Requested: ${amountToSend} SOL`);
      return;
    }

    console.log(`📤 Preparing to send ${amountToSend} SOL to main wallet...\n`);
    console.log(`   From: User ${userId.substring(0, 8)}...`);
    console.log(`   To: ${mainAddress}`);
    console.log(`   Reason: ${reason || 'Admin transfer'}\n`);

    // 4. Call send-solana-transaction Edge Function
    // Note: This requires the user to have a Solana wallet with private key
    console.log('⚠️  To complete this transfer, you need to:');
    console.log('   1. Use the send-solana-transaction Edge Function');
    console.log('   2. Or use the admin UI in Treasury Management');
    console.log('   3. Or manually transfer using a Solana wallet\n');

    // Alternative: call Supabase RPC or admin tooling if you add a replacement.
    console.log('💡 Alternative: Use Admin Panel → Treasury → Adjust Liquidity');
    console.log('   This allows you to manually adjust the inventory after transfer.\n');

    // For now, just show instructions
    console.log('📝 Instructions:');
    console.log('   1. Go to Admin → Treasury');
    console.log('   2. Find the user wallet that has SOL');
    console.log('   3. Use the send function or manually transfer');
    console.log('   4. After blockchain transfer, adjust inventory in Treasury\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node admin-send-sol-to-main-wallet.js <user_id> <amount> [reason]');
  console.log('');
  console.log('Examples:');
  console.log('  node admin-send-sol-to-main-wallet.js abc123... 0.5');
  console.log('  node admin-send-sol-to-main-wallet.js abc123... all "Sweep all SOL"');
  process.exit(1);
}

const [userId, amount, reason] = args;
sendSolToMainWallet(userId, amount, reason);
