const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRecentSolSells() {
  try {
    console.log(`🔍 Checking recent SOL sells...\n`);
    
    // Get recent SOL sell orders
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No SOL sell orders found');
      return;
    }
    
    console.log(`📋 Found ${sells.length} recent SOL sell orders:\n`);
    
    for (const sell of sells) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
      console.log(`   Created: ${sell.created_at}`);
      console.log(`   Updated: ${sell.updated_at}`);
      
      // Get user email
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.id === sell.user_id);
      console.log(`   User: ${authUser?.email || sell.user_id}`);
      
      // Check transactions for this sell
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', sell.user_id)
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .order('created_at', { ascending: false });
      
      if (transactions && transactions.length > 0) {
        console.log(`\n   📋 Transactions (${transactions.length}):`);
        transactions.forEach((tx, idx) => {
          console.log(`\n      ${idx + 1}. Transaction ID: ${tx.id}`);
          console.log(`         Type: ${tx.transaction_type}`);
          console.log(`         Status: ${tx.status}`);
          console.log(`         Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
          console.log(`         Fiat: ${tx.fiat_amount} ${tx.fiat_currency || 'NGN'}`);
          console.log(`         Hash: ${tx.transaction_hash || 'N/A'}`);
          console.log(`         Created: ${tx.created_at}`);
        });
      } else {
        console.log(`\n   ⚠️ No transactions found for this sell`);
      }
      
      // Check if NGN was credited
      const { data: ngnTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', sell.user_id)
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .not('fiat_amount', 'is', null)
        .eq('fiat_currency', 'NGN')
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .limit(1);
      
      if (ngnTx && ngnTx.length > 0) {
        console.log(`\n   ✅ NGN credited: ₦${ngnTx[0].fiat_amount}`);
      } else {
        console.log(`\n   ⚠️ NGN NOT credited`);
      }
      
      // Check user's NGN balance
      const { data: ngnBalance } = await supabase
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
      
      const balanceFromWalletBalances = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
      const balanceFromWallets = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
      const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
      
      console.log(`\n   💰 Current NGN Balance:`);
      console.log(`      wallet_balances: ₦${balanceFromWalletBalances.toFixed(2)}`);
      console.log(`      wallets: ₦${balanceFromWallets.toFixed(2)}`);
      console.log(`      Effective: ₦${currentNgnBalance.toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkRecentSolSells();
