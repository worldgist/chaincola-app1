/**
 * Script to check if there are completed sells with pending transactions
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCompletedSells(userEmail) {
  console.log(`\n🔍 Checking for completed sells with pending transactions: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError || !authUsers || !authUsers.users) {
    console.error('❌ Error listing users:', listError);
    return;
  }

  const authUser = authUsers.users.find(u => u.email === userEmail);
  if (!authUser) {
    console.error('❌ User not found in auth.users');
    return;
  }

  const userId = authUser.id;

  // Get all completed or sold sell orders
  const { data: completedSells, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', userId)
    .not('sol_amount', 'is', null)
    .in('status', ['COMPLETED', 'SOLD_ON_LUNO', 'SOL_CREDITED_ON_LUNO'])
    .order('created_at', { ascending: false });

  if (sellsError) {
    console.error('❌ Error fetching sell orders:', sellsError);
    return;
  }

  console.log(`📊 Found ${completedSells.length} completed/sold sell orders\n`);

  if (completedSells.length === 0) {
    console.log('✅ No completed sells found');
    
    // Check all sell orders
    const { data: allSells } = await supabase
      .from('sells')
      .select('sell_id, status, sol_amount, ngn_received, completed_at')
      .eq('user_id', userId)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false });
    
    if (allSells && allSells.length > 0) {
      console.log(`\n📋 All sell orders:`);
      allSells.forEach(sell => {
        console.log(`   ${sell.sell_id.substring(0, 8)}... | ${sell.status} | SOL: ${sell.sol_amount} | NGN: ${sell.ngn_received || 'N/A'} | Completed: ${sell.completed_at || 'N/A'}`);
      });
    }
    return;
  }

  // Check transactions for each completed sell
  for (const sell of completedSells) {
    console.log(`\n📋 Sell Order: ${sell.sell_id}`);
    console.log(`   Status: ${sell.status}`);
    console.log(`   SOL Amount: ${sell.sol_amount}`);
    console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
    console.log(`   Completed At: ${sell.completed_at || 'N/A'}`);

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
      .order('created_at', { ascending: false });

    if (txError) {
      console.error(`   ❌ Error fetching transactions:`, txError);
      continue;
    }

    console.log(`   📊 Found ${transactions.length} related transaction(s):`);
    
    transactions.forEach(tx => {
      console.log(`      - ID: ${tx.id.substring(0, 8)}...`);
      console.log(`        Type: ${tx.transaction_type}`);
      console.log(`        Status: ${tx.status}`);
      console.log(`        Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
      console.log(`        Fiat: ${tx.fiat_amount || 'N/A'} ${tx.fiat_currency || ''}`);
      
      if (tx.status === 'PENDING' && (sell.status === 'COMPLETED' || sell.status === 'SOLD_ON_LUNO')) {
        console.log(`        ⚠️  MISMATCH: Transaction is PENDING but sell is ${sell.status}`);
        
        // Fix it
        const platformFee = parseFloat(sell.ngn_received || '0') * 0.03;
        const finalNgnPayout = parseFloat(sell.ngn_received || '0') - platformFee;
        
        supabase.from('transactions').update({
          status: 'COMPLETED',
          fiat_amount: finalNgnPayout > 0 ? finalNgnPayout.toFixed(2) : null,
          fiat_currency: finalNgnPayout > 0 ? 'NGN' : null,
          fee_amount: finalNgnPayout > 0 ? platformFee.toFixed(2) : null,
          fee_currency: finalNgnPayout > 0 ? 'NGN' : null,
          external_order_id: sell.luno_order_id || null,
          completed_at: sell.completed_at || new Date().toISOString(),
        }).eq('id', tx.id).then(({ error }) => {
          if (error) {
            console.error(`        ❌ Failed to fix:`, error);
          } else {
            console.log(`        ✅ Fixed: Updated to COMPLETED`);
          }
        });
      }
      console.log('');
    });
  }
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
checkCompletedSells(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    setTimeout(() => process.exit(0), 2000);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


