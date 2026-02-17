const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDuplicateCompletedTransactions() {
  try {
    const userId = '2fbdf270-d641-403b-86e2-81a285d82e4a'; // worldgistmedia14@gmail.com
    const sellId = '50009476-6b2f-4e9b-ae41-1ea4814086f5';
    
    console.log(`🔍 Fixing duplicate COMPLETED transactions for sell: ${sellId}\n`);
    
    // Get all transactions for this sell
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'SELL')
      .or(`metadata->>sell_id.eq.${sellId}`)
      .order('created_at', { ascending: true });
    
    if (!transactions || transactions.length === 0) {
      console.log('✅ No transactions found');
      return;
    }
    
    console.log(`📋 Found ${transactions.length} transactions:\n`);
    
    const completedTxs = transactions.filter(tx => tx.status === 'COMPLETED');
    
    if (completedTxs.length > 1) {
      console.log(`⚠️ Found ${completedTxs.length} COMPLETED transactions (duplicates!)\n`);
      
      // Keep the most recent one, delete older duplicates
      completedTxs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      console.log(`Keeping transaction: ${completedTxs[0].id} (created: ${completedTxs[0].created_at})`);
      
      for (let i = 1; i < completedTxs.length; i++) {
        console.log(`Deleting duplicate: ${completedTxs[i].id} (created: ${completedTxs[i].created_at})`);
        const { error } = await supabase.from('transactions').delete().eq('id', completedTxs[i].id);
        
        if (error) {
          console.error(`❌ Failed to delete:`, error);
        } else {
          console.log(`✅ Deleted duplicate transaction: ${completedTxs[i].id}`);
        }
      }
    } else {
      console.log(`✅ No duplicate COMPLETED transactions found`);
    }
    
    // Also check for any failed transactions for completed sells
    const failedTxs = transactions.filter(tx => tx.status === 'FAILED');
    
    if (failedTxs.length > 0 && completedTxs.length > 0) {
      console.log(`\n⚠️ Found ${failedTxs.length} FAILED transactions for a COMPLETED sell`);
      console.log(`   These should be deleted since the sell succeeded\n`);
      
      for (const failedTx of failedTxs) {
        console.log(`Deleting failed transaction: ${failedTx.id}`);
        const { error } = await supabase.from('transactions').delete().eq('id', failedTx.id);
        
        if (error) {
          console.error(`❌ Failed to delete:`, error);
        } else {
          console.log(`✅ Deleted failed transaction: ${failedTx.id}`);
        }
      }
    }
    
    console.log(`\n✅ Done!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

fixDuplicateCompletedTransactions();

