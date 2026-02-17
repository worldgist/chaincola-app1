/**
 * Check for stuck SOL sell orders that haven't been credited NGN
 * This script helps diagnose why NGN isn't being credited after Luno sells
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStuckSells() {
  console.log('🔍 Checking for stuck SOL sell orders...\n');

  // Check all SOL sell orders that are not COMPLETED
  const { data: sells, error } = await supabase
    .from('sells')
    .select('*')
    .not('status', 'eq', 'COMPLETED')
    .not('status', 'eq', 'SELL_FAILED')
    .not('status', 'eq', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('❌ Error fetching sells:', error);
    return;
  }

  console.log(`Found ${sells.length} non-completed sell orders\n`);

  // Filter SOL sells
  const solSells = sells.filter(s => s.sol_amount && parseFloat(s.sol_amount) > 0);

  console.log(`Found ${solSells.length} SOL sell orders:\n`);

  for (const sell of solSells) {
    console.log(`📋 Sell ID: ${sell.sell_id}`);
    console.log(`   Status: ${sell.status}`);
    console.log(`   SOL Amount: ${sell.sol_amount}`);
    console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
    console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
    console.log(`   Quoted NGN: ${sell.quoted_ngn || 'N/A'}`);
    console.log(`   Luno Order ID: ${sell.luno_order_id || 'N/A'}`);
    console.log(`   Created: ${sell.created_at}`);
    console.log(`   Updated: ${sell.updated_at}`);
    
    // Check user's NGN balance
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', sell.user_id)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', sell.user_id)
      .single();

    const ngnBalance = walletBalance?.balance || wallet?.ngn_balance || '0';
    console.log(`   User NGN Balance: ₦${parseFloat(ngnBalance).toFixed(2)}`);

    // Check if transaction exists
    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, status, fiat_amount, fiat_currency')
      .eq('user_id', sell.user_id)
      .eq('transaction_type', 'SELL')
      .eq('crypto_currency', 'SOL')
      .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
      .limit(5);

    console.log(`   Transactions: ${transactions?.length || 0} found`);
    if (transactions && transactions.length > 0) {
      transactions.forEach(tx => {
        console.log(`     - ${tx.id}: ${tx.status}, ${tx.fiat_currency} ${tx.fiat_amount || 'N/A'}`);
      });
    }

    // Determine what should happen
    if (sell.status === 'SOLD_ON_LUNO' && !sell.ngn_received) {
      console.log(`   ⚠️ ISSUE: Status is SOLD_ON_LUNO but ngn_received is missing`);
    } else if (sell.status === 'SOLD_ON_LUNO' && sell.ngn_received) {
      console.log(`   ⚠️ ISSUE: Status is SOLD_ON_LUNO with ngn_received but not COMPLETED`);
    } else if (sell.status === 'SOL_SENT' && sell.sol_tx_hash) {
      console.log(`   ℹ️ Should be processed by verify-sol-sell cron job`);
    }

    console.log('');
  }

  // Summary
  const statusCounts = {};
  solSells.forEach(sell => {
    statusCounts[sell.status] = (statusCounts[sell.status] || 0) + 1;
  });

  console.log('\n📊 Status Summary:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });
}

checkStuckSells().catch(console.error);







