/**
 * Script to check SOL balance and locked amounts for a user
 * Usage: node check-sol-balance-locked.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpcxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSolBalance(userEmail) {
  console.log(`\n🔍 Checking SOL balance for user: ${userEmail}\n`);

  // Get user ID
  const { data: userProfiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email')
    .eq('email', userEmail)
    .limit(1);

  if (profileError || !userProfiles || userProfiles.length === 0) {
    console.error('❌ User not found:', profileError?.message || 'No user found');
    return;
  }

  const userProfile = userProfiles[0];

  const userId = userProfile.id;
  console.log(`✅ Found user: ${userProfile.email} (ID: ${userId})\n`);

  // Get SOL balance
  const { data: solBalance, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance, locked, currency, updated_at')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  if (balanceError && balanceError.code !== 'PGRST116') {
    console.error('❌ Error fetching SOL balance:', balanceError);
    return;
  }

  if (!solBalance) {
    console.log('⚠️ No SOL balance record found for this user');
    console.log('   Checking for SOL transactions and wallet...\n');
    
    // Check for SOL transactions
    const { data: solTransactions, error: txError } = await supabase
      .from('transactions')
      .select('id, crypto_amount, crypto_currency, transaction_hash, status, created_at')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (!txError && solTransactions && solTransactions.length > 0) {
      console.log(`📋 Found ${solTransactions.length} SOL transaction(s):\n`);
      solTransactions.forEach((tx, index) => {
        console.log(`   ${index + 1}. TX ID: ${tx.id}`);
        console.log(`      Amount: ${tx.crypto_amount || 'N/A'} SOL`);
        console.log(`      Status: ${tx.status}`);
        console.log(`      Hash: ${tx.transaction_hash || 'N/A'}`);
        console.log(`      Created: ${tx.created_at}`);
        console.log('');
      });
    } else {
      console.log('   No SOL transactions found\n');
    }
    
    // Check for SOL wallet
    const { data: solWallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('id, address, asset, created_at')
      .eq('user_id', userId)
      .eq('asset', 'SOL')
      .limit(1);
    
    if (!walletError && solWallet && solWallet.length > 0) {
      console.log(`✅ Found SOL wallet: ${solWallet[0].address}\n`);
    } else {
      console.log('   No SOL wallet found\n');
    }
  } else {
    const balance = parseFloat(solBalance.balance || '0');
    const locked = parseFloat(solBalance.locked || '0');
    const available = balance - locked;

    console.log('📊 SOL Balance Details:');
    console.log(`   Total Balance: ${balance.toFixed(9)} SOL`);
    console.log(`   Locked Amount: ${locked.toFixed(9)} SOL`);
    console.log(`   Available: ${available.toFixed(9)} SOL`);
    console.log(`   Last Updated: ${solBalance.updated_at || 'N/A'}\n`);

    if (locked > 0) {
      console.log('⚠️ WARNING: SOL balance is locked! Checking for pending sell orders...\n');

      // Check for pending sell orders
      const { data: pendingSells, error: sellsError } = await supabase
        .from('sells')
        .select('sell_id, sol_amount, locked_sol_amount, status, created_at, updated_at, quote_expires_at')
        .eq('user_id', userId)
        .in('status', ['PENDING', 'SOL_SENT', 'SOL_CREDITED_ON_LUNO', 'SOLD_ON_LUNO'])
        .order('created_at', { ascending: false });

      if (sellsError) {
        console.error('❌ Error fetching sell orders:', sellsError);
      } else if (pendingSells && pendingSells.length > 0) {
        console.log(`📋 Found ${pendingSells.length} pending sell order(s):\n`);
        pendingSells.forEach((sell, index) => {
          console.log(`   ${index + 1}. Sell ID: ${sell.sell_id}`);
          console.log(`      Status: ${sell.status}`);
          console.log(`      SOL Amount: ${sell.sol_amount || 'N/A'}`);
          console.log(`      Locked Amount: ${sell.locked_sol_amount || 'N/A'}`);
          console.log(`      Created: ${sell.created_at}`);
          console.log(`      Updated: ${sell.updated_at}`);
          if (sell.quote_expires_at) {
            const expiresAt = new Date(sell.quote_expires_at);
            const now = new Date();
            const isExpired = expiresAt < now;
            console.log(`      Quote Expires: ${sell.quote_expires_at} ${isExpired ? '⚠️ EXPIRED' : ''}`);
          }
          console.log('');
        });
      } else {
        console.log('⚠️ No pending sell orders found, but balance is locked!');
        console.log('   This might indicate a stuck lock. Consider unlocking manually.\n');
      }
    }
  }

  // Check all sell orders for this user
  const { data: allSells, error: allSellsError } = await supabase
    .from('sells')
    .select('sell_id, sol_amount, locked_sol_amount, status, created_at, updated_at, completed_at, sol_tx_hash')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!allSellsError && allSells && allSells.length > 0) {
    console.log(`\n📋 All sell orders (last 20):\n`);
    allSells.forEach((sell, index) => {
      console.log(`   ${index + 1}. Sell ID: ${sell.sell_id}`);
      console.log(`      Status: ${sell.status}`);
      console.log(`      SOL Amount: ${sell.sol_amount || 'N/A'}`);
      console.log(`      Locked Amount: ${sell.locked_sol_amount || 'N/A'}`);
      console.log(`      TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`      Created: ${sell.created_at}`);
      console.log(`      Updated: ${sell.updated_at}`);
      if (sell.completed_at) {
        console.log(`      Completed: ${sell.completed_at}`);
      }
      console.log('');
    });
    
    // Calculate total SOL sold
    const totalSold = allSells
      .filter(s => s.sol_amount && (s.status === 'COMPLETED' || s.status === 'SOLD_ON_LUNO'))
      .reduce((sum, s) => sum + parseFloat(s.sol_amount || '0'), 0);
    
    if (totalSold > 0) {
      console.log(`💰 Total SOL sold (completed): ${totalSold.toFixed(9)} SOL\n`);
    }
  } else {
    console.log('\n📋 No sell orders found\n');
  }
  
  // Check if balance was debited but not properly recorded
  console.log('🔍 Checking for potential balance issues...\n');
  
  // Check if there's a balance record that was deleted or zeroed out
  const { data: allBalances, error: balancesError } = await supabase
    .from('wallet_balances')
    .select('currency, balance, locked, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  
  if (!balancesError && allBalances && allBalances.length > 0) {
    console.log('📊 All wallet balances:\n');
    allBalances.forEach((bal) => {
      console.log(`   ${bal.currency}: ${bal.balance} (locked: ${bal.locked || '0'}) - Updated: ${bal.updated_at}`);
    });
    console.log('');
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Please provide user email as argument');
  console.log('Usage: node check-sol-balance-locked.js <user_email>');
  process.exit(1);
}

checkSolBalance(userEmail).catch(console.error);

