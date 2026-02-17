#!/usr/bin/env node

/**
 * Check if a transaction exists in the database
 */

try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TX_HASH = '0xca0d18c803a21b0dd6413ec99d86dc52f01e0ff3df903ce72e6a5f5ee2408973';
const WALLET_ADDRESS = '0xD325417473eB92E272F699b2a9A4e7139Fb844c9';

async function checkTransaction() {
  console.log(`🔍 Checking if transaction exists in database...`);
  console.log(`   Transaction: ${TX_HASH}`);
  console.log(`   Wallet: ${WALLET_ADDRESS}`);
  console.log('');

  const { data: tx, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_hash', TX_HASH.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!tx) {
    console.log('❌ Transaction NOT found in database');
    console.log('');
    console.log('This transaction needs to be recorded and credited!');
    console.log('');
    console.log('Transaction details:');
    console.log('  Hash: 0xca0d18c803a21b0dd6413ec99d86dc52f01e0ff3df903ce72e6a5f5ee2408973');
    console.log('  Block: 24136670');
    console.log('  Amount: 0.00074119 ETH');
    console.log('  To: 0xD325417473eB92E272F699b2a9A4e7139Fb844c9');
    console.log('');
    
    // Get user info
    const { data: wallet } = await supabase
      .from('crypto_wallets')
      .select('user_id')
      .eq('address', WALLET_ADDRESS)
      .eq('asset', 'ETH')
      .single();

    if (wallet) {
      const { data: user } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('user_id', wallet.user_id)
        .single();

      console.log('User:', user?.full_name || 'N/A', `(${user?.email || 'N/A'})`);
      console.log('User ID:', wallet.user_id);
    }
  } else {
    console.log('✅ Transaction found in database:');
    console.log('');
    console.log('  ID:', tx.id);
    console.log('  Status:', tx.status);
    console.log('  Amount:', tx.crypto_amount, tx.crypto_currency);
    console.log('  Confirmations:', tx.confirmations);
    console.log('  Created:', tx.created_at);
    console.log('  Metadata:', JSON.stringify(tx.metadata, null, 2));
  }
}

checkTransaction();










