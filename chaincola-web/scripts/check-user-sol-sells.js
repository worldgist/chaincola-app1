const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserSolSells() {
  try {
    const userEmail = 'worldgistmedia14@gmail.com';
    
    console.log(`🔍 Checking SOL sells for user: ${userEmail}\n`);
    
    // Get user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === userEmail);
    
    if (!authUser) {
      console.error(`❌ User not found: ${userEmail}`);
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // Get all SOL sell orders
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No SOL sell orders found');
      return;
    }
    
    console.log(`📋 Found ${sells.length} SOL sell orders:\n`);
    
    // Group by status
    const byStatus = {};
    for (const sell of sells) {
      const status = sell.status || 'UNKNOWN';
      if (!byStatus[status]) {
        byStatus[status] = [];
      }
      byStatus[status].push(sell);
    }
    
    console.log(`📊 Status Summary:`);
    for (const [status, statusSells] of Object.entries(byStatus)) {
      console.log(`   ${status}: ${statusSells.length}`);
    }
    console.log('');
    
    // Check each sell
    for (const sell of sells) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
      console.log(`   Created: ${sell.created_at}`);
      console.log(`   Updated: ${sell.updated_at}`);
      
      // Check transactions for this sell
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .order('created_at', { ascending: false });
      
      if (transactions && transactions.length > 0) {
        console.log(`\n   📋 Transactions (${transactions.length}):`);
        
        const byType = {};
        for (const tx of transactions) {
          const type = tx.transaction_type || 'UNKNOWN';
          if (!byType[type]) {
            byType[type] = [];
          }
          byType[type].push(tx);
        }
        
        for (const [type, txs] of Object.entries(byType)) {
          console.log(`\n      ${type} transactions (${txs.length}):`);
          txs.forEach((tx, idx) => {
            console.log(`\n         ${idx + 1}. Transaction ID: ${tx.id}`);
            console.log(`            Status: ${tx.status}`);
            console.log(`            Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
            console.log(`            Fiat: ${tx.fiat_amount || 'N/A'} ${tx.fiat_currency || 'N/A'}`);
            console.log(`            Hash: ${tx.transaction_hash || 'N/A'}`);
            console.log(`            Created: ${tx.created_at}`);
          });
        }
        
        // Check for duplicates
        const failedTxs = transactions.filter(tx => tx.status === 'FAILED');
        const completedTxs = transactions.filter(tx => tx.status === 'COMPLETED');
        const pendingTxs = transactions.filter(tx => tx.status === 'PENDING');
        
        if (failedTxs.length > 1) {
          console.log(`\n   ⚠️ Found ${failedTxs.length} FAILED transactions (duplicates!)`);
        }
        if (completedTxs.length > 0 && failedTxs.length > 0) {
          console.log(`\n   ⚠️ Found both COMPLETED and FAILED transactions!`);
        }
      } else {
        console.log(`\n   ⚠️ No transactions found for this sell`);
      }
      
      // Check if NGN was credited
      const { data: ngnTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .not('fiat_amount', 'is', null)
        .eq('fiat_currency', 'NGN')
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .limit(1);
      
      if (ngnTx && ngnTx.length > 0) {
        console.log(`\n   ✅ NGN credited: ₦${ngnTx[0].fiat_amount}`);
      } else if (sell.status === 'COMPLETED' || sell.status === 'SOL_SENT') {
        console.log(`\n   ⚠️ NGN NOT credited but sell is ${sell.status}`);
      }
    }
    
    // Check user's current balances
    console.log(`\n${'='.repeat(60)}`);
    console.log(`💰 Current Balances:`);
    
    const { data: solBalance } = await supabase
      .from('wallet_balances')
      .select('balance, locked')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();
    
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    if (solBalance) {
      const balance = parseFloat(solBalance.balance || '0');
      const locked = parseFloat(solBalance.locked || '0');
      const available = balance - locked;
      console.log(`   SOL Balance: ${balance.toFixed(9)}`);
      console.log(`   SOL Locked: ${locked.toFixed(9)}`);
      console.log(`   SOL Available: ${available.toFixed(9)}`);
    }
    
    if (ngnBalance) {
      console.log(`   NGN (wallet_balances): ₦${parseFloat(ngnBalance.balance || '0').toFixed(2)}`);
    }
    
    if (wallet) {
      console.log(`   NGN (wallets): ₦${parseFloat(wallet.ngn_balance || '0').toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkUserSolSells();

