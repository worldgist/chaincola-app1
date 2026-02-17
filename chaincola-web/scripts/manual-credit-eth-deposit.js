#!/usr/bin/env node

/**
 * Manually Credit Missing ETH Deposit
 * 
 * This script manually records a transaction and credits the user's wallet
 * for deposits that were missed by the automatic detection system.
 * 
 * Usage:
 *   node scripts/manual-credit-eth-deposit.js <txHash> <amount> <toAddress>
 */

try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Transaction details
const TX_HASH = '0xca0d18c803a21b0dd6413ec99d86dc52f01e0ff3df903ce72e6a5f5ee2408973';
const AMOUNT = 0.00074119; // ETH
const TO_ADDRESS = '0xD325417473eB92E272F699b2a9A4e7139Fb844c9';
const BLOCK_NUMBER = 24136670;
const FROM_ADDRESS = '0x416299aade6443e6f6e8ab67126e65a7f606eef5';

async function creditDeposit() {
  console.log('💰 Manually crediting missing ETH deposit...');
  console.log('');

  try {
    // Find wallet and user
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address')
      .eq('address', TO_ADDRESS)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .single();

    if (walletError || !wallet) {
      throw new Error(`Wallet not found: ${walletError?.message || 'Unknown error'}`);
    }

    console.log(`✅ Found wallet for user: ${wallet.user_id}`);

    // Get current block number to calculate confirmations
    const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const blockResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const blockData = await blockResponse.json();
    const currentBlock = parseInt(blockData.result || '0', 16);
    const confirmations = currentBlock - BLOCK_NUMBER;

    console.log(`   Current block: ${currentBlock}`);
    console.log(`   Transaction block: ${BLOCK_NUMBER}`);
    console.log(`   Confirmations: ${confirmations}`);
    console.log('');

    // Check if transaction already exists
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status, metadata')
      .eq('transaction_hash', TX_HASH.toLowerCase())
      .maybeSingle();

    if (existingTx) {
      console.log('⚠️  Transaction already exists in database');
      console.log(`   ID: ${existingTx.id}`);
      console.log(`   Status: ${existingTx.status}`);
      console.log('');
      
      if (existingTx.metadata?.credited === true) {
        console.log('✅ Transaction already credited');
        return;
      }
    }

    // Record transaction
    const status = confirmations >= 12 ? 'CONFIRMED' : 'PENDING';
    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: wallet.user_id,
        transaction_type: 'RECEIVE',
        crypto_currency: 'ETH',
        network: 'mainnet',
        crypto_amount: AMOUNT.toFixed(8),
        to_address: TO_ADDRESS,
        from_address: FROM_ADDRESS,
        transaction_hash: TX_HASH.toLowerCase(),
        status: status,
        confirmations: confirmations,
        block_number: BLOCK_NUMBER,
        metadata: {
          detected_via: 'manual_credit_script',
          detected_at: new Date().toISOString(),
          manual_credit: true,
        },
      })
      .select()
      .single();

    if (txError) {
      if (txError.code === '23505') { // Unique constraint violation
        console.log('⚠️  Transaction already exists, updating...');
        const { data: updatedTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('transaction_hash', TX_HASH.toLowerCase())
          .single();
        
        if (updatedTx) {
          newTx = { id: updatedTx.id };
        } else {
          throw txError;
        }
      } else {
        throw txError;
      }
    }

    console.log(`✅ Transaction recorded: ${newTx.id}`);
    console.log('');

    // Credit wallet if confirmed
    if (confirmations >= 12) {
      console.log(`💳 Crediting ${AMOUNT.toFixed(8)} ETH to user ${wallet.user_id}...`);

      const { data: rpcResult, error: creditError } = await supabase.rpc('credit_crypto_wallet', {
        p_user_id: wallet.user_id,
        p_amount: AMOUNT,
        p_currency: 'ETH',
      });

      if (creditError) {
        throw new Error(`Failed to credit wallet: ${creditError.message}`);
      }

      // Update transaction metadata
      await supabase
        .from('transactions')
        .update({
          status: 'CONFIRMED',
          metadata: {
            detected_via: 'manual_credit_script',
            detected_at: new Date().toISOString(),
            manual_credit: true,
            credited: true,
            credited_at: new Date().toISOString(),
          },
        })
        .eq('id', newTx.id);

      console.log(`✅ Successfully credited ${AMOUNT.toFixed(8)} ETH`);
      console.log('');

      // Verify balance
      const { data: balance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', wallet.user_id)
        .eq('currency', 'ETH')
        .single();

      console.log(`📊 New balance: ${parseFloat(balance?.balance || '0').toFixed(8)} ETH`);
    } else {
      console.log(`⏳ Transaction needs more confirmations (${confirmations}/12)`);
      console.log('   Will be credited automatically when confirmations reach 12');
    }

    console.log('');
    console.log('✅ Manual credit process completed');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

creditDeposit();










